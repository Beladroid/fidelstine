#!/usr/bin/env node
/**
 * Shows which sections of the site have enough photos and videos, and which still need some.
 *   npm run media:report
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const lib = JSON.parse(fs.readFileSync(path.join(root, "src/_data/media.json"), "utf8"));
const { slots } = JSON.parse(fs.readFileSync(path.join(root, "src/_data/slots.json"), "utf8"));
const items = lib.items || [];

function count(match) {
  if (match.pairs) {
    const groups = {};
    for (const m of items) {
      if (!m.pair) continue;
      groups[m.pair] ??= new Set();
      for (const t of m.tags || []) if (t === "before" || t === "after") groups[m.pair].add(t);
    }
    return Object.values(groups).filter((s) => s.size === 2).length;
  }
  return items.filter(
    (m) => (!match.type || m.type === match.type) && (match.all || []).every((t) => (m.tags || []).includes(t))
  ).length;
}

const pad = (s, n) => String(s).padEnd(n);
console.log("\nMedia coverage\n");
console.log(pad("Section", 34) + pad("Page", 26) + pad("Have", 6) + pad("Min", 5) + pad("Ideal", 7) + "Status");
console.log("-".repeat(94));
let missing = 0;
for (const s of slots) {
  const n = count(s.match);
  const status = n === 0 ? (s.fallback ? `EMPTY (shows ${s.fallback})` : "EMPTY (hidden on live site)") : n < s.min ? "below minimum" : n < s.ideal ? "ok, more welcome" : "full";
  if (n < s.min) missing++;
  console.log(pad(s.label, 34) + pad(s.page, 26) + pad(n, 6) + pad(s.min, 5) + pad(s.ideal, 7) + status);
}

const review = items.filter((m) => m.review || !m.alt);
console.log("\n" + items.length + " items in the library.");
if (review.length) {
  console.log(`${review.length} item(s) still need alt text or a caption: ${review.map((m) => m.id).join(", ")}`);
}
const noConsent = items.filter((m) => !m.consent);
if (noConsent.length) {
  console.log(`${noConsent.length} item(s) have no consent note: ${noConsent.map((m) => m.id).join(", ")}`);
}
console.log(missing ? `\n${missing} section(s) need more media. Hints are in src/_data/slots.json.\n` : "\nEvery section has at least its minimum.\n");
