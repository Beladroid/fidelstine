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
    "--binding", "ADMIN_PASSWORD=test-setup-key",
    "--binding", "ADMIN_PATH=test-console",
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
  assert.equal(data.user, "Developer", "the signed-in person's name, used for 'changed by'");
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

test("geo endpoint returns a supported currency or null", async () => {
  const r = await fetch(`${BASE}/api/geo`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("cache-control"), /no-store/);
  const { currency } = await r.json();
  assert.ok(currency === null || ["NGN", "GBP", "USD", "EUR", "GHS", "KES", "ZAR", "CAD"].includes(currency));
});

test("impact numbers: public read, admin update, validation, cache cleared", async () => {
  const before = await (await fetch(`${BASE}/api/stats`)).json();
  assert.equal(before.items.length, 5);
  assert.equal(before.custom, false);
  const trained = before.items.find((i) => i.key === "trained");
  assert.equal(trained.label, "Trained and empowered");

  const put = (body) => fetch(`${BASE}/api/admin/stats`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await put({ items: [{ key: "nope", value: 1, label: "x y", suffix: "" }] })).status, 422);
  assert.equal((await put({ items: [{ key: "children", value: -3, label: "Children sheltered", suffix: "+" }] })).status, 422);
  assert.equal((await put({ items: [{ key: "children", value: 12.5, label: "Children sheltered", suffix: "+" }] })).status, 422);
  assert.equal((await put({ items: [{ key: "children", value: 10, label: "Children sheltered", suffix: "<b>" }] })).status, 422);

  const ok = await put({ items: [{ key: "children", value: 312, label: "Children sheltered", suffix: "+" }, { key: "trained", value: 77, label: "Young people trained", suffix: "" }] });
  assert.equal(ok.status, 200);
  const after = await (await fetch(`${BASE}/api/stats`)).json();
  assert.equal(after.custom, true);
  assert.equal(after.items.find((i) => i.key === "children").value, 312);
  assert.equal(after.items.find((i) => i.key === "trained").label, "Young people trained");
  assert.equal(after.items.find((i) => i.key === "years").value, 6, "untouched figures keep their starting value");
});

test("site content: admin edits appear on the served pages", async () => {
  const put = (key, body) => fetch(`${BASE}/api/admin/content/${key}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const list = await (await fetch(`${BASE}/api/admin/content`)).json();
  const byKey = Object.fromEntries(list.sections.map((s) => [s.key, s]));
  assert.equal(byKey.testimonials.custom, false);

  assert.equal((await put("spending", { note: "", items: [{ label: "Care", percent: 50 }, { label: "School", percent: 20 }] })).status, 422);

  const quote = "A brand new story from the admin panel.";
  assert.equal((await put("testimonials", { items: [{ quote, name: "Test Person", role: "Volunteer" }] })).status, 200);
  assert.equal((await put("campaign", { headline: "Christmas for every family", targetNGN: 7500000, endsAt: "2026-12-20" })).status, 200);
  assert.equal((await put("contact", { ...byKey.contact.value, whatsapp: "+234 811 111 1111", email: "hello@fidelstine.org" })).status, 200);
  assert.equal((await put("announcement", { enabled: true, text: "Packing day is on Saturday.", linkUrl: "/contact/", linkLabel: "Join us" })).status, 200);

  const about = await (await fetch(`${BASE}/about/`)).text();
  assert.ok(about.includes(quote), "new testimonial is on the About page");
  assert.ok(about.includes("Packing day is on Saturday."), "announcement shows");
  assert.ok(about.includes("wa.me/2348111111111"), "WhatsApp links use the new number");
  assert.ok(about.includes("mailto:hello@fidelstine.org"), "footer email updated");

  const xmas = await (await fetch(`${BASE}/christmas-scheme/`)).text();
  assert.ok(xmas.includes("Christmas for every family"));
  assert.ok(xmas.includes('data-target="7500000"'));
  assert.ok(xmas.includes('data-countdown="2026-12-20T23:59:59+01:00"'));
  const camp = await (await fetch(`${BASE}/api/campaign/christmas-scheme`)).json();
  assert.equal(camp.targetNGN, 7500000);

  // back to the starting text
  assert.equal((await fetch(`${BASE}/api/admin/content/announcement`, { method: "DELETE" })).status, 200);
  const again = await (await fetch(`${BASE}/about/`)).text();
  assert.ok(!again.includes("Packing day is on Saturday."));
});

test("recorded gifts count towards the campaign and can be removed", async () => {
  const before = await (await fetch(`${BASE}/api/campaign/christmas-scheme`)).json();
  const today = new Date().toISOString().slice(0, 10);
  const r = await post("/api/admin/gifts", { amount: 20000, currency: "NGN", method: "GTBank transfer", date: today, campaign: "christmas-scheme", name: "Bank Donor", reference: "GTB-123" });
  assert.equal(r.status, 201);
  const { txRef } = await r.json();
  assert.match(txRef, /^MAN-/);
  const after = await (await fetch(`${BASE}/api/campaign/christmas-scheme`)).json();
  assert.equal(after.raisedNGN - before.raisedNGN, 20000);

  const list = await (await fetch(`${BASE}/api/admin/donations?q=${txRef}`)).json();
  const row = list.items[0];
  assert.equal(row.payment_type, "GTBank transfer");
  assert.match(row.notes, /GTB-123/);

  // online payments can't be removed, manual entries can
  const online = (await (await fetch(`${BASE}/api/admin/donations?status=successful`)).json()).items.find((d) => !d.tx_ref.startsWith("MAN-"));
  if (online) assert.equal((await fetch(`${BASE}/api/admin/gifts/${online.id}`, { method: "DELETE" })).status, 403);
  assert.equal((await fetch(`${BASE}/api/admin/gifts/${row.id}`, { method: "DELETE" })).status, 200);
});

test("a donor's report waits for staff, then counts once confirmed", async () => {
  const before = await (await fetch(`${BASE}/api/campaign/christmas-scheme`)).json();
  const today = new Date().toISOString().slice(0, 10);
  const r = await post("/api/donations/report", { name: "Kind Donor", email: "kind@example.com", method: "GTBank transfer", date: today, amount: 12000, currency: "NGN", campaign: "christmas-scheme", reference: "TRF-9" });
  assert.equal(r.status, 201);
  assert.equal((await post("/api/donations/report", { name: "", method: "GTBank transfer", date: today, amount: 5, currency: "NGN" })).status, 422);

  const list = await (await fetch(`${BASE}/api/admin/donations?status=pending&q=REP-`)).json();
  assert.ok(list.awaiting >= 1);
  const row = list.items.find((d) => d.donor_name === "Kind Donor");
  assert.equal(row.status, "pending");
  const mid = await (await fetch(`${BASE}/api/campaign/christmas-scheme`)).json();
  assert.equal(mid.raisedNGN, before.raisedNGN, "a report alone doesn't count");

  const c = await fetch(`${BASE}/api/admin/gifts/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "successful" }) });
  assert.equal(c.status, 200);
  const after = await (await fetch(`${BASE}/api/campaign/christmas-scheme`)).json();
  assert.equal(after.raisedNGN - before.raisedNGN, 12000);
});

