// Site content that staff can change from the admin panel without a rebuild.
//
// Each section has a starting value (from src/_data/copy.json and the lib/ config) and a field list
// that drives both validation and the admin editor. Saved changes live in the D1 `settings` table
// under "content:<section>". The build renders the starting values; functions/_middleware.js swaps in
// any saved values as each page is served, using the render helpers at the bottom of this file, which
// mirror the Nunjucks markup exactly.
//
// This module must run in both Node (Eleventy, tests) and Workers, so it takes copy.json as an
// argument instead of importing it.
import { HttpError } from "./http.js";
import { cleanText, isEmail } from "./validate.js";
import { APPROX_NGN_RATE } from "./currencies.js";
import { CAMPAIGNS } from "./campaigns.js";
import { IMAGE_ID, imageUrl, galleryImages } from "./images.js";

export const CONTENT_PREFIX = "content:";
export const CAMPAIGN_SLUG = "christmas-scheme";
const RATE_CODES = Object.keys(APPROX_NGN_RATE).filter((c) => c !== "NGN");

/* ---------------------------------------------------------------- sections */

export const SECTIONS = [
  {
    key: "campaign",
    title: "Christmas Scheme",
    help: "The goal, closing date and headline for this year's Christmas Scheme. The progress bar adds up recorded gifts automatically.",
    fields: [
      { name: "headline", label: "Headline", type: "text", max: 80 },
      { name: "targetNGN", label: "Goal (₦)", type: "number", min: 1000, max: 10_000_000_000, int: true },
      { name: "endsAt", label: "Closing date", type: "date", help: "The countdown ends at midnight on this day, Nigeria time." },
    ],
  },
  {
    key: "rates",
    title: "Exchange rates",
    help: "How many naira one unit of each currency is worth. Used for the approximate (≈) amounts shown to visitors abroad and for adding up foreign gifts. Check them every few weeks.",
    fields: RATE_CODES.map((code) => ({ name: code, label: `1 ${code} = ₦`, type: "number", min: 0.01, max: 1_000_000 })),
  },
  {
    key: "giftImpact",
    title: "What your gift does",
    help: "The three example gifts on the Donate page and in every donate form. Keep them in order from smallest to largest.",
    fields: [
      {
        name: "NGN", label: "Example gifts", itemLabel: "Example gift", type: "list", min: 3, max: 3, fixed: true,
        item: [
          { name: "amount", label: "Amount (₦)", type: "number", min: 100, max: 100_000_000, int: true },
          { name: "text", label: "What it pays for", type: "text", max: 90 },
        ],
      },
    ],
    check(v) {
      const a = v.NGN.map((g) => g.amount);
      if (!(a[0] < a[1] && a[1] < a[2])) throw new HttpError("Put the example gifts in order, smallest first.", 422);
    },
  },
  {
    key: "testimonials",
    title: "Testimonials",
    help: "Short stories in people's own words, shown on the Home and About pages. Never include a child's full name.",
    fields: [
      {
        name: "items", label: "Testimonials", itemLabel: "Testimonial", type: "list", min: 1, max: 10, addLabel: "Add a testimonial",
        item: [
          { name: "photo", label: "Photo", type: "image", kind: "testimonial", optional: true },
          { name: "quote", label: "Quote", type: "textarea", max: 400 },
          { name: "name", label: "Name", type: "text", max: 60 },
          { name: "role", label: "Role or place", type: "text", max: 60, optional: true },
        ],
      },
    ],
  },
  {
    key: "team",
    title: "Team and trustees",
    help: "The people shown on the About page.",
    fields: [
      {
        name: "items", label: "People", itemLabel: "Person", type: "list", min: 1, max: 12, addLabel: "Add a person",
        item: [
          { name: "photo", label: "Photo", type: "image", kind: "team", optional: true },
          { name: "name", label: "Name", type: "text", max: 60 },
          { name: "role", label: "Role", type: "text", max: 60 },
        ],
      },
    ],
  },
  {
    key: "spending",
    title: "Where the money goes",
    help: "The spending breakdown on the Transparency page. The percentages must add up to 100.",
    fields: [
      { name: "note", label: "Note under the heading", type: "text", max: 200, optional: true },
      {
        name: "items", label: "Spending areas", itemLabel: "Area", type: "list", min: 2, max: 8, addLabel: "Add an area",
        item: [
          { name: "label", label: "Area", type: "text", max: 50 },
          { name: "percent", label: "Percent", type: "number", min: 0, max: 100, int: true },
        ],
      },
    ],
    check(v) {
      const sum = v.items.reduce((n, i) => n + i.percent, 0);
      if (sum !== 100) throw new HttpError(`The percentages add up to ${sum}. They need to add up to 100.`, 422);
    },
  },
  {
    key: "documents",
    title: "Reports and documents",
    help: "Links to annual reports, accounts or certificates on the Transparency page, for example a shared Google Drive file.",
    fields: [
      {
        name: "items", label: "Documents", itemLabel: "Document", type: "list", min: 0, max: 10, addLabel: "Add a document",
        item: [
          { name: "title", label: "Title", type: "text", max: 80 },
          { name: "url", label: "Link", type: "url" },
        ],
      },
    ],
  },
  {
    key: "contact",
    title: "Contact details",
    help: "Shown in the footer, on the Contact page, in the menu and on the WhatsApp buttons.",
    fields: [
      { name: "email", label: "Email address", type: "email", optional: true },
      { name: "whatsapp", label: "WhatsApp number", type: "phone", help: "In international format, e.g. +234 802 342 5558" },
      { name: "phonesNigeria", label: "Phone numbers in Nigeria", type: "lines", itemType: "phone", min: 1, max: 4, help: "One per line. The first is used for the Call buttons." },
      { name: "phonesInternational", label: "International phone numbers", type: "lines", itemType: "phone", min: 0, max: 4, help: "One per line." },
      { name: "facebook", label: "Facebook page link", type: "url", optional: true },
      { name: "instagram", label: "Instagram link", type: "url", optional: true },
      { name: "x", label: "X (Twitter) link", type: "url", optional: true },
      { name: "registration", label: "Charity registration", type: "text", max: 80, optional: true, help: "e.g. \"CAC/IT/123456\". Shown in the footer and trust strip once filled in." },
    ],
  },
  {
    key: "faqs",
    title: "Questions and answers",
    help: "The questions on the Donate page.",
    fields: [
      {
        name: "items", label: "Questions", itemLabel: "Question", type: "list", min: 1, max: 20, addLabel: "Add a question",
        item: [
          { name: "q", label: "Question", type: "text", max: 120 },
          { name: "a", label: "Answer", type: "textarea", max: 600 },
          {
            name: "show", label: "Show", type: "select",
            options: [["always", "Always"], ["manual", "Only while giving is by bank transfer or PayPal"], ["online", "Only once card payments are live"]],
          },
        ],
      },
    ],
  },
  {
    key: "announcement",
    title: "Announcement",
    help: "An optional short notice shown on every page, such as a packing day or an urgent appeal. Visitors can close it.",
    fields: [
      { name: "enabled", label: "Show the announcement", type: "bool" },
      { name: "text", label: "Message", type: "text", max: 140, optional: true },
      { name: "linkUrl", label: "Link (optional)", type: "url", optional: true, relative: true },
      { name: "linkLabel", label: "Link text", type: "text", max: 30, optional: true },
    ],
    check(v) {
      if (v.enabled && !v.text) throw new HttpError("Write a message before switching the announcement on.", 422);
      if (v.linkUrl && !v.linkLabel) throw new HttpError("Add the link text, e.g. \"Find out more\".", 422);
    },
  },
];

