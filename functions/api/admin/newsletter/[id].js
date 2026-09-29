// DELETE /api/admin/newsletter/:id  remove a subscriber (e.g. when someone asks to be taken off the list)
import { json, handle, HttpError } from "../../../../lib/http.js";
import { requireAdmin } from "../../../../lib/access.js";
import { logActivity } from "../../../../lib/staff.js";

export const onRequestDelete = handle(async (context) => {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError("Unknown subscriber.", 404);
  const row = await context.env.DB.prepare("DELETE FROM newsletter WHERE id = ? RETURNING email").bind(id).first();
  if (!row) throw new HttpError("Unknown subscriber.", 404);
  await logActivity(context, auth.email, "removed a subscriber", row.email.replace(/^(.).*(@.*)$/, "$1…$2"));
  return json({ ok: true });
});
