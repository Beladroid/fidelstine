// GET /api/geo  ->  { country, currency }
// The visitor's country as seen by Cloudflare, and the currency the site should show them.
// Nothing is stored; the answer is private to the visitor and never cached.
import { json } from "../../lib/http.js";
import { currencyForCountry } from "../../lib/currencies.js";

export function onRequestGet({ request }) {
  const country = request.cf?.country || request.headers.get("cf-ipcountry") || null;
  return json(
    { country, currency: currencyForCountry(country) },
    200,
    { "Cache-Control": "private, no-store", Vary: "CF-IPCountry" }
  );
}
