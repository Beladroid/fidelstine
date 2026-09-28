# Fidelstine site v3: redesign, media system and Flutterwave donations

## Context

Today the site is a single `index.html` of about 1,070 lines with all CSS and JS inline, plus `assets/`. It has no build step, no backend, no git and no hosting.

The design is solid. It has a brand palette (navy, red, pink, cream), Newsreader and Work Sans type, a hero slideshow with video, programme video rows, video bands, scroll reveals, counters and good accessibility. However, phones and tablets only get the desktop layout squeezed down through media queries at 940, 600 and 420px. Media is hard-coded, so each new photo or video means editing HTML by hand. The Donate section is a placeholder.

The user wants four things:
1. Real donations through Flutterwave in NGN, GBP, USD and more, one-time for now, with a full backend and database.
2. A polished, professional look with richer effects and animation.
3. Phone and tablet layouts that feel purpose-built, not shrunk.
4. Places to hold many more photos and videos: slideshows, background videos, galleries and varied section styles.

Hosting must be the cheapest option that supports a custom domain.

---

## 1. Foundation

### Hosting: Cloudflare (all free tiers)

| Service | Use | Cost |
|---|---|---|
| Pages | Static site, CDN, SSL, custom domain | Free |
| Pages Functions | Payment and form backend | Free up to 100k requests/day |
| D1 (SQLite) | Donations and newsletter database | Free up to 5 GB |
| R2 | Video and large photo storage | Free up to 10 GB, with no bandwidth fees |
| Access | Login for the staff admin page | Free up to 50 users |
| Web Analytics | Visitor stats without cookies | Free |
| Domain | .org about $10-12/yr, or .org.ng / .com.ng about ₦5-10k/yr | Only real cost |

Storing videos in R2 matters for three reasons. It avoids the Pages 25 MB per-file cap. It keeps deploys small. It costs nothing in bandwidth however many people watch.

### Build: Eleventy (11ty) static generator

With many new photos and videos, the site should become several pages that share one header and footer. Eleventy gives three things with no runtime cost:
- Shared layouts and partials, so header, footer and bottom nav are written once.
- A data-driven media library: galleries and slideshows are built from `src/_data/media.json`, not hand-written HTML.
- `@11ty/eleventy-img`, which turns each photo into AVIF, WebP and JPEG at 480, 960 and 1600 px wide, with correct `srcset`.

### New page structure

| Page | Content |
|---|---|
| Home | Cinematic hero, impact, short mission, programmes teaser, stories reel, before/after, Christmas Scheme band, gallery teaser, donate CTA |
| About | Mission, vision, values, "Our journey" timeline, team or trustees, scroll-story "A day at the home" |
| Programmes | One section per programme with a video band, photo carousel and needs |
| Gallery | Filterable masonry of photos and videos with a full-screen lightbox |
| Christmas Scheme | Campaign page with countdown and a live "raised so far" bar from D1 |
| Donate | Full donation form, currency choice and impact explainer |
| Thank you | Payment verification result |
| Contact | Addresses, map, phones and a contact form |
| Admin (private) | Donations, totals and CSV export |
| Donation / Privacy policy | Static legal pages |

### Repository layout

```
fidelstine/
  src/
    _includes/layouts/base.njk        (head, header, bottom nav, footer)
    _includes/partials/               (header, footer, bottom-nav, donate-sheet, …)
    _includes/components/             (hero, media-band, reel, carousel, gallery, before-after, …)
    _data/media.json                  (every photo/video: file, type, category, caption, alt, orientation, poster)
    _data/site.json                   (contacts, socials, currency presets)
    css/tokens.css  base.css  layout-phone.css  layout-tablet.css  layout-desktop.css  components/*.css
    js/core.js  motion.js  media.js  donate.js  nav.js
    index.njk  about.njk  programmes.njk  gallery.njk  christmas.njk  donate.njk  contact.njk  …
    admin/index.njk
  functions/                           (Cloudflare Pages Functions, see section 5)
  migrations/0001_init.sql
  media/incoming/                      (drop new raw photos and videos here, git-ignored)
  scripts/add-media.mjs               (optimise, upload to R2, register in media.json)
  eleventy.config.js  wrangler.toml  package.json  .dev.vars.example  .gitignore
```