test("the console lives only at its private address", async () => {
  const page = await fetch(`${BASE}/test-console/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Fidelstine Console/);
  assert.match(page.headers.get("x-robots-tag") || "", /noindex/);
  assert.equal((await fetch(`${BASE}/console-app/`)).status, 404, "the build folder is never served directly");
  assert.equal((await fetch(`${BASE}/admin/`)).status, 404, "the old address is gone");
});

test("first owner account: setup key required, then email + password sign-in", async () => {
  const setup = (body) => post("/api/admin/setup", body);
  const person = { name: "Uju Test", email: "uju@example.com", password: "a proper long password" };
  assert.equal((await setup({ ...person, setupKey: "wrong" })).status, 401);
  assert.equal((await setup({ ...person, password: "short", setupKey: "test-setup-key" })).status, 422);
  const ok = await setup({ ...person, setupKey: "test-setup-key" });
  assert.equal(ok.status, 201);
  assert.match(ok.headers.get("set-cookie") || "", /fid_admin=.+HttpOnly/);
  assert.equal((await setup({ ...person, email: "second@example.com", setupKey: "test-setup-key" })).status, 409, "only works once");

  assert.equal((await post("/api/admin/login", { email: "uju@example.com", password: "not it at all" })).status, 401);
  const login = await post("/api/admin/login", { email: "UJU@example.com", password: "a proper long password" });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).user.role, "owner");
});

test("photos: upload, serve, show in the gallery, protect while used", async () => {
  // 1x1 PNG
  const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
  const form = new FormData();
  form.append("large", new Blob([png], { type: "image/png" }), "l.png");
  form.append("small", new Blob([png], { type: "image/png" }), "s.png");
  form.append("width", "1");
  form.append("height", "1");
  form.append("kind", "gallery");
  form.append("caption", "Packing Christmas hampers");
  form.append("inGallery", "1");
  const up = await fetch(`${BASE}/api/admin/images`, { method: "POST", body: form });
  assert.equal(up.status, 201);
  const { item } = await up.json();
  assert.match(item.id, /^[a-z0-9]{16}$/);

  const img = await fetch(`${BASE}${item.small}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("content-type"), "image/png");
  assert.match(img.headers.get("cache-control"), /immutable/);

  const gallery = await (await fetch(`${BASE}/gallery/`)).text();
  assert.ok(gallery.includes("Packing Christmas hampers"), "new photo appears on the Gallery page");

  // use it as a team photo, then try to delete it
  const content = await (await fetch(`${BASE}/api/admin/content`)).json();
  const team = content.sections.find((s) => s.key === "team").value;
  team.items[0].photo = item.id;
  assert.equal((await fetch(`${BASE}/api/admin/content/team`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(team) })).status, 200);
  const about = await (await fetch(`${BASE}/about/`)).text();
  assert.ok(about.includes(`/api/images/${item.id}/s`), "team photo shows on the About page");
  assert.equal((await fetch(`${BASE}/api/admin/images/${item.id}`, { method: "DELETE" })).status, 409);
  assert.equal((await fetch(`${BASE}/api/admin/images/${item.id}?force=1`, { method: "DELETE" })).status, 200);
  assert.equal((await fetch(`${BASE}/api/admin/content/team`, { method: "DELETE" })).status, 200);
});

test("overview and activity for the console", async () => {
  const o = await (await fetch(`${BASE}/api/admin/overview`)).json();
  assert.ok(Array.isArray(o.series) && Array.isArray(o.byCampaign));
  assert.equal(o.campaign.slug, "christmas-scheme");
  const a = await (await fetch(`${BASE}/api/admin/activity`)).json();
  assert.ok(a.items.some((x) => x.action === "uploaded a photo"));
});
