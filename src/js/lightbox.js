// Gallery filters + a full-screen lightbox for photos and videos:
// swipe, keyboard, double-tap zoom with panning, swipe down to close.
import { $, $$, openDialog, closeDialog, readJSON, reducedMotion } from "./util.js";

export default function initLightbox() {
  const lb = $("[data-lightbox]");
  if (!lb) return;
  const stage = $("[data-lb-stage]", lb);
  const cap = $("[data-lb-caption]", lb);
  const count = $("[data-lb-count]", lb);

  let list = []; // items currently navigable (respects gallery filters)
  let pos = 0;
  let zoom = 1;
  let pan = { x: 0, y: 0 };

  function render(direction = 0) {
    const it = list[pos];
    if (!it) return;
    stage.innerHTML = "";
    zoom = 1;
    pan = { x: 0, y: 0 };
    stage.classList.remove("is-zoomed");
    let el;
    if (it.type === "video") {
      el = document.createElement("video");
      el.controls = true;
      el.playsInline = true;
      el.autoplay = true;
      el.preload = "auto";
      el.poster = it.poster || "";
      el.src = it.src;
      el.muted = !it.audio;
      if (!it.audio) el.loop = true;
    } else {
      el = document.createElement("img");
      el.src = it.src;
      el.alt = it.alt || "";
      el.decoding = "async";
      if (it.w && it.h) {
        el.width = it.w;
        el.height = it.h;
      }
    }
    if (!reducedMotion()) el.classList.add("is-entering");
    el.style.setProperty("--dir", direction);
    stage.appendChild(el);
    cap.textContent = it.caption || it.alt || "";
    count.textContent = `${pos + 1} / ${list.length}`;
    // warm the neighbours
    [list[pos + 1], list[pos - 1]].forEach((n) => {
      if (n && n.type === "image") new Image().src = n.src;
    });
  }

  function go(delta) {
    if (list.length < 2) return;
    pos = (pos + delta + list.length) % list.length;
    render(delta);
  }

  $("[data-lb-close]", lb).addEventListener("click", () => closeDialog(lb));
  $("[data-lb-prev]", lb).addEventListener("click", () => go(-1));
  $("[data-lb-next]", lb).addEventListener("click", () => go(1));
  lb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") go(1);
    if (e.key === "ArrowLeft") go(-1);
  });

  /* ---------- gestures ---------- */
  let start = null;
  let lastTap = 0;
  const media = () => stage.firstElementChild;
  const applyTransform = (dx = 0, dy = 0, fade = false) => {
    const m = media();
    if (!m) return;
    m.style.transform = zoom > 1 ? `translate(${pan.x + dx}px, ${pan.y + dy}px) scale(${zoom})` : `translate(${dx}px, ${dy}px)`;
    m.style.opacity = fade ? String(Math.max(0.35, 1 - Math.abs(dy) / 400)) : "";
  };

  stage.addEventListener("pointerdown", (e) => {
    if (e.target.tagName === "VIDEO" && e.offsetY > e.target.clientHeight - 60) return; // leave video controls alone
    start = { x: e.clientX, y: e.clientY, t: Date.now() };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add("is-dragging");
  });
  stage.addEventListener("pointermove", (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (zoom > 1) applyTransform(dx, dy);
    else if (Math.abs(dy) > Math.abs(dx)) applyTransform(0, Math.max(0, dy), true);
    else applyTransform(dx, 0);
  });
  const end = (e) => {
    if (!start) return;
    stage.classList.remove("is-dragging");
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const quick = Date.now() - start.t < 300;
    start = null;
    if (zoom > 1) {
      pan = { x: pan.x + dx, y: pan.y + dy };
      applyTransform();
      return;
    }
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
      // tap: double-tap toggles zoom on photos
      const now = Date.now();
      const m = media();
      if (now - lastTap < 300 && m && m.tagName === "IMG") {
        zoom = zoom > 1 ? 1 : 2.2;
        pan = { x: 0, y: 0 };
        stage.classList.toggle("is-zoomed", zoom > 1);
        applyTransform();
      }
      lastTap = now;
      return;
    }
    if (dy > 110 && Math.abs(dy) > Math.abs(dx)) return closeDialog(lb);
    if (Math.abs(dx) > 60 || (quick && Math.abs(dx) > 30)) go(dx < 0 ? 1 : -1);
    else applyTransform();
  };
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);
  stage.addEventListener("dblclick", (e) => e.preventDefault());

  /* ---------- groups + gallery filters ---------- */
  $$("[data-lightbox-group]").forEach((group) => {
    const all = readJSON($("[data-lightbox-items]", group)) || [];
    const buttons = $$("[data-lb-index]", group);

    buttons.forEach((btn) =>
      btn.addEventListener("click", () => {
        // navigate only the items currently visible (gallery filters)
        const visible = buttons.filter((b) => !b.closest(".masonry__item")?.hidden).map((b) => Number(b.dataset.lbIndex));
        list = visible.map((i) => all[i]);
        pos = visible.indexOf(Number(btn.dataset.lbIndex));
        openDialog(lb, { onClose: () => (stage.innerHTML = "") });
        render();
      })
    );

    if (group.matches("[data-gallery]")) filters(group);
  });
}

function filters(root) {
  const chips = $$("[data-filter]", root);
  const items = $$(".masonry__item", root);
  const counter = $("[data-gallery-count]", root);
  chips.forEach((chip) =>
    chip.addEventListener("click", () => {
      const f = chip.dataset.filter;
      chips.forEach((c) => {
        const on = c === chip;
        c.classList.toggle("is-active", on);
        c.setAttribute("aria-pressed", String(on));
      });
      let n = 0;
      items.forEach((it) => {
        const show = f === "all" || it.dataset.tags.split(" ").includes(f);
        it.hidden = !show;
        it.classList.remove("is-entering");
        if (show) {
          n++;
          void it.offsetWidth;
          it.classList.add("is-entering");
          it.style.animationDelay = `${Math.min(n, 12) * 25}ms`;
        }
      });
      if (counter) counter.textContent = `${n} item${n === 1 ? "" : "s"}`;
    })
  );
}
