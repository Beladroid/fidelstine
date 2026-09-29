# Looking after the site

A quick reference for whoever maintains the Fidelstine website.

## Where things live

| To change | Edit |
|---|---|
| Phone numbers, addresses, social links, bank details, email | `src/_data/site.js` |
| Mission, values, programmes, FAQs, testimonials, timeline, gift examples | `src/_data/copy.json` |
| Menu links | `src/_data/nav.json` |
| Currencies, amount buttons, minimums | `lib/currencies.js` |
| Campaigns, targets and end dates | `lib/campaigns.js` |
| Photos and videos | `src/_data/media.json` (see `docs/MEDIA-GUIDE.md`) |
| Legal pages | `src/legal/*.md` |
| Page layouts | `src/*.njk` |
| Look and feel | `src/_includes/css/` |

Some text is temporary until the charity sends the real version. `docs/CONTENT-TODO.md` lists it. Most of it can be replaced from the admin panel without touching the code.

## Reading donations

Go to `/admin/` on the live site. Sign in with the one-time code sent to your email. You can filter by status, currency, campaign and date, search by name or reference, and export a CSV for the accounts.

Status meanings:

| Status | Meaning |
|---|---|
| successful | Paid and confirmed with Flutterwave |
| pending | The donor started but has not finished, or a transfer is still clearing |
| failed | Payment declined, or the amount did not match |
| abandoned | The donor cancelled at checkout |

Flutterwave's dashboard remains the source of truth for settlements and refunds.

## What staff can change in the admin panel

Open `/admin/`. Changes show on the live site straight away, with no rebuild. Every change records who made it and when, and each section has a "Go back to the starting text" link.

| Tab | What it changes |
|---|---|
| Record a gift | Adds a gift received by GTBank transfer, PayPal or cash. It counts in the totals, the CSV export and the Christmas Scheme progress bar. A gift entered by mistake can be removed from the Donations list (online payments cannot). |
| Site content > Christmas Scheme | Headline, goal and closing date |
| Site content > Exchange rates | Naira value of £, $, € and the other currencies, used for the "≈" amounts and for adding up foreign gifts. Check them every few weeks. |
| Site content > What your gift does | The three example gifts ("₦5,000: books and school supplies…") |
| Site content > Testimonials, Team and trustees | Add, edit, reorder and remove |
| Site content > Where the money goes | Spending percentages (must add up to 100) and the note above them |
| Site content > Reports and documents | Links to annual reports and certificates |
| Site content > Contact details | Email, WhatsApp, phone numbers, social links, registration number |
| Site content > Questions and answers | The Donate page FAQs |
| Site content > Announcement | A short notice on every page, e.g. a packing day |
| Impact numbers | The five figures on the home page |

How it works: the build renders the starting text from `src/_data/copy.json`; saved changes live in the D1 `settings` table, and `functions/_middleware.js` swaps them into each page as it is served (`lib/content.js`, `lib/live.js`).

**Not in the admin panel on purpose:** the GTBank account and PayPal details (`src/_data/site.js`, `manualGiving`). If an admin login were ever stolen, changing them could send donations to a thief, so they can only change through the code.

## Changing a campaign's other settings

Campaign titles and the other programmes' settings are in `lib/campaigns.js` and change on the next deploy.

## Keys and passwords

- Flutterwave keys and the webhook hash live in Cloudflare Pages > Settings > Variables and Secrets. Never put them in the code.
- To rotate the Flutterwave key: generate a new one in Flutterwave, paste it into `FLW_SECRET_KEY`, and redeploy.
- To change who can open the admin page: edit the Access policy and `ADMIN_EMAILS`.

## Renewals

- Domain: renews yearly. Turn on auto-renew at the registrar.
- Cloudflare, R2, D1, Access: free tiers, nothing to renew.

## Backups

D1 keeps 30 days of history. To restore: `npx wrangler d1 time-travel restore fidelstine --timestamp=<ISO time>`. Also export the donations CSV monthly and keep it with the accounts.

## Checks before a big change

```
npm run build
npm test
npm run shots
```
