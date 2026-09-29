// PATCH  /api/admin/images/:id  { alt?, caption?, kind?, inGallery? }
// DELETE /api/admin/images/:id[?force=1]  refuses while the photo is still used, unless forced
import { json, readJson, handle, HttpError } from "../../../../lib/http.js";
import { cleanText } from "../../../../lib/validate.js";
import { requireAdmin } from "../../../../lib/access.js";
import { IMAGE_ID, IMAGE_KINDS, publicImage, LIST_COLUMNS } from "../../../../lib/images.js";
import { clearContentCache, sectionByKey, CONTENT_PREFIX } from "../../../../lib/content.js";
import { logActivity } from "../../../../lib/staff.js";

function id(context) {
  const v = String(context.params.id || "");
  if (!IMAGE_ID.test(v)) throw new HttpError("Unknown photo.", 404);
  return v;
}

/** Where a photo is used: site content sections and staff profile photos. */
async function usage(db, imageId) {
  const where = [];
  const { results } = await db.prepare("SELECT key FROM settings WHERE value LIKE ?").bind(`%"${imageId}"%`).all();
  for (const r of results || []) where.push(sectionByKey(r.key.slice(CONTENT_PREFIX.length))?.title || r.key);
  const staff = await db.prepare("SELECT name FROM staff WHERE avatar_id = ?").bind(imageId).all();
  for (const s of staff.results || []) where.push(`${s.name}'s profile photo`);
  return where;
}

export const onRequestPatch = handle(async (context) => {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const db = context.env.DB;
  const imageId = id(context);
  const row = await db.prepare(`SELECT ${LIST_COLUMNS} FROM images WHERE id = ?`).bind(imageId).first();
  if (!row) throw new HttpError("Unknown photo.", 404);
  const body = await readJson(context.request);
  const alt = body.alt !== undefined ? cleanText(body.alt, 200) : row.alt;
  const caption = body.caption !== undefined ? cleanText(body.caption, 200) : row.caption;
  const kind = IMAGE_KINDS.includes(body.kind) ? body.kind : row.kind;
  const inGallery = body.inGallery !== undefined ? !!body.inGallery : !!row.in_gallery;
  const updated = await db
    .prepare(`UPDATE images SET alt = ?, caption = ?, kind = ?, in_gallery = ? WHERE id = ? RETURNING ${LIST_COLUMNS}`)
    .bind(alt, caption, kind, inGallery ? 1 : 0, imageId)
    .first();
  await clearContentCache(context);
  return json({ ok: true, item: publicImage(updated) });
});

export const onRequestDelete = handle(async (context) => {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const db = context.env.DB;
  const imageId = id(context);
  const used = await usage(db, imageId);
  if (used.length && new URL(context.request.url).searchParams.get("force") !== "1")
    return json({ error: `This photo is still used in: ${used.join(", ")}.`, usedIn: used }, 409);
  const row = await db.prepare("SELECT caption, alt FROM images WHERE id = ?").bind(imageId).first();
  await db.prepare("DELETE FROM images WHERE id = ?").bind(imageId).run();
  await db.prepare("UPDATE staff SET avatar_id = NULL WHERE avatar_id = ?").bind(imageId).run();
  await clearContentCache(context);
  await logActivity(context, auth.email, "deleted a photo", row?.caption || row?.alt || "");
  return json({ ok: true });
});
