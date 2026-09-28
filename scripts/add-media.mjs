#!/usr/bin/env node
/**
 * Add new photos and videos to the website.
 *
 *   1. Put files in media/incoming/. Optional: put them in a sub-folder whose name lists tags,
 *      joined with "+", e.g. media/incoming/gallery+shelter/IMG_2041.jpg
 *      For before/after pairs name them  something.before.jpg  and  something.after.jpg
 *   2. Run  npm run media
 *   3. Open src/_data/media.json and fill in "alt" and "caption" for the new items
 *      (they are marked "review": true). Then build or deploy.
 *
 * Options
 *   --tags a,b     extra tags for every file in this run
 *   --r2           upload videos to Cloudflare R2 (needs R2_BUCKET and a logged-in wrangler)
 *   --backfill     create missing phone-size videos / dimensions for items already in media.json
 *   --dry-run      show what would happen without changing anything
 *
 * Photos: rotated upright, resized to at most 2000px, re-encoded as JPEG, and all metadata
 * (including GPS location) removed. That protects the home's location.
 * Videos: a 720p and a 480p H.264 MP4 with fast start, plus a poster frame. Short landscape
 * clips become silent background loops, portrait clips become "reel" stories.
 */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";

const ROOT = process.cwd();
const DIR = {
  incoming: path.join(ROOT, "media", "incoming"),
  processed: path.join(ROOT, "media", "processed"),
  r2out: path.join(ROOT, "media", "processed", "r2"),
  photos: path.join(ROOT, "src", "media", "photos"),
  videos: path.join(ROOT, "src", "media", "videos"),
  posters: path.join(ROOT, "src", "media", "posters"),
};
const MEDIA_JSON = path.join(ROOT, "src", "_data", "media.json");

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".tif", ".tiff", ".avif"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".3gp"]);
const PLACEMENT_TAGS = new Set(["hero", "hero-video", "band", "reel", "library", "testimonial", "before", "after", "team", "flyer", "timeline", "about-day"]);

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const DRY = flag("--dry-run");
const USE_R2 = flag("--r2") || process.env.MEDIA_UPLOAD === "r2";
const EXTRA_TAGS = (option("--tags") || "").split(",").map((t) => t.trim()).filter(Boolean);

const log = (...a) => console.log(...a);
const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- helpers
function run(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, cmdArgs, { stdio: ["ignore", "pipe", "pipe"], shell: false });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code, out, err }));
  });
}

async function ffmpeg(ffArgs) {
  const r = await run(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...ffArgs]);
  if (r.code !== 0) throw new Error(`ffmpeg failed: ${r.err.slice(-600)}`);
}

/** Reads duration, display size and audio presence from `ffmpeg -i` output. */
async function probe(file) {
  const r = await run(ffmpegPath, ["-hide_banner", "-i", file]);
  const text = r.err;
  const dur = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration = dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : 0;
  const vLine = text.split("\n").find((l) => /Stream #.*Video:/.test(l)) || "";
  const size = vLine.match(/,\s*(\d{2,5})x(\d{2,5})/);
  let width = size ? +size[1] : 0;
  let height = size ? +size[2] : 0;
  const rot = text.match(/rotation of (-?\d+(?:\.\d+)?) degrees/) || text.match(/rotate\s*:\s*(-?\d+)/);
  if (rot && Math.abs(Math.round(+rot[1])) % 180 === 90) [width, height] = [height, width];
  const audio = /Stream #.*Audio:/.test(text);
  return { duration: Math.round(duration * 10) / 10, width, height, audio };
}

function slugify(name) {
  return (
    name
      .toLowerCase()
      .replace(/\.(before|after)$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "media"
  );
}

function uniqueId(base, taken) {
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  taken.add(id);
  return id;
}

async function readLibrary() {
  if (!existsSync(MEDIA_JSON)) return { items: [] };
  return JSON.parse(await fs.readFile(MEDIA_JSON, "utf8"));
}

async function writeLibrary(lib) {
  if (DRY) return;
  await fs.writeFile(MEDIA_JSON, JSON.stringify(lib, null, 2) + "\n");
}

async function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (!entry.name.startsWith(".")) out.push(full);
  }
  return out;
}

