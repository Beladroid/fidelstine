#!/usr/bin/env node
/**
 * Generates favicons, app icons and the default social sharing image from the crest.
 *   node scripts/make-icons.mjs
 * Re-run if the logo changes.
 */
import sharp from "sharp";
import path from "node:path";

const out = path.join("src", "static", "brand");
const mark = path.join(out, "logo-mark.jpg");
const NAVY = { r: 14, g: 35, b: 56, alpha: 1 };

async function roundIcon(size, file, padding = 0) {
  const inner = size - padding * 2;
  const circle = Buffer.from(`<svg width="${inner}" height="${inner}"><circle cx="${inner / 2}" cy="${inner / 2}" r="${inner / 2}"/></svg>`);
  const crest = await sharp(mark).resize(inner, inner, { fit: "cover" }).composite([{ input: circle, blend: "dest-in" }]).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: padding ? NAVY : { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: crest, top: padding, left: padding }])
    .png()
    .toFile(path.join(out, file));
}

await roundIcon(32, "favicon-32.png");
await roundIcon(192, "icon-192.png");
await roundIcon(512, "icon-512.png");
await roundIcon(512, "icon-maskable-512.png", 72);
await roundIcon(180, "apple-touch-icon.png", 12);

// 1200x630 social card: hero photo, navy wash, crest and name
const W = 1200;
const H = 630;
const photo = await sharp(path.join("src", "media", "photos", "hero-photo.jpg")).resize(W, H, { fit: "cover", position: "centre" }).toBuffer();
const crestSize = 170;
const circle = Buffer.from(`<svg width="${crestSize}" height="${crestSize}"><circle cx="${crestSize / 2}" cy="${crestSize / 2}" r="${crestSize / 2}"/></svg>`);
const crest = await sharp(mark).resize(crestSize, crestSize).composite([{ input: circle, blend: "dest-in" }]).png().toBuffer();
const overlay = Buffer.from(`
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#0E2338" stop-opacity=".94"/><stop offset=".62" stop-color="#0E2338" stop-opacity=".7"/><stop offset="1" stop-color="#0E2338" stop-opacity=".2"/></linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="0" y="${H - 10}" width="${W * 0.45}" height="10" fill="#A33234"/>
  <rect x="${W * 0.45}" y="${H - 10}" width="${W * 0.17}" height="10" fill="#E8B4BC"/>
  <rect x="${W * 0.62}" y="${H - 10}" width="${W * 0.38}" height="10" fill="#2F5F8F"/>
  <text x="290" y="250" font-family="Georgia, serif" font-size="64" fill="#fff">Fidelstine</text>
  <text x="292" y="296" font-family="Arial, sans-serif" font-size="22" letter-spacing="4" fill="#E8B4BC">CHARITY CONCERNS &amp; ORPHANAGE</text>
  <text x="80" y="420" font-family="Georgia, serif" font-size="44" fill="#fff">Restoring dignity to the abandoned,</text>
  <text x="80" y="476" font-family="Georgia, serif" font-size="44" fill="#fff">hope to the forgotten.</text>
  <text x="80" y="548" font-family="Georgia, serif" font-style="italic" font-size="26" fill="#D9C08A">Nurturing Hope, Building Futures, Defending Dignity.</text>
</svg>`);
await sharp(photo)
  .composite([{ input: overlay }, { input: crest, top: 150, left: 90 }])
  .jpeg({ quality: 84, mozjpeg: true })
  .toFile(path.join(out, "og-default.jpg"));

console.log("Icons and social image written to", out);
