# Deploying the Fidelstine site

This guide takes the site from this repository to a live address with working donations. Everything runs on Cloudflare's free tier. The only cost is the domain name.

## What you need

- A Cloudflare account (free): https://dash.cloudflare.com/sign-up
- A Flutterwave business account for the charity: https://flutterwave.com
- Optional: a Resend account for thank-you emails (free up to 3,000 a month): https://resend.com
- Node.js 20 or newer on your computer

## 1. Log in to Cloudflare from your computer

```
npx wrangler login
```

## 2. Create the database

```
npx wrangler d1 create fidelstine
```

Copy the `database_id` it prints into `wrangler.toml`, replacing the zeros. Then create the tables:

```
npm run db:migrate:remote
```

## 3. Create the Pages project

The simplest route is to connect GitHub:

1. Cloudflare dashboard > Workers & Pages > Create > Pages > Connect to Git.
2. Choose the `fidelstine` repository.
3. Build command: `npm run build`. Output directory: `_site`.
4. Under Environment variables add `NODE_VERSION` = `20` or newer.

Every push to `main` now deploys automatically. Pull requests get their own preview address.

## 4. Environment variables and secrets

In the Pages project go to Settings > Variables and Secrets. Add these for **Production**:

| Name | Type | Value |
|---|---|---|
| `SITE_ENV` | Variable | `production` (hides preview notes and placeholder outlines) |
| `SITE_URL` | Variable | `https://your-domain.org` |
| `FLW_SECRET_KEY` | Secret | Flutterwave secret key (test key first, live key at launch) |
| `FLW_SECRET_HASH` | Secret | A long random string, also entered in Flutterwave's webhook settings |
| `RESEND_API_KEY` | Secret | Optional, for thank-you emails |
| `MAIL_FROM` | Variable | e.g. `Fidelstine <donations@your-domain.org>` |
| `STAFF_EMAIL` | Variable | Where contact-form messages are forwarded |
| `ACCESS_TEAM_DOMAIN` | Variable | e.g. `fidelstine.cloudflareaccess.com` (step 7) |
| `ACCESS_AUD` | Variable | The Access application's AUD tag (step 7) |
| `ADMIN_EMAILS` | Variable | Comma-separated staff emails allowed into the admin page |
| `RATE_SALT` | Secret | Any random string |
| `MEDIA_R2_BASE` | Variable | Public address of the media bucket (step 6), e.g. `https://media.your-domain.org` |
| `CF_ANALYTICS_TOKEN` | Variable | Optional, from Web Analytics |

Leave `SITE_ENV` as `preview` for the Preview environment so preview builds stay clearly marked and hidden from search engines.

The D1 binding comes from `wrangler.toml`. Check Settings > Bindings shows `DB`.

## 5. Custom domain

1. Buy the domain. A `.org` costs about $10-12 a year at Cloudflare Registrar. A `.org.ng` or `.com.ng` costs about ₦5,000-10,000 a year from a Nigerian registrar such as Whogohost or Qservers.
2. If bought elsewhere, add the domain to Cloudflare (Add a site, Free plan) and change the nameservers at the registrar to the two Cloudflare gives you.
3. Pages project > Custom domains > Set up a domain. Add both `your-domain.org` and `www.your-domain.org`.

SSL certificates are issued automatically.

## 6. Video storage (R2)

Videos can live in the repository while there are only a few. Once there are many, use R2, which is free up to 10 GB with no bandwidth charges.

1. R2 > Create bucket `fidelstine-media`.
2. Bucket > Settings > Custom domains > connect `media.your-domain.org`.
3. Set `MEDIA_R2_BASE` to `https://media.your-domain.org` in Pages.
4. On your computer, add videos with `R2_BUCKET=fidelstine-media npm run media -- --r2`. The script uploads them and marks them as R2 items.

## 7. Admin page login (Cloudflare Access)

1. Zero Trust dashboard > Access > Applications > Add an application > Self-hosted.
2. Application domain: `your-domain.org`, path `admin`. Add a second path `api/admin`.
3. Policy: Allow, with Include > Emails listing the staff who may sign in.
4. Login method: One-time PIN. Staff get a code by email, so no passwords are needed.
5. Copy the Application Audience (AUD) tag into `ACCESS_AUD`. Set `ACCESS_TEAM_DOMAIN` to your team domain.

Access is free for up to 50 users.

## 8. Flutterwave

1. Complete business verification (KYC). You will need the CAC certificate for the Incorporated Trustees, trustees' IDs and BVNs, proof of address, and a bank account in the charity's name.
2. Settings > Payment methods: enable card, bank transfer, USSD and the currencies you want (NGN, USD, GBP, EUR and others). Remove any currency from `lib/currencies.js` that the account cannot collect.
3. Settings > Webhooks: URL `https://your-domain.org/api/webhooks/flutterwave`, Secret hash = the same value as `FLW_SECRET_HASH`. Tick "Enable webhook retries".
4. Start with **test** keys. When KYC is approved, replace `FLW_SECRET_KEY` with the live key and redeploy. No code changes are needed.

Test card details are in Flutterwave's documentation under Testing Helpers.

## 9. Rate limiting

The API already limits repeated submissions per visitor. For extra protection, add a Cloudflare rule: Security > WAF > Rate limiting rules. Match URI path starts with `/api/` and allow 30 requests per minute per IP.

## 10. Go-live checklist

- [ ] `SITE_ENV=production` and `SITE_URL` set
- [ ] Live Flutterwave key set and webhook URL saved in Flutterwave
- [ ] One real small donation made, seen in the admin page, receipt email received, then refunded from the Flutterwave dashboard
- [ ] Admin page asks for a login when signed out
- [ ] All placeholder text replaced (search the preview for dashed red outlines)
- [ ] Legal pages reviewed by the trustees
- [ ] Bank details, email address and Facebook link filled in `src/_data/site.js`
- [ ] Every photo of a child has a consent note in `src/_data/media.json`

## Local development

```
npm install
cp .dev.vars.example .dev.vars      # then fill in test keys
npm run db:migrate:local
npm run dev                         # site + API on http://localhost:8788
```

Useful commands:

| Command | What it does |
|---|---|
| `npm run build` | Build the site into `_site` |
| `npm run deploy` | Build and upload to https://fidelstine.pages.dev (works in PowerShell and bash). If it says the request timed out, the upload hit a slow connection: run it again |
| `npm test` | Unit tests and end-to-end payment tests against a mock Flutterwave |
| `npm run media` | Add new photos and videos from `media/incoming` |
| `npm run media:report` | Show which sections still need media |
| `npm run shots` | Screenshot every page at phone, tablet and desktop sizes |
