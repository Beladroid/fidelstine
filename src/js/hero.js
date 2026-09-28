// Home hero: Ken Burns photo slideshow + crossfading background video playlist.
import { $, $$, motionAllowed, onLiteChange, readJSON } from "./util.js";

export default function initHero() {
  const hero = $("[data-hero]");
  if (!hero) return;

  const slides = $$("[data-hero-slide]", hero);
  const dots = $$("[data-hero-dot]", hero);
  const caption = $("[data-hero-caption]", hero);
  const toggle = $("[data-hero-toggle]", hero);
  const videos = $$("[data-hero-video]", hero);
  const playlist = readJSON($("[data-hero-playlist]", hero)) || [];

  let index = 0;
  let timer = null;
  let userPaused = false;
  let onScreen = true;
  let videoMode = false;

  /* ---------- slideshow ---------- */
  function show(i) {
    slides[index]?.classList.remove("is-active");
    dots[index]?.removeAttribute("aria-current");
    index = (i + slides.length) % slides.length;
    slides[index].classList.add("is-active");
    dots[index]?.setAttribute("aria-current", "true");
    if (caption) caption.textContent = slides[index].dataset.caption || "";
  }
  function startSlides() {
    if (timer || slides.length < 2 || !motionAllowed() || userPaused || videoMode || !onScreen) return;
    timer = setInterval(() => show(index + 1), 7000);
  }
  function stopSlides() {
    clearInterval(timer);
    timer = null;
  }
  dots.forEach((d) =>
    d.addEventListener("click", () => {
      show(Number(d.dataset.heroDot));
      stopSlides();
      startSlides();
    })
  );

  /* ---------- video playlist (two elements for crossfades) ---------- */
  let active = 0;
  let clip = 0;
  const srcFor = (item) => item.src;

  function load(video, item) {
    video.src = srcFor(item);
    if (item.poster) video.poster = item.poster;
    video.loop = playlist.length === 1;
    video.load();
  }

  function startVideo() {
    if (!playlist.length || !videos.length || !motionAllowed() || userPaused) return;
    const v = videos[active];
    if (!v.src) load(v, playlist[clip]);
    const p = v.play();
    if (p) p.catch(() => {});
  }
  function pauseVideo() {
    videos.forEach((v) => v.pause());
  }

  function onPlaying(e) {
    if (e.target !== videos[active]) return;
    e.target.classList.add("is-visible");
    if (!videoMode) {
      videoMode = true;
      hero.classList.add("has-video");
      stopSlides();
      if (toggle) toggle.hidden = false;
    }
  }

  function crossfadeToNext() {
    if (playlist.length < 2) return;
    const current = videos[active];
    const nextIndex = (clip + 1) % playlist.length;
    const next = videos[1 - active];
    load(next, playlist[nextIndex]);
    const p = next.play();
    if (p) p.catch(() => {});
    next.addEventListener(
      "playing",
      () => {
        next.classList.add("is-visible");
        current.classList.remove("is-visible");
        setTimeout(() => current.pause(), 1400);
        active = 1 - active;
        clip = nextIndex;
      },
      { once: true }
    );
  }

  videos.forEach((v) => {
    v.muted = true;
    v.addEventListener("playing", onPlaying);
    v.addEventListener("timeupdate", () => {
      if (v !== videos[active] || playlist.length < 2 || v._fading) return;
      if (v.duration && v.currentTime > v.duration - 1.4) {
        v._fading = true;
        crossfadeToNext();
        setTimeout(() => (v._fading = false), 2000);
      }
    });
  });

  /* ---------- controls ---------- */
  if (toggle) {
    if (slides.length > 1 && motionAllowed()) toggle.hidden = false;
    toggle.addEventListener("click", () => {
      userPaused = !userPaused;
      toggle.classList.toggle("is-paused", userPaused);
      toggle.setAttribute("aria-label", userPaused ? "Play background motion" : "Pause background motion");
      if (userPaused) {
        pauseVideo();
        stopSlides();
      } else if (videoMode) startVideo();
      else startSlides();
    });
  }

  // pause everything while the hero is off screen
  new IntersectionObserver(
    ([e]) => {
      onScreen = e.isIntersecting;
      if (!onScreen) {
        pauseVideo();
        stopSlides();
      } else if (videoMode) startVideo();
      else startSlides();
    },
    { threshold: 0.05 }
  ).observe(hero);

  onLiteChange((lite) => {
    if (lite) {
      pauseVideo();
      videos.forEach((v) => v.classList.remove("is-visible"));
      hero.classList.remove("has-video");
      videoMode = false;
      stopSlides();
    } else {
      startVideo();
      startSlides();
    }
  });

  if (caption && slides[0]) caption.textContent = slides[0].dataset.caption || "";
  // give the LCP photo a moment before pulling video over the network
  const kick = () => {
    startVideo();
    startSlides();
  };
  if (document.readyState === "complete") setTimeout(kick, 400);
  else window.addEventListener("load", () => setTimeout(kick, 400), { once: true });
}
