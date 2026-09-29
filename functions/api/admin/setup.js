// POST /api/admin/setup  { name, email, password, setupKey }
// Creates the first owner account. Only works while there are no accounts, and only with the setup key
// (the ADMIN_PASSWORD secret), so nobody else can claim the console.
import { json, readJson, handle, HttpError, safeEqual } from "../../../lib/http.js";
import { rateLimit } from "../../../lib/ratelimit.js";
import { createSession, sessionCookie } from "../../../lib/access.js";
import { cleanStaff, checkNewPassword, hashPassword, staffCount, publicStaff, logActivity } from "../../../lib/staff.js";

export const onRequestPost = handle(async (context) => {
  const { env, request } = context;
  if (!env.ADMIN_PASSWORD) throw new HttpError("The setup key has not been configured.", 503);
  await rateLimit(context, "admin-setup", { limit: 8, windowSeconds: 900 });
  const body = await readJson(request);
  if ((await staffCount(env.DB)) > 0) throw new HttpError("The console is already set up. Sign in instead.", 409);
  if (!safeEqual(String(body.setupKey || ""), env.ADMIN_PASSWORD)) throw new HttpError("That setup key is not right.", 401);
  const person = cleanStaff({ ...body, role: "owner" });
  const hash = await hashPassword(checkNewPassword(body.password));
  const row = await env.DB.prepare("INSERT INTO staff (name, email, role, password_hash) VALUES (?, ?, 'owner', ?) RETURNING *")
    .bind(person.name, person.email, hash)
    .first();
  await logActivity(context, row.name, "set up the console");
  const res = json({ ok: true, user: publicStaff(row) }, 201);
  res.headers.append("Set-Cookie", sessionCookie(await createSession(env, row), request));
  return res;
});
