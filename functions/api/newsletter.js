// POST /api/newsletter  { email, source }
import { handle, json, readJson, error } from "../../lib/http.js";
import { cleanText, isEmail, isBot } from "../../lib/validate.js";
import { rateLimit } from "../../lib/ratelimit.js";

export const onRequestPost = handle(async (context) => {
  const body = await readJson(context.request);
  if (isBot(body)) return json({ ok: true });
  const email = cleanText(body.email, 160).toLowerCase();
  if (!isEmail(email)) return error("Please enter a valid email address.", 422);
  await rateLimit(context, "newsletter", { limit: 6, windowSeconds: 600 });
  await context.env.DB.prepare(
    "INSERT INTO newsletter (email, source) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET unsubscribed_at = NULL"
  )
    .bind(email, cleanText(body.source, 80) || "website")
    .run();
  return json({ ok: true });
});
