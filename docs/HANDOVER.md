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

## The staff console

The console is a separate app with its own design, at a **private address** stored in the `ADMIN_PATH` Pages secret (for example `https://fidelstine.pages.dev/<ADMIN_PATH>/`). The address is not in the code or on the website, `/admin/` shows "page not found", and the page is never indexed. Keep the link private and bookmark it.

- **Laptops:** sidebar (collapsible to icons), top bar with search (Ctrl K / ⌘K), notifications, light and dark mode.
- **Phones:** app bar, bottom tabs (Home, Donations, a central **+** to record a donation, Inbox, More), cards, and bottom sheets you can swipe down.

**Accounts.** Everyone signs in with their own email and password. The first owner account was created with the setup key (the `ADMIN_PASSWORD` secret); it only works while there are no accounts. Owners add people, reset passwords, switch access off and remove people in **Settings > Team**. There is always at least one owner. Changing a password signs that person out everywhere. Sessions last 12 hours.

**Sections:** Overview (figures, charts, latest gifts, team activity), Donations, Inbox, Site content, Media library, Subscribers, Activity, Settings.

**Photos.** Upload in the Media library (drag and drop on a laptop). Photos are resized in the browser first, then stored in the D1 database and served from `/api/images/<id>/l|s`. Gallery photos appear in a "Latest from the home" section at the top of the Gallery page. Team and testimonial photos are chosen in Site content. Profile photos are set in Settings > Your profile. A photo that is in use can't be deleted without confirming.

## Reading donations

Open **Donations** in the console. Tabs: All, Needs checking (gifts donors reported), Bank & PayPal, Online. Search by name, email or reference; filter by status, campaign, currency, method and dates; export a CSV. Tap a donation for the full details and actions.

Status meanings:

| Status | Meaning |
|---|---|
| successful | Paid and confirmed with Flutterwave |
| pending | The donor started but has not finished, or a transfer is still clearing |
| failed | Payment declined, or the amount did not match |
| abandoned | The donor cancelled at checkout |

Flutterwave's dashboard remains the source of truth for settlements and refunds.

## What staff can change in the console

Changes show on the live site straight away, with no rebuild. Every change is recorded on the Activity page with who made it and when, and each content section has a "Go back to the starting text" button. Unsaved edits show a save bar, and the console asks before you leave with unsaved changes.

| Where | What it changes |
|---|---|
| Record a donation (the **+** / "Record donation" button) | Adds a donation received by GTBank transfer, PayPal or cash. It counts in the totals, the CSV export and the Christmas Scheme progress bar, and the donor gets a thank-you email if an address is given. A donation entered by mistake can be removed from the Donations list (online payments cannot). |
| Donations: reports from donors | Donors can say "I've sent my gift" under the bank and PayPal details. These arrive as **pending** and do not count until a staff member checks the bank or PayPal and clicks **Confirm received**, which also sends the thank-you email. A yellow banner shows how many are waiting. |
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
- Console address: `npx wrangler pages secret put ADMIN_PATH --project-name fidelstine` (letters, numbers and dashes, 6 to 64 characters), then redeploy. The old address stops working.
- Setup key and session signing: `ADMIN_PASSWORD` (set `SESSION_SECRET` to sign sessions with a separate secret). Changing whichever one signs sessions signs everyone out.
- A forgotten owner password with no other owner: a developer can reset it with `wrangler d1 execute` or delete the account so the setup key works again.
- If Cloudflare Access is added: edit the Access policy and `ADMIN_EMAILS` to change who can open the console.
- Thank-you emails need `RESEND_API_KEY` and `MAIL_FROM` (a verified domain address, so after the domain is bought). Until then they are skipped and nothing else is affected.

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