export const SECTION_KEYS = SECTIONS.map((s) => s.key);
export const sectionByKey = (key) => SECTIONS.find((s) => s.key === key) || null;

/* ---------------------------------------------------------------- defaults */

/** Starting values for every section, from copy.json and the currency/campaign config. */
export function contentDefaults(copy) {
  const camp = CAMPAIGNS[CAMPAIGN_SLUG];
  return {
    campaign: { headline: copy.christmas.headline, targetNGN: camp.targetNGN, endsAt: camp.endsAt.slice(0, 10) },
    rates: Object.fromEntries(RATE_CODES.map((c) => [c, APPROX_NGN_RATE[c]])),
    giftImpact: { NGN: copy.giftImpact.NGN.map(({ amount, text }) => ({ amount, text })) },
    testimonials: { items: copy.testimonials.items },
    team: { items: copy.team.items },
    spending: { note: copy.spending.note || "", items: copy.spending.items },
    documents: { items: copy.documents?.items || [] },
    contact: { ...copy.contact },
    faqs: { items: copy.faqs },
    announcement: { enabled: false, text: "", linkUrl: "", linkLabel: "", ...copy.announcement },
  };
}

/* -------------------------------------------------------------- validation */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function phone(value, label) {
  const display = cleanText(value, 30).replace(/[^\d+()\-\s]/g, "").replace(/\s+/g, " ").trim();
  const digits = display.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) throw new HttpError(`${label}: "${value}" doesn't look like a phone number.`, 422);
  return display;
}

