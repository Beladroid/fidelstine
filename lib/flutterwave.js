// Flutterwave v3 API client (Standard / hosted checkout).
// Docs: https://developer.flutterwave.com/docs/collecting-payments/standard
import { HttpError } from "./http.js";

const API = "https://api.flutterwave.com/v3";

function key(env) {
  if (!env.FLW_SECRET_KEY) throw new HttpError("Online giving is not configured yet.", 503);
  return env.FLW_SECRET_KEY;
}

async function call(env, path, init = {}) {
  // FLW_API_BASE is only for automated tests against a mock server
  const base = (env.FLW_API_BASE || API).replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key(env)}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, body };
}

/** Creates a hosted checkout link. Returns the URL to send the donor to. */
export async function createPayment(env, payload) {
  const r = await call(env, "/payments", { method: "POST", body: JSON.stringify(payload) });
  if (!r.ok || r.body?.status !== "success" || !r.body?.data?.link) {
    console.error("Flutterwave /payments failed", r.status, r.body?.message);
    throw new HttpError("We could not start the payment. Please try again in a moment.", 502);
  }
  return r.body.data.link;
}

/** Looks up a transaction by Flutterwave's numeric id. Returns the data object or null. */
export async function verifyTransaction(env, id) {
  if (!/^\d{1,20}$/.test(String(id))) return null;
  const r = await call(env, `/transactions/${id}/verify`);
  if (!r.ok || r.body?.status !== "success") return null;
  return r.body.data;
}

/** Looks up a transaction by our own tx_ref. Returns the data object or null. */
export async function verifyByReference(env, txRef) {
  const r = await call(env, `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`);
  if (!r.ok || r.body?.status !== "success") return null;
  return r.body.data;
}
