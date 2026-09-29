// GET  /api/admin/images?kind=&gallery=1&q=   photos in the media library (no image data)
// POST /api/admin/images                       upload one photo (multipart form, see lib/images.js)
import { json, handle } from "../../../../lib/http.js";
import { requireAdmin } from "../../../../lib/access.js";
import { readUpload, newImageId, publicImage, LIST_COLUMNS, IMAGE_KINDS } from "../../../../lib/images.js";
import { clearContentCache } from "../../../../lib/content.js";
import { logActivity } from "../../../../lib/staff.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const p = new URL(context.request.url).searchParams;
  const where = [];
  const args = [];
  if (IMAGE_KINDS.includes(p.get("kind"))) {
    where.push("kind = ?");
    args.push(p.get("kind"));
  }
  if (p.get("gallery") === "1") where.push("in_gallery = 1");
  if (p.get("q")) {
    where.push("(alt LIKE ? OR caption LIKE ?)");
    const q = `%${p.get("q").slice(0, 60).replace(/[%_]/g, "")}%`;
    args.push(q, q);
  }
  const { results } = await context.env.DB.prepare(
    `SELECT ${LIST_COLUMNS} FROM images ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT 500`
  )
    .bind(...args)
    .all();
  const totals = await context.env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS bytes FROM images").first();
  return json({ items: results.map(publicImage), total: totals.n, bytes: totals.bytes });
}

export const onRequestPost = handle(async (context) => {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const img = await readUpload(context.request);
  const id = newImageId();
  const row = await context.env.DB.prepare(
    `INSERT INTO images (id, kind, mime, width, height, bytes, data, thumb, alt, caption, in_gallery, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${LIST_COLUMNS}`
  )
    .bind(id, img.kind, img.mime, img.width, img.height, img.data.byteLength, img.data, img.thumb, img.alt, img.caption, img.inGallery ? 1 : 0, auth.email)
    .first();
  if (img.inGallery) await clearContentCache(context);
  await logActivity(context, auth.email, "uploaded a photo", img.caption || img.alt || img.kind);
  return json({ ok: true, item: publicImage(row) }, 201);
});
