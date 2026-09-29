// POST /api/admin/gifts  record a gift received by bank transfer, PayPal or cash (staff only)
import { json, readJson, handle } from "../../../../lib/http.js";
import { requireAdmin } from "../../../../lib/access.js";
import { validateGift, insertGift } from "../../../../lib/gifts.js";
import { clearContentCache } from "../../../../lib/content.js";

export const onRequestPost = handle(async (context) => {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const gift = validateGift(await readJson(context.request));
  const txRef = await insertGift(context.env.DB, gift, auth.email);
  // campaign totals are cached for a minute; clear them so the progress bar moves now
  await clearContentCache(context);
  if (typeof caches !== "undefined") {
    await caches.default.delete(new Request(new URL(`/api/campaign/${gift.campaign}`, context.request.url).toString()));
  }
  return json({ ok: true, txRef }, 201);
});
