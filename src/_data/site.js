/**
 * Site-wide settings. Values that change between preview and live come from environment
 * variables set in Cloudflare Pages (Settings > Environment variables).
 *
 *   SITE_ENV        "production" hides preview-only notes and placeholder outlines
 *   SITE_URL        e.g. https://fidelstine.org (used for canonical links and sharing)
 *   MEDIA_R2_BASE   public URL of the R2 media bucket, e.g. https://media.fidelstine.org
 *   CF_ANALYTICS_TOKEN  Cloudflare Web Analytics token (optional)
 */
const env = process.env.SITE_ENV || "preview";

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

  // PLACEHOLDER: client has not supplied an email address yet
  email: "",
  phonesNigeria: [
    { display: "+234 802 342 5558", tel: "+2348023425558" },
    { display: "+234 703 981 2282", tel: "+2347039812282" },
  ],
  phonesInternational: [
    // added 28 Sep from the client (Uju). ASSUMPTION: an extra UK line, not a replacement. Confirm.
    { display: "+44 7378 255045", tel: "+447378255045" },
    { display: "+44 7398 277555", tel: "+447398277555" },
    { display: "+44 7474 371109", tel: "+447474371109" },
  ],
  // ASSUMPTION: WhatsApp on the first Nigerian number. Confirm with the client.
  whatsapp: "2348023425558",
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
  socials: [
    // PLACEHOLDER: exact Facebook page URL still needed
    { name: "Facebook", handle: "Fidelstine Charity Concerns", url: "", icon: "facebook" },
    { name: "Instagram", handle: "@fidelstine", url: "https://www.instagram.com/fidelstine", icon: "instagram" },
    { name: "X", handle: "@fidelstine", url: "https://x.com/fidelstine", icon: "x" },
  ],

  // PLACEHOLDER: bank details for direct transfers. Leave empty to hide the panel.
  bank: {
    ngn: { bank: "", accountName: "", accountNumber: "" },
    domiciliary: { bank: "", accountName: "", accountNumber: "", currency: "USD" },
  },

  // Registration details shown in the trust strip and footer once supplied
  registration: "",
};
