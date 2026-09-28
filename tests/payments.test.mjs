// End-to-end tests for the donation backend.
// Starts a mock Flutterwave API, runs the real Pages Functions with `wrangler pages dev` against a
// throwaway local D1 database, and exercises the whole flow.
//   npm run build   (once, so _site exists)
//   npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import { startMockFlutterwave } from "./mock-flutterwave.mjs";

const PORT = 8799;
const MOCK_PORT = 9999;
const BASE = `http://127.0.0.1:${PORT}`;
const KEY = "FLWSECK_TEST-mock";
const HASH = "test-webhook-hash-123";
const PERSIST = ".wrangler/test-state";

let mock;
let dev;

async function waitFor(url, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not start: ${url}`);
}

const post = (path, body, headers = {}) =>
  fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

const donation = (over = {}) => ({ amount: 15000, currency: "NGN", campaign: "christmas-scheme", name: "Ada Test", email: "ada@example.com", ...over });

async function startDonation(over) {
  const r = await post("/api/donations/init", donation(over));
  const body = await r.json();
  assert.equal(r.status, 200, JSON.stringify(body));
  return body;
}

/** Follows the mock checkout and returns the query params Flutterwave would send back. */
async function checkout(link, params = "") {
  const r = await fetch(link + params, { redirect: "manual" });
  assert.equal(r.status, 302);
  return new URL(r.headers.get("location")).searchParams;
}

before(async () => {
  assert.ok(fs.existsSync("_site/index.html"), "Run `npm run build` before the tests.");
  fs.rmSync(PERSIST, { recursive: true, force: true });
  execSync(`npx wrangler d1 migrations apply fidelstine --local --persist-to ${PERSIST}`, { stdio: "ignore", shell: true, env: { ...process.env, CI: "1" } });
  mock = await startMockFlutterwave({ port: MOCK_PORT, secretKey: KEY });
  const args = [
    "wrangler", "pages", "dev", "_site", "--port", String(PORT), "--ip", "127.0.0.1", "--persist-to", PERSIST,
    "--binding", `FLW_SECRET_KEY=${KEY}`,
    "--binding", `FLW_SECRET_HASH=${HASH}`,
    "--binding", `FLW_API_BASE=http://127.0.0.1:${MOCK_PORT}/v3`,
    "--binding", "ADMIN_DEV_BYPASS=1",
    "--binding", "RATE_SALT=test",
  ];
  dev = spawn("npx", args, { shell: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" } });
  let log = "";
  dev.stdout.on("data", (d) => (log += d));
  dev.stderr.on("data", (d) => (log += d));
  dev.on("exit", (code) => code && console.error("wrangler exited", code, log.slice(-2000)));
  await waitFor(`${BASE}/`);
});

after(async () => {
  if (dev) {
    if (process.platform === "win32") {
      try {
        execSync(`taskkill /pid ${dev.pid} /T /F`, { stdio: "ignore" });
      } catch {}
    } else dev.kill("SIGTERM");
  }
  await mock?.close();
});

test("rejects invalid donations", async () => {
  const cases = [
    [{ currency: "XYZ" }, 422],
    [{ amount: 100 }, 422], // below NGN minimum
    [{ amount: -5 }, 422],
    [{ email: "not-an-email" }, 422],
    [{ name: "" }, 422],
  ];
  for (const [over, code] of cases) {
    const r = await post("/api/donations/init", donation(over));
    assert.equal(r.status, code, `expected ${code} for ${JSON.stringify(over)}`);
  }
  const bad = await fetch(BASE + "/api/donations/init", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" });
  assert.equal(bad.status, 415);
});

test("honeypot submissions are ignored quietly", async () => {
  const r = await post("/api/donations/init", donation({ website: "http://spam" }));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).link, "/");
});

test("successful payment is verified and recorded once", async () => {
  const { link, tx_ref } = await startDonation();
  assert.match(tx_ref, /^FID-/);
  assert.equal(mock.payments.get(tx_ref).payload.amount, 15000);
  assert.equal(mock.payments.get(tx_ref).payload.currency, "NGN");
  assert.ok(mock.payments.get(tx_ref).payload.redirect_url.endsWith("/donate/thank-you/"));

  const back = await checkout(link);
  assert.equal(back.get("status"), "successful");
  const r1 = await post("/api/donations/verify", { tx_ref, transaction_id: back.get("transaction_id") });
  const v1 = await r1.json();
  assert.equal(v1.status, "successful");
  assert.equal(v1.outcome, "successful");
  assert.equal(v1.amount, 15000);
  assert.equal(v1.currency, "NGN");
  assert.equal(v1.campaignTitle, "Christmas Scheme");
  assert.equal(v1.firstName, "Ada");
  assert.equal(v1.email, undefined, "email must not be exposed");

  const v2 = await (await post("/api/donations/verify", { tx_ref, transaction_id: back.get("transaction_id") })).json();
  assert.equal(v2.status, "successful");
  assert.equal(v2.outcome, "already");
});

test("underpayment is not accepted", async () => {
  const { link, tx_ref } = await startDonation({ amount: 50000 });
  const back = await checkout(link, "?amount=500");
  const v = await (await post("/api/donations/verify", { tx_ref, transaction_id: back.get("transaction_id") })).json();
  assert.notEqual(v.status, "successful");
  assert.equal(v.outcome, "mismatch");
});

