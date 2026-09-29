// GET /api/admin/activity?before=<id>  who did what in the console, newest first
import { json } from "../../../lib/http.js";
import { requireAdmin } from "../../../lib/access.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const before = Number(new URL(context.request.url).searchParams.get("before")) || 0;
  const { results } = await context.env.DB.prepare(
    `SELECT id, at, actor, action, detail FROM audit ${before ? "WHERE id < ?" : ""} ORDER BY id DESC LIMIT 60`
  )
    .bind(...(before ? [before] : []))
    .all();
  return json({ items: results, next: results.length === 60 ? results[results.length - 1].id : null });
}
