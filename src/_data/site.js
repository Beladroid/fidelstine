/**
 * Site-wide settings. Values that change between preview and live come from environment
 * variables set in Cloudflare Pages (Settings > Environment variables).
 *
 *   SITE_ENV        "production" lets search engines index the site (preview builds are noindex)
 *   SITE_URL        e.g. https://fidelstine.org (used for canonical links and sharing)
 *   MEDIA_R2_BASE   public URL of the R2 media bucket, e.g. https://media.fidelstine.org
 *   CF_ANALYTICS_TOKEN  Cloudflare Web Analytics token (optional)
 */
import fs from "node:fs";
import { socialList, telHref, waNumber } from "../../lib/content.js";

const env = process.env.SITE_ENV || "preview";
// contact details live in copy.json, because staff can also change them from the admin panel
const contact = JSON.parse(fs.readFileSync(new URL("./copy.json", import.meta.url), "utf8")).contact;
const phone = (display) => ({ display, tel: telHref(display).slice(4) });

export default {
  env,
  preview: env !== "production",
  // the free Cloudflare address until the charity buys a domain; then set SITE_URL
  url: (process.env.SITE_URL || "https://fidelstine.pages.dev").replace(/\/$/, ""),
  r2Base: process.env.MEDIA_R2_BASE || "",
  analyticsToken: process.env.CF_ANALYTICS_TOKEN || "",
  buildTime: Date.now().toString(36),

  name: "Fidelstine Charity Concerns and Orphanage",
  shortName: "Fidelstine",
  tagline: "Charity Concerns & Orphanage",
  motto: "Nurturing Hope, Building Futures, Defending Dignity.",
  description:
    "Fidelstine Charity Concerns and Orphanage restores dignity to the abandoned and hope to the forgotten across Nigeria and beyond: shelter, care, education and crisis response.",
  locale: "en_NG",

  email: contact.email,
  phonesNigeria: contact.phonesNigeria.map(phone),
  phonesInternational: contact.phonesInternational.map(phone),
  whatsapp: waNumber(contact.whatsapp),
  addresses: {
    head: {
      label: "Head office",
      lines: "1, Market Road, Idumu Uzu Quarters, by Skill Acquisition Center, Ubulu Okiti, Delta State, Nigeria",
      map: "https://www.google.com/maps/search/?api=1&query=Market+Road+Idumu+Uzu+Ubulu+Okiti+Delta+State+Nigeria",
      embed: "https://www.google.com/maps?q=Ubulu+Okiti,+Delta+State,+Nigeria&output=embed",
    },
    extension: {
      label: "Extension",
      lines: "Ogechukwu Nwanokwai Layout, Ashaba Okiti New Layout, off Issele Uku Road, Ubulu Okiti, Aniocha South LGA, Delta State",
    },
  },
  socials: socialList(contact),

  // Online card payments through Flutterwave. Keep false until the live Flutterwave account is ready;
  // while false, every donate form is replaced by the manual giving details below.
  onlineGiving: false,

  // Manual giving: shown instead of the online form while onlineGiving is false, and as an
  // alternative on the Donate page afterwards. Kept in code on purpose (not in the admin panel), so a
  // stolen admin login can never redirect donations. Until the account details arrive, the page offers
  // to send them on request by WhatsApp.
  manualGiving: {
    gtbank: {
      bank: "Guaranty Trust Bank (GTBank)",
      accountName: "",
      accountNumber: "",
      currency: "Naira (NGN)",
    },
    paypal: {
      email: "nwanokwai@gmail.com",
      // optional PayPal.Me link, e.g. "https://paypal.me/yourname"
      link: "",
    },
  },

  // Registration details shown in the trust strip and footer once supplied (editable in admin)
  registration: contact.registration,
};
