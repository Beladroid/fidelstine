// Shell behaviour on every page: header, menu, bottom bar, donate sheet, lite mode,
// footer accordions, scroll reveals, counters and small pointer effects.
import { $, $$, mq, reducedMotion, openDialog, closeDialog, storage, toast } from "./util.js";

export function initCore() {
  header();
  menu();
  bottomBarAndFloat();
  donateSheet();
  liteMode();
  footerAccordions();
  reveals();
  counters();
  pointerEffects();
  small();
}

/* ---------- header: solid background once scrolled ---------- */
function header() {
  const el = $("[data-header]");
  if (!el) return;
  const update = () => el.classList.toggle("is-scrolled", window.scrollY > 24);
  update();
  window.addEventListener("scroll", update, { passive: true });
}

/* ---------- menu panel ---------- */
function menu() {
  const dlg = $("[data-menu]");
  if (!dlg) return;
  const openers = $$("[data-menu-open]");
  const setExpanded = (v) => openers.forEach((b) => b.setAttribute("aria-expanded", String(v)));
  openers.forEach((b) =>
    b.addEventListener("click", () => {
      openDialog(dlg, { onClose: () => setExpanded(false) });
      setExpanded(true);
    })
  );
  $$("[data-menu-close]", dlg).forEach((b) => b.addEventListener("click", () => closeDialog(dlg)));
  $$("a", dlg).forEach((a) => a.addEventListener("click", () => closeDialog(dlg)));
  // the donate button inside the menu swaps the menu for the donate sheet
  $$("[data-donate-open]", dlg).forEach((b) => b.addEventListener("click", () => closeDialog(dlg)));
  // close the drawer if the viewport grows into desktop layout
  mq.desktop.addEventListener("change", (e) => e.matches && closeDialog(dlg));
}

/* ---------- phone bottom bar (hide on scroll down) + tablet floating donate ---------- */
function bottomBarAndFloat() {
  const bar = $("[data-bottom-nav]");
  const float = $("[data-float-donate]");
  let lastY = window.scrollY;
  let ticking = false;
  let donateVisible = false;

  const onScroll = () => {
    const y = window.scrollY;
    const down = y > lastY + 4;
    const up = y < lastY - 4;
    if (bar && mq.phone.matches) {
      if (down && y > 120) bar.classList.add("is-hidden");
      else if (up || y < 120) bar.classList.remove("is-hidden");
    }
    if (float) float.classList.toggle("is-shown", y > window.innerHeight * 0.7 && !donateVisible);
    if (down || up) lastY = y;
    ticking = false;
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(onScroll);
      }
    },
    { passive: true }
  );

  // hide the floating button while a donate form or the footer is on screen
  const targets = $$(".donate-section, .donate-page, .site-footer");
  if (float && targets.length) {
    const seen = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? seen.add(e.target) : seen.delete(e.target)));
      donateVisible = seen.size > 0;
      onScroll();
    });
    targets.forEach((t) => io.observe(t));
  }

  // keep the tab bar out of the way while typing (on-screen keyboard)
  if (bar) {
    document.addEventListener("focusin", (e) => {
      if (mq.phone.matches && e.target.matches("input, textarea, select")) bar.classList.add("is-hidden");
    });
    document.addEventListener("focusout", () => {
      if (mq.phone.matches) bar.classList.remove("is-hidden");
    });
  }
}

/* ---------- donate sheet ---------- */
function donateSheet() {
  const dlg = $("[data-donate-sheet]");
  if (!dlg) return;
  const panel = $("[data-sheet-panel]", dlg);
  const campaignLabel = $("[data-sheet-campaign]", dlg);
  const campaignInput = $("[data-campaign-input]", dlg);
  const campaigns = (() => {
    try {
      return JSON.parse(document.getElementById("money-config").textContent).campaigns;
    } catch {
      return {};
    }
  })();

  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-donate-open]");
    if (!trigger) return;
    e.preventDefault();
    const slug = trigger.dataset.campaign || "general";
    if (campaignInput) campaignInput.value = slug;
    if (campaignLabel) campaignLabel.textContent = campaigns[slug]?.title || "Where it's needed most";
    // wait for the menu to finish closing if the trigger was inside it
    const delay = trigger.closest("[data-menu]") ? 380 : 0;
    setTimeout(() => {
      openDialog(dlg);
      const checked = $("input[type=radio]:checked", dlg);
      if (checked && !mq.phone.matches) checked.focus({ preventScroll: true });
    }, delay);
  });
  $$("[data-sheet-close]", dlg).forEach((b) => b.addEventListener("click", () => closeDialog(dlg)));

  // drag the grip down to dismiss (phone)
  const grip = $("[data-sheet-grip]", dlg);
  if (grip && panel) {
    let startY = 0;
    let dy = 0;
    grip.addEventListener("pointerdown", (e) => {
      startY = e.clientY;
      dy = 0;
      grip.setPointerCapture(e.pointerId);
      dlg.classList.add("is-dragging");
    });
    grip.addEventListener("pointermove", (e) => {
      if (!dlg.classList.contains("is-dragging")) return;
      dy = Math.max(0, e.clientY - startY);
      panel.style.setProperty("--drag", `${dy}px`);
    });
    const end = () => {
      if (!dlg.classList.contains("is-dragging")) return;
      dlg.classList.remove("is-dragging");
      panel.style.removeProperty("--drag");
      if (dy > 110) closeDialog(dlg);
    };
    grip.addEventListener("pointerup", end);
    grip.addEventListener("pointercancel", end);
  }
}

