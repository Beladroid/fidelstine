// Small UI toolkit for the console: element builder, icons, formatting, toasts, overlays.
// Everything user-provided is set with textContent, never parsed as HTML.

export const cfg = JSON.parse(document.getElementById("console-config").textContent);
export const phoneQuery = matchMedia("(max-width: 767px)");
export const isPhone = () => phoneQuery.matches;
export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- elements ---------- */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "style" && typeof v === "object") for (const [p, x] of Object.entries(v)) p.startsWith("--") ? el.style.setProperty(p, x) : (el.style[p] = x);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "value") el.value = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el && typeof v !== "string" && k !== "list") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const SVG = "http://www.w3.org/2000/svg";
export function icon(name, cls = "") {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", `i ${cls}`.trim());
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG, "use");
  use.setAttribute("href", `#c-${name}`);
  svg.append(use);
  return svg;
}
export const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

/* ---------- formatting ---------- */
const CUR = cfg.money.currencies;
export function money(amount, currency = "NGN", { compact = false } = {}) {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      notation: compact && Math.abs(n) >= 100000 ? "compact" : "standard",
      maximumFractionDigits: compact ? 1 : currency === "NGN" ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${CUR[currency]?.symbol || currency + " "}${n.toLocaleString("en")}`;
  }
}
export const ngn = (n, opts) => money(n, "NGN", opts);
export const minorMoney = (minor, currency, opts) => money((Number(minor) || 0) / 100, currency, opts);
export const number = (n) => (Number(n) || 0).toLocaleString("en");
export const plural = (n, one, many = one + "s") => `${number(n)} ${n === 1 ? one : many}`;

export function relTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 45) return "just now";
  if (s < 90) return "a minute ago";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 172800) return "yesterday";
  if (s < 604800) return `${Math.round(s / 86400)} days ago`;
  return fmtDate(iso);
}
export const fmtDate = (iso, opts = { day: "numeric", month: "short", year: "numeric" }) => (iso ? new Date(iso).toLocaleDateString("en-GB", opts) : "");
export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const campaignTitle = (slug) => cfg.money.campaigns[slug]?.title || slug || "General";
export const firstName = (name = "") => String(name).trim().split(/\s+/)[0] || "there";

export function initials(name = "") {
  return (
    String(name)
      .split(/[\s@.]+/)
      .filter((w) => /^[A-Za-z]/.test(w))
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("") || "·"
  );
}
const hue = (s = "") => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 17);
export function avatar(person, size = "") {
  const name = person?.name || person?.donor_name || person?.email || "";
  const el = h("span", { class: `avatar ${size ? "avatar--" + size : ""}`, style: { "--h": hue(name) }, "aria-hidden": "true" });
  if (person?.avatarId) el.append(h("img", { src: `/api/images/${person.avatarId}/s`, alt: "" }));
  else el.textContent = initials(name);
  return el;
}

/* ---------- small behaviours ---------- */
export function debounce(fn, ms = 250) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
export async function busy(btn, work) {
  btn?.setAttribute("aria-busy", "true");
  try {
    return await work();
  } finally {
    btn?.removeAttribute("aria-busy");
  }
}
export async function copy(text, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(label, { type: "ok" });
  } catch {
    toast("Couldn't copy. Please select and copy it by hand.", { type: "bad" });
  }
}
export function countUp(el, to, fmt = number, dur = 1100) {
  if (reduced() || !to) {
    el.textContent = fmt(to || 0);
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(Math.max(0, (now - t0) / dur), 1);
    el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- toasts ---------- */
export function toast(message, { type = "", action = null, timeout = 4200 } = {}) {
  const host = document.getElementById("toasts");
  const el = h("div", { class: `toast ${type ? "toast--" + type : ""}` }, icon(type === "bad" ? "alert" : type === "ok" ? "check-circle" : "zap"), h("span", { text: message }));
  if (action) el.append(h("button", { type: "button", text: action.label, onclick: () => (action.run(), close()) }));
  host.append(el);
  const close = () => {
    el.classList.add("is-closing");
    setTimeout(() => el.remove(), 250);
  };
  setTimeout(close, timeout);
  return close;
}

/* ---------- overlays ---------- */
const openOverlays = [];
function trapKeys(e) {
  const top = openOverlays[openOverlays.length - 1];
  if (!top) return;
  if (e.key === "Escape") {
    e.preventDefault();
    top.close();
  }
  if (e.key === "Tab") {
    const f = $$('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex="0"]', top.el).filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) {
      e.preventDefault();
      f[f.length - 1].focus();
    } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
      e.preventDefault();
      f[0].focus();
    }
  }
}
document.addEventListener("keydown", trapKeys);

/** Closes every open drawer, sheet and dialog (used when moving to another page). */
export function closeOverlays() {
  [...openOverlays].reverse().forEach((o) => o.close());
  document.querySelector(".pop")?.remove();
}

/**
 * A drawer (laptop: slides from the right; phone: bottom sheet) or a modal (laptop: centred; phone: sheet).
 * Returns { el, body, foot, close, setTitle }.
 */
export function overlay({ kind = "drawer", title = "", subtitle = "", wide = false, onClose, cls = "" } = {}) {
  const prev = document.activeElement;
  const scrim = h("div", { class: "scrim" });
  const titleEl = h("h2", { class: "ov__title", text: title });
  const subEl = h("p", { class: "ov__sub", text: subtitle, hidden: !subtitle });
  const closeBtn = h("button", { class: "icon-btn ov__close", type: "button", "aria-label": "Close" }, icon("x"));
  const body = h("div", { class: "ov__body" });
  const foot = h("div", { class: "ov__foot", hidden: true });
  const el = h(
    "section",
    { class: `${kind === "modal" ? "modal" : "drawer"} ${wide ? "modal--wide" : ""} ${cls}`, role: "dialog", "aria-modal": "true", "aria-label": title, tabindex: "-1" },
    h("div", { class: "grab", "aria-hidden": "true" }),
    h("header", { class: "ov__head" }, h("div", { style: { minWidth: 0 } }, titleEl, subEl), closeBtn),
    body,
    foot
  );
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.classList.add("is-closing");
    scrim.classList.add("is-closing");
    const i = openOverlays.indexOf(api);
    if (i >= 0) openOverlays.splice(i, 1);
    setTimeout(() => {
      el.remove();
      scrim.remove();
      if (!openOverlays.length) document.body.style.overflow = "";
    }, 240);
    prev?.focus?.({ preventScroll: true });
    onClose?.();
  };
  scrim.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  swipeToClose(el, close);
  document.body.append(scrim, el);
  document.body.style.overflow = "hidden";
  const api = {
    el,
    body,
    foot,
    close,
    setTitle(t, s) {
      titleEl.textContent = t;
      if (s !== undefined) {
        subEl.textContent = s;
        subEl.hidden = !s;
      }
    },
    showFoot(...kids) {
      foot.replaceChildren(...kids.flat());
      foot.hidden = !kids.length;
    },
  };
  openOverlays.push(api);
  requestAnimationFrame(() => (el.querySelector("[autofocus]") || el).focus({ preventScroll: true }));
  return api;
}

/** Drag the grab handle down to close a sheet (phones). */
function swipeToClose(el, close) {
  const grab = el.querySelector(".grab");
  const head = el.querySelector(".ov__head");
  let y0 = null;
  let dy = 0;
  const start = (e) => {
    if (!isPhone()) return;
    y0 = e.touches[0].clientY;
    dy = 0;
    el.style.transition = "none";
  };
  const move = (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    el.style.transform = `translateY(${dy}px)`;
  };
  const end = () => {
    if (y0 === null) return;
    el.style.transition = "transform .25s var(--ease)";
    if (dy > 110) close();
    else el.style.transform = "";
    y0 = null;
  };
  for (const t of [grab, head]) {
    t.addEventListener("touchstart", start, { passive: true });
    t.addEventListener("touchmove", move, { passive: true });
    t.addEventListener("touchend", end);
  }
}

/** In-app confirmation (never the browser's confirm()). Resolves true or false. */
export function confirmDialog({ title, text, confirmLabel = "Confirm", danger = true, iconName = "alert" }) {
  return new Promise((resolve) => {
    let answered = false;
    const ov = overlay({ kind: "modal", title, cls: "confirm", onClose: () => !answered && resolve(false) });
    ov.body.append(h("div", { class: `confirm__icon ${danger ? "" : "confirm__icon--info"}` }, icon(iconName)), h("p", { class: "muted", text }));
    const no = h("button", { class: "btn", type: "button", text: "Cancel", onclick: () => ov.close() });
    const yes = h("button", {
      class: `btn ${danger ? "btn--danger" : "btn--primary"}`,
      type: "button",
      text: confirmLabel,
      onclick: () => {
        answered = true;
        resolve(true);
        ov.close();
      },
    });
    ov.showFoot(no, yes);
    setTimeout(() => yes.focus(), 60);
  });
}

/* ---------- building blocks ---------- */
export function empty({ iconName = "inbox", title, text, action }) {
  return h("div", { class: "empty" }, h("div", { class: "empty__icon" }, icon(iconName)), h("h3", { text: title }), text && h("p", { text }), action);
}
export function skeleton(kind = "list", n = 5) {
  if (kind === "kpis") return h("div", { class: "grid grid-4" }, Array.from({ length: 4 }, () => h("div", { class: "card kpi" }, h("div", { class: "sk sk-line", style: { width: "50%" } }), h("div", { class: "sk", style: { height: "34px", width: "70%" } }), h("div", { class: "sk sk-line", style: { width: "40%" } }))));
  if (kind === "grid") return h("div", { class: "mgrid" }, Array.from({ length: n }, () => h("div", { class: "sk", style: { aspectRatio: "1", borderRadius: "14px" } })));
  return h(
    "div",
    { class: "stack stack--sm" },
    Array.from({ length: n }, (_, i) =>
      h("div", { class: "row", style: { padding: "10px 4px" } }, h("div", { class: "sk", style: { width: "36px", height: "36px", borderRadius: "50%" } }), h("div", { class: "stack stack--sm", style: { flex: 1 } }, h("div", { class: "sk sk-line", style: { width: `${60 - (i % 3) * 10}%` } }), h("div", { class: "sk sk-line", style: { width: "30%" } })))
    )
  );
}
export function field(label, control, hint) {
  const id = control.id || `f-${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  return h("div", { class: "field" }, h("label", { for: id, text: label }), control, hint && h("p", { class: "hint", text: hint }));
}
export const input = (props = {}) => h("input", { class: "input", ...props });
export function select(options, value, props = {}) {
  const el = h("select", { class: "select", ...props });
  for (const o of options) {
    const [v, label] = Array.isArray(o) ? o : [o, o];
    el.append(h("option", { value: v, text: label, selected: v === value }));
  }
  return el;
}
export function switchEl(label, checked = false, props = {}) {
  const box = h("input", { type: "checkbox", checked, ...props });
  return { el: h("label", { class: "switch" }, box, h("span", { text: label })), box };
}
export function seg(options, value, onChange) {
  const el = h("div", { class: "seg", role: "group" });
  const set = (v) => $$("button", el).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
  for (const [v, label, count] of options) {
    el.append(
      h("button", { type: "button", dataset: { v }, "aria-pressed": String(v === value), onclick: () => (set(v), onChange(v)) }, label, count ? h("span", { class: "count", text: count }) : null)
    );
  }
  return { el, set };
}
export function statusPill(status, txRef = "") {
  const map = { successful: ["ok", "Received"], pending: ["warn", txRef.startsWith("REP-") ? "Needs checking" : "Pending"], failed: ["bad", "Failed"], abandoned: ["bad", "Abandoned"] };
  const [tone, label] = map[status] || ["", status];
  return h("span", { class: `pill ${tone ? "pill--" + tone : ""}`, text: label });
}
export function passwordInput(props = {}) {
  const inp = h("input", { class: "input", type: "password", autocomplete: "current-password", ...props });
  const toggle = h("button", { class: "icon-btn icon-btn--sm", type: "button", "aria-label": "Show password" }, icon("eye"));
  toggle.addEventListener("click", () => {
    const show = inp.type === "password";
    inp.type = show ? "text" : "password";
    toggle.replaceChildren(icon(show ? "eye-off" : "eye"));
    toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });
  return { el: h("div", { class: "pw" }, inp, toggle), input: inp };
}
export function strengthMeter(inputEl) {
  const bar = h("i");
  const el = h("div", { class: "meter", "aria-hidden": "true" }, bar);
  const update = () => {
    const v = inputEl.value;
    let s = 0;
    if (v.length >= 10) s++;
    if (v.length >= 14) s++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
    if (/\d/.test(v)) s++;
    if (/[^A-Za-z0-9]/.test(v)) s++;
    const pct = Math.min(100, (s / 5) * 100);
    bar.style.width = `${v ? Math.max(pct, 12) : 0}%`;
    bar.style.background = pct < 40 ? "var(--bad)" : pct < 80 ? "var(--warn)" : "var(--ok)";
  };
  inputEl.addEventListener("input", update);
  return el;
}
export function generatePassword() {
  const words = ["amber", "river", "cedar", "maple", "harbor", "lantern", "meadow", "orchid", "pebble", "sunrise", "willow", "falcon", "garden", "canyon", "breeze"];
  const r = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const pick = [];
  while (pick.length < 3) {
    const w = words[r(words.length)];
    if (!pick.includes(w)) pick.push(w);
  }
  return `${pick[0]}-${pick[1]}-${100 + r(900)}-${pick[2]}`;
}
