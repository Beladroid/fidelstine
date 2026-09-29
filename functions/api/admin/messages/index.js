// GET /api/admin/messages  Staff only. Latest contact-form messages.
import { json } from "../../../../lib/http.js";
import { requireAdmin } from "../../../../lib/access.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const { results } = await context.env.DB.prepare(
    "SELECT id, name, email, phone, subject, message, created_at, read_at FROM messages ORDER BY id DESC LIMIT 500"
  ).all();
  return json({ user: auth.email, items: results });
}
