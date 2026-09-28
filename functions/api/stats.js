// GET /api/stats  ->  { items: [{ key, value, suffix, label }], custom, updatedAt }
// Public impact numbers for the home page. Cached at the edge for 60 seconds; saving in the admin
// panel clears the cache so changes show straight away.
import { json } from "../../lib/http.js";
import { mergeStats, readSavedStats } from "../../lib/stats.js";
import copy from "../../src/_data/copy.json";

export async function onRequestGet(context) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = new Request(new URL("/api/stats", context.request.url).toString());
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }
  const saved = context.env.DB ? await readSavedStats(context.env.DB) : null;
  const res = json(
    { items: mergeStats(copy.impact.items, saved), custom: !!saved, updatedAt: saved?.updatedAt || null },
    200,
    { "Cache-Control": "public, max-age=60" }
  );
  if (cache) context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
