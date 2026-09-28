// Shared helpers used by every module.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const mq = {
  phone: matchMedia("(max-width: 600px)"),
  tablet: matchMedia("(min-width: 601px) and (max-width: 900px)"),
  desktop: matchMedia("(min-width: 901px)"),
  finePointer: matchMedia("(hover: hover) and (pointer: fine)"),
  reducedMotion: matchMedia("(prefers-reduced-motion: reduce)"),
};

export const reducedMotion = () => mq.reducedMotion.matches;
export const isLite = () => document.documentElement.classList.contains("lite");
/** Background motion (autoplaying video, slideshows) is allowed. */
export const motionAllowed = () => !reducedMotion() && !isLite();

export function onLiteChange(cb) {
  document.addEventListener("fid:lite", (e) => cb(e.detail.lite));
}

export function storage(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    return null;
  }
}

let toastTimer;
export function toast(message, ms = 3200) {
  const el = $("[data-toast]");
  if (!el) return;
  el.textContent = message;
  el.classList.add("is-shown");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-shown"), ms);
}

/* ---------- animated <dialog> open / close ---------- */
const openDialogs = new Set();
function syncScrollLock() {
  document.documentElement.style.overflow = openDialogs.size ? "hidden" : "";
}

export function openDialog(dialog, { onClose } = {}) {
  if (!dialog || dialog.open) return;
  dialog._onClose = onClose;
  dialog._returnFocus = document.activeElement;
  dialog.showModal();
  openDialogs.add(dialog);
  syncScrollLock();
  requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.add("is-open")));
  if (!dialog._wired) {
    dialog._wired = true;
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeDialog(dialog);
    });
    // click on the backdrop area (the dialog element itself) closes
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) closeDialog(dialog);
    });
  }
}

export function closeDialog(dialog) {
  if (!dialog || !dialog.open || dialog._closing) return;
  dialog._closing = true;
  dialog.classList.remove("is-open");
  const done = () => {
    dialog._closing = false;
    dialog.close();
    openDialogs.delete(dialog);
    syncScrollLock();
    dialog._onClose && dialog._onClose();
    const back = dialog._returnFocus;
    if (back && document.contains(back)) back.focus({ preventScroll: true });
  };
  setTimeout(done, reducedMotion() ? 0 : 420);
}

export async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function readJSON(el) {
  if (!el) return null;
  try {
    return JSON.parse(el.textContent);
  } catch {
    return null;
  }
}

export function moneyConfig() {
  if (!moneyConfig.cache) moneyConfig.cache = readJSON(document.getElementById("money-config")) || { currencies: {} };
  return moneyConfig.cache;
}

export function formatMoney(amount, currency) {
  const c = moneyConfig().currencies[currency];
  const n = Number(amount);
  const digits = Number.isInteger(n) ? 0 : 2;
  const num = n.toLocaleString("en", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return c ? `${c.symbol}${num}` : `${currency} ${num}`;
}

export function inView(el, cb, options = { threshold: 0.2 }) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        cb(e.target);
        io.unobserve(e.target);
      }
    });
  }, options);
  io.observe(el);
  return io;
}