function url(value, field, label) {
  const v = cleanText(value, 500);
  if (field.relative && /^\/[^/]/.test(v)) return v;
  let u;
  try {
    u = new URL(v);
  } catch {
    throw new HttpError(`${label} must be a full link starting with https://`, 422);
  }
  if (u.protocol !== "https:") throw new HttpError(`${label} must start with https://`, 422);
  return u.toString();
}

function field(f, raw, where) {
  const label = where ? `${where}: ${f.label}` : f.label;
  const empty = raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");
  switch (f.type) {
    case "bool":
      return raw === true || raw === "true" || raw === 1;
    case "number": {
      const n = Number(raw);
      if (empty || !Number.isFinite(n)) throw new HttpError(`${label} must be a number.`, 422);
      if (f.int && !Number.isInteger(n)) throw new HttpError(`${label} must be a whole number.`, 422);
      if (n < f.min || n > f.max) throw new HttpError(`${label} must be between ${f.min.toLocaleString("en")} and ${f.max.toLocaleString("en")}.`, 422);
      return n;
    }
    case "lines": {
      const list = (Array.isArray(raw) ? raw : String(raw || "").split(/\r?\n/)).map((s) => String(s).trim()).filter(Boolean);
      if (list.length < (f.min || 0)) throw new HttpError(`${label}: add at least ${f.min}.`, 422);
      if (list.length > f.max) throw new HttpError(`${label}: no more than ${f.max}.`, 422);
      return list.map((s) => (f.itemType === "phone" ? phone(s, label) : cleanText(s, 120)));
    }
    case "list": {
      if (!Array.isArray(raw)) throw new HttpError(`${label}: send a list.`, 422);
      if (raw.length < f.min || raw.length > f.max)
        throw new HttpError(f.min === f.max ? `${label}: exactly ${f.min} needed.` : `${label}: between ${f.min} and ${f.max} allowed.`, 422);
      return raw.map((item, i) => {
        const out = {};
        for (const sub of f.item) out[sub.name] = field(sub, item?.[sub.name], `${f.label} ${i + 1}`);
        return out;
      });
    }
    default:
      break;
  }
  if (empty) {
    if (f.optional) return "";
    throw new HttpError(`${label} is required.`, 422);
  }
  switch (f.type) {
    case "text":
    case "textarea": {
      const v = cleanText(raw, f.max || 200);
      if (v.length < 2) throw new HttpError(`${label} is too short.`, 422);
      return v;
    }
    case "email": {
      const v = cleanText(raw, 160).toLowerCase();
      if (!isEmail(v)) throw new HttpError(`${label} doesn't look like an email address.`, 422);
      return v;
    }
    case "url":
      return url(raw, f, label);
    case "image": {
      const v = cleanText(raw, 20);
      if (!IMAGE_ID.test(v)) throw new HttpError(`${label}: choose a photo from the media library.`, 422);
      return v;
    }
    case "phone":
      return phone(raw, label);
    case "date": {
      const v = cleanText(raw, 10);
      if (!DATE_RE.test(v) || Number.isNaN(Date.parse(v))) throw new HttpError(`${label} must be a date.`, 422);
      return v;
    }
    case "select": {
      const v = cleanText(raw, 40);
      if (!f.options.some(([value]) => value === v)) throw new HttpError(`${label}: choose one of the options.`, 422);
      return v;
    }
    default:
      throw new HttpError(`Unknown field type ${f.type}`, 500);
  }
}

