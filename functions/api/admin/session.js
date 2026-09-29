// GET /api/admin/session  who is signed in, or whether the first owner account still needs setting up
import { json } from "../../../lib/http.js";
import { requireAdmin } from "../../../lib/access.js";
import { staffCount } from "../../../lib/staff.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  const env = context.env;
  if (auth.response) {
    if (auth.response.status !== 401) return auth.response;
    return json({ user: null, needsSetup: (await staffCount(env.DB)) === 0 });
  }
  const db = env.DB;
  const [reports, unread] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS n FROM donations WHERE status = 'pending' AND tx_ref LIKE 'REP-%'").first(),
    db.prepare("SELECT COUNT(*) AS n FROM messages WHERE read_at IS NULL").first(),
  ]);
  return json({
    user: auth.user,
    counts: { pendingReports: reports.n, unreadMessages: unread.n },
    status: {
      emailReady: !!(env.RESEND_API_KEY && env.MAIL_FROM),
      cardPaymentsReady: !!env.FLW_SECRET_KEY,
      environment: env.SITE_ENV || "preview",
    },
  });
}
