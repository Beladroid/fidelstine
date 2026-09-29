// GET  /api/admin/staff   everyone with console access (any signed-in person)
// POST /api/admin/staff   { name, email, role, password }  add a person (owners only)
import { json, readJson, handle, HttpError } from "../../../../lib/http.js";
import { requireAdmin } from "../../../../lib/access.js";
import { cleanStaff, checkNewPassword, hashPassword, publicStaff, logActivity } from "../../../../lib/staff.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const { results } = await context.env.DB.prepare("SELECT * FROM staff ORDER BY role = 'owner' DESC, name").all();
  return json({ items: results.map(publicStaff), me: auth.user });
}

export const onRequestPost = handle(async (context) => {
  const auth = await requireAdmin(context, { owner: true });
  if (auth.response) return auth.response;
  const body = await readJson(context.request);
  const person = cleanStaff(body);
  const hash = await hashPassword(checkNewPassword(body.password));
  const exists = await context.env.DB.prepare("SELECT id FROM staff WHERE email = ?").bind(person.email).first();
  if (exists) throw new HttpError("Someone with that email already has access.", 409);
  const row = await context.env.DB.prepare("INSERT INTO staff (name, email, role, password_hash) VALUES (?, ?, ?, ?) RETURNING *")
    .bind(person.name, person.email, person.role, hash)
    .first();
  await logActivity(context, auth.email, "added a team member", `${person.name} (${person.role})`);
  return json({ ok: true, item: publicStaff(row) }, 201);
});
