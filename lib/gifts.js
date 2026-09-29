// Donations made outside the website checkout (GTBank transfer, PayPal, cash).
//  - Staff record them in the admin panel: saved as successful, reference "MAN-…".
//  - Donors can tell us they have sent one (the "I've sent my gift" form under the bank and PayPal
//    details): saved as pending, reference "REP-…", until staff see the money and confirm it.
// Both are ordinary rows in `donations`, so they count in totals, exports and campaign progress once
// successful. Only these two kinds can be confirmed or removed from the admin panel.
import { HttpError } from "./http.js";
import { cleanText, isEmail } from "./validate.js";
import { isSupportedCurrency } from "./currencies.js";
import { isKnownCampaign, DEFAULT_CAMPAIGN } from "./campaigns.js";
import { receiptEmail, sendEmail } from "./email.js";

export const MANUAL_PREFIX = "MAN-";
export const REPORT_PREFIX = "REP-";
export const GIFT_METHODS = ["GTBank transfer", "PayPal", "Cash", "Other"];
export const DONOR_METHODS = ["GTBank transfer", "PayPal"];
export const isOffline = (txRef) => txRef.startsWith(MANUAL_PREFIX) || txRef.startsWith(REPORT_PREFIX);

/**
 * @param fromDonor  true for the public "I've sent my gift" form: name required, fewer methods,
 *                   date within the last 90 days, unknown campaigns fall back to "general".
 */
export function validateGift(body, now = new Date(), fromDonor = false) {
  if (!body || typeof body !== "object") throw new HttpError("Send the details as JSON.", 422);

  const currency = cleanText(body.currency, 3).toUpperCase();
  if (!isSupportedCurrency(currency)) throw new HttpError("Choose a currency from the list.", 422);
  const amount = Math.round(Number(body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(fromDonor ? "Enter the amount you sent." : "Enter the amount received.", 422);
  if (amount > 1_000_000_000) throw new HttpError("That amount is too large. Check it and try again.", 422);

  const methods = fromDonor ? DONOR_METHODS : GIFT_METHODS;
  const method = cleanText(body.method, 30);
  if (!methods.includes(method)) throw new HttpError(fromDonor ? "Choose how you sent it." : "Choose how the donation was received.", 422);

  const date = cleanText(body.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new HttpError("Enter the date it was sent.", 422);
  if (Date.parse(date) > now.getTime() + 864e5) throw new HttpError("The date can't be in the future.", 422);
  if (fromDonor && Date.parse(date) < now.getTime() - 90 * 864e5) throw new HttpError("For gifts sent more than 90 days ago, please contact us.", 422);

  let campaign = cleanText(body.campaign, 40);
  if (!isKnownCampaign(campaign)) {
    if (!fromDonor) throw new HttpError("Choose where the donation should go.", 422);
    campaign = DEFAULT_CAMPAIGN;
  }

  const name = cleanText(body.name, 120);
  if (fromDonor && name.length < 2) throw new HttpError("Please tell us your name.", 422);
  const email = cleanText(body.email, 160).toLowerCase();
  if (email && !isEmail(email)) throw new HttpError("That email address doesn't look right.", 422);

  return {
    amount,
    currency,
    method,
    date,
    campaign,
    name: name || "Anonymous",
    email,
    anonymous: body.anonymous === true,
    reference: cleanText(body.reference, 80),
    note: cleanText(body.note, 300),
  };
}

/** Saves a donation made outside the checkout. Returns its reference. */
export async function insertGift(db, g, { reported = false, recordedBy = "" } = {}) {
  const txRef = `${reported ? REPORT_PREFIX : MANUAL_PREFIX}${g.date.replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8)}`;
  const notes = [g.reference && `Reference: ${g.reference}`, reported ? "Reported by the donor" : g.note, recordedBy && `Recorded by ${recordedBy}`]
    .filter(Boolean)
    .join(" | ");
  await db
    .prepare(
      `INSERT INTO donations (tx_ref, amount, currency, campaign, donor_name, donor_email, anonymous, status, payment_type, notes, message, created_at, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      txRef,
      Math.round(g.amount * 100),
      g.currency,
      g.campaign,
      g.name,
      g.email,
      g.anonymous ? 1 : 0,
      reported ? "pending" : "successful",
      g.method,
      notes,
      reported ? g.note || null : null,
      `${g.date}T12:00:00.000Z`,
      reported ? null : new Date().toISOString()
    )
    .run();
  return txRef;
}

/** Sends the thank-you email once for a successful offline donation that has an email address. */
export async function thankDonor(env, db, txRef, siteUrl) {
  const row = await db.prepare("SELECT * FROM donations WHERE tx_ref = ?").bind(txRef).first();
  if (!row || row.status !== "successful" || !row.donor_email || row.receipt_sent_at) return false;
  const sent = await sendEmail(env, { to: row.donor_email, ...receiptEmail(row, siteUrl), replyTo: env.STAFF_EMAIL || undefined });
  if (sent) await db.prepare("UPDATE donations SET receipt_sent_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(row.id).run();
  return sent;
}
