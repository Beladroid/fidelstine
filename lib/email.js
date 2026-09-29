// Transactional email through Resend (https://resend.com, free tier: 3,000 emails/month).
// Optional: if RESEND_API_KEY or MAIL_FROM is missing, emails are skipped and logged.
import { CURRENCIES, fromMinor } from "./currencies.js";
import { CAMPAIGNS } from "./campaigns.js";

export async function sendEmail(env, { to, subject, html, text, replyTo }) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
    console.log(`Email skipped (not configured): "${subject}" to ${Array.isArray(to) ? to.join(",") : to}`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: Array.isArray(to) ? to : [to], subject, html, text, reply_to: replyTo }),
  });
  if (!res.ok) {
    console.error("Resend failed", res.status, await res.text().catch(() => ""));
    return false;
  }
  return true;
}

export function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function money(minor, currency) {
  const c = CURRENCIES[currency];
  const n = fromMinor(minor);
  return `${c ? c.symbol : currency + " "}${n.toLocaleString("en", { maximumFractionDigits: 2 })}`;
}

export function receiptEmail(row, siteUrl) {
  const first = escapeHtml(row.donor_name.split(/\s+/)[0] || "friend");
  const amount = money(row.amount, row.currency);
  const campaign = escapeHtml(CAMPAIGNS[row.campaign]?.title || "Where it's needed most");
  const date = new Date(row.verified_at || Date.now()).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const subject = `Thank you for your gift of ${amount}`;
  // gifts by bank transfer or PayPal, recorded or confirmed by staff (no Flutterwave receipt)
  const offline = /^(MAN|REP)-/.test(row.tx_ref);
  const html = `<!doctype html><html><body style="margin:0;background:#FAF6F1;font-family:Arial,Helvetica,sans-serif;color:#2A2624">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF6F1;padding:24px 0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden">
      <tr><td style="background:#0E2338;padding:28px 32px;text-align:center">
        <img src="${siteUrl}/brand/icon-192.png" width="72" height="72" alt="" style="border-radius:50%">
        <p style="margin:12px 0 0;color:#fff;font-family:Georgia,serif;font-size:22px">Fidelstine</p>
        <p style="margin:4px 0 0;color:#E8B4BC;font-size:11px;letter-spacing:2px">CHARITY CONCERNS &amp; ORPHANAGE</p>
      </td></tr>
      <tr><td style="padding:32px">
        <h1 style="margin:0 0 12px;font-family:Georgia,serif;font-weight:normal;font-size:26px;color:#0E2338">Thank you, ${first}.</h1>
        <p style="line-height:1.6;margin:0 0 20px">Your gift has arrived safely and is already at work: shelter, food, schooling and care for children and vulnerable adults in Delta State and beyond.</p>
        <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#F0E6DC;border-radius:8px;font-size:14px">
          <tr><td style="color:#6b625b">Amount</td><td style="font-weight:bold;text-align:right">${amount}</td></tr>
          <tr><td style="color:#6b625b">Going to</td><td style="font-weight:bold;text-align:right">${campaign}</td></tr>
          <tr><td style="color:#6b625b">Date</td><td style="text-align:right">${date}</td></tr>
          <tr><td style="color:#6b625b">Reference</td><td style="text-align:right;font-family:monospace">${escapeHtml(row.tx_ref)}</td></tr>
        </table>
        ${offline ? "" : '<p style="line-height:1.6;margin:20px 0 0">Flutterwave has also emailed you a payment receipt. Please keep both for your records.</p>'}
        <p style="margin:28px 0 0"><a href="${siteUrl}/gallery/" style="background:#A33234;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:14px">See the work you support</a></p>
      </td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #eee;font-size:12px;color:#6b625b;line-height:1.5">
        <em>Nurturing Hope, Building Futures, Defending Dignity.</em><br>
        Fidelstine Charity Concerns and Orphanage, 1 Market Road, Idumu Uzu Quarters, Ubulu Okiti, Delta State, Nigeria.<br>
        <a href="${siteUrl}/donation-policy/" style="color:#6b625b">Donation policy</a> &middot; <a href="${siteUrl}/privacy/" style="color:#6b625b">Privacy</a>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
  const text = `Thank you, ${row.donor_name.split(/\s+/)[0]}.\n\nYour gift of ${amount} to ${CAMPAIGNS[row.campaign]?.title || "our work"} has arrived safely.\nReference: ${row.tx_ref}\n\nFidelstine Charity Concerns and Orphanage\n${siteUrl}`;
  return { subject, html, text };
}
