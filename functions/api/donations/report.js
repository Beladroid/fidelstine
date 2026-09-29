// POST /api/donations/report  a donor tells us they have sent a gift by GTBank transfer or PayPal.
// Saved as "pending" until staff see the money and confirm it in the admin panel, so it never
// counts towards totals on the donor's word alone.
import { json, readJson, handle } from "../../../lib/http.js";
import { isBot } from "../../../lib/validate.js";
import { rateLimit } from "../../../lib/ratelimit.js";
import { validateGift, insertGift } from "../../../lib/gifts.js";

export const onRequestPost = handle(async (context) => {
  const body = await readJson(context.request);
  if (isBot(body)) return json({ ok: true }, 201);
  await rateLimit(context, "report", { limit: 5, windowSeconds: 3600 });
  const gift = validateGift(body, new Date(), true);
  await insertGift(context.env.DB, gift, { reported: true });
  return json({ ok: true }, 201);
});
