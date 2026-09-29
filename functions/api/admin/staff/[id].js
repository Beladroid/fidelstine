// PATCH  /api/admin/staff/:id  { name?, email?, role?, disabled?, password? }  (owners only)
// DELETE /api/admin/staff/:id                                               (owners only)
// There must always be at least one active owner, so nobody can lock the charity out.
import { json, readJson, handle, HttpError } from "../../../../lib/http.js";
import { requireAdmin } from "../../../../lib/access.js";
import { cleanStaff, checkNewPassword, hashPassword, publicStaff, logActivity } from "../../../../lib/staff.js";

async function target(context) {
  const id = Number(context.params.id);
  const row = Number.isInteger(id) ? await context.env.DB.prepare("SELECT * FROM staff WHERE id = ?").bind(id).first() : null;
  if (!row) throw new HttpError("Unknown person.", 404);
  return row;
}

async function otherOwners(db, id) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM staff WHERE role = 'owner' AND disabled = 0 AND id != ?").bind(id).first();
  return r.n;
}

export const onRequestPatch = handle(async (context) => {
  const auth = await requireAdmin(context, { owner: true });
  if (auth.response) return auth.response;
  const db = context.env.DB;
  const row = await target(context);
  const body = await readJson(context.request);
  const change = cleanStaff(body, { partial: true });
  const disabled = body.disabled === undefined ? !!row.disabled : !!body.disabled;
  const role = change.role || row.role;
  if ((role !== "owner" || disabled) && row.role === "owner" && !row.disabled && (await otherOwners(db, row.id)) === 0)
    throw new HttpError("There must always be at least one active owner.", 409);
  if (change.email && change.email !== row.email) {
    const taken = await db.prepare("SELECT id FROM staff WHERE email = ? AND id != ?").bind(change.email, row.id).first();
    if (taken) throw new HttpError("Someone else already uses that email.", 409);
  }
  const hash = body.password ? await hashPassword(checkNewPassword(body.password)) : row.password_hash;
  const updated = await db
    .prepare("UPDATE staff SET name = ?, email = ?, role = ?, disabled = ?, password_hash = ? WHERE id = ? RETURNING *")
    .bind(change.name || row.name, change.email || row.email, role, disabled ? 1 : 0, hash, row.id)
    .first();
  const what = [body.password && "reset the password", body.role && `role: ${role}`, body.disabled !== undefined && (disabled ? "switched off" : "switched on")]
    .filter(Boolean)
    .join(", ");
  await logActivity(context, auth.email, "updated a team member", `${updated.name}${what ? ` (${what})` : ""}`);
  return json({ ok: true, item: publicStaff(updated) });
});

export const onRequestDelete = handle(async (context) => {
  const auth = await requireAdmin(context, { owner: true });
  if (auth.response) return auth.response;
  const row = await target(context);
  if (row.id === auth.user.id) throw new HttpError("You can't remove yourself. Ask another owner.", 409);
  if (row.role === "owner" && (await otherOwners(context.env.DB, row.id)) === 0) throw new HttpError("There must always be at least one active owner.", 409);
  await context.env.DB.prepare("DELETE FROM staff WHERE id = ?").bind(row.id).run();
  await logActivity(context, auth.email, "removed a team member", row.name);
  return json({ ok: true });
});
