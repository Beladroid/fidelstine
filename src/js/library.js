// Video library: one main player plus a playlist of films.
import { $, $$, mq, readJSON } from "./util.js";

export default function initLibrary() {
  $$("[data-vlib]").forEach((root) => {
    const stage = $("[data-vlib-stage]", root);
    const video = $("[data-vlib-video]", root);
    const title = $("[data-vlib-title]", root);
    const items = readJSON($("[data-vlib-items]", root)) || [];
    const buttons = $$("[data-vlib-index]", root);

    const playNow = () => {
      stage.classList.add("is-playing");
      const p = video.play();
      if (p) p.catch(() => {});
    };
    $("[data-vlib-play]", root)?.addEventListener("click", playNow);
    video.addEventListener("play", () => stage.classList.add("is-playing"));

    buttons.forEach((btn) =>
      btn.addEventListener("click", () => {
        const it = items[Number(btn.dataset.vlibIndex)];
        if (!it) return;
        buttons.forEach((b) => b.removeAttribute("aria-current"));
        btn.setAttribute("aria-current", "true");
        video.pause();
        video.innerHTML = "";
        video.poster = it.poster || "";
        video.src = mq.phone.matches && it.mobile ? it.mobile : it.src;
        if (title) title.textContent = it.caption || it.alt || "";
        playNow();
        if (mq.phone.matches || !mq.desktop.matches) stage.scrollIntoView({ behavior: "smooth", block: "center" });
      })
    );
  });
}