The existing CSS in `index.html` (lines 15-510) is split into these files, not rewritten. That keeps the tokens, buttons, `.bg-video`, scrims, footer and accessibility rules. The existing JS (lines 889-1064) moves into `js/media.js` and `js/core.js`. That covers the hero slideshow and video toggle, reduced-motion and data-saver handling, lazy video play and pause, counters and the reveal observer.

### Adding media from now on

1. Drop files into `media/incoming/`.
2. Run `npm run media`. The script uses sharp and ffmpeg.
3. For photos, it makes responsive AVIF and WebP versions and reads the orientation.
4. For videos, it makes a 720p and a 480p H.264 MP4 with faststart, a poster frame and, for background loops, a muted 10-20 second loop.
5. It uploads the results to R2 and adds entries to `media.json` with a blank caption, alt text and category to fill in.
6. Any component that lists that category picks the new files up on the next build.

Phones get the 480p video through `<source media="(max-width:600px)">`. That matters for Nigerian mobile data costs.

### Media that arrives over time

The user will keep sending new videos and photos as they become available. The site is built so that it never looks unfinished while waiting.

- **Self-hiding slots.** Every media component reads its category from `media.json`. If the category is empty, the component either hides, like the current story-video section, or shows a branded poster. An empty slot never appears broken.
- **Graceful growth.** A reel with one clip shows as a single feature card. With three or more clips it becomes a swipeable row. A gallery category with fewer than four items folds into "All".
- **Coverage report.** `npm run media:report` lists each component, the categories it wants, how many items it has and what is still missing. It shows at a glance where new footage should go.
- **Filming brief.** A `docs/MEDIA-BRIEF.md` for the client explains what to capture:
  - vertical 9:16 clips of 15-60 seconds for reels
  - horizontal 16:9 silent loops of 10-20 seconds for hero and bands
  - steady photos in landscape and portrait
  - before and after pairs from the same angle
  - one-minute testimonials with consent
- **No code changes per upload.** Adding media means dropping files, running the script, filling captions and deploying.

---

## 2. Design system and visual polish

**Tokens.** Keep the current palette and fonts. Add spacing, radius, shadow, easing and duration tokens, plus a fluid type scale using `clamp()`.

**Three section moods** give variety while staying on-brand:
- *Editorial light*: cream or white, large serif headings, generous whitespace. Used for mission, stories and text.
- *Cinematic dark*: navy with full-bleed video or photo, scrim and white type. Used for hero, values and donate.
- *Campaign warm*: red to deep-red gradient with pink accents. Used for Christmas Scheme and urgent needs.

**Finishing touches:**
- A subtle film-grain overlay on dark sections.
- A soft pink glow behind key headings.
- Thin gold hairlines taken from the crest logo.
- A consistent 4:5, 16:9 and 9:16 media ratio system.
- Rounded 14px cards on phone, sharper 2-4px editorial edges on desktop.

**Clean-up:**
- Remove "placeholder" and "mock" labels as real content arrives.
- Keep the editor note in preview builds only, not in production.
- Wire the social links, which currently point to `#`.
- Fill in the email.
- Replace the JPEG favicon with a proper icon set and web manifest.

---

## 3. Device-specific layouts

This stays one codebase, but each device class gets its own navigation, section structure and interactions. The phone layout is designed first, then tablet and desktop layer on top. Components use container queries so a card adapts to its slot, not only to the screen.

| Tier | Width | Character |
|---|---|---|
| Small phone | up to 380px | Phone layout with tighter type and a 2-up to 1-up fallback |
| Phone | 381-600px | App-like |
| Tablet portrait | 601-900px | Magazine-like, two columns |
| Tablet landscape / small laptop | 901-1180px | Condensed desktop |
| Desktop | above 1180px | Editorial, cinematic |

Desktop-only effects such as tilt, magnetic buttons and custom cursor sit behind `(hover:hover) and (pointer:fine)`, so touch devices never get them.

### Phone: app-like

