// POST /api/webhooks/flutterwave
// Flutterwave calls this when a charge completes. We check the secret hash header, then confirm the
// transaction through the API (never trusting the body alone) and update the donation idempotently.
// Set the same secret in the Flutterwave dashboard (Settings > Webhooks) and as FLW_SECRET_HASH.
import { json, safeEqual } from "../../../lib/http.js";
import { reconcile } from "../../../lib/donations.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const hash = request.headers.get("verif-hash");
  if (!env.FLW_SECRET_HASH || !safeEqual(hash || "", env.FLW_SECRET_HASH)) {
    return json({ error: "unauthorised" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: true, ignored: "bad json" });
  }
  const data = body && typeof body === "object" ? body.data || body : {};
  const txRef = data.tx_ref || data.txRef;
  const id = data.id;
  if (!txRef || !String(txRef).startsWith("FID-")) return json({ ok: true, ignored: "not ours" });

  try {
    const { outcome } = await reconcile(context, { txRef: String(txRef), transactionId: id ? String(id) : null });
    return json({ ok: true, outcome });
  } catch (e) {
    console.error("Webhook reconcile failed", e);
    // a non-2xx makes Flutterwave retry later
    return json({ ok: false }, 500);
  }
}
