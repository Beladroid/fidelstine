// GET /api/admin/content  every editable section: its fields, current value and starting value (staff only)
import { json } from "../../../../lib/http.js";
import { requireAdmin } from "../../../../lib/access.js";
import { SECTIONS, contentDefaults, readSavedContent } from "../../../../lib/content.js";
import copy from "../../../../src/_data/copy.json";

const defaults = contentDefaults(copy);

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const saved = await readSavedContent(context.env.DB);
  const sections = SECTIONS.map(({ check, ...s }) => ({
    ...s,
    value: saved[s.key]?.value ?? defaults[s.key],
    custom: !!saved[s.key],
    updatedAt: saved[s.key]?.updatedAt || null,
    updatedBy: saved[s.key]?.updatedBy || null,
  }));
  return json({ user: auth.email, sections });
}