- **Bottom tab bar:** Home, Programmes, Gallery, About, with a raised red "Give" button in the centre. It respects the safe area, hides when scrolling down and returns when scrolling up.
- **Compact top bar:** small crest only. The full name collapses into the bar after the hero.
- **Full-screen menu:** large serif links with a staggered entrance, plus quick contact buttons for call, WhatsApp and map.
- **Hero:** full height, a portrait-cropped vertical video when one exists, headline pinned low, one primary CTA.
- **Swipe instead of stacking:** programmes, values, testimonials and impact use horizontal scroll-snap cards with dots and a peek of the next card.
- **Stories reel:** full-screen, Instagram-style tap-through of 9:16 clips. This suits phone-shot footage.
- **Donate bottom sheet:** the "Give" tab opens a sheet with amount pills and currency. It links to the full form. A slim sticky "Donate" bar appears after the hero and hides near the donate section.
- **Gallery:** 2-column masonry. The lightbox is full-screen with swipe and swipe-down to close.
- **Footer:** collapses into accordions.

### Tablet: magazine-like

- **Navigation:** a slide-in side drawer from the right, not a dropdown. It shows the crest, links and a donate card.
- **Portrait hero:** 75vh with a floating glass "quick give" card overlapping the bottom edge.
- **Programmes:** a 2-column card grid. Each card's video plays when it is in view.
- **Values:** a 2x3 grid with icon medallions.
- **Gallery:** 3-column masonry with a filter chip bar.
- **Donate:** two panels, with the form on one side and a "what your gift does" impact list with photos on the other.
- **Landscape:** switches to condensed desktop nav, 3-column grids and the side-by-side hero.

### Desktop: editorial and cinematic

- Keeps the current horizontal nav and adds a mega-menu for Programmes with a thumbnail per programme.
- Split-screen and alternating image/text sections with parallax on the media.
- Pinned scroll-story sections, where an image or video stays fixed while text steps scroll past.
- 4-column masonry gallery, and hover-to-preview video on cards.

---

## 4. Media components

Each component is an Eleventy component fed from `media.json` by category, so the client only adds files.

| Component | What it does | Where |
|---|---|---|
| Cinematic hero | Playlist of 2-4 background clips crossfading, with Ken Burns photo fallback and slide captions. Builds on the current hero code. | Home, campaign pages |
| Media band | Full-bleed background video or photo with a scrim and text, in navy, red or dark variants. Generalises the current `.bg-video` and `.urgent`/`.donate` styles. | Between sections everywhere |
| Stories reel | Row of 9:16 vertical video cards that opens a full-screen player with progress bars. | Home, Programmes |
| Photo carousel / slideshow | Scroll-snap slider with thumbnails, autoplay with pause, and captions. | Programmes, About |
| Masonry gallery | Filter chips for All, Shelter, Education, Crisis, Christmas and Events. Mixes photos and videos and lazy-loads. | Gallery page, Home teaser |
| Lightbox | Full-screen viewer with swipe, keyboard, captions, pinch-zoom and inline video. | All galleries and carousels |
| Before / after slider | Drag handle comparing two photos, matching the "The Need Is Real / The Help Is Here" flyer. | Home, Christmas Scheme |
| Photo ribbon | Slow, infinite marquee of small photos that pauses on hover or touch. It is off when reduced motion is on. | Section dividers |
| Video library | Main player plus a playlist of thumbnails. Replaces the single "Our work in motion" video. | Home, About |
| Scroll-story | Pinned media that changes as text steps scroll. On phones it becomes a vertical sequence. | About ("A day at the home"), Programmes |
| Timeline | Year markers with photos that reveal as you scroll. | About |
| Testimonial carousel | Photo or short-video testimonials. Replaces the placeholder story block. | Home, About |
| Campaign progress | Live total raised against a target, read from D1, with a countdown. | Christmas Scheme, Donate |

Media rules:
- Only videos that are on screen play. That is the existing behaviour, extended to all components.
- At most two background videos play at once.
- Posters always show first.
- Reduced motion or data-saver shows posters only.
- Every video has alt text through `aria-label`, and background loops are `aria-hidden`.

---

## 5. Flutterwave payments and backend

### Flow: Flutterwave Standard (hosted checkout)

The server sets the amount, so the browser cannot change it.

