// PUT    /api/admin/content/:key  save a section (staff only)
// DELETE /api/admin/content/:key  go back to the starting value
import { json, readJson, handle, HttpError } from "../../../../lib/http.js";
import { requireAdmin } from "../../../../lib/access.js";
import { CONTENT_PREFIX, sectionByKey, validateSection, contentDefaults, readSavedContent, clearContentCache } from "../../../../lib/content.js";
import copy from "../../../../src/_data/copy.json";

const defaults = contentDefaults(copy);

async function current(context, key) {
  const saved = (await readSavedContent(context.env.DB))[key];
  return { ok: true, key, value: saved?.value ?? defaults[key], custom: !!saved, updatedAt: saved?.updatedAt || null, updatedBy: saved?.updatedBy || null };
}

function section(context) {
  const key = String(context.params.key || "");
  if (!sectionByKey(key)) throw new HttpError("Unknown section.", 404);
  return key;
}

export const onRequestPut = handle(async (context) => {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const key = section(context);
  const value = validateSection(key, await readJson(context.request, 64 * 1024));
  await context.env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
  )
    .bind(CONTENT_PREFIX + key, JSON.stringify(value), auth.email)
    .run();
  await clearContentCache(context);
  return json(await current(context, key));
});

export const onRequestDelete = handle(async (context) => {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const key = section(context);
  await context.env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(CONTENT_PREFIX + key).run();
  await clearContentCache(context);
  return json(await current(context, key));
});
