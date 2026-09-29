// Staff accounts for the console: password hashing, validation and the activity log.
// Passwords are hashed with PBKDF2-SHA256 and a random salt per person. The iteration count is kept
// modest because Cloudflare's free plan allows about 10 ms of CPU per request; sign-in attempts are
// rate-limited and passwords must be at least 10 characters.
import { HttpError, safeEqual } from "./http.js";
import { cleanText, isEmail } from "./validate.js";

const ITERATIONS = 10000;
export const ROLES = ["owner", "editor"];

const toB64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

/** "pbkdf2$<iterations>$<salt>$<hash>" */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(await derive(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iter, salt, hash] = String(stored || "").split("$");
  if (scheme !== "pbkdf2" || !salt || !hash) return false;
  const got = toB64(await derive(String(password), fromB64(salt), Number(iter)));
  return safeEqual(got, hash);
}

export function checkNewPassword(pw) {
  const p = String(pw || "");
  if (p.length < 10) throw new HttpError("Use at least 10 characters for the password.", 422);
  if (p.length > 200) throw new HttpError("That password is too long.", 422);
  if (/^(.)\1+$/.test(p) || /^(0123456789|1234567890|password)/i.test(p)) throw new HttpError("Choose a less guessable password.", 422);
  return p;
}

export function cleanStaff(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.name !== undefined) {
    out.name = cleanText(body.name, 60);
    if (out.name.length < 2) throw new HttpError("Enter a name.", 422);
  }
  if (!partial || body.email !== undefined) {
    out.email = cleanText(body.email, 160).toLowerCase();
    if (!isEmail(out.email)) throw new HttpError("Enter a valid email address.", 422);
  }
  if (!partial || body.role !== undefined) {
    out.role = ROLES.includes(body.role) ? body.role : "editor";
  }
  return out;
}

/** What the console is allowed to see about a person. */
export const publicStaff = (r) =>
  r && {
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    avatarId: r.avatar_id || null,
    disabled: !!r.disabled,
    createdAt: r.created_at || null,
    lastLoginAt: r.last_login_at || null,
  };

export async function staffCount(db) {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM staff").first();
  return row ? row.n : 0;
}

/** Records who did what, for the Activity page. Never throws: logging must not break the action. */
export async function logActivity(context, actor, action, detail = "") {
  try {
    await context.env.DB.prepare("INSERT INTO audit (actor, action, detail) VALUES (?, ?, ?)")
      .bind(String(actor || "Someone").slice(0, 60), action, String(detail || "").slice(0, 300))
      .run();
  } catch (e) {
    console.error("Activity log failed", e);
  }
}
