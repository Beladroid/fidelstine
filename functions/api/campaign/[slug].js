// GET /api/campaign/:slug  ->  { raisedNGN, donors, targetNGN }
// Public total for a campaign's progress bar. Other currencies are converted approximately to naira.
// Cached at the edge for 60 seconds.
import { json, error } from "../../../lib/http.js";
import { CAMPAIGNS } from "../../../lib/campaigns.js";
import { APPROX_NGN_RATE } from "../../../lib/currencies.js";

export async function onRequestGet(context) {
  const slug = String(context.params.slug || "");
  const camp = CAMPAIGNS[slug];
  if (!camp) return error("Unknown campaign", 404);

  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = new Request(new URL(context.request.url).toString());
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  const { results } = await context.env.DB.prepare(
    "SELECT currency, SUM(amount) AS total, COUNT(*) AS n FROM donations WHERE status = 'successful' AND campaign = ? GROUP BY currency"
  )
    .bind(slug)
    .all();
  let raisedNGN = 0;
  let donors = 0;
  for (const r of results || []) {
    raisedNGN += (r.total / 100) * (APPROX_NGN_RATE[r.currency] || 0);
    donors += r.n;
  }
  const res = json({ slug, raisedNGN: Math.round(raisedNGN), donors, targetNGN: camp.targetNGN || null }, 200, {
    "Cache-Control": "public, max-age=60",
  });
  if (cache) context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
