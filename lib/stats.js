// Impact numbers shown on the home page ("Children sheltered", ...). The starting figures live in
// src/_data/copy.json; staff can override them from the admin panel, stored in D1 `settings`.
import { HttpError } from "./http.js";
import { cleanText } from "./validate.js";

export const STATS_KEY = "impact";
const SUFFIXES = ["", "+", "%", "k", "k+", "m", "m+"];

/** Starting figures merged with any saved overrides (same order as the defaults). */
export function mergeStats(defaults, saved) {
  const byKey = new Map((saved?.items || []).map((i) => [i.key, i]));
  return defaults.map((d) => {
    const s = byKey.get(d.key);
    return {
      key: d.key,
      value: s && Number.isFinite(s.value) ? s.value : d.value,
      suffix: s && typeof s.suffix === "string" ? s.suffix : d.suffix || "",
      label: s && s.label ? s.label : d.label,
    };
  });
}

/** Validates an admin update. Only known keys, whole numbers, short labels. */
export function validateStats(defaults, body) {
  const known = new Set(defaults.map((d) => d.key));
  if (!body || !Array.isArray(body.items)) throw new HttpError("Send a list of items.", 422);
  const items = [];
  for (const raw of body.items) {
    const key = cleanText(raw?.key, 40);
    if (!known.has(key)) throw new HttpError(`Unknown figure "${key}".`, 422);
    const value = Number(raw.value);
    if (!Number.isInteger(value) || value < 0 || value > 100000000) throw new HttpError(`"${key}" must be a whole number from 0 to 100,000,000.`, 422);
    const label = cleanText(raw.label, 40);
    if (label.length < 2) throw new HttpError(`"${key}" needs a label.`, 422);
    const suffix = cleanText(raw.suffix, 3);
    if (!SUFFIXES.includes(suffix)) throw new HttpError(`"${key}" suffix must be one of: ${SUFFIXES.filter(Boolean).join(" ")}`, 422);
    items.push({ key, value, suffix, label });
  }
  return { items };
}

export async function readSavedStats(db) {
  const row = await db.prepare("SELECT value, updated_at, updated_by FROM settings WHERE key = ?").bind(STATS_KEY).first();
  if (!row) return null;
  try {
    return { ...JSON.parse(row.value), updatedAt: row.updated_at, updatedBy: row.updated_by };
  } catch {
    return null;
  }
}
