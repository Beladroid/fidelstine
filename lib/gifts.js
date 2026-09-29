// Gifts received outside the website (GTBank transfer, PayPal, cash), recorded by staff in the admin
// panel. They are stored as successful donations, so they count in totals, exports and campaign
// progress. Their reference starts with "MAN-", which is also how the admin panel knows it may remove them.
import { HttpError } from "./http.js";
import { cleanText, isEmail } from "./validate.js";
import { isSupportedCurrency } from "./currencies.js";
import { isKnownCampaign } from "./campaigns.js";

export const MANUAL_PREFIX = "MAN-";
export const GIFT_METHODS = ["GTBank transfer", "PayPal", "Cash", "Other"];

export function validateGift(body, now = new Date()) {
  if (!body || typeof body !== "object") throw new HttpError("Send the gift as JSON.", 422);

  const currency = cleanText(body.currency, 3).toUpperCase();
  if (!isSupportedCurrency(currency)) throw new HttpError("Choose a currency from the list.", 422);
  const amount = Math.round(Number(body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError("Enter the amount received.", 422);
  if (amount > 1_000_000_000) throw new HttpError("That amount is too large. Check it and try again.", 422);

  const method = cleanText(body.method, 30);
  if (!GIFT_METHODS.includes(method)) throw new HttpError("Choose how the gift was received.", 422);

  const date = cleanText(body.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new HttpError("Enter the date the gift arrived.", 422);
  if (Date.parse(date) > now.getTime() + 864e5) throw new HttpError("The date can't be in the future.", 422);

  const campaign = cleanText(body.campaign, 40);
  if (!isKnownCampaign(campaign)) throw new HttpError("Choose where the gift should go.", 422);

  const name = cleanText(body.name, 120) || "Anonymous";
  const email = cleanText(body.email, 160).toLowerCase();
  if (email && !isEmail(email)) throw new HttpError("That email address doesn't look right. Leave it empty if you don't have one.", 422);

  return {
    amount,
    currency,
    method,
    date,
    campaign,
    name,
    email,
    anonymous: body.anonymous === true,
    reference: cleanText(body.reference, 80),
    note: cleanText(body.note, 300),
  };
}

export async function insertGift(db, g, recordedBy) {
  const txRef = `${MANUAL_PREFIX}${g.date.replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8)}`;
  const notes = [g.reference && `Reference: ${g.reference}`, g.note, `Recorded by ${recordedBy}`].filter(Boolean).join(" | ");
  await db
    .prepare(
      `INSERT INTO donations (tx_ref, amount, currency, campaign, donor_name, donor_email, anonymous, status, payment_type, notes, created_at, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'successful', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
    )
    .bind(txRef, Math.round(g.amount * 100), g.currency, g.campaign, g.name, g.email, g.anonymous ? 1 : 0, g.method, notes, `${g.date}T12:00:00.000Z`)
    .run();
  return txRef;
}
