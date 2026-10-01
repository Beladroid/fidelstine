// Fast unit tests for pure helpers (no server needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDonation, isEmail, cleanText } from "../lib/validate.js";
import { toCsv } from "../lib/csv.js";
import { toMinor, fromMinor, CURRENCIES } from "../lib/currencies.js";
import { safeEqual } from "../lib/http.js";

test("validateDonation normalises good input", () => {
  const d = validateDonation({ amount: "15000", currency: "ngn", campaign: "nope", name: "  Ada  ", email: "ADA@Example.com", anonymous: true });
  assert.equal(d.amount, 15000);
  assert.equal(d.currency, "NGN");
  assert.equal(d.campaign, "general", "unknown campaigns fall back to general");
  assert.equal(d.name, "Ada");
  assert.equal(d.email, "ada@example.com");
  assert.equal(d.anonymous, true);
});

test("validateDonation enforces limits", () => {
  assert.throws(() => validateDonation({ amount: 1, currency: "GBP", name: "Ada", email: "a@b.co" }), /minimum/);
  assert.throws(() => validateDonation({ amount: 10, currency: "BTC", name: "Ada", email: "a@b.co" }), /currency/);
  assert.throws(() => validateDonation({ amount: 1e12, currency: "NGN", name: "Ada", email: "a@b.co" }), /contact us/);
});

test("email and text cleaning", () => {
  assert.ok(isEmail("ada@example.com"));
  assert.ok(!isEmail("ada@example"));
  assert.ok(!isEmail("<script>@x.com"));
  assert.equal(cleanText("a\u0000b  ", 10), "ab");
  assert.equal(cleanText("x".repeat(50), 5), "xxxxx");
});

test("money is stored in minor units", () => {
  assert.equal(toMinor(15000), 1500000);
  assert.equal(toMinor(10.1), 1010);
  assert.equal(fromMinor(1010), 10.1);
  for (const [code, c] of Object.entries(CURRENCIES)) {
    assert.ok(c.presets.every((p) => p >= c.min && p <= c.max), `${code} presets within limits`);
  }
});

