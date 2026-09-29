// Entry point: core shell behaviour always, feature modules only when the page needs them.
import { initCore } from "./core.js";
import { initCurrency } from "./currency.js";

initCore();
initCurrency();

const modules = [
  ["[data-hero]", () => import("./hero.js")],
  ["[data-stats]", () => import("./stats.js")],
  ["[data-bg-video], [data-inview], [data-hover-preview]", () => import("./video.js")],
  ["[data-rail], [data-carousel]", () => import("./carousel.js")],
  ["[data-reel]", () => import("./reel.js")],
  ["[data-lightbox-group]", () => import("./lightbox.js")],
  ["[data-ba]", () => import("./before-after.js")],
  ["[data-vlib]", () => import("./library.js")],
  ["[data-scrolly]", () => import("./scrolly.js")],
  ["[data-donate-form]", () => import("./donate.js")],
  ["[data-countdown], [data-campaign-progress]", () => import("./campaign.js")],
  ["[data-thankyou]", () => import("./thankyou.js")],
  ["[data-report-form]", () => import("./report.js")],
  ["[data-newsletter-form], [data-contact-form]", () => import("./forms.js")],
];

for (const [selector, load] of modules) {
  if (document.querySelector(selector)) {
    load()
      .then((m) => m.default && m.default())
      .catch((e) => console.error(`Module for ${selector} failed`, e));
  }
}
