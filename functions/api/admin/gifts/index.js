// POST /api/admin/gifts  record a donation received by bank transfer, PayPal or cash (staff only)
import { json, readJson, handle, siteOrigin } from "../../../../lib/http.js";
import { requireAdmin } from "../../../../lib/access.js";
import { validateGift, insertGift, thankDonor } from "../../../../lib/gifts.js";
import { clearContentCache } from "../../../../lib/content.js";
import { logActivity } from "../../../../lib/staff.js";
import { CURRENCIES } from "../../../../lib/currencies.js";

export const onRequestPost = handle(async (context) => {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const body = await readJson(context.request);
  const gift = validateGift(body);
  const txRef = await insertGift(context.env.DB, gift, { recordedBy: auth.email });
  await logActivity(context, auth.email, "recorded a donation", `${CURRENCIES[gift.currency].symbol}${gift.amount.toLocaleString("en")} from ${gift.name} (${gift.method})`);
  const emailed = body.thank === true ? await thankDonor(context.env, context.env.DB, txRef, siteOrigin(context)) : false;
  // campaign totals are cached for a minute; clear them so the progress bar moves now
  await clearContentCache(context);
  if (typeof caches !== "undefined") {
    await caches.default.delete(new Request(new URL(`/api/campaign/${gift.campaign}`, context.request.url).toString()));
  }
  return json({ ok: true, txRef, emailed }, 201);
});
