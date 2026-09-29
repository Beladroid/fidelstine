// POST   /api/admin/login  { email, password }  sign in (sets a 12-hour cookie)
// DELETE /api/admin/login                       sign out
import { json, readJson, handle, HttpError } from "../../../lib/http.js";
import { cleanText } from "../../../lib/validate.js";
import { rateLimit } from "../../../lib/ratelimit.js";
import { createSession, sessionCookie } from "../../../lib/access.js";
import { verifyPassword, publicStaff, logActivity } from "../../../lib/staff.js";

export const onRequestPost = handle(async (context) => {
  const { env, request } = context;
  await rateLimit(context, "admin-login", { limit: 8, windowSeconds: 900 });
  const body = await readJson(request);
  const email = cleanText(body.email, 160).toLowerCase();
  const row = email ? await env.DB.prepare("SELECT * FROM staff WHERE email = ?").bind(email).first() : null;
  // check the password even when the email is unknown, so both cases take the same time
  const good = await verifyPassword(String(body.password || ""), row?.password_hash || "pbkdf2$10000$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
  if (!row || !good) throw new HttpError("That email and password don't match an account.", 401);
  if (row.disabled) throw new HttpError("This account has been switched off. Ask an owner to turn it back on.", 403);
  await env.DB.prepare("UPDATE staff SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(row.id).run();
  await logActivity(context, row.name, "signed in");
  const res = json({ ok: true, user: publicStaff(row) });
  res.headers.append("Set-Cookie", sessionCookie(await createSession(env, row), request));
  return res;
});

export async function onRequestDelete(context) {
  const res = json({ ok: true });
  res.headers.append("Set-Cookie", sessionCookie("", context.request, 0));
  return res;
}