1. The donor picks a currency, amount and campaign, then enters name, email, and optional phone, message and "give anonymously".
2. `POST /api/donations/init` validates the input and inserts a `pending` row with a unique `tx_ref`. It calls Flutterwave `POST /v3/payments` with the secret key and returns `data.link`.
3. The browser redirects to Flutterwave, which offers card, bank transfer, USSD or mobile money depending on currency.
4. Flutterwave redirects to `/donate/thank-you/?status&tx_ref&transaction_id`.
5. That page calls `POST /api/donations/verify`. The server calls `GET /v3/transactions/{id}/verify` and requires status `successful`, a matching `tx_ref` and currency, and an amount at least the expected amount. Only then is the row marked `successful`.
6. `POST /api/webhooks/flutterwave` checks the `verif-hash` header and re-verifies through the API. It updates the row idempotently and returns 200 quickly. This covers donors who close the tab.
7. Optional: a Resend free-tier receipt email, sent once on the first successful transition.

### Functions

```
functions/api/donations/init.js
functions/api/donations/verify.js
functions/api/webhooks/flutterwave.js
functions/api/campaign/[slug].js      (public raised-so-far total; cached 60s)
functions/api/newsletter.js           (replaces the placeholder signup; stores in D1)
functions/api/contact.js              (contact form; stores in D1 and emails staff)
functions/api/admin/donations.js      (list, filter, CSV; behind Access)
functions/_lib/flutterwave.js  db.js  validate.js  currencies.js  email.js
```

### Database: `migrations/0001_init.sql`

- **`donations`**: `tx_ref` unique, `flw_transaction_id` unique, `amount` in minor units, `currency`, `amount_settled`, `app_fee`, donor fields, `anonymous`, `campaign`, `status` (pending, successful, failed or abandoned), `payment_type`, timestamps, `receipt_sent_at`, `raw_verify_json`.
- **`newsletter`**: email unique, `created_at`, `source`.
- **`messages`**: contact form entries.

### Currencies

A single config in `functions/_lib/currencies.js` is shared with the front end through the build.

| Currency | Presets | Minimum |
|---|---|---|
| NGN | 5,000 / 15,000 / 50,000 | 500 |
| GBP, USD, EUR | 10 / 25 / 50 | 2 |
| GHS | 100 / 250 / 500 | 20 |
| KES | 1,000 / 2,500 / 5,000 | 100 |
| ZAR | 200 / 500 / 1,000 | 50 |
| CAD | 15 / 35 / 70 | 3 |

- The default currency comes from the browser time zone: Lagos gives NGN, London gives GBP, anything else gives USD.
- The list is trimmed to the currencies actually enabled on the Flutterwave account.

### Admin page

- Cloudflare Access protects `/admin/*` and `/api/admin/*` with a staff email allow-list and one-time PIN login.
- The functions also check the `Cf-Access-Authenticated-User-Email` header.
- The page shows totals per currency, filters, a table, CSV export, and newsletter and contact lists.

### Security

- Secrets are stored only with `wrangler pages secret put`.
- Every payment is re-verified server-side.
- Status updates are idempotent.
- Input is checked against the currency allow-list and min/max limits.
- A Cloudflare rate-limit rule covers `init`, `newsletter` and `contact`.
- All admin output is escaped.

### Flutterwave account (client task, blocks go-live)

1. Open a business account under the charity's legal name.
2. Complete KYC: CAC Incorporated Trustees certificate, trustees' IDs and BVNs, proof of address, and a bank account in the charity's name.
3. Enable the needed currencies and choose settlement, NGN or a domiciliary account.
4. Set the webhook URL and secret hash.
5. Build and test on test keys, then swap in live keys with no code change.

---

## 6. Motion and effects

**Libraries**, loaded from jsDelivr and deferred:
- **GSAP + ScrollTrigger** for pinned scroll-stories, parallax and text reveals. GSAP is now free.
- **PhotoSwipe 5** for the lightbox.

Carousels and reels use native CSS scroll-snap with small custom JS, with no carousel library.

**Effects:**
- **Intro:** the crest fades in with a short curtain wipe, under 700ms, only on the first visit in a session.
- **Headlines:** mask reveal, line by line or word by word, when entering view.
- **Media reveals:** clip-path wipes or scale-in on images, and gentle parallax on desktop and tablet.
- **Scroll-driven CSS:** `animation-timeline: view()` for progress bars and fades, with the current IntersectionObserver as fallback.
- **Page transitions:** cross-document View Transitions between pages, such as crest and hero morphs. Unsupported browsers load normally.
- **Micro-interactions:** button press feedback, animated underlines, pill selection spring, a count-up on the campaign total, and a success confetti burst on the thank-you page using a light canvas.
- **Desktop only:** magnetic CTA buttons, subtle card tilt and hover video previews.

