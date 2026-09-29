// GET /api/admin/overview  figures for the console's home screen. Amounts in other currencies are
// converted to naira with the exchange rates set in the console, for charts and totals only.
import { json } from "../../../lib/http.js";
import { requireAdmin } from "../../../lib/access.js";
import { APPROX_NGN_RATE } from "../../../lib/currencies.js";
import { CAMPAIGNS } from "../../../lib/campaigns.js";
import { CAMPAIGN_SLUG, readSavedContent, campaignEnd } from "../../../lib/content.js";

const day = (d) => d.toISOString().slice(0, 10);

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const db = context.env.DB;
  const saved = await readSavedContent(db);
  const rates = { ...APPROX_NGN_RATE, ...(saved.rates?.value || {}) };
  const ngn = (minor, cur) => (minor / 100) * (rates[cur] || 0);

  const now = new Date();
  const since = new Date(now.getTime() - 400 * 864e5);
  const [daily, byCampaign, byMethod, recent, pending, unread, subs, subsMonth, activity, donors] = await Promise.all([
    db.prepare(
      `SELECT substr(created_at, 1, 10) AS d, currency, SUM(amount) AS total, COUNT(*) AS n FROM donations
       WHERE status = 'successful' AND created_at >= ? GROUP BY d, currency`
    ).bind(since.toISOString()).all(),
    db.prepare("SELECT campaign, currency, SUM(amount) AS total, COUNT(*) AS n FROM donations WHERE status = 'successful' GROUP BY campaign, currency").all(),
    db.prepare("SELECT COALESCE(payment_type, 'Card') AS method, currency, SUM(amount) AS total, COUNT(*) AS n FROM donations WHERE status = 'successful' GROUP BY method, currency").all(),
    db.prepare(
      "SELECT id, created_at, donor_name, anonymous, amount, currency, campaign, payment_type, tx_ref FROM donations WHERE status = 'successful' ORDER BY created_at DESC LIMIT 6"
    ).all(),
    db.prepare("SELECT COUNT(*) AS n FROM donations WHERE status = 'pending' AND tx_ref LIKE 'REP-%'").first(),
    db.prepare("SELECT COUNT(*) AS n FROM messages WHERE read_at IS NULL").first(),
    db.prepare("SELECT COUNT(*) AS n FROM newsletter WHERE unsubscribed_at IS NULL").first(),
    db.prepare("SELECT COUNT(*) AS n FROM newsletter WHERE unsubscribed_at IS NULL AND created_at >= ?").bind(day(new Date(now.getFullYear(), now.getMonth(), 1))).first(),
    db.prepare("SELECT id, at, actor, action, detail FROM audit ORDER BY id DESC LIMIT 8").all(),
    db.prepare("SELECT COUNT(DISTINCT CASE WHEN donor_email != '' THEN donor_email ELSE donor_name END) AS n FROM donations WHERE status = 'successful'").first(),
  ]);

  // one naira figure per day
  const series = new Map();
  for (const r of daily.results || []) {
    const s = series.get(r.d) || { d: r.d, ngn: 0, n: 0 };
    s.ngn += ngn(r.total, r.currency);
    s.n += r.n;
    series.set(r.d, s);
  }
  const sum = (rows, keyName) => {
    const m = new Map();
    for (const r of rows || []) {
      const k = r[keyName];
      const v = m.get(k) || { key: k, ngn: 0, n: 0 };
      v.ngn += ngn(r.total, r.currency);
      v.n += r.n;
      m.set(k, v);
    }
    return [...m.values()].sort((a, b) => b.ngn - a.ngn);
  };

  const campaigns = sum(byCampaign.results, "campaign").map((c) => ({ ...c, title: CAMPAIGNS[c.key]?.title || c.key }));
  const camp = saved.campaign?.value;
  const xmas = campaigns.find((c) => c.key === CAMPAIGN_SLUG);
  return json({
    user: auth.user,
    series: [...series.values()].sort((a, b) => (a.d < b.d ? -1 : 1)),
    byCampaign: campaigns,
    byMethod: sum(byMethod.results, "method"),
    recent: recent.results,
    counts: { pendingReports: pending.n, unreadMessages: unread.n, subscribers: subs.n, subscribersThisMonth: subsMonth.n, donors: donors.n },
    campaign: {
      slug: CAMPAIGN_SLUG,
      title: camp?.headline || CAMPAIGNS[CAMPAIGN_SLUG].title,
      targetNGN: camp?.targetNGN || CAMPAIGNS[CAMPAIGN_SLUG].targetNGN,
      endsAt: camp ? campaignEnd(camp.endsAt) : CAMPAIGNS[CAMPAIGN_SLUG].endsAt,
      raisedNGN: Math.round(xmas?.ngn || 0),
      gifts: xmas?.n || 0,
    },
    activity: activity.results,
  });
}
