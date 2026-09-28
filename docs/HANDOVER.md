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

Anything marked `"placeholder": true` in `copy.json` shows a dashed red outline on preview builds. Remove the flag once real content is in.

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

## Changing a campaign

Edit `lib/campaigns.js`: title, `targetNGN` and `endsAt`. The countdown and progress bar update on the next deploy. Other currencies count towards the naira target using the approximate rates in `lib/currencies.js`. Update those rates now and then.

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