function tagsFromPath(file) {
  const rel = path.relative(DIR.incoming, path.dirname(file));
  if (!rel || rel === ".") return [];
  return rel
    .split(path.sep)
    .flatMap((part) => part.split(/[+,]/))
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

async function uploadToR2(localFile, key, contentType) {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error("Set R2_BUCKET (the bucket name) to upload to R2.");
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const r = await new Promise((resolve, reject) => {
    const p = spawn(npx, ["wrangler", "r2", "object", "put", `${bucket}/${key}`, "--file", localFile, "--content-type", contentType, "--remote"], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    p.on("error", reject);
    p.on("close", (code) => resolve(code));
  });
  if (r !== 0) throw new Error(`Upload of ${key} to R2 failed`);
}

// ---------------------------------------------------------------- photo
async function processPhoto(file, id, tags) {
  const outName = `${id}.jpg`;
  const outPath = path.join(DIR.photos, outName);
  let info = { width: 0, height: 0 };
  if (!DRY) {
    info = await sharp(file)
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(outPath);
  }
  const isPortrait = info.height > info.width;
  const hasPlacement = tags.some((t) => PLACEMENT_TAGS.has(t));
  const finalTags = [...new Set([...(hasPlacement ? [] : ["gallery"]), ...tags])];
  return {
    id,
    type: "image",
    src: `photos/${outName}`,
    width: info.width,
    height: info.height,
    orientation: isPortrait ? "portrait" : info.width === info.height ? "square" : "landscape",
    alt: "",
    caption: "",
    tags: finalTags,
    consent: "",
    added: today(),
    review: true,
  };
}

// ---------------------------------------------------------------- video
function scaleFilter(meta, longEdge) {
  const portrait = meta.height > meta.width;
  return portrait ? `scale=-2:'min(${longEdge},ih)'` : `scale='min(${longEdge},iw)':-2`;
}

async function encodeVideo(input, meta, { mainOut, mobileOut, posterOut, silent, maxSeconds }) {
  const audioArgs = silent || !meta.audio ? ["-an"] : ["-c:a", "aac", "-b:a", "128k"];
  const mobileAudio = silent || !meta.audio ? ["-an"] : ["-c:a", "aac", "-b:a", "96k"];
  const trim = maxSeconds && meta.duration > maxSeconds ? ["-t", String(maxSeconds)] : [];
  const common = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart"];

  if (mainOut) {
    log(`    720p  -> ${path.basename(mainOut)}`);
    await ffmpeg(["-i", input, ...trim, "-vf", scaleFilter(meta, 1280), ...common, "-preset", "slow", "-crf", "24", ...audioArgs, mainOut]);
  }
  if (mobileOut) {
    log(`    480p  -> ${path.basename(mobileOut)}`);
    await ffmpeg(["-i", input, ...trim, "-vf", scaleFilter(meta, 854), ...common, "-preset", "slow", "-crf", "28", ...mobileAudio, mobileOut]);
  }
  if (posterOut) {
    const at = Math.min(1.5, Math.max(0, meta.duration * 0.1));
    const tmp = posterOut.replace(/\.jpg$/, ".tmp.png");
    await ffmpeg(["-ss", String(at), "-i", input, "-frames:v", "1", "-vf", scaleFilter(meta, 1280), tmp]);
    await sharp(tmp).jpeg({ quality: 80, mozjpeg: true }).toFile(posterOut);
    await fs.rm(tmp, { force: true });
    log(`    poster -> ${path.basename(posterOut)}`);
  }
}

async function processVideo(file, id, tags) {
  const meta = await probe(file);
  const portrait = meta.height > meta.width;
  const hasPlacement = tags.some((t) => PLACEMENT_TAGS.has(t));
  let placement = [];
  if (!hasPlacement) {
    if (portrait) placement = ["reel"];
    else if (meta.duration <= 30) placement = ["band"];
    else placement = ["library"];
  }
  const finalTags = [...new Set([...placement, ...tags, ...(tags.includes("testimonial") || tags.includes("hero-video") ? [] : ["gallery"])])];
  const isLoop = finalTags.includes("band") || finalTags.includes("hero-video");
  const silent = isLoop && !finalTags.includes("library");

  const outDir = USE_R2 ? DIR.r2out : DIR.videos;
  const mainName = `${id}.mp4`;
  const mobileName = `${id}-480.mp4`;
  const posterName = `${id}.jpg`;
  log(`  ${meta.width}x${meta.height}, ${meta.duration}s, ${meta.audio ? "audio" : "no audio"}, tags: ${finalTags.join(", ")}`);

  if (!DRY) {
    await fs.mkdir(outDir, { recursive: true });
    await encodeVideo(file, meta, {
      mainOut: path.join(outDir, mainName),
      mobileOut: path.join(outDir, mobileName),
      posterOut: path.join(DIR.posters, posterName),
      silent,
      maxSeconds: isLoop ? 20 : 0,
    });
    if (USE_R2) {
      await uploadToR2(path.join(outDir, mainName), `videos/${mainName}`, "video/mp4");
      await uploadToR2(path.join(outDir, mobileName), `videos/${mobileName}`, "video/mp4");
    }
  }

  return {
    id,
    type: "video",
    src: `videos/${mainName}`,
    mobile: `videos/${mobileName}`,
    poster: `posters/${posterName}`,
    host: USE_R2 ? "r2" : "local",
    width: meta.width,
    height: meta.height,
    duration: isLoop ? Math.min(meta.duration, 20) : meta.duration,
    audio: meta.audio && !silent,
    orientation: portrait ? "portrait" : "landscape",
    alt: "",
    caption: "",
    tags: finalTags,
    consent: "",
    added: today(),
    review: true,
  };
}

// ---------------------------------------------------------------- backfill
async function backfill(lib) {
  let changed = 0;
  for (const item of lib.items) {
    if (item.type === "image" && (!item.width || !item.height)) {
      const p = path.join(ROOT, "src", "media", item.src);
      if (!existsSync(p)) continue;
      const m = await sharp(p).metadata();
      item.width = m.width;
      item.height = m.height;
      item.orientation = m.height > m.width ? "portrait" : m.width === m.height ? "square" : "landscape";
      changed++;
      log(`  measured ${item.id}: ${m.width}x${m.height}`);
    }
    if (item.type === "video" && item.host !== "r2") {
      const src = path.join(ROOT, "src", "media", item.src);
      if (!existsSync(src)) continue;
      const meta = await probe(src);
      Object.assign(item, {
        width: meta.width,
        height: meta.height,
        duration: meta.duration,
        audio: meta.audio,
        orientation: meta.height > meta.width ? "portrait" : "landscape",
      });
      if (!item.mobile) {
        const mobileName = path.basename(item.src).replace(/\.mp4$/, "-480.mp4");
        log(`  ${item.id}: making phone version`);
        if (!DRY) {
          await encodeVideo(src, meta, {
            mobileOut: path.join(DIR.videos, mobileName),
            silent: !item.audio,
          });
        }
        item.mobile = `videos/${mobileName}`;
      }
      changed++;
    }
  }
  return changed;
}

// ---------------------------------------------------------------- main
async function main() {
  for (const d of Object.values(DIR)) if (!DRY) await fs.mkdir(d, { recursive: true });
  const lib = await readLibrary();
  lib.items ??= [];

  if (flag("--backfill")) {
    const n = await backfill(lib);
    await writeLibrary(lib);
    log(`Backfill done: ${n} item(s) updated.`);
    return;
  }

  const files = (await walk(DIR.incoming)).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return IMAGE_EXT.has(ext) || VIDEO_EXT.has(ext);
  });
  if (!files.length) {
    log("No files in media/incoming/. Drop photos or videos there and run again.");
    return;
  }

  const taken = new Set(lib.items.map((i) => i.id));
  const added = [];
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const base = path.basename(file, ext);
    const pairMatch = base.match(/^(.*)\.(before|after)$/i);
    const tags = [...new Set([...tagsFromPath(file), ...EXTRA_TAGS, ...(pairMatch ? [pairMatch[2].toLowerCase()] : [])])];
    const id = uniqueId(slugify(pairMatch ? `${pairMatch[1]}-${pairMatch[2]}` : base), taken);
    log(`\n${path.relative(ROOT, file)} -> ${id}`);
    try {
      const item = IMAGE_EXT.has(ext) ? await processPhoto(file, id, tags) : await processVideo(file, id, tags);
      if (pairMatch) item.pair = slugify(pairMatch[1]);
      added.push(item);
      if (!DRY) {
        const dest = path.join(DIR.processed, path.relative(DIR.incoming, file));
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.rename(file, dest);
      }
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
    }
  }

  lib.items.push(...added);
  await writeLibrary(lib);
  log(`\n${added.length} item(s) added${DRY ? " (dry run)" : ""}.`);
  if (added.length) {
    log("Next: open src/_data/media.json, fill in \"alt\" and \"caption\" for items marked \"review\": true,");
    log("then remove the \"review\" line. Run  npm run media:report  to see which sections still need media.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