test("CSV quotes values and blocks formula injection", () => {
  const csv = toCsv([{ a: "=HYPERLINK(1)", b: 'say "hi"', c: "x,y" }]);
  assert.match(csv, /'=HYPERLINK\(1\)/);
  assert.match(csv, /"say ""hi"""/);
  assert.match(csv, /"x,y"/);
});

test("safeEqual", () => {
  assert.ok(safeEqual("abc", "abc"));
  assert.ok(!safeEqual("abc", "abd"));
  assert.ok(!safeEqual("abc", "abcd"));
  assert.ok(!safeEqual(undefined, "abc"));
});

test("visitor country picks the right currency", async () => {
  const { currencyForCountry } = await import("../lib/currencies.js");
  assert.equal(currencyForCountry("NG"), "NGN");
  assert.equal(currencyForCountry("gb"), "GBP");
  assert.equal(currencyForCountry("US"), "USD");
  assert.equal(currencyForCountry("DE"), "EUR");
  assert.equal(currencyForCountry("GH"), "GHS");
  assert.equal(currencyForCountry("IN"), "USD", "unsupported countries fall back to dollars");
  assert.equal(currencyForCountry("XX"), null);
  assert.equal(currencyForCountry(""), null);
  assert.equal(currencyForCountry("<script>"), null);
});

test("impact numbers merge and validation", async () => {
  const { mergeStats, validateStats } = await import("../lib/stats.js");
  const defaults = [{ key: "a", value: 1, label: "Alpha", suffix: "+" }, { key: "b", value: 2, label: "Beta" }];
  assert.deepEqual(mergeStats(defaults, null), [{ key: "a", value: 1, suffix: "+", label: "Alpha" }, { key: "b", value: 2, suffix: "", label: "Beta" }]);
  const merged = mergeStats(defaults, { items: [{ key: "b", value: 9, label: "Bee", suffix: "" }] });
  assert.equal(merged[1].value, 9);
  assert.equal(merged[0].value, 1);
  assert.throws(() => validateStats(defaults, { items: [{ key: "z", value: 1, label: "Zed" }] }), /Unknown/);
  assert.throws(() => validateStats(defaults, { items: [{ key: "a", value: 1e9, label: "Alpha" }] }), /whole number/);
  assert.deepEqual(validateStats(defaults, { items: [{ key: "a", value: "5", label: " Alpha ", suffix: "+" }] }).items[0], { key: "a", value: 5, suffix: "+", label: "Alpha" });
});

test("content sections validate and normalise", async () => {
  const { validateSection, contentDefaults, SECTIONS, render } = await import("../lib/content.js");
  const fs = await import("node:fs");
  const copy = JSON.parse(fs.readFileSync("src/_data/copy.json", "utf8"));
  const defaults = contentDefaults(copy);
  // every starting value passes its own validation
  for (const s of SECTIONS) assert.doesNotThrow(() => validateSection(s.key, defaults[s.key]), s.key);

  assert.throws(() => validateSection("spending", { note: "", items: [{ label: "Care", percent: 60 }, { label: "School", percent: 30 }] }), /add up to 90/);
  assert.throws(() => validateSection("giftImpact", { NGN: [{ amount: 500, text: "Pens" }, { amount: 400, text: "Food" }, { amount: 900, text: "More" }] }), /order/);
  assert.throws(() => validateSection("documents", { items: [{ title: "Report", url: "javascript:alert(1)" }] }), /https/);
  assert.throws(() => validateSection("contact", { ...defaults.contact, whatsapp: "12" }), /phone number/);
  // each WhatsApp number gets a button labelled by country; a single saved number still works
  const wa = validateSection("contact", { ...defaults.contact, whatsapp: "+234 802 342 5558\n+44 7398 277555" });
  assert.deepEqual(wa.whatsapp, ["+234 802 342 5558", "+44 7398 277555"]);
  assert.ok(render.waButtons(wa).includes("wa.me/2348023425558") && render.waButtons(wa).includes("WhatsApp UK"));
  assert.ok(render.waLines({ whatsapp: "+234 802 342 5558" }).includes("(Nigeria)"));
  assert.throws(() => validateSection("announcement", { enabled: true, text: "" }), /message/);
  assert.throws(() => validateSection("nope", {}), /Unknown section/);

  const c = validateSection("contact", { ...defaults.contact, phonesNigeria: "+234 802 342 5558\n\n +234 703 981 2282 ", email: "INFO@Fidelstine.org" });
  assert.deepEqual(c.phonesNigeria, ["+234 802 342 5558", "+234 703 981 2282"]);
  assert.equal(c.email, "info@fidelstine.org");

  // rendered markup is escaped
  const html = render.testimonials([{ quote: "<script>x</script>", name: "A <b>", role: "" }]);
  assert.ok(!html.includes("<script>") && html.includes("&lt;script&gt;"));
});

test("manual gifts validate", async () => {
  const { validateGift } = await import("../lib/gifts.js");
  const now = new Date("2026-10-01T10:00:00Z");
  const g = validateGift({ amount: "25000", currency: "ngn", method: "GTBank transfer", date: "2026-09-30", campaign: "christmas-scheme", name: "" }, now);
  assert.equal(g.amount, 25000);
  assert.equal(g.currency, "NGN");
  assert.equal(g.name, "Anonymous");
  assert.throws(() => validateGift({ ...g, date: "2026-12-01" }, now), /future/);
  assert.throws(() => validateGift({ ...g, method: "Bitcoin" }, now), /received/);
  assert.throws(() => validateGift({ ...g, amount: 0 }, now), /amount/);
});

test("staff passwords hash and verify", async () => {
  const { hashPassword, verifyPassword, checkNewPassword } = await import("../lib/staff.js");
  const hash = await hashPassword("a long enough password");
  assert.match(hash, /^pbkdf2\$10000\$/);
  assert.equal(await verifyPassword("a long enough password", hash), true);
  assert.equal(await verifyPassword("a long enough passworD", hash), false);
  assert.notEqual(await hashPassword("a long enough password"), hash, "each hash has its own salt");
  assert.throws(() => checkNewPassword("short"), /10 characters/);
});

test("console sessions are signed, expire, and end when the password changes", async () => {
  const { createSession, readSession, SESSION_SECONDS } = await import("../lib/access.js");
  const { hashPassword } = await import("../lib/staff.js");
  const rows = { 1: { id: 1, name: "Uju", email: "uju@example.com", role: "owner", password_hash: await hashPassword("first password 123"), disabled: 0 } };
  const db = { prepare: () => ({ bind: (id) => ({ first: async () => (rows[id] && !rows[id].disabled ? rows[id] : null) }) }) };
  const context = { env: { ADMIN_PASSWORD: "setup key", DB: db } };
  const now = Date.UTC(2026, 8, 29, 9);
  const v = await createSession(context.env, rows[1], now);
  assert.equal((await readSession(context, v, now + 1000)).name, "Uju");
  assert.equal(await readSession(context, v, now + (SESSION_SECONDS + 5) * 1000), null, "expired");
  const [exp, , sig] = v.split(".");
  assert.equal(await readSession(context, `${exp}.2.${sig}`, now), null, "id can't be swapped");
  rows[1].password_hash = await hashPassword("second password 456");
  assert.equal(await readSession(context, v, now + 1000), null, "a new password signs that person out");
  rows[1].disabled = 1;
  assert.equal(await readSession(context, await createSession(context.env, rows[1], now), now), null, "switched-off accounts can't sign in");
});

test("donor reports need a name and a recent date", async () => {
  const { validateGift } = await import("../lib/gifts.js");
  const now = new Date("2026-10-01T10:00:00Z");
  const ok = validateGift({ amount: 50, currency: "GBP", method: "PayPal", date: "2026-09-30", campaign: "nope", name: "Ada" }, now, true);
  assert.equal(ok.campaign, "general");
  assert.throws(() => validateGift({ ...ok, name: "" }, now, true), /name/);
  assert.throws(() => validateGift({ ...ok, method: "Cash" }, now, true), /how you sent/);
  assert.throws(() => validateGift({ ...ok, date: "2026-05-01" }, now, true), /90 days/);
});
