#!/usr/bin/env node
/**
 * Visual check: serves _site, opens each page at phone / tablet / desktop sizes, scrolls one screen
 * at a time (so scroll animations run) and stitches the screens into contact sheets.
 *   npm run build && npm run shots -- [--out dir] [--pages /,/donate/] [--devices phone,tablet]
 * Uses an installed Edge or Chrome (set BROWSER_PATH to override).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const OUT = opt("--out", path.join("media", "processed", "screenshots"));
const PAGES = opt("--pages", "/,/about/,/programmes/,/gallery/,/christmas-scheme/,/donate/,/contact/").split(",");
const DEVICES = {
  phone: { width: 375, height: 780, mobile: true, cols: 6, scale: 1 },
  tablet: { width: 768, height: 1024, mobile: true, cols: 4, scale: 0.6 },
  laptop: { width: 1100, height: 760, mobile: false, cols: 3, scale: 0.55 },
  desktop: { width: 1440, height: 900, mobile: false, cols: 3, scale: 0.45 },
};
const WANT = opt("--devices", "phone,tablet,desktop").split(",");
const MAX_SCREENS = Number(opt("--max", 18));

const BROWSERS = [
  process.env.BROWSER_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const executablePath = BROWSERS.find((p) => fs.existsSync(p));
if (!executablePath) throw new Error("No Edge/Chrome found. Set BROWSER_PATH.");

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webmanifest": "application/manifest+json", ".txt": "text/plain", ".xml": "application/xml" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.startsWith("/api/")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end("{}");
  }
  if (p.endsWith("/")) p += "index.html";
  const file = path.join("_site", p);
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  const stat = fs.statSync(file);
  const type = TYPES[path.extname(file)] || "application/octet-stream";
  const range = req.headers.range;
  if (range && type === "video/mp4") {
    const [s, e] = range.replace("bytes=", "").split("-");
    const start = Number(s);
    const end = e ? Number(e) : stat.size - 1;
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { "Content-Type": type, "Content-Length": stat.size });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(8090, "127.0.0.1", r));

fs.mkdirSync(OUT, { recursive: true });
// a private profile so an already-running Edge/Chrome window does not swallow the launch
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fidelstine-shots-"));
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  userDataDir,
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio", "--no-first-run", "--no-default-browser-check", "--disable-features=msEdgeStartupBoost,msImplicitSignin"],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const devName of WANT) {
  const dev = DEVICES[devName];
  for (const pagePath of PAGES) {
    const page = await browser.newPage();
    await page.setViewport({ width: dev.width, height: dev.height, isMobile: dev.mobile, hasTouch: dev.mobile, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(`http://127.0.0.1:8090${pagePath}`, { waitUntil: "networkidle2", timeout: 60000 });
    await page.evaluate(() => document.querySelector("[data-editor-note]")?.remove());
    await sleep(1800);
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    const shots = [];
    for (let y = 0, i = 0; y < total && i < MAX_SCREENS; y += dev.height, i++) {
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
      await sleep(1100);
      shots.push(await page.screenshot({ type: "png" }));
    }
    const w = Math.round(dev.width * dev.scale);
    const h = Math.round(dev.height * dev.scale);
    const cols = Math.min(dev.cols, shots.length);
    const rows = Math.ceil(shots.length / cols);
    const gap = 8;
    const tiles = await Promise.all(shots.map(async (buf, i) => ({ input: await sharp(buf).resize(w, h).png().toBuffer(), left: (i % cols) * (w + gap), top: Math.floor(i / cols) * (h + gap) })));
    const name = `${devName}-${pagePath.replace(/\//g, "_").replace(/^_|_$/g, "") || "home"}.jpg`;
    await sharp({ create: { width: cols * (w + gap) - gap, height: rows * (h + gap) - gap, channels: 3, background: "#333" } })
      .composite(tiles)
      .jpeg({ quality: 78 })
      .toFile(path.join(OUT, name));
    console.log(`${name}: ${shots.length} screens${errors.length ? `, JS errors: ${errors.join(" | ")}` : ""}`);
    await page.close();
  }
}
await browser.close();
server.close();
