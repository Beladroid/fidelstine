import { CURRENCIES, DEFAULT_CURRENCY, TIMEZONE_CURRENCY, APPROX_NGN_RATE, EURO_COUNTRIES } from "../../lib/currencies.js";
import { CAMPAIGNS, DEFAULT_CAMPAIGN } from "../../lib/campaigns.js";

// Exposes the shared currency and campaign config to templates (and, via JSON, to the browser).
export default {
  currencies: CURRENCIES,
  defaultCurrency: DEFAULT_CURRENCY,
  timezoneCurrency: TIMEZONE_CURRENCY,
  approxNgnRate: APPROX_NGN_RATE,
  euroCountries: EURO_COUNTRIES,
  campaigns: CAMPAIGNS,
  defaultCampaign: DEFAULT_CAMPAIGN,
};
