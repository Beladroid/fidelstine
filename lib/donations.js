// Confirms a donation with Flutterwave and records the result. Used by both the thank-you page
// (/api/donations/verify) and the webhook, so a gift is confirmed even if the donor closes the tab.
// Rules:
//   - Never trust the browser or the webhook body; always ask Flutterwave's API.
//   - The transaction must match our tx_ref, currency, and at least the amount we asked for.
//   - Updates are idempotent: a row becomes "successful" once, and the receipt is sent once.
import { verifyTransaction, verifyByReference } from "./flutterwave.js";
import { toMinor } from "./currencies.js";
import { receiptEmail, sendEmail } from "./email.js";

const nowIso = () => new Date().toISOString();

export async function getDonation(db, txRef) {
  return db.prepare("SELECT * FROM donations WHERE tx_ref = ?").bind(txRef).first();
}

/**
 * @returns {Promise<{row: object|null, outcome: string}>}
 * outcome: not_found | already | successful | failed | pending | abandoned | mismatch
 */
export async function reconcile(context, { txRef, transactionId = null, cancelled = false }) {
  const { env } = context;
  const db = env.DB;
  let row = await getDonation(db, txRef);
  if (!row) return { row: null, outcome: "not_found" };
  if (row.status === "successful") return { row, outcome: "already" };

  const tx = transactionId ? await verifyTransaction(env, transactionId) : await verifyByReference(env, txRef);

  if (!tx) {
    // Flutterwave has no completed charge for this reference yet
    if (cancelled && row.status === "pending") {
      await db.prepare("UPDATE donations SET status = 'abandoned' WHERE tx_ref = ? AND status = 'pending'").bind(txRef).run();
      row = await getDonation(db, txRef);
      return { row, outcome: "abandoned" };
    }
    return { row, outcome: "pending" };
  }

  const raw = JSON.stringify({
    id: tx.id,
    tx_ref: tx.tx_ref,
    flw_ref: tx.flw_ref,
    amount: tx.amount,
    charged_amount: tx.charged_amount,
    app_fee: tx.app_fee,
    amount_settled: tx.amount_settled,
    currency: tx.currency,
    status: tx.status,
    payment_type: tx.payment_type,
    created_at: tx.created_at,
  });

  if (tx.tx_ref !== txRef) {
    console.warn("Verification mismatch: tx_ref differs", txRef, tx.tx_ref);
    return { row, outcome: "mismatch" };
  }

  const status = String(tx.status || "").toLowerCase();
  if (status === "successful") {
    const paidEnough = tx.currency === row.currency && toMinor(tx.amount) >= row.amount;
    if (!paidEnough) {
      await db
        .prepare("UPDATE donations SET status = 'failed', notes = ?, raw_verify_json = ?, flw_transaction_id = ? WHERE tx_ref = ? AND status != 'successful'")
        .bind(`Amount or currency mismatch: got ${tx.amount} ${tx.currency}`, raw, String(tx.id), txRef)
        .run();
      console.warn("Amount/currency mismatch", txRef, tx.amount, tx.currency, row.amount, row.currency);
      return { row: await getDonation(db, txRef), outcome: "mismatch" };
    }
    const res = await db
      .prepare(
        `UPDATE donations SET status = 'successful', flw_transaction_id = ?, amount_settled = ?, app_fee = ?,
           payment_type = ?, verified_at = ?, raw_verify_json = ?
         WHERE tx_ref = ? AND status != 'successful'`
      )
      .bind(String(tx.id), tx.amount_settled ?? null, tx.app_fee ?? null, tx.payment_type || null, nowIso(), raw, txRef)
      .run();
    row = await getDonation(db, txRef);
    if (res.meta && res.meta.changes === 1) {
      // first confirmation: thank the donor and honour their newsletter choice
      const work = afterSuccess(context, row);
      if (context.waitUntil) context.waitUntil(work);
      else await work;
      return { row, outcome: "successful" };
    }
    return { row, outcome: "already" };
  }

  if (status === "failed") {
    await db.prepare("UPDATE donations SET status = 'failed', raw_verify_json = ? WHERE tx_ref = ? AND status IN ('pending','abandoned')").bind(raw, txRef).run();
    return { row: await getDonation(db, txRef), outcome: "failed" };
  }

  return { row, outcome: "pending" };
}

async function afterSuccess(context, row) {
  const { env } = context;
  const site = (env.SITE_URL || new URL(context.request.url).origin).replace(/\/$/, "");
  try {
    if (row.newsletter) {
      await env.DB.prepare("INSERT OR IGNORE INTO newsletter (email, source) VALUES (?, 'donation')").bind(row.donor_email).run();
    }
    if (!row.receipt_sent_at) {
      const mail = receiptEmail(row, site);
      const sent = await sendEmail(env, { to: row.donor_email, ...mail, replyTo: env.STAFF_EMAIL || undefined });
      if (sent) await env.DB.prepare("UPDATE donations SET receipt_sent_at = ? WHERE tx_ref = ? AND receipt_sent_at IS NULL").bind(nowIso(), row.tx_ref).run();
    }
  } catch (e) {
    console.error("After-success tasks failed", e);
  }
}

/** What the thank-you page is allowed to see: no email, phone or message. */
export function publicView(row, campaigns) {
  return {
    status: row.status,
    amount: row.amount / 100,
    currency: row.currency,
    campaign: row.campaign,
    campaignTitle: campaigns[row.campaign]?.title || "Where it's needed most",
    firstName: row.anonymous ? "" : row.donor_name.split(/\s+/)[0],
  };
}