/* ---------- lite mode ---------- */
function liteMode() {
  const html = document.documentElement;
  const toggles = $$("[data-lite-toggle]");
  const sync = () => toggles.forEach((t) => t.setAttribute("aria-pressed", String(html.classList.contains("lite"))));
  sync();
  toggles.forEach((t) =>
    t.addEventListener("click", () => {
      const lite = !html.classList.contains("lite");
      html.classList.toggle("lite", lite);
      storage("fid-lite", lite ? "1" : "0");
      sync();
      document.dispatchEvent(new CustomEvent("fid:lite", { detail: { lite } }));
      toast(lite ? "Lite mode on: background videos stopped to save data." : "Lite mode off: background videos will play.");
    })
  );
}

/* ---------- footer accordions (closed on phone, open elsewhere) ---------- */
function footerAccordions() {
  const items = $$("[data-footer-acc]");
  const apply = () => items.forEach((d) => (d.open = !mq.phone.matches));
  apply();
  mq.phone.addEventListener("change", apply);
}

/* ---------- scroll reveals + headline word split ---------- */
function splitWords(el) {
  if (el.dataset.splitDone) return;
  el.dataset.splitDone = "1";
  const words = el.textContent.trim().split(/\s+/);
  el.setAttribute("aria-label", el.textContent.trim());
  el.innerHTML = words.map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${escapeHtml(w)}</span></span>`).join(" ");
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function reveals() {
  const html = document.documentElement;
  if (!html.classList.contains("js")) return;
  const splits = $$("[data-split]");
  if (!reducedMotion()) splits.forEach(splitWords);

  const introDelay = html.classList.contains("intro") ? 800 : 0;
  $$("[data-split-now]").forEach((el) => {
    el.style.setProperty("--delay", `${introDelay + 150}ms`);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("is-in")));
  });

  const targets = $$("[data-reveal], [data-stagger], [data-split]:not([data-split-now]), .spend");
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      });
    },
    { threshold: 0.14, rootMargin: "0px 0px -6% 0px" }
  );
  targets.forEach((t) => io.observe(t));
}

/* ---------- counters ---------- */
function counters() {
  const els = $$("[data-count]");
  if (!els.length) return;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        const el = e.target;
        const target = Number(el.dataset.count);
        const suffix = el.dataset.suffix || "";
        if (reducedMotion()) return;
        const start = performance.now();
        const dur = 1400;
        const tick = (now) => {
          const p = Math.min((now - start) / dur, 1);
          el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target).toLocaleString("en") + suffix;
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    },
    { threshold: 0.6 }
  );
  els.forEach((el) => {
    if (!reducedMotion()) el.textContent = "0" + (el.dataset.suffix || "");
    io.observe(el);
  });
}

/* ---------- desktop pointer effects ---------- */
function pointerEffects() {
  if (!mq.finePointer.matches || reducedMotion()) return;
  $$("[data-magnetic]").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) * 0.22;
      const y = (e.clientY - r.top - r.height / 2) * 0.3;
      el.style.transform = `translate(${x}px, ${y}px)`;
    });
    el.addEventListener("pointerleave", () => (el.style.transform = ""));
  });
  $$("[data-tilt]").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const rx = ((e.clientY - r.top) / r.height - 0.5) * -5;
      const ry = ((e.clientX - r.left) / r.width - 0.5) * 6;
      el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
    });
    el.addEventListener("pointerleave", () => (el.style.transform = ""));
  });
}

/* ---------- small things ---------- */
function small() {
  const note = $("[data-editor-note]");
  if (note) {
    if (sessionStorage.getItem("fid-note") === "hidden") note.remove();
    $("[data-editor-note-close]", note)?.addEventListener("click", () => {
      note.remove();
      try {
        sessionStorage.setItem("fid-note", "hidden");
      } catch {}
    });
  }

  // copy-to-clipboard buttons (bank details)
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      toast("Copied to clipboard");
    } catch {
      toast("Copy failed. Please copy it manually.");
    }
  });

  // click-to-load map (saves data until the visitor asks for it)
  $$("[data-map-load]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const wrap = btn.closest(".map-embed");
      const iframe = document.createElement("iframe");
      iframe.src = btn.dataset.mapLoad;
      iframe.title = "Map showing the Fidelstine head office";
      iframe.loading = "lazy";
      iframe.referrerPolicy = "no-referrer-when-downgrade";
      wrap.innerHTML = "";
      wrap.appendChild(iframe);
    })
  );
}
