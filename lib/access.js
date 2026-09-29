// Console sign-in.
//  - Staff accounts (the `staff` table): /api/admin/login checks email and password and sets a signed,
//    HttpOnly session cookie for 12 hours. The signature includes part of the person's password hash,
//    so changing a password signs that person out everywhere.
//  - The first owner account is created with the setup key (ADMIN_PASSWORD secret): /api/admin/setup.
//  - Optional: Cloudflare Access in front of the console. Its signed JWT is verified below.
//   SESSION_SECRET      optional; signs sessions (falls back to ADMIN_PASSWORD)
//   ACCESS_TEAM_DOMAIN  e.g. "fidelstine.cloudflareaccess.com"
//   ACCESS_AUD          the Application Audience (AUD) tag from the Access application
//   ADMIN_EMAILS        optional comma-separated allow-list for Access
//   ADMIN_DEV_BYPASS    "1" allows access from localhost during development only
import { error, safeEqual } from "./http.js";

export const SESSION_COOKIE = "fid_admin";
export const SESSION_SECONDS = 12 * 60 * 60;
const DEV_USER = { id: 0, name: "Developer", email: "dev@localhost", role: "owner", avatarId: null };

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

/**
 * Returns { email, user } for a signed-in person ("email" is the display name used in "changed by"),
 * or { response } to send back. Pass { owner: true } for owner-only actions.
 */
export async function requireAdmin(context, { owner = false } = {}) {
  const { request, env } = context;
  const host = new URL(request.url).hostname;
  const ok = (user) =>
    owner && user.role !== "owner" ? { response: error("Only an owner can do this.", 403) } : { email: user.name, user };

  if (env.ADMIN_DEV_BYPASS === "1" && (host === "localhost" || host === "127.0.0.1")) return ok(DEV_USER);

  const accessOn = !!(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);
  const sessionsOn = !!sessionKey(env);
  if (!accessOn && !sessionsOn) return { response: error("Staff sign-in is not set up on this site yet.", 503) };

  if (sessionsOn) {
    const user = await readSession(context, cookie(request, SESSION_COOKIE));
    if (user) return ok(user);
  }
  if (accessOn) {
    const token = request.headers.get("Cf-Access-Jwt-Assertion") || cookie(request, "CF_Authorization");
    if (token) {
      let payload = null;
      try {
        payload = await verifyJwt(token, env);
      } catch (e) {
        console.error("Access verification error", e);
      }
      if (payload?.email) {
        const allow = (env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        if (allow.length && !allow.includes(payload.email.toLowerCase())) return { response: error("Not allowed.", 403) };
        return ok({ id: 0, name: payload.email, email: payload.email, role: "owner", avatarId: null });
      }
    }
  }
  return { response: error("Sign in required.", 401, { login: sessionsOn }) };
}

function cookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/* ---------- sessions ---------- */

const sessionKey = (env) => env.SESSION_SECRET || env.ADMIN_PASSWORD || "";
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const stamp = (row) => String(row.password_hash || "").slice(-16);

async function sign(env, data) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`fid-console:${sessionKey(env)}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))));
}

/** Cookie value for a staff row: "<expires>.<id>.<signature>". */
export async function createSession(env, row, now = Date.now()) {
  const exp = Math.floor(now / 1000) + SESSION_SECONDS;
  return `${exp}.${row.id}.${await sign(env, `${exp}.${row.id}.${stamp(row)}`)}`;
}

/** The signed-in staff member, or null. */
export async function readSession(context, value, now = Date.now()) {
  const env = context.env;
  if (!value || !sessionKey(env)) return null;
  const [exp, id, sig] = value.split(".");
  if (!exp || !id || !sig || Number(exp) < now / 1000 || !/^\d+$/.test(id)) return null;
  const row = await env.DB.prepare("SELECT * FROM staff WHERE id = ? AND disabled = 0").bind(Number(id)).first();
  if (!row) return null;
  if (!safeEqual(sig, await sign(env, `${exp}.${row.id}.${stamp(row)}`))) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role, avatarId: row.avatar_id || null };
}

export function sessionCookie(value, request, maxAge = SESSION_SECONDS) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
