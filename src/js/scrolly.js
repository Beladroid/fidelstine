// Scroll story: the pinned picture changes as each step scrolls through the middle of the screen.
import { $, $$ } from "./util.js";

export default function initScrolly() {
  $$("[data-scrolly]").forEach((root) => {
    const steps = $$("[data-scrolly-step]", root);
    const frames = $$("[data-scrolly-frame]", root);
    const counter = $("[data-scrolly-counter]", root);
    const total = String(steps.length).padStart(2, "0");

    const activate = (i) => {
      steps.forEach((s, j) => s.classList.toggle("is-active", j === i));
      frames.forEach((f, j) => f.classList.toggle("is-active", j === i));
      if (counter) counter.textContent = `${String(i + 1).padStart(2, "0")} / ${total}`;
    };

    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && activate(steps.indexOf(e.target))),
      { rootMargin: "-45% 0px -45% 0px" }
    );
    steps.forEach((s) => io.observe(s));
  });
}
