// PATCH  /api/admin/messages/:id  { read: true|false }
// DELETE /api/admin/messages/:id
import { json, readJson, handle, HttpError } from "../../../../lib/http.js";
import { requireAdmin } from "../../../../lib/access.js";
import { logActivity } from "../../../../lib/staff.js";

const idOf = (context) => {
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError("Unknown message.", 404);
  return id;
};

export const onRequestPatch = handle(async (context) => {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const body = await readJson(context.request);
  const r = await context.env.DB.prepare(
    `UPDATE messages SET read_at = ${body.read === false ? "NULL" : "COALESCE(read_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"} WHERE id = ? RETURNING read_at`
  )
    .bind(idOf(context))
    .first();
  if (!r) throw new HttpError("Unknown message.", 404);
  return json({ ok: true, readAt: r.read_at });
});

export const onRequestDelete = handle(async (context) => {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const row = await context.env.DB.prepare("DELETE FROM messages WHERE id = ? RETURNING name").bind(idOf(context)).first();
  if (!row) throw new HttpError("Unknown message.", 404);
  await logActivity(context, auth.email, "deleted a message", `from ${row.name}`);
  return json({ ok: true });
});
