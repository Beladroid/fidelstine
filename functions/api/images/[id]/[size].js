// GET /api/images/:id/:size  a photo uploaded from the console. size: "l" (large) or "s" (small).
// Photos never change once uploaded (a new upload gets a new id), so they are cached for a year.
import { IMAGE_ID } from "../../../../lib/images.js";

export async function onRequestGet(context) {
  const { id, size } = context.params;
  if (!IMAGE_ID.test(id) || !["l", "s"].includes(size)) return new Response("Not found", { status: 404 });

  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(new URL(context.request.url).toString());
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  const row = await context.env.DB.prepare(`SELECT mime, ${size === "l" ? "data" : "thumb"} AS body FROM images WHERE id = ?`).bind(id).first();
  if (!row) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const res = new Response(new Uint8Array(row.body), {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
  if (cache) context.waitUntil(cache.put(key, res.clone()));
  return res;
}
