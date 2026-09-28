// Swipe rails (dots on phone) and the testimonial carousel (dots, arrows, gentle autoplay).
import { $, $$, mq, reducedMotion } from "./util.js";

export default function initCarousels() {
  $$("[data-rail]").forEach(rail);
  $$("[data-carousel]").forEach(carousel);
}

function scrollToItem(track, item) {
  track.scrollTo({ left: item.offsetLeft - track.offsetLeft - parseFloat(getComputedStyle(track).paddingLeft || 0), behavior: reducedMotion() ? "auto" : "smooth" });
}

/* ---------- rail: horizontal on phone, grid elsewhere ---------- */
function rail(root) {
  const track = $(".rail", root);
  if (!track) return;
  const items = Array.from(track.children);
  let dots = null;
  let io = null;

  function build() {
    if (!mq.phone.matches || items.length < 2) return teardown();
    if (dots) return;
    dots = document.createElement("div");
    dots.className = "rail-dots";
    items.forEach((item, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", `Go to item ${i + 1} of ${items.length}`);
      if (i === 0) b.setAttribute("aria-current", "true");
      b.addEventListener("click", () => scrollToItem(track, item));
      dots.appendChild(b);
    });
    root.appendChild(dots);
    io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const i = items.indexOf(e.target);
          Array.from(dots.children).forEach((d, j) => (j === i ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current")));
        });
      },
      { root: track, threshold: 0.6 }
    );
    items.forEach((it) => io.observe(it));
  }
  function teardown() {
    dots?.remove();
    dots = null;
    io?.disconnect();
    io = null;
  }
  build();
  mq.phone.addEventListener("change", build);
}

/* ---------- carousel ---------- */
function carousel(root) {
  const track = $("[data-carousel-track]", root);
  const slides = Array.from(track.children);
  const dotsWrap = $("[data-carousel-dots]", root);
  const prev = $("[data-carousel-prev]", root);
  const next = $("[data-carousel-next]", root);
  const delay = Number(root.dataset.autoplay || 0);
  let current = 0;
  let timer = null;
  let hovering = false;
  let visible = false;
  let userTouched = false;

  const dots = slides.map((s, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", `Show story ${i + 1}`);
    b.addEventListener("click", () => {
      userTouched = true;
      go(i);
    });
    dotsWrap?.appendChild(b);
    return b;
  });

  function mark(i) {
    current = i;
    dots.forEach((d, j) => (j === i ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current")));
  }
  function go(i) {
    const n = (i + slides.length) % slides.length;
    scrollToItem(track, slides[n]);
    mark(n);
  }
  prev?.addEventListener("click", () => {
    userTouched = true;
    go(current - 1);
  });
  next?.addEventListener("click", () => {
    userTouched = true;
    go(current + 1);
  });

  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && e.intersectionRatio > 0.6 && mark(slides.indexOf(e.target))),
    { root: track, threshold: [0.6] }
  );
  slides.forEach((s) => io.observe(s));
  mark(0);

  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") go(current + 1);
    if (e.key === "ArrowLeft") go(current - 1);
  });
  track.addEventListener("pointerdown", () => (userTouched = true));

  if (delay && !reducedMotion() && slides.length > 1) {
    root.addEventListener("pointerenter", () => (hovering = true));
    root.addEventListener("pointerleave", () => (hovering = false));
    root.addEventListener("focusin", () => (hovering = true));
    root.addEventListener("focusout", () => (hovering = false));
    new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.4 }).observe(root);
    timer = setInterval(() => {
      if (visible && !hovering && !userTouched && !document.hidden) go(current + 1);
    }, delay);
  }
}
