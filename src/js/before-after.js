// Before / after comparison slider. The range input keeps it keyboard and screen-reader friendly.
import { $$, reducedMotion, inView } from "./util.js";

export default function initBeforeAfter() {
  $$("[data-ba]").forEach((ba) => {
    const range = ba.querySelector(".ba__range");
    const set = (v) => ba.style.setProperty("--pos", `${v}%`);
    range.addEventListener("input", () => set(range.value));
    set(range.value);

    // a small nudge the first time it scrolls into view, to show it can be dragged
    if (!reducedMotion()) {
      inView(ba, () => {
        const frames = [50, 32, 68, 50];
        let i = 0;
        const step = () => {
          if (i >= frames.length || ba.matches(":active")) return;
          ba.style.transition = "none";
          const from = Number(range.value);
          const to = frames[i++];
          const t0 = performance.now();
          const anim = (now) => {
            const p = Math.min((now - t0) / 450, 1);
            const v = from + (to - from) * (1 - Math.pow(1 - p, 3));
            range.value = v;
            set(v);
            if (p < 1) requestAnimationFrame(anim);
            else setTimeout(step, 80);
          };
          requestAnimationFrame(anim);
        };
        setTimeout(step, 400);
      }, { threshold: 0.6 });
    }
  });
}