/** Validates and normalises an update for one section. */
export function validateSection(key, body) {
  const section = sectionByKey(key);
  if (!section) throw new HttpError("Unknown section.", 404);
  if (!body || typeof body !== "object") throw new HttpError("Send the section as JSON.", 422);
  const value = {};
  for (const f of section.fields) value[f.name] = field(f, body[f.name]);
  section.check?.(value);
  return value;
}

/* ---------------------------------------------------------------- storage */

/** Saved overrides: { [section]: { value, updatedAt, updatedBy } } */
export async function readSavedContent(db) {
  const { results } = await db
    .prepare("SELECT key, value, updated_at, updated_by FROM settings WHERE key LIKE ?")
    .bind(CONTENT_PREFIX + "%")
    .all();
  const out = {};
  for (const r of results || []) {
    const key = r.key.slice(CONTENT_PREFIX.length);
    if (!sectionByKey(key)) continue;
    try {
      out[key] = { value: JSON.parse(r.value), updatedAt: r.updated_at, updatedBy: r.updated_by };
    } catch {
      /* ignore a damaged row; the starting value is used instead */
    }
  }
  return out;
}

// Saved content is read on every page view, so it is kept in the edge cache for a minute.
// Saving in the admin panel clears it, so staff see their change straight away.
const LIVE_CACHE_PATH = "/api/_live-content";
const cacheKey = (context) => new Request(new URL(LIVE_CACHE_PATH, context.request.url).toString());

/** { sections: saved content, gallery: photos for the Gallery page }, cached for a minute. */
export async function readLiveCached(context) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) {
    const hit = await cache.match(cacheKey(context));
    if (hit) return hit.json();
  }
  const db = context.env.DB;
  const live = db ? { sections: await readSavedContent(db), gallery: await galleryImages(db) } : { sections: {}, gallery: [] };
  if (cache) {
    const res = new Response(JSON.stringify(live), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } });
    context.waitUntil(cache.put(cacheKey(context), res));
  }
  return live;
}

export async function clearContentCache(context) {
  if (typeof caches === "undefined") return;
  await caches.default.delete(cacheKey(context));
  await caches.default.delete(new Request(new URL(`/api/campaign/${CAMPAIGN_SLUG}`, context.request.url).toString()));
}

/** Starting values with saved overrides applied. */
export function mergeContent(defaults, saved) {
  const out = { ...defaults };
  for (const [k, s] of Object.entries(saved || {})) out[k] = s.value;
  return out;
}

/* ------------------------------------------------------------ small helpers */

export const telHref = (display) => "tel:" + (String(display).trim().startsWith("+") ? "+" : "") + String(display).replace(/\D/g, "");
export const waNumber = (display) => String(display || "").replace(/\D/g, "");
export const campaignEnd = (date) => `${date}T23:59:59+01:00`;

const SOCIALS = [
  ["facebook", "Facebook", "facebook"],
  ["instagram", "Instagram", "instagram"],
  ["x", "X", "x"],
];

/** Social links with a readable handle, e.g. "@fidelstine". */
export function socialList(contact) {
  return SOCIALS.map(([key, name, icon]) => {
    const link = contact[key] || "";
    let handle = name;
    try {
      const seg = new URL(link).pathname.split("/").filter(Boolean)[0];
      if (seg) handle = key === "facebook" ? seg.replace(/[-.]/g, " ") : "@" + seg;
    } catch {}
    return { key, name, icon, url: link, handle };
  });
}

export function initials(name = "") {
  return (
    String(name)
      .split(/\s+/)
      .filter((w) => /^[A-Za-z]/.test(w))
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("") || "F"
  );
}

export const moneyNGN = (n) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);