**Guardrails:**
- `prefers-reduced-motion` turns motion off. That is already in place and will be extended to GSAP.
- Only `transform` and `opacity` are animated.
- There is no scroll hijacking on touch devices.

---

## 7. SEO, performance and launch polish

- **Search and sharing:** Open Graph and Twitter cards per page, JSON-LD `NGO` / `Organization` schema, `sitemap.xml`, `robots.txt`, canonical URLs, and a web manifest with icons.
- **Performance targets:** Lighthouse mobile score of 90 or more, LCP under 2.5s on 4G, CLS under 0.05.
- **How to hit them:** preload the hero poster, self-host fonts, inline critical CSS, lazy-load everything below the fold, and defer JS.
- **Analytics:** Cloudflare Web Analytics, which needs no cookie banner.
- **Accessibility:** keep the current focus, skip-link and aria work. Carousels and reels get pause controls and keyboard support, and the lightbox traps focus.

---

## 8. Additional suggestions

These go beyond what was asked. Each is marked for launch or later so the client can pick.

### Strongly recommended for launch

- **Child safeguarding and media consent.** An orphanage site must protect the children it shows. Do not publish children's full names, school names or exact home location next to their photos. Get written consent from guardians or the home's director for every identifiable child. Blur faces where consent is missing. Add a short safeguarding statement page. Donors and partners such as UK trusts often check for this.
- **Privacy compliance.** The site will store donor names and emails. The privacy policy should cover the Nigeria Data Protection Act 2023 and, because of UK supporters, UK GDPR. Donors must opt in to the newsletter, not be added automatically.
- **"What your gift does" mapping.** Tie each amount to a tangible result, such as "₦5,000 buys school supplies for one child". This shows next to the amount pills and usually raises the average gift. The client must supply real figures.
- **WhatsApp button.** A floating click-to-chat button to the Nigerian number. It is the channel most Nigerian visitors prefer. On phone it sits in the full-screen menu and contact sheet so it does not clash with the bottom bar.
- **Bank transfer fallback.** A "Prefer to transfer directly?" panel with the charity's NGN account and, if one exists, a domiciliary account. Some donors avoid online card payments.
- **Lite mode.** A small toggle that turns off all background video and serves posters only. It is saved per visitor and switched on automatically when data-saver is on. It respects visitors on expensive mobile data.
- **Transparency section.** A page or block showing how donations are used, with a simple breakdown and downloadable annual reports when available. This backs the "Integrity" value on the site.

### Recommended soon after launch

- **Monthly giving** through Flutterwave payment plans, with a self-service cancel link in the receipt email.
- **Opt-in donor wall** showing first name, city and campaign, read from D1, for social proof.
- **Share after donating.** The thank-you page offers WhatsApp, Facebook and X share links for the campaign.
- **Volunteer and partner sign-up forms**, stored in D1 and listed in the admin page.
- **News and updates page** built from Markdown files, for field reports and Christmas Scheme updates.
- **Newsletter sending.** Connect the D1 newsletter list to Brevo's free tier so the client can actually send updates.
- **Self-service uploads.** An admin "Add media" screen that uploads straight to R2 and registers the item. The client or staff could then add videos from a phone without a developer. The command-line script covers launch.

### Operations

- **Backups.** D1 Time Travel gives 30 days of point-in-time restore for free. Add a weekly CSV export emailed to the treasurer as an extra copy.
- **Monitoring.** A free uptime check on the home page and the webhook endpoint, and error alerts from Functions logs.
- **Handover guide.** A `docs/HANDOVER.md` explaining how to add media, read donations, rotate keys and renew the domain.

---

## Build order

0. **Save the plan and put the project on GitHub.**
   - Write this full plan to `PLAN.md` in the project root. Add `docs/MEDIA-BRIEF.md` and a `README.md`.
   - Add a `.gitignore` covering `node_modules`, `.dev.vars`, `_site`, `media/incoming` and `.wrangler`. Secrets must never be committed.
   - `git init`, commit, `git branch -M main`, add the remote `https://github.com/Beladroid/fidelstine.git`, and `git push -u origin main`.
   - After each build phase below, commit and push to `main`, so GitHub always holds the full current code.
   - Later, Cloudflare Pages connects to this repository and deploys automatically on every push.
   - If the repository is public, any photos or videos of children committed to it are public too. See the safeguarding suggestion in section 8. New media goes to R2, not the repository.
