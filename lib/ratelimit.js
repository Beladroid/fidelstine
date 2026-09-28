// Simple sliding-window rate limit stored in D1. IPs are hashed, never stored raw.
// A Cloudflare WAF rate-limiting rule is still recommended in front of /api/* (see docs/DEPLOY.md).
import { clientIp, sha256, HttpError } from "./http.js";

export async function rateLimit(context, bucket, { limit, windowSeconds }) {
  const db = context.env.DB;
  if (!db) return;
  const salt = context.env.RATE_SALT || "fidelstine";
  const key = `${bucket}:${(await sha256(salt + clientIp(context.request))).slice(0, 24)}`;
  const now = Math.floor(Date.now() / 1000);
  const since = now - windowSeconds;
  const row = await db.prepare("SELECT COUNT(*) AS n FROM rate_events WHERE key = ? AND ts > ?").bind(key, since).first();
  if (row && row.n >= limit) throw new HttpError("Too many attempts. Please wait a few minutes and try again.", 429);
  await db.prepare("INSERT INTO rate_events (key, ts) VALUES (?, ?)").bind(key, now).run();
  // occasional clean-up of old rows
  if (Math.random() < 0.05) {
    context.waitUntil?.(db.prepare("DELETE FROM rate_events WHERE ts < ?").bind(now - 86400).run());
  }
}
