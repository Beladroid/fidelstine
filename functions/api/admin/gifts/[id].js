// PATCH  /api/admin/gifts/:id  { status: "successful" }  confirm a donation a donor reported, once the
//                                                       money is seen in the bank or PayPal (staff only)
// DELETE /api/admin/gifts/:id  remove a recorded or reported donation, e.g. one entered by mistake.
// Only offline donations (MAN-/REP-) can be changed here; online payments stay as Flutterwave reported them.
import { json, error, handle, readJson, siteOrigin } from "../../../../lib/http.js";
import { requireAdmin } from "../../../../lib/access.js";
import { isOffline, thankDonor } from "../../../../lib/gifts.js";

async function offlineRow(context) {
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) return { response: error("Unknown donation.", 404) };
  const row = await context.env.DB.prepare("SELECT id, tx_ref, campaign, status, notes FROM donations WHERE id = ?").bind(id).first();
  if (!row) return { response: error("Unknown donation.", 404) };
  if (!isOffline(row.tx_ref)) return { response: error("Only donations recorded by staff or reported by donors can be changed here.", 403) };
  return { row };
}

const clearCampaign = (context, slug) =>
  typeof caches !== "undefined" ? caches.default.delete(new Request(new URL(`/api/campaign/${slug}`, context.request.url).toString())) : null;

export const onRequestPatch = handle(async (context) => {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const { row, response } = await offlineRow(context);
  if (response) return response;
  const body = await readJson(context.request);
  if (body.status !== "successful") return error("Only confirming is supported.", 422);
  if (row.status !== "successful") {
    const notes = [row.notes, `Confirmed by ${auth.email}`].filter(Boolean).join(" | ");
    await context.env.DB.prepare("UPDATE donations SET status = 'successful', verified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), notes = ? WHERE id = ?")
      .bind(notes, row.id)
      .run();
  }
  const emailed = await thankDonor(context.env, context.env.DB, row.tx_ref, siteOrigin(context));
  await clearCampaign(context, row.campaign);
  return json({ ok: true, emailed });
});

export const onRequestDelete = handle(async (context) => {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  const { row, response } = await offlineRow(context);
  if (response) return response;
  await context.env.DB.prepare("DELETE FROM donations WHERE id = ?").bind(row.id).run();
  await clearCampaign(context, row.campaign);
  return json({ ok: true });
});
