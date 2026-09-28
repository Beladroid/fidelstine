// Background and in-card videos: play only while on screen, at most two at a time,
// never in lite mode or with reduced motion (the poster frame shows instead).
import { $$, mq, motionAllowed, onLiteChange } from "./util.js";

const MAX_PLAYING = 2;

export default function initVideos() {
  const vids = $$("video[data-bg-video], video[data-inview]");
  const ratios = new Map();

  const play = (v) => {
    if (!v.paused) return;
    v.muted = true;
    const p = v.play();
    if (p) p.catch(() => {});
  };

  function schedule() {
    if (!motionAllowed()) {
      vids.forEach((v) => v.pause());
      return;
    }
    const visible = [...ratios.entries()].filter(([, r]) => r > 0).sort((a, b) => b[1] - a[1]);
    const winners = new Set(visible.slice(0, MAX_PLAYING).map(([v]) => v));
    vids.forEach((v) => (winners.has(v) ? play(v) : v.pause()));
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => ratios.set(e.target, e.isIntersecting ? e.intersectionRatio : 0));
      schedule();
    },
    { threshold: [0, 0.25, 0.5, 0.75], rootMargin: "80px 0px" }
  );
  vids.forEach((v) => io.observe(v));
  onLiteChange(schedule);
  document.addEventListener("visibilitychange", () => (document.hidden ? vids.forEach((v) => v.pause()) : schedule()));

  // gallery tiles: preview a clip on hover (desktop only)
  if (mq.finePointer.matches) {
    $$("video[data-hover-preview]").forEach((v) => {
      const tile = v.closest(".tile");
      if (!tile) return;
      tile.addEventListener("pointerenter", () => {
        if (!motionAllowed()) return;
        v.preload = "auto";
        play(v);
        tile.classList.add("is-previewing");
      });
      tile.addEventListener("pointerleave", () => {
        v.pause();
        tile.classList.remove("is-previewing");
      });
    });
  }
}
