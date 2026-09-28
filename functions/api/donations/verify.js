// POST /api/donations/verify  { tx_ref, transaction_id? }
// Called by the thank-you page after Flutterwave redirects back. Re-checks the payment with
// Flutterwave's API and returns only what the page needs to show.
import { handle, json, readJson, error } from "../../../lib/http.js";
import { cleanText } from "../../../lib/validate.js";
import { rateLimit } from "../../../lib/ratelimit.js";
import { reconcile, publicView } from "../../../lib/donations.js";
import { CAMPAIGNS } from "../../../lib/campaigns.js";

export const onRequestPost = handle(async (context) => {
  const body = await readJson(context.request);
  const txRef = cleanText(body.tx_ref, 64);
  const transactionId = cleanText(body.transaction_id, 24) || null;
  if (!/^FID-[A-Z0-9]+-[A-Z0-9]+$/.test(txRef)) return error("Unknown reference.", 404);
  await rateLimit(context, "verify", { limit: 40, windowSeconds: 600 });

  const { row, outcome } = await reconcile(context, { txRef, transactionId, cancelled: body.cancelled === true });
  if (!row) return error("Unknown reference.", 404);
  return json({ ...publicView(row, CAMPAIGNS), outcome });
});
