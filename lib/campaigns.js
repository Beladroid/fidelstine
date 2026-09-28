/**
 * Fundraising campaigns. The "slug" is stored with each donation, so the admin page and
 * campaign pages can total them. Targets are in naira; gifts in other currencies are
 * converted approximately (see APPROX_NGN_RATE) for the progress bar only.
 */
export const CAMPAIGNS = {
  general: {
    slug: "general",
    title: "Where it's needed most",
    description: "Shelter, food, schooling and care across all our programmes.",
  },
  "christmas-scheme": {
    slug: "christmas-scheme",
    title: "Christmas Scheme",
    description: "Food, clothing, gifts and care for children and families this Christmas.",
    // PLACEHOLDER: confirm the real target and end date with the client
    targetNGN: 5000000,
    endsAt: "2026-12-24T23:59:59+01:00",
    placeholder: true,
  },
  shelter: {
    slug: "shelter",
    title: "Safe Shelter & Family Care",
    description: "A safe home, meals and daily care for children at the home.",
  },
  education: {
    slug: "education",
    title: "Education & Vocational Training",
    description: "School fees, books, tutoring and skills training.",
  },
  crisis: {
    slug: "crisis",
    title: "Crisis Response",
    description: "Emergency food, clothing, medical care and shelter.",
  },
};

export const DEFAULT_CAMPAIGN = "general";

export function isKnownCampaign(slug) {
  return Object.prototype.hasOwnProperty.call(CAMPAIGNS, slug);
}
