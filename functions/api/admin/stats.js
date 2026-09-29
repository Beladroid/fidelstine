// GET /api/admin/stats   current impact numbers (staff only)
// PUT /api/admin/stats   { items: [{ key, value, suffix, label }] }  saves them
import { json, readJson, handle } from "../../../lib/http.js";
import { requireAdmin } from "../../../lib/access.js";
import { mergeStats, validateStats, readSavedStats, STATS_KEY } from "../../../lib/stats.js";
import { logActivity } from "../../../lib/staff.js";
import copy from "../../../src/_data/copy.json";

const defaults = copy.impact.items;

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const saved = await readSavedStats(context.env.DB);
  return json({ user: auth.email, items: mergeStats(defaults, saved), custom: !!saved, updatedAt: saved?.updatedAt || null, updatedBy: saved?.updatedBy || null });
}

export const onRequestPut = handle(async (context) => {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const update = validateStats(defaults, await readJson(context.request));
  await context.env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
  )
    .bind(STATS_KEY, JSON.stringify(update), auth.email)
    .run();
  // clear the public cache so the home page shows the new figures at once
  if (typeof caches !== "undefined") {
    await caches.default.delete(new Request(new URL("/api/stats", context.request.url).toString()));
  }
  await logActivity(context, auth.email, "updated the impact numbers");
  const saved = await readSavedStats(context.env.DB);
  return json({ ok: true, items: mergeStats(defaults, saved), updatedAt: saved?.updatedAt || null });
});
