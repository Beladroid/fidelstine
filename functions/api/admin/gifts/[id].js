// DELETE /api/admin/gifts/:id  remove a gift recorded by staff, e.g. one entered by mistake.
// Only manual entries can be removed; online payments stay on record.
import { json, error, handle } from "../../../../lib/http.js";
import { requireAdmin } from "../../../../lib/access.js";
import { MANUAL_PREFIX } from "../../../../lib/gifts.js";

export const onRequestDelete = handle(async (context) => {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) return error("Unknown gift.", 404);
  const row = await context.env.DB.prepare("SELECT tx_ref, campaign FROM donations WHERE id = ?").bind(id).first();
  if (!row) return error("Unknown gift.", 404);
  if (!row.tx_ref.startsWith(MANUAL_PREFIX)) return error("Only gifts recorded by staff can be removed.", 403);
  await context.env.DB.prepare("DELETE FROM donations WHERE id = ?").bind(id).run();
  if (typeof caches !== "undefined") {
    await caches.default.delete(new Request(new URL(`/api/campaign/${row.campaign}`, context.request.url).toString()));
  }
  return json({ ok: true });
});
