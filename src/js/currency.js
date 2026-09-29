// Shows every amount on the site in the visitor's own currency.
// Order of preference:
//   1. a currency the visitor picked themselves (remembered on this device)
//   2. the visitor's country, detected by Cloudflare through /api/geo (remembered for the visit)
//   3. a guess from the device's time zone
//   4. naira
// Markup hooks:
//   data-money-preset="i"  -> the i-th preset amount of the current currency (quick-give buttons)
//   data-money-ngn="5000"  -> a naira figure shown approximately in the current currency
import { $$, moneyConfig, formatMoney, storage } from "./util.js";

const listeners = new Set();
let current = null;

function timezoneGuess(cfg) {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const mapped = cfg.timezoneCurrency?.[tz];
    if (mapped && cfg.currencies[mapped]) return mapped;
    if (tz.startsWith("Europe/") && cfg.currencies.EUR) return "EUR";
    if (tz.startsWith("Africa/")) return null;
    if (tz && cfg.currencies.USD) return "USD";
  } catch {}
  return null;
}

async function detect(cfg) {
  // a link that names a currency (e.g. a quick-give button) wins for this page
  const fromLink = new URLSearchParams(location.search).get("currency");
  if (fromLink && cfg.currencies[fromLink]) return fromLink;
  const chosen = storage("fid-currency");
  if (chosen && cfg.currencies[chosen]) return chosen;
  try {
    const cached = sessionStorage.getItem("fid-geo-currency");
    if (cached && cfg.currencies[cached]) return cached;
  } catch {}
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch("/api/geo", { signal: ctrl.signal, headers: { Accept: "application/json" } });
    clearTimeout(timer);
    if (res.ok) {
      const { currency } = await res.json();
      if (currency && cfg.currencies[currency]) {
        try {
          sessionStorage.setItem("fid-geo-currency", currency);
        } catch {}
        return currency;
      }
    }
  } catch {
    /* offline, blocked, or a static preview without the API */
  }
  return timezoneGuess(cfg) || cfg.defaultCurrency || "NGN";
}

/** Rounds a converted figure to something a person would write: 2.5, 35, 1,200, 3,300. */
export function niceRound(v) {
  if (v < 10) return Math.max(0.5, Math.round(v * 2) / 2);
  if (v < 100) return Math.round(v);
  if (v < 1000) return Math.round(v / 5) * 5;
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / mag) * mag;
}

/** A naira figure shown in `code`: exact for NGN, approximate (≈) for everything else. */
export function fromNaira(ngn, code = current) {
  const cfg = moneyConfig();
  if (!code || code === "NGN") return formatMoney(Math.round(ngn), "NGN");
  if (!(ngn > 0)) return formatMoney(0, code);
  const rate = cfg.approxNgnRate?.[code];
  if (!rate) return formatMoney(Math.round(ngn), "NGN");
  return "≈ " + formatMoney(niceRound(ngn / rate), code);
}

function apply(code) {
  const cfg = moneyConfig();
  const c = cfg.currencies[code];
  if (!c) return;
  $$("[data-money-preset]").forEach((el) => {
    const amount = c.presets[Number(el.dataset.moneyPreset)];
    if (amount === undefined) return;
    el.textContent = formatMoney(amount, code);
    if (el.tagName === "A") el.href = `/donate/?amount=${amount}&currency=${code}`;
  });
  $$("[data-money-ngn]").forEach((el) => {
    el.textContent = fromNaira(Number(el.dataset.moneyNgn), code);
  });
  // point visitors to the GTBank account in their own currency
  $$("[data-bank-account]").forEach((el) => {
    const mine = el.dataset.bankAccount === code;
    el.classList.toggle("is-yours", mine);
    const tag = el.querySelector(".bank-account__yours");
    if (tag) tag.hidden = !mine;
  });
  document.documentElement.dataset.currency = code;
}

export function getCurrency() {
  return current;
}

/** Switch the whole page to `code`. `remember` = the visitor chose it, keep it for next time. */
export function setCurrency(code, { remember = false } = {}) {
  if (!moneyConfig().currencies[code]) return;
  if (remember) storage("fid-currency", code);
  if (code === current) return;
  current = code;
  apply(code);
  listeners.forEach((fn) => fn(code));
}

export function onCurrencyChange(fn) {
  listeners.add(fn);
  if (current) fn(current);
  return () => listeners.delete(fn);
}

export const currencyReady = detect(moneyConfig()).then((code) => {
  setCurrency(code);
  return code;
});

export function initCurrency() {
  return currencyReady;
}
