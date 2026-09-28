// Small HTTP helpers for Cloudflare Pages Functions.

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

export function error(message, status = 400, extra = {}) {
  return json({ error: message, ...extra }, status);
}

/** Parses a JSON body, refusing anything over `limit` bytes. */
export async function readJson(request, limit = 16 * 1024) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new HttpError("Expected JSON", 415);
  const text = await request.text();
  if (text.length > limit) throw new HttpError("Request too large", 413);
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new HttpError("Invalid JSON", 400);
  }
}

export class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Wraps a handler so thrown HttpErrors become JSON responses and other errors are logged. */
export function handle(fn) {
  return async (context) => {
    try {
      return await fn(context);
    } catch (e) {
      if (e instanceof HttpError) return error(e.message, e.status);
      console.error("Unhandled error", e && e.stack ? e.stack : e);
      return error("Something went wrong on our side. Please try again in a moment.", 500);
    }
  };
}

/** Origin of the site for building absolute links (prefers SITE_URL, falls back to the request). */
export function siteOrigin(context) {
  const configured = context.env.SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  return new URL(context.request.url).origin;
}

export function clientIp(request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison for secrets. */
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const len = Math.max(ea.length, eb.length);
  for (let i = 0; i < len; i++) diff |= (ea[i] || 0) ^ (eb[i] || 0);
  return diff === 0;
}