/* ------------------------------------------------------ render (live pages) */
// Each helper returns the same markup as the matching Nunjucks template.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
export const icon = (name, cls = "") => `<svg class="i ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;

export const render = {
  testimonials: (items) =>
    items
      .map(
        (t, i) => `<li class="carousel__slide" aria-roledescription="slide" aria-label="${i + 1} of ${items.length}">
          <figure class="testimonial">
            <div class="testimonial__avatar" aria-hidden="true">${t.photo ? `<img src="${imageUrl(t.photo)}" alt="" loading="lazy">` : esc(initials(t.name))}</div>
            <div>
              <blockquote class="testimonial__quote">&ldquo;${esc(t.quote)}&rdquo;</blockquote>
              <figcaption class="testimonial__who">${esc(t.name)}<span>${esc(t.role)}</span></figcaption>
            </div>
          </figure>
        </li>`
      )
      .join(""),

  team: (items) =>
    items
      .map(
        (p) =>
          `<li class="team-card"><div class="team-card__photo">${p.photo ? `<img src="${imageUrl(p.photo)}" alt="${esc(p.name)}" loading="lazy">` : esc(initials(p.name))}</div><h3>${esc(p.name)}</h3><p>${esc(p.role)}</p></li>`
      )
      .join(""),

  spending: (items) =>
    items
      .map(
        (s) =>
          `<div class="spend__row"><div class="spend__head"><span>${esc(s.label)}</span><span>${s.percent}%</span></div><div class="spend__bar"><i style="--w: ${s.percent}%"></i></div></div>`
      )
      .join(""),

  documents: (items) =>
    items.length
      ? items.map((d) => `<li><a href="${esc(d.url)}" target="_blank" rel="noopener">${icon("file")}${esc(d.title)}</a></li>`).join("")
      : `<li><span>${icon("file")}Our annual report and registration certificate are available on request.</span></li>`,

  faqs: (items, online) =>
    items
      .filter((f) => f.show === "always" || (f.show === "online") === online)
      .map((f, i) => `<details${i === 0 ? " open" : ""}><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`)
      .join(""),

  phones: (list) => list.map((p) => `<a href="${telHref(p)}">${esc(p)}</a>`).join(""),

  email: (email, variant) =>
    email
      ? `<a href="mailto:${esc(email)}">${esc(email)}</a>`
      : variant === "contact"
        ? "<p>Please use the form and we will reply by email.</p>"
        : '<a href="/contact/">Use our contact form</a>',

  socialIcons: (contact) =>
    socialList(contact)
      .filter((s) => s.url)
      .map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener" aria-label="${esc(s.name)}: ${esc(s.handle)}">${icon(s.icon)}</a>`)
      .join(""),

  socialLines: (contact) =>
    socialList(contact)
      .filter((s) => s.url)
      .map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}: ${esc(s.handle)}</a>`)
      .join(""),

  trustRegistration: (reg) => (reg ? `${icon("shield")}Registered charity: ${esc(reg)}` : `${icon("pin")}Rooted in Ubulu Okiti, Delta State`),

  // the "Just added" part of the Gallery page: photos uploaded in the console, with their own lightbox
  galleryLatest: (items) => {
    const lb = items.map((g) => ({ id: g.id, type: "image", src: imageUrl(g.id, "l"), poster: null, alt: g.alt || "", caption: g.caption || "", w: g.w, h: g.h }));
    const tiles = items
      .map(
        (g, i) =>
          `<li class="masonry__item"><button class="tile" type="button" data-lb-index="${i}" aria-label="Open image: ${esc(g.caption || g.alt || "photo")}"><img src="${imageUrl(g.id)}" alt="${esc(g.alt)}" loading="lazy"${g.w && g.h ? ` width="${g.w}" height="${g.h}"` : ""}>${g.caption ? `<span class="tile__caption">${esc(g.caption)}</span>` : ""}</button></li>`
      )
      .join("");
    return `<div class="wrap"><div class="section-head"><div><p class="eyebrow">Just added</p><h2 id="latest-title">Latest from the home</h2></div></div><div data-lightbox-group><ul class="masonry" role="list">${tiles}</ul><script type="application/json" data-lightbox-items>${JSON.stringify(lb).replace(/</g, "\\u003c")}</script></div></div>`;
  },

  announcement: (a) =>
    `<p class="notice__text">${esc(a.text)}${a.linkUrl ? ` <a class="text-link" href="${esc(a.linkUrl)}">${esc(a.linkLabel)}</a>` : ""}</p><button class="notice__close" type="button" data-notice-close aria-label="Close">${icon("close")}</button>`,
};
