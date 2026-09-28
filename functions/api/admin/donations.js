// GET /api/admin/donations?status=&currency=&campaign=&from=&to=&q=&cursor=&format=csv
// Staff only (Cloudflare Access). Returns donations, per-currency totals, or a CSV export.
import { json } from "../../../lib/http.js";
import { requireAdmin } from "../../../lib/access.js";
import { toCsv } from "../../../lib/csv.js";

const PAGE = 50;

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;

  const url = new URL(context.request.url);
  const p = url.searchParams;
  const where = [];
  const args = [];
  const status = p.get("status");
  if (status && ["pending", "successful", "failed", "abandoned"].includes(status)) {
    where.push("status = ?");
    args.push(status);
  }
  if (p.get("currency")) {
    where.push("currency = ?");
    args.push(p.get("currency").toUpperCase().slice(0, 3));
  }
  if (p.get("campaign")) {
    where.push("campaign = ?");
    args.push(p.get("campaign").slice(0, 40));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(p.get("from") || "")) {
    where.push("created_at >= ?");
    args.push(p.get("from"));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(p.get("to") || "")) {
    where.push("created_at < date(?, '+1 day')");
    args.push(p.get("to"));
  }
  if (p.get("q")) {
    const q = `%${p.get("q").slice(0, 80).replace(/[%_]/g, "")}%`;
    where.push("(donor_name LIKE ? OR donor_email LIKE ? OR tx_ref LIKE ?)");
    args.push(q, q, q);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const db = context.env.DB;

  if (p.get("format") === "csv") {
    const { results } = await db
      .prepare(
        `SELECT created_at, verified_at, tx_ref, flw_transaction_id, status, amount, currency, amount_settled, app_fee, campaign,
                donor_name, donor_email, donor_phone, donor_country, anonymous, newsletter, payment_type, message
         FROM donations ${clause} ORDER BY id DESC LIMIT 20000`
      )
      .bind(...args)
      .all();
    const rows = results.map((r) => ({ ...r, amount: (r.amount / 100).toFixed(2) }));
    return new Response(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fidelstine-donations-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const cursor = Number(p.get("cursor")) || 0;
  const pageClause = cursor ? `${clause ? clause + " AND" : "WHERE"} id < ?` : clause;
  const pageArgs = cursor ? [...args, cursor] : args;
  const { results: items } = await db
    .prepare(
      `SELECT id, created_at, tx_ref, status, amount, currency, amount_settled, campaign, donor_name, donor_email,
              anonymous, payment_type, message
       FROM donations ${pageClause} ORDER BY id DESC LIMIT ${PAGE + 1}`
    )
    .bind(...pageArgs)
    .all();
  const { results: totals } = await db
    .prepare(`SELECT currency, SUM(amount) AS total, COUNT(*) AS count FROM donations ${clause} GROUP BY currency ORDER BY total DESC`)
    .bind(...args)
    .all();

  const more = items.length > PAGE;
  const page = more ? items.slice(0, PAGE) : items;
  return json({ user: auth.email, items: page, totals, nextCursor: more ? page[page.length - 1].id : null });
}
