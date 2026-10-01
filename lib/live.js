// Swaps staff-edited content (saved in the admin panel) into pages as they are served.
// Only sections that have been changed get a handler, so untouched pages pass straight through.
// Workers-only: uses HTMLRewriter.
import money from "../src/_data/money.js";
import { CAMPAIGN_SLUG, campaignEnd, moneyNGN, render, telHref, waList, waNumber } from "./content.js";

const html = { html: true };
// JSON inside <script>: never let "</script>" or "<!--" end the element early
const scriptJson = (v) => JSON.stringify(v).replace(/</g, "\\u003c");

function replaceWith(markup) {
  return { element: (el) => el.setInnerContent(markup, html) };
}

/** Builds the money config the browser reads (#money-config), with saved rates and campaign values. */
export function moneyConfig(content) {
  const camp = content.campaign;
  return {
    ...money,
    approxNgnRate: { ...money.approxNgnRate, ...content.rates },
    campaigns: {
      ...money.campaigns,
      [CAMPAIGN_SLUG]: { ...money.campaigns[CAMPAIGN_SLUG], targetNGN: camp.targetNGN, endsAt: campaignEnd(camp.endsAt) },
    },
  };
}

/**
 * @param copy     src/_data/copy.json (for parts of sections that are not editable)
 * @param content  merged content (starting values + saved changes)
 * @param changed  keys of the sections that have saved changes ("gallery" when there are new photos)
 * @param gallery  photos uploaded in the console for the Gallery page
 */
export function liveRewriter(copy, content, changed, gallery = []) {
  const on = new Set(changed);
  const rw = new HTMLRewriter();

  if (on.has("testimonials")) rw.on('[data-live="testimonials"]', replaceWith(render.testimonials(content.testimonials.items)));
  if (on.has("team")) rw.on('[data-live="team"]', replaceWith(render.team(content.team.items)));
  if (on.has("documents")) rw.on('[data-live="documents"]', replaceWith(render.documents(content.documents.items)));

  if (on.has("spending")) {
    const { note, items } = content.spending;
    rw.on('[data-live="spending"]', replaceWith(render.spending(items)));
    rw.on('[data-live="spending-note"]', {
      element(el) {
        el.setInnerContent(note || "");
        if (note) el.removeAttribute("hidden");
        else el.setAttribute("hidden", "");
      },
    });
  }

  if (on.has("faqs")) {
    rw.on('[data-live="faqs"]', {
      element: (el) => el.setInnerContent(render.faqs(content.faqs.items, el.getAttribute("data-online") === "true"), html),
    });
  }

  if (on.has("giftImpact")) {
    const tiers = content.giftImpact.NGN;
    rw.on("[data-gi-amount]", {
      element(el) {
        const g = tiers[Number(el.getAttribute("data-gi-amount"))];
        if (!g) return;
        el.setAttribute("data-money-ngn", String(g.amount));
        el.setInnerContent(moneyNGN(g.amount));
      },
    });
    rw.on("[data-gi-text]", {
      element(el) {
        const g = tiers[Number(el.getAttribute("data-gi-text"))];
        if (g) el.setInnerContent(g.text);
      },
    });
    rw.on("#gift-impact-data", replaceWith(scriptJson({ ...copy.giftImpact, NGN: tiers })));
  }

  if (on.has("campaign")) {
    const camp = content.campaign;
    rw.on('[data-live-campaign="headline"]', { element: (el) => el.setInnerContent(camp.headline) });
    rw.on('[data-live-campaign="target"]', {
      element(el) {
        el.setAttribute("data-money-ngn", String(camp.targetNGN));
        el.setInnerContent(moneyNGN(camp.targetNGN));
      },
    });
    rw.on(`[data-campaign-progress="${CAMPAIGN_SLUG}"]`, { element: (el) => el.setAttribute("data-target", String(camp.targetNGN)) });
    // only the Christmas Scheme has a countdown
    rw.on("[data-countdown]", { element: (el) => el.setAttribute("data-countdown", campaignEnd(camp.endsAt)) });
  }

  if (on.has("campaign") || on.has("rates")) rw.on("#money-config", replaceWith(scriptJson(moneyConfig(content))));

  if (on.has("contact")) {
    const c = content.contact;
    rw.on('[data-live="phones-ng"]', replaceWith(render.phones(c.phonesNigeria)));
    rw.on('[data-live="phones-intl"]', replaceWith(render.phones(c.phonesInternational)));
    rw.on('[data-live="email"]', { element: (el) => el.setInnerContent(render.email(c.email, el.getAttribute("data-variant")), html) });
    rw.on('[data-live="social-icons"]', replaceWith(render.socialIcons(c)));
    rw.on('[data-live="social-lines"]', replaceWith(render.socialLines(c)));
    rw.on("[data-live-call]", { element: (el) => el.setAttribute("href", telHref(c.phonesNigeria[0])) });
    rw.on('[data-live="wa-lines"]', replaceWith(render.waLines(c)));
    rw.on('[data-live="wa-buttons"]', replaceWith(render.waButtons(c)));
    rw.on('[data-live="wa-quick"]', replaceWith(render.waQuick(c)));
    // single links with a ready-made message (giving details, "I've sent my gift") use the first number
    rw.on("[data-live-wa]", {
      element(el) {
        el.setAttribute("href", el.getAttribute("href").replace(/wa\.me\/\d+/, `wa.me/${waNumber(waList(c)[0])}`));
      },
    });
    rw.on('[data-live="registration"]', {
      element(el) {
        el.setInnerContent(c.registration ? `Registered charity: ${c.registration}` : "");
        if (c.registration) el.removeAttribute("hidden");
        else el.setAttribute("hidden", "");
      },
    });
    rw.on('[data-live="trust-registration"]', replaceWith(render.trustRegistration(c.registration)));
  }

  if (on.has("gallery") && gallery.length) {
    rw.on('[data-live="gallery-latest"]', {
      element(el) {
        el.removeAttribute("hidden");
        el.setInnerContent(render.galleryLatest(gallery), html);
      },
    });
  }

  if (on.has("announcement")) {
    const a = content.announcement;
    rw.on('[data-live="announcement"]', {
      element(el) {
        if (a.enabled && a.text) {
          el.removeAttribute("hidden");
          el.setInnerContent(render.announcement(a), html);
        } else {
          el.setAttribute("hidden", "");
          el.setInnerContent("");
        }
      },
    });
  }

  return rw;
}
