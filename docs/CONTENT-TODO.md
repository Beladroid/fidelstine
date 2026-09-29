# Temporary content still to replace

The site no longer shows placeholder marks, so this list is the only record of what is temporary. Replace each item when the charity sends the real version, then delete the line.

"Admin" means staff can change it at `/admin/` without a developer. "Code" means a developer edits the file named and redeploys.

## Needed before the site is promoted widely

| Item | Where it shows | Temporary version | How to change |
|---|---|---|---|
| Testimonials | Home, About | Three general quotes attributed to roles ("Volunteer, Ubulu Okiti"), not real people. **Replace with real quotes, with consent.** | Admin > Site content > Testimonials |
| GTBank account name and number | Every donate form | "Sent to you on request" with a WhatsApp button | Code: `src/_data/site.js` > `manualGiving.gtbank` |
| Team and trustees | About | Roles only (Founder, Home director, Caregivers, Trustees) | Admin > Team and trustees |
| Spending breakdown | Transparency | A planned split (55 / 25 / 12 / 8 %), labelled as planned | Admin > Where the money goes |
| Christmas Scheme goal and date | Home, Christmas page, Donate | ₦5,000,000, closing 24 December 2026 | Admin > Christmas Scheme |
| "What your gift does" amounts | Donate page, donate forms | ₦5,000 / ₦15,000 / ₦50,000 with example uses | Admin > What your gift does |
| Impact numbers | Home | 240+, 18, 95, 150+, 6 | Admin > Impact numbers |

## When the charity can supply it

| Item | Temporary version | How to change |
|---|---|---|
| Email address | Footer and Contact page point to the contact form | Admin > Contact details |
| Facebook page link | Facebook icon hidden | Admin > Contact details |
| Charity registration number | Trust strip reads "Rooted in Ubulu Okiti, Delta State" | Admin > Contact details |
| Annual report, registration certificate | "Available on request" | Admin > Reports and documents |
| Programme descriptions | General descriptions of shelter, education and crisis work | Code: `src/_data/copy.json` > `programmes` |
| Christmas Scheme introduction | General description | Code: `copy.json` > `christmas.intro` |
| "Our journey" timeline | Stages without years ("The beginning", "A home"…) | Code: `copy.json` > `timeline` |
| "A day at the home" | A typical day, written generally | Code: `copy.json` > `dayAtHome` |
| Legal pages | Written as a starting point; must be checked by the trustees, ideally with a lawyer | Code: `src/legal/*.md` (still marked `draft: true` in the file) |
| Photos and videos | Several stills look AI-generated (Gemini mark). Replace with real footage | `npm run media` (see `docs/MEDIA-GUIDE.md`) |

## Confirm with the client

- Is +44 7378 255045 an extra UK line, or does it replace one of the others?
- Is WhatsApp on +234 802 342 5558?
- Which logo and tagline are official? The flyers use a different logo and "Giving Hope, Building Brighter Futures".
- Written consent for every identifiable child in photos and flyers.
