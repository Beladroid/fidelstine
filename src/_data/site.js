/**
 * Site-wide settings. Values that change between preview and live come from environment
 * variables set in Cloudflare Pages (Settings > Environment variables).
 *
 *   SITE_ENV        "production" lets search engines index the site (preview builds are noindex)
 *   SITE_URL        e.g. https://charity.fidelstine.org (used for canonical links and sharing)
 *   MEDIA_R2_BASE   public URL of the R2 media bucket, e.g. https://media.fidelstine.org
 *   CF_ANALYTICS_TOKEN  Cloudflare Web Analytics token (optional)
 */
import fs from "node:fs";
import { socialList, telHref, waCountry, waList, waNumber } from "../../lib/content.js";

const env = process.env.SITE_ENV || "preview";
// contact details live in copy.json, because staff can also change them from the admin panel
const contact = JSON.parse(fs.readFileSync(new URL("./copy.json", import.meta.url), "utf8")).contact;
const phone = (display) => ({ display, tel: telHref(display).slice(4) });

export default {
  env,
  preview: env !== "production",
  // the live domain; the Flutterwave test copy sets SITE_URL to its own address
  url: (process.env.SITE_URL || "https://charity.fidelstine.org").replace(/\/$/, ""),
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
  // the first WhatsApp number takes messages about giving; every number gets its own button
  whatsapp: waNumber(waList(contact)[0]),
  whatsappList: waList(contact).map((display) => ({ display, number: waNumber(display), country: waCountry(display) })),
  addresses: {
    head: {
      label: "Head office",
      lines: "1, Market Road, Idumu Uzu Quarters, by Skill Acquisition Center, Ubulu Okiti, Delta State, Nigeria",
      map: "https://www.google.com/maps/search/?api=1&query=Market+Road+Idumu+Uzu+Ubulu+Okiti+Delta+State+Nigeria",
      embed: "https://www.google.com/maps?q=Ubulu+Okiti,+Delta+State,+Nigeria&output=embed",
    },
    // from the client (Uju), 1 Oct 2026
    international: {
      label: "International address",
      lines: "156 King Edwards Road, Swansea SA1 4LW, United Kingdom",
      map: "https://www.google.com/maps/search/?api=1&query=156+King+Edwards+Road+Swansea+SA1+4LW+United+Kingdom",
    },
    extension: {
      label: "Extension",
      lines: "Ogechukwu Nwanokwai Layout, Ashaba Okiti New Layout, off Issele Uku Road, Ubulu Okiti, Aniocha South LGA, Delta State",
    },
  },
  socials: socialList(contact),

  // Online card payments through Flutterwave. Keep false until the live Flutterwave account is ready;
  // while false, every donate form is replaced by the manual giving details below.
  // Set ONLINE_GIVING=1 when building to switch it on (the Flutterwave test copy is built that way).
  onlineGiving: process.env.ONLINE_GIVING === "1",

  // Manual giving: shown instead of the online form while onlineGiving is false, and as an
  // alternative on the Donate page afterwards. Kept in code on purpose (not in the console), so a
  // stolen staff login can never redirect donations.
  manualGiving: {
    gtbank: {
      bank: "Guaranty Trust Bank (GTBank)",
      // shown once the client confirms it
      accountName: "",
      // from the client (Uju), 29 Sep 2026
      accounts: [
        { currency: "NGN", label: "Naira", number: "3005582820" },
        { currency: "GBP", label: "Pounds", number: "3005582985" },
        { currency: "USD", label: "US dollars", number: "3005582947" },
        { currency: "EUR", label: "Euros", number: "3005582961" },
      ],
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
