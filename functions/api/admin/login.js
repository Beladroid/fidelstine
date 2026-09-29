// POST   /api/admin/login  { password, name }  sign in with the staff password (sets a 12-hour cookie)
// DELETE /api/admin/login                      sign out
import { json, readJson, handle, HttpError, safeEqual } from "../../../lib/http.js";
import { cleanText } from "../../../lib/validate.js";
import { rateLimit } from "../../../lib/ratelimit.js";
import { createSession, sessionCookie } from "../../../lib/access.js";

export const onRequestPost = handle(async (context) => {
  const { env, request } = context;
  if (!env.ADMIN_PASSWORD) throw new HttpError("Password sign-in is not switched on.", 503);
  await rateLimit(context, "admin-login", { limit: 8, windowSeconds: 900 });
  const body = await readJson(request);
  const name = cleanText(body.name, 40);
  if (name.length < 2) throw new HttpError("Enter your name, so changes show who made them.", 422);
  if (!safeEqual(String(body.password || ""), env.ADMIN_PASSWORD)) throw new HttpError("That password is not right.", 401);
  const res = json({ ok: true, user: name });
  res.headers.append("Set-Cookie", sessionCookie(await createSession(env, name), request));
  return res;
});

export async function onRequestDelete(context) {
  const res = json({ ok: true });
  res.headers.append("Set-Cookie", sessionCookie("", context.request, 0));
  return res;
}
