// POST /api/donations/init
// Validates the donation, records it as "pending", and asks Flutterwave for a hosted checkout link.
// The amount is fixed here on the server, so the browser cannot change what the donor is charged.
import { handle, json, readJson, siteOrigin, error } from "../../../lib/http.js";
import { validateDonation, isBot } from "../../../lib/validate.js";
import { rateLimit } from "../../../lib/ratelimit.js";
import { createPayment } from "../../../lib/flutterwave.js";
import { toMinor } from "../../../lib/currencies.js";
import { CAMPAIGNS } from "../../../lib/campaigns.js";

function newTxRef() {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  return `FID-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

export const onRequestPost = handle(async (context) => {
  const { env, request } = context;
  const body = await readJson(request);
  if (isBot(body)) return json({ link: "/" }); // quietly ignore bots
  const d = validateDonation(body);
  await rateLimit(context, "donate", { limit: 12, windowSeconds: 600 });

  const txRef = newTxRef();
  await env.DB.prepare(
    `INSERT INTO donations (tx_ref, amount, currency, campaign, donor_name, donor_email, donor_phone, donor_country, message, anonymous, newsletter, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
  )
    .bind(txRef, toMinor(d.amount), d.currency, d.campaign, d.name, d.email, d.phone || null, d.country || null, d.message || null, d.anonymous ? 1 : 0, d.newsletter ? 1 : 0)
    .run();

  const origin = siteOrigin(context);
  let link;
  try {
    link = await createPayment(env, {
      tx_ref: txRef,
      amount: d.amount,
      currency: d.currency,
      redirect_url: `${origin}/donate/thank-you/`,
      customer: { email: d.email, name: d.name, phonenumber: d.phone || undefined },
      customizations: {
        title: "Fidelstine Charity",
        description: `Gift to ${CAMPAIGNS[d.campaign]?.title || "Fidelstine"}`,
        logo: `${origin}/brand/icon-512.png`,
      },
      meta: { campaign: d.campaign, source: "website" },
    });
  } catch (e) {
    await env.DB.prepare("UPDATE donations SET status = 'failed', notes = 'checkout link failed' WHERE tx_ref = ?").bind(txRef).run();
    throw e;
  }
  // only ever send donors to an https checkout (the mock used in automated tests is the one exception)
  if (!/^https:\/\//.test(link) && !env.FLW_API_BASE) return error("Unexpected checkout link.", 502);
  return json({ link, tx_ref: txRef });
});