1. **Foundation.** `git init`, Eleventy scaffold, split the existing CSS and JS, and port the current page as the Home page with no visual change. Set up Cloudflare Pages, R2, D1 and the domain.
2. **Media pipeline.** `scripts/add-media.mjs`, `media.json`, responsive images, R2 video upload, and migrating the current assets.
3. **Payments backend.** D1 migration, `init`, `verify`, the webhook and the thank-you page, tested with Flutterwave test keys.
4. **Design system and layouts.** Tokens, the three moods, then the phone shell (bottom bar, menu, donate sheet), then the tablet shell (drawer), then desktop refinements.
5. **Media components.** Hero playlist, media band, carousel, masonry and lightbox, stories reel, before/after, video library, scroll-story, timeline and testimonials.
6. **Pages.** About, Programmes, Gallery, Christmas Scheme with live progress, Donate with the full form, Contact, and legal pages.
7. **Admin, newsletter and contact backends, plus the Access policy.**
8. **Motion pass.** GSAP reveals, View Transitions and micro-interactions.
9. **Launch polish.** SEO, icons, analytics and a performance pass. Swap in live Flutterwave keys and make one real small donation, then refund it.
10. Update `CLIENT-REQUIREMENTS.md` with the decisions made, and add `docs/HANDOVER.md`.
11. **Ongoing.** Each new batch of videos and photos goes through `npm run media`. Check `npm run media:report` and deploy. No layout work is needed per batch.

## Verification

**Local:**
- `npm run dev` runs Eleventy watch and `wrangler pages dev` with D1 and `.dev.vars` test keys.

**Payments:**
- A test-card donation moves the row from `pending` to `successful`.
- Tampering with the redirect URL or reusing another transaction ID does not verify.
- Closing the tab before the redirect still gets the row marked by the webhook.
- Replaying a webhook causes no second update or email.
- A declined card or a cancelled checkout shows the correct state.
- One test payment each in NGN, GBP and USD succeeds.
- `/admin` requires login, and totals and CSV match the database.

**Devices:**
- Check Chrome device mode at 360, 390, 768, 1024 (both orientations) and 1440 wide.
- Test on at least one real low-end Android phone and one iPhone or iPad.
- Check bottom-bar safe areas, swipe gestures, the lightbox and the donate sheet.

**Media:**
- `npm run media` with a new photo and a vertical video makes both appear in the right gallery category and reel after a build.
- Emptying a category hides its component cleanly, and the coverage report lists it as missing.
- Phones receive the 480p video, confirmed in the network tab.

**Motion and accessibility:**
- With reduced motion on, nothing animates and posters replace videos.
- Keyboard-only navigation works through the menu, carousels, lightbox and donate form.

**Performance:**
- Lighthouse mobile scores 90 or more on Home, Gallery and Donate under throttled 4G.

---

## Implementation status (28 September 2026)

**Built and tested:** phases 0 to 8 of the build order, except the steps that need the client's accounts.

| Area | Status |
|---|---|
| Eleventy site, 11 public pages, legal drafts, 404, admin | Done |
| Phone, tablet and desktop layouts | Done, checked with screenshots at 375, 768 and 1440 px |
| Media pipeline, coverage report, phone-size videos | Done. 21 items in the library |
| Flutterwave backend, webhook, D1 schema, admin API | Done. 18 automated tests pass against a mock Flutterwave |
| Cloudflare account, D1 database, domain, R2, Access | Waiting on the client's accounts. Steps are in `docs/DEPLOY.md` |
| Flutterwave KYC and live keys | Waiting on the charity |

**Deviations from the plan, and why:**

- **No GSAP or PhotoSwipe.** Scroll effects use native CSS scroll-driven animations and small scripts. The lightbox is custom so photos and videos share one viewer. This keeps pages lighter on Nigerian mobile data.
- **Shared server code is in `lib/`, not `functions/_lib/`.** Both the build and the functions import from it, for example the currency list.
- **The phone has no separate sticky Donate bar.** The bottom tab bar's raised Give button covers the same need. Tablets get a floating Donate pill instead.
- **Fonts still load from Google Fonts.** Self-hosting them is a small follow-up.
- **`content.json` became `copy.json`**, because `content` is a reserved name in Eleventy.
