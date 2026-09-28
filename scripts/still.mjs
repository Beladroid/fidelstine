#!/usr/bin/env node
/**
 * Pull a crisp still photo out of a video, or enhance an existing photo.
 *
 *   npm run still -- <video-id> <seconds> <new-photo-id> [tags]
 *       Looks at every frame within ±0.6 s of <seconds>, keeps the sharpest one (least motion blur),
 *       enhances it and adds it to the media library as a photo.
 *   npm run still -- --enhance <photo-id> [<photo-id> ...]
 *       Re-processes existing photos in place (e.g. small ones supplied by the client).
 *   npm run still -- --posters
 *       Enhances every video poster in place.
 *
 * "Enhance" = high-quality Lanczos enlargement to 1920 px wide (so browsers never have to stretch the
 * picture themselves) plus a gentle unsharp mask. It makes pictures look cleaner and crisper; it cannot
 * invent detail that the camera never captured.
 */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";

const ROOT = process.cwd();
const MEDIA = path.join(ROOT, "src", "media");
const LIB = path.join(ROOT, "src", "_data", "media.json");
const TARGET_WIDTH = 1920;

const run = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...args]);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-400)))));
  });

/** Enlarge (never shrink below the original) with Lanczos and sharpen gently. */
export async function enhance(input, output, { quality = 92 } = {}) {
  // read into memory first so the same file can be overwritten in place (Windows locks open files)
  const img = sharp(await fs.readFile(input), { failOn: "none" }).rotate();
  const meta = await img.metadata();
  const width = Math.max(meta.width, TARGET_WIDTH);
  const buf = await img
    .resize({ width, kernel: sharp.kernel.lanczos3, withoutEnlargement: false })
    .sharpen({ sigma: 0.9, m1: 0.6, m2: 1.4 })
    .jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
  await fs.writeFile(output, buf);
  const out = await sharp(buf).metadata();
  return { width: out.width, height: out.height };
}

/** Extract frames around `at` seconds and return the path of the sharpest one. */
async function sharpestFrame(video, at) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "still-"));
  const start = Math.max(0, at - 0.6);
  await run(["-ss", String(start), "-i", video, "-t", "1.2", "-vsync", "0", "-q:v", "1", path.join(dir, "f%03d.png")]);
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".png"));
  let best = null;
  for (const f of files) {
    const p = path.join(dir, f);
    const { sharpness } = await sharp(p).stats();
    if (!best || sharpness > best.sharpness) best = { p, sharpness };
  }
  if (!best) throw new Error(`No frames found at ${at}s`);
  return { file: best.p, dir, frames: files.length };
}

async function readLib() {
  return JSON.parse(await fs.readFile(LIB, "utf8"));
}
async function writeLib(lib) {
  await fs.writeFile(LIB, JSON.stringify(lib, null, 2) + "\n");
}

async function main() {
  const args = process.argv.slice(2);
  const lib = await readLib();
  const byId = (id) => lib.items.find((i) => i.id === id);

  if (args[0] === "--posters") {
    const done = new Set();
    for (const v of lib.items.filter((i) => i.type === "video" && i.poster)) {
      if (done.has(v.poster)) continue;
      done.add(v.poster);
      const p = path.join(MEDIA, v.poster);
      const size = await enhance(p, p, { quality: 90 });
      console.log(`poster ${v.poster}: ${size.width}x${size.height}`);
    }
    return;
  }

  if (args[0] === "--enhance") {
    for (const id of args.slice(1)) {
      const item = byId(id);
      if (!item || item.type !== "image") throw new Error(`No photo with id "${id}"`);
      const p = path.join(MEDIA, item.src);
      const size = await enhance(p, p);
      Object.assign(item, size);
      console.log(`${id}: ${size.width}x${size.height}`);
    }
    await writeLib(lib);
    return;
  }

  const [videoId, seconds, newId, tags = "gallery"] = args;
  if (!videoId || seconds === undefined || !newId) {
    console.log("Usage: npm run still -- <video-id> <seconds> <new-photo-id> [tag1+tag2]");
    process.exit(1);
  }
  const video = byId(videoId);
  if (!video || video.type !== "video") throw new Error(`No video with id "${videoId}"`);
  const src = path.join(MEDIA, video.src);
  if (!existsSync(src)) throw new Error(`Video file missing: ${src}`);

  const { file, dir, frames } = await sharpestFrame(src, Number(seconds));
  const out = path.join(MEDIA, "photos", `${newId}.jpg`);
  const size = await enhance(file, out);
  await fs.rm(dir, { recursive: true, force: true });

  const existing = byId(newId);
  const entry = existing || { id: newId, type: "image", alt: "", caption: "", review: true, added: new Date().toISOString().slice(0, 10) };
  Object.assign(entry, {
    src: `photos/${newId}.jpg`,
    ...size,
    orientation: size.height > size.width ? "portrait" : "landscape",
    from: { video: videoId, seconds: Number(seconds) },
    consent: video.consent || entry.consent || "",
  });
  if (!existing) {
    entry.tags = tags.split(/[+,]/).filter(Boolean);
    lib.items.push(entry);
  }
  await writeLib(lib);
  console.log(`${newId}: sharpest of ${frames} frames -> ${size.width}x${size.height}${existing ? " (replaced)" : ""}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
