// GET /api/admin/newsletter[?format=csv]  Staff only.
import { json } from "../../../lib/http.js";
import { requireAdmin } from "../../../lib/access.js";
import { toCsv } from "../../../lib/csv.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const { results } = await context.env.DB.prepare(
    "SELECT email, source, created_at FROM newsletter WHERE unsubscribed_at IS NULL ORDER BY id DESC LIMIT 20000"
  ).all();
  if (new URL(context.request.url).searchParams.get("format") === "csv") {
    return new Response(toCsv(results), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fidelstine-subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return json({ user: auth.email, items: results.slice(0, 500) });
}