test("another donation's transaction id cannot confirm this one", async () => {
  const a = await startDonation({ amount: 5000 });
  const paidA = await checkout(a.link);
  const b = await startDonation({ amount: 50000 });
  const v = await (await post("/api/donations/verify", { tx_ref: b.tx_ref, transaction_id: paidA.get("transaction_id") })).json();
  assert.notEqual(v.status, "successful");
  assert.equal(v.outcome, "mismatch");
});

test("foreign currencies work (GBP)", async () => {
  const { link, tx_ref } = await startDonation({ amount: 25, currency: "GBP" });
  const back = await checkout(link);
  const v = await (await post("/api/donations/verify", { tx_ref, transaction_id: back.get("transaction_id") })).json();
  assert.equal(v.status, "successful");
  assert.equal(v.currency, "GBP");
  assert.equal(v.amount, 25);
});

test("failed and cancelled payments", async () => {
  const f = await startDonation();
  const fb = await checkout(f.link, "?outcome=failed");
  const vf = await (await post("/api/donations/verify", { tx_ref: f.tx_ref, transaction_id: fb.get("transaction_id") })).json();
  assert.equal(vf.status, "failed");

  const c = await startDonation();
  const cb = await checkout(c.link, "?outcome=cancelled");
  assert.equal(cb.get("status"), "cancelled");
  const vc = await (await post("/api/donations/verify", { tx_ref: c.tx_ref, cancelled: true })).json();
  assert.equal(vc.status, "abandoned");
});

test("webhook needs the secret hash, confirms closed-tab payments, and is idempotent", async () => {
  const { tx_ref } = await startDonation({ amount: 7500 });
  const tx = mock.pay(tx_ref); // donor paid but never came back to the site
  const payload = { event: "charge.completed", data: { id: tx.id, tx_ref, status: "successful", amount: 7500, currency: "NGN" } };

  assert.equal((await post("/api/webhooks/flutterwave", payload)).status, 401);
  assert.equal((await post("/api/webhooks/flutterwave", payload, { "verif-hash": "wrong" })).status, 401);

  const w1 = await (await post("/api/webhooks/flutterwave", payload, { "verif-hash": HASH })).json();
  assert.equal(w1.outcome, "successful");
  const w2 = await (await post("/api/webhooks/flutterwave", payload, { "verif-hash": HASH })).json();
  assert.equal(w2.outcome, "already");

  // a forged webhook claiming success for an unpaid donation must not confirm it
  const unpaid = await startDonation({ amount: 9000 });
  const forged = { event: "charge.completed", data: { id: 999999, tx_ref: unpaid.tx_ref, status: "successful", amount: 9000, currency: "NGN" } };
  const w3 = await (await post("/api/webhooks/flutterwave", forged, { "verif-hash": HASH })).json();
  assert.notEqual(w3.outcome, "successful");
});

test("campaign total counts only successful gifts", async () => {
  const r = await fetch(`${BASE}/api/campaign/christmas-scheme`);
  const data = await r.json();
  assert.equal(r.status, 200);
  // 15,000 NGN + 25 GBP (approx 2,000 each) + 7,500 NGN from the webhook test = 72,500
  assert.equal(data.raisedNGN, 72500);
  assert.equal(data.donors, 3);
  assert.equal((await fetch(`${BASE}/api/campaign/nope`)).status, 404);
});

test("newsletter and contact forms", async () => {
  assert.equal((await post("/api/newsletter", { email: "news@example.com" })).status, 200);
  assert.equal((await post("/api/newsletter", { email: "news@example.com" })).status, 200, "duplicates are fine");
  assert.equal((await post("/api/newsletter", { email: "bad" })).status, 422);
  assert.equal((await post("/api/contact", { name: "Bo", email: "bo@example.com", message: "Hello there, a question." })).status, 200);
  assert.equal((await post("/api/contact", { name: "Bo", email: "bo@example.com", message: "short" })).status, 422);
});

test("admin API lists donations, totals and CSV", async () => {
  const r = await fetch(`${BASE}/api/admin/donations?status=successful`);
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.user, "dev@localhost");
  assert.ok(data.items.length >= 3);
  const ngn = data.totals.find((t) => t.currency === "NGN");
  assert.ok(ngn && ngn.total >= 2250000);

  const csv = await fetch(`${BASE}/api/admin/donations?format=csv`);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type"), /text\/csv/);
  const text = await csv.text();
  assert.match(text, /tx_ref/);

  const news = await (await fetch(`${BASE}/api/admin/newsletter`)).json();
  assert.ok(news.items.some((i) => i.email === "news@example.com"));
  const msgs = await (await fetch(`${BASE}/api/admin/messages`)).json();
  assert.ok(msgs.items.length >= 1);
});

test("pages are served", async () => {
  for (const path of ["/", "/about/", "/programmes/", "/gallery/", "/christmas-scheme/", "/donate/", "/contact/", "/donate/thank-you/", "/privacy/"]) {
    const r = await fetch(BASE + path);
    assert.equal(r.status, 200, path);
  }
});
