// PUT /api/admin/me  { name?, avatarId? }                       update your own profile
// PUT /api/admin/me  { currentPassword, newPassword }            change your password
import { json, readJson, handle, HttpError } from "../../../lib/http.js";
import { requireAdmin, createSession, sessionCookie } from "../../../lib/access.js";
import { cleanStaff, checkNewPassword, hashPassword, verifyPassword, publicStaff, logActivity } from "../../../lib/staff.js";

const IMAGE_ID = /^[a-z0-9]{16}$/;

export const onRequestPut = handle(async (context) => {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  if (!auth.user.id) throw new HttpError("This sign-in has no profile to change.", 409);
  const db = context.env.DB;
  const body = await readJson(context.request);
  const row = await db.prepare("SELECT * FROM staff WHERE id = ?").bind(auth.user.id).first();

  if (body.newPassword !== undefined) {
    if (!(await verifyPassword(String(body.currentPassword || ""), row.password_hash))) throw new HttpError("Your current password is not right.", 401);
    const hash = await hashPassword(checkNewPassword(body.newPassword));
    const updated = await db.prepare("UPDATE staff SET password_hash = ? WHERE id = ? RETURNING *").bind(hash, row.id).first();
    await logActivity(context, row.name, "changed their password");
    // the old cookie is no longer valid; hand out a fresh one so this browser stays signed in
    const res = json({ ok: true, user: publicStaff(updated) });
    res.headers.append("Set-Cookie", sessionCookie(await createSession(context.env, updated), context.request));
    return res;
  }

  const name = body.name !== undefined ? cleanStaff({ name: body.name }, { partial: true }).name : row.name;
  let avatar = row.avatar_id;
  if (body.avatarId !== undefined) {
    if (body.avatarId && !IMAGE_ID.test(body.avatarId)) throw new HttpError("Unknown image.", 422);
    avatar = body.avatarId || null;
  }
  const updated = await db.prepare("UPDATE staff SET name = ?, avatar_id = ? WHERE id = ? RETURNING *").bind(name, avatar, row.id).first();
  await logActivity(context, name, "updated their profile");
  return json({ ok: true, user: publicStaff(updated) });
});
