// Campaign countdown and live "raised so far" progress bar.
import { $, $$, inView, reducedMotion } from "./util.js";
import { fromNaira, onCurrencyChange } from "./currency.js";

export default function initCampaign() {
  $$("[data-countdown]").forEach(countdown);
  $$("[data-campaign-progress]").forEach(progress);
}

function countdown(el) {
  const end = new Date(el.dataset.countdown).getTime();
  if (Number.isNaN(end)) return;
  const parts = { d: $("[data-cd=d]", el), h: $("[data-cd=h]", el), m: $("[data-cd=m]", el), s: $("[data-cd=s]", el) };
  const tick = () => {
    const left = Math.max(0, end - Date.now());
    if (left === 0) {
      el.innerHTML = '<p class="countdown__done">This year\'s scheme has closed. Thank you!</p>';
      clearInterval(timer);
      return;
    }
    const d = Math.floor(left / 864e5);
    const h = Math.floor((left % 864e5) / 36e5);
    const m = Math.floor((left % 36e5) / 6e4);
    const s = Math.floor((left % 6e4) / 1e3);
    parts.d.textContent = d;
    parts.h.textContent = String(h).padStart(2, "0");
    parts.m.textContent = String(m).padStart(2, "0");
    parts.s.textContent = String(s).padStart(2, "0");
  };
  const timer = setInterval(tick, 1000);
  tick();
}

function progress(el) {
  const slug = el.dataset.campaignProgress;
  const target = Number(el.dataset.target) || 0;
  const raisedEl = $("[data-raised]", el);
  const donorsEl = $("[data-donors]", el);
  const pctEl = $("[data-percent]", el);
  const bar = $(".progress__bar", el);

  inView(el, async () => {
    let raised = 0;
    let donors = 0;
    try {
      const res = await fetch(`/api/campaign/${encodeURIComponent(slug)}`, { headers: { Accept: "application/json" } });
      if (res.ok) {
        const data = await res.json();
        raised = Number(data.raisedNGN) || 0;
        donors = Number(data.donors) || 0;
      }
    } catch {
      /* offline or preview without the API: show zero */
    }
    const pct = target ? Math.min(100, (raised / target) * 100) : 0;
    el.style.setProperty("--p", `${pct.toFixed(1)}%`);
    bar.setAttribute("aria-valuenow", Math.round(pct));
    if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
    if (donorsEl) donorsEl.textContent = donors ? `${donors.toLocaleString("en")} gift${donors === 1 ? "" : "s"} so far` : "Be one of the first to give";
    raisedEl.dataset.raisedNgn = raised;
    animateNumber(raisedEl, raised);
  });
  // show the total in the visitor's currency, and follow any switch
  onCurrencyChange(() => {
    if (raisedEl.dataset.raisedNgn !== undefined) raisedEl.textContent = fromNaira(Number(raisedEl.dataset.raisedNgn));
  });
}

function animateNumber(el, to) {
  const fmt = (n) => fromNaira(n);
  if (reducedMotion() || !to) {
    el.textContent = fmt(to);
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min((now - t0) / 1600, 1);
    el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
