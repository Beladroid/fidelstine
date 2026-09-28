// POST /api/contact  { name, email, phone, subject, message }
// Stores the message and, if email is configured, forwards it to STAFF_EMAIL.
import { handle, json, readJson, error } from "../../lib/http.js";
import { cleanText, isEmail, isBot } from "../../lib/validate.js";
import { rateLimit } from "../../lib/ratelimit.js";
import { sendEmail, escapeHtml } from "../../lib/email.js";

export const onRequestPost = handle(async (context) => {
  const { env } = context;
  const body = await readJson(context.request);
  if (isBot(body)) return json({ ok: true });
  const name = cleanText(body.name, 120);
  const email = cleanText(body.email, 160).toLowerCase();
  const phone = cleanText(body.phone, 30);
  const subject = cleanText(body.subject, 80) || "General question";
  const message = cleanText(body.message, 3000);
  if (name.length < 2) return error("Please tell us your name.", 422);
  if (!isEmail(email)) return error("Please enter a valid email address.", 422);
  if (message.length < 10) return error("Please write a little more in your message.", 422);
  await rateLimit(context, "contact", { limit: 5, windowSeconds: 900 });

  await env.DB.prepare("INSERT INTO messages (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)")
    .bind(name, email, phone || null, subject, message)
    .run();

  if (env.STAFF_EMAIL) {
    const html = `<p><strong>${escapeHtml(name)}</strong> &lt;${escapeHtml(email)}&gt; ${escapeHtml(phone)}</p><p><strong>About:</strong> ${escapeHtml(subject)}</p><p style="white-space:pre-wrap">${escapeHtml(message)}</p>`;
    const work = sendEmail(env, { to: env.STAFF_EMAIL, subject: `Website message: ${subject}`, html, text: `${name} <${email}> ${phone}\n\n${message}`, replyTo: email });
    context.waitUntil ? context.waitUntil(work) : await work;
  }
  return json({ ok: true });
});
