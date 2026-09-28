// Input validation for donations and forms. Everything from the browser is untrusted.
import { CURRENCIES, isSupportedCurrency } from "./currencies.js";
import { isKnownCampaign, DEFAULT_CAMPAIGN } from "./campaigns.js";
import { HttpError } from "./http.js";

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

export function cleanText(value, max = 200) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

export function isEmail(value) {
  return typeof value === "string" && value.length <= 160 && EMAIL_RE.test(value);
}

export function validateDonation(body) {
  const currency = cleanText(body.currency, 3).toUpperCase();
  if (!isSupportedCurrency(currency)) throw new HttpError("That currency is not supported.", 422);
  const cfg = CURRENCIES[currency];

  const amount = Math.round(Number(body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError("Please enter a valid amount.", 422);
  if (amount < cfg.min) throw new HttpError(`The minimum gift is ${cfg.symbol}${cfg.min.toLocaleString("en")}.`, 422);
  if (amount > cfg.max) throw new HttpError(`For gifts above ${cfg.symbol}${cfg.max.toLocaleString("en")} please contact us directly.`, 422);

  const name = cleanText(body.name, 120);
  if (name.length < 2) throw new HttpError("Please tell us your name.", 422);
  const email = cleanText(body.email, 160).toLowerCase();
  if (!isEmail(email)) throw new HttpError("Please enter a valid email address.", 422);

  const campaignRaw = cleanText(body.campaign, 40);
  const campaign = isKnownCampaign(campaignRaw) ? campaignRaw : DEFAULT_CAMPAIGN;

  return {
    amount,
    currency,
    campaign,
    name,
    email,
    phone: cleanText(body.phone, 30).replace(/[^\d+()\-\s]/g, ""),
    country: cleanText(body.country, 60),
    message: cleanText(body.message, 500),
    anonymous: body.anonymous === true || body.anonymous === "1" || body.anonymous === 1,
    newsletter: body.newsletter === true || body.newsletter === "1" || body.newsletter === 1,
  };
}

/** Honeypot: a hidden "website" field real people never fill in. */
export function isBot(body) {
  return typeof body.website === "string" && body.website.trim() !== "";
}
