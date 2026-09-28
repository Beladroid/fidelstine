/**
 * Currencies donors can give in. Shared by the website build and the payment functions,
 * so the amount pills and the server-side checks always agree.
 *
 * Only list currencies that are enabled for collection on the Flutterwave account.
 * Amounts are in major units (naira, pounds, dollars). "min"/"max" are enforced on the server.
 */
export const CURRENCIES = {
  NGN: { symbol: "₦", name: "Nigerian naira", presets: [5000, 15000, 50000], min: 500, max: 50000000 },
  GBP: { symbol: "£", name: "British pound", presets: [10, 25, 50], min: 2, max: 50000 },
  USD: { symbol: "$", name: "US dollar", presets: [10, 25, 50], min: 2, max: 50000 },
  EUR: { symbol: "€", name: "Euro", presets: [10, 25, 50], min: 2, max: 50000 },
  GHS: { symbol: "GH₵", name: "Ghanaian cedi", presets: [100, 250, 500], min: 20, max: 500000 },
  KES: { symbol: "KSh", name: "Kenyan shilling", presets: [1000, 2500, 5000], min: 100, max: 5000000 },
  ZAR: { symbol: "R", name: "South African rand", presets: [200, 500, 1000], min: 50, max: 1000000 },
  CAD: { symbol: "CA$", name: "Canadian dollar", presets: [15, 35, 70], min: 3, max: 70000 },
};

export const DEFAULT_CURRENCY = "NGN";

/** Default currency guessed from the visitor's time zone (the donor can always change it). */
export const TIMEZONE_CURRENCY = {
  "Africa/Lagos": "NGN",
  "Europe/London": "GBP",
  "Africa/Accra": "GHS",
  "Africa/Nairobi": "KES",
  "Africa/Johannesburg": "ZAR",
  "America/Toronto": "CAD",
  "America/Vancouver": "CAD",
};
export const EURO_ZONE_PREFIXES = ["Europe/"];

/**
 * Approximate value of one unit of each currency in naira. Only used to show a combined
 * "raised so far" figure on campaign pages, never for payments. Update occasionally.
 */
export const APPROX_NGN_RATE = {
  NGN: 1,
  GBP: 2000,
  USD: 1500,
  EUR: 1700,
  GHS: 100,
  KES: 11.5,
  ZAR: 83,
  CAD: 1080,
};

/**
 * Visitor's country (ISO code from Cloudflare) -> the currency shown on the site.
 * Countries without their own supported currency see US dollars, which Flutterwave accepts from any card.
 */
export const EURO_COUNTRIES = ["AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES"];
export const COUNTRY_CURRENCY = { NG: "NGN", GB: "GBP", US: "USD", GH: "GHS", KE: "KES", ZA: "ZAR", CA: "CAD" };
export const FALLBACK_CURRENCY = "USD";

export function currencyForCountry(country) {
  if (!country || typeof country !== "string" || !/^[A-Za-z]{2}$/.test(country)) return null;
  const cc = country.toUpperCase();
  if (cc === "XX" || cc === "T1") return null; // unknown / Tor
  if (COUNTRY_CURRENCY[cc]) return COUNTRY_CURRENCY[cc];
  if (EURO_COUNTRIES.includes(cc)) return "EUR";
  return FALLBACK_CURRENCY;
}

export function isSupportedCurrency(code) {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, code);
}

/** Integer minor units (kobo, pence, cents) so money is never stored as a float. */
export function toMinor(amount) {
  return Math.round(Number(amount) * 100);
}
export function fromMinor(minor) {
  return Number(minor) / 100;
}
