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
