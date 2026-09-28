# Fidelstine Charity Concerns and Orphanage website

Website for Fidelstine Charity Concerns and Orphanage, Ubulu Okiti, Delta State, Nigeria.
It includes secure online giving through Flutterwave in naira, pounds, dollars and more.

- Static pages built with [Eleventy](https://www.11ty.dev/), with responsive AVIF and WebP images.
- A small backend on Cloudflare Pages Functions with a D1 database, for donations, forms and the staff dashboard.
- Separate phone, tablet and desktop layouts.
- A media library, so new photos and videos appear without layout changes.

## Quick start

```
npm install
cp .dev.vars.example .dev.vars     # add Flutterwave TEST keys
npm run db:migrate:local
npm run dev                        # http://localhost:8788
```

For pages only, without the backend, run `npm run serve` (http://localhost:8080).

## Commands

| Command | What it does |
|---|---|
| `npm run build` | Build the site into `_site` |
| `npm run dev` | Site and API together, with a local database |
| `npm test` | Unit tests, plus end-to-end payment tests against a mock Flutterwave (needs a build first) |
| `npm run media` | Add photos and videos from `media/incoming` |
| `npm run media:report` | Show which sections still need photos or videos |
| `npm run shots` | Screenshot every page at phone, tablet and desktop sizes |

## Project layout

```
src/                 pages (*.njk), data (_data), layouts, components, CSS, browser JS
  _data/site.js      contact details, socials, bank details
  _data/copy.json    mission, values, programmes, FAQs and other text
  _data/media.json   every photo and video, with tags that decide where it appears
  _includes/         layouts, header/footer/menu, component macros, CSS
  js/                browser modules, loaded only where needed
functions/api/       backend endpoints (Cloudflare Pages Functions)
lib/                 shared server code: Flutterwave, validation, email, currencies, campaigns
migrations/          database tables (D1 / SQLite)
scripts/             media pipeline, icons, screenshots
tests/               unit and end-to-end tests
docs/                deployment, media and handover guides
```

## Documentation

- [PLAN.md](PLAN.md): the full build plan and the reasoning behind it
- [docs/DEPLOY.md](docs/DEPLOY.md): Cloudflare, domain, Flutterwave, admin login, go-live checklist
- [docs/MEDIA-GUIDE.md](docs/MEDIA-GUIDE.md): adding photos and videos, and tag meanings
- [docs/MEDIA-BRIEF.md](docs/MEDIA-BRIEF.md): what to film and photograph (for the charity)
- [docs/HANDOVER.md](docs/HANDOVER.md): day-to-day maintenance
- [CLIENT-REQUIREMENTS.md](CLIENT-REQUIREMENTS.md): what the client has supplied so far

## How a donation works

1. The donor picks an amount and currency. The browser sends it to `/api/donations/init`.
2. The server checks it, saves it as pending, and asks Flutterwave for a secure checkout link.
3. The donor pays on Flutterwave's page by card, bank transfer, USSD or mobile money.
4. Flutterwave sends the donor back to `/donate/thank-you/`. The server re-checks the payment with Flutterwave before marking it successful.
5. Flutterwave also calls `/api/webhooks/flutterwave`, so the gift is confirmed even if the donor closes the tab.

Card details never touch this site. Every payment is verified server-side against the amount, currency and reference.
