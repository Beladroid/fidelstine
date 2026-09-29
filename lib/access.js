// Admin sign-in. Two ways, either or both:
//  1. Cloudflare Access in front of /admin/* and /api/admin/* (verified below from its signed JWT).
//  2. A shared staff password (ADMIN_PASSWORD secret): /api/admin/login sets a signed, HttpOnly
//     session cookie for 12 hours. Changing the password signs everyone out.
// Cloudflare Access sits in front of /admin/* and /api/admin/*. We still check its signed JWT here,
// so the admin API stays closed even if someone reaches it on another hostname.
//   ACCESS_TEAM_DOMAIN  e.g. "fidelstine.cloudflareaccess.com"
//   ACCESS_AUD          the Application Audience (AUD) tag from the Access application
//   ADMIN_EMAILS        optional comma-separated allow-list
//   ADMIN_DEV_BYPASS    "1" allows access from localhost during development only
import { error, safeEqual } from "./http.js";

export const SESSION_COOKIE = "fid_admin";
export const SESSION_SECONDS = 12 * 60 * 60;

let certCache = { at: 0, keys: [] };

function b64urlToBytes(s) {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function decodePart(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

async function getKeys(team) {
  if (Date.now() - certCache.at < 60 * 60 * 1000 && certCache.keys.length) return certCache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error("Could not fetch Access certs");
  const { keys } = await res.json();
  certCache = { at: Date.now(), keys };
  return keys;
}

async function verifyJwt(token, env) {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  const header = decodePart(h);
  const payload = decodePart(p);
  if (header.alg !== "RS256") return null;
  const keys = await getKeys(env.ACCESS_TEAM_DOMAIN);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;
  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return null;
  if (payload.exp && payload.exp < now) return null;
  if (payload.iss && payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
  return payload;
}

/** Returns { email } for a signed-in admin, or a Response to send back. */
export async function requireAdmin(context) {
  const { request, env } = context;
  const host = new URL(request.url).hostname;
  if (env.ADMIN_DEV_BYPASS === "1" && (host === "localhost" || host === "127.0.0.1")) return { email: "dev@localhost" };

  const accessOn = !!(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);
  const passwordOn = !!env.ADMIN_PASSWORD;
  if (!accessOn && !passwordOn) return { response: error("Admin access is not configured.", 503) };

  if (passwordOn) {
    const name = await readSession(env, cookie(request, SESSION_COOKIE));
    if (name) return { email: name };
  }
  const token = accessOn ? request.headers.get("Cf-Access-Jwt-Assertion") || cookie(request, "CF_Authorization") : null;
  if (!token) return { response: error("Sign in required.", 401, { login: passwordOn }) };
  let payload = null;
  try {
    payload = await verifyJwt(token, env);
  } catch (e) {
    console.error("Access verification error", e);
  }
  if (!payload || !payload.email) return { response: error("Sign in required.", 401) };
  const allow = (env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allow.length && !allow.includes(payload.email.toLowerCase())) return { response: error("Not allowed.", 403) };
  return { email: payload.email };
}

function cookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/* ---------- password sessions ---------- */

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sign(env, data) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`fid-admin:${env.ADMIN_PASSWORD}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))));
}

/** A session value: "<expires>.<name>.<signature>". */
export async function createSession(env, name, now = Date.now()) {
  const exp = Math.floor(now / 1000) + SESSION_SECONDS;
  const who = b64url(new TextEncoder().encode(name));
  return `${exp}.${who}.${await sign(env, `${exp}.${who}`)}`;
}

export async function readSession(env, value, now = Date.now()) {
  if (!value || !env.ADMIN_PASSWORD) return null;
  const [exp, who, sig] = value.split(".");
  if (!exp || !who || !sig || Number(exp) < now / 1000) return null;
  if (!safeEqual(sig, await sign(env, `${exp}.${who}`))) return null;
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(who.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

export function sessionCookie(value, request, maxAge = SESSION_SECONDS) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
