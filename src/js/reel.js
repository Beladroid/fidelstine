// Stories reel: tap a card to open a full-screen, Instagram-style player with progress bars.
import { $, $$, mq, openDialog, closeDialog, readJSON } from "./util.js";

export default function initReels() {
  const player = $("[data-story-player]");
  if (!player) return;
  const video = $("[data-sp-video]", player);
  const bars = $("[data-sp-bars]", player);
  const caption = $("[data-sp-caption]", player);
  const muteBtn = $("[data-sp-mute]", player);
  let items = [];
  let index = 0;
  let muted = true;

  function renderBars() {
    bars.innerHTML = items.map(() => "<span><i></i></span>").join("");
  }
  function setBars() {
    Array.from(bars.children).forEach((b, i) => b.firstChild.style.setProperty("--p", i < index ? 1 : 0));
  }
  function load(i) {
    if (i < 0) i = 0;
    if (i >= items.length) return closeDialog(player);
    index = i;
    const it = items[index];
    video.src = mq.phone.matches && it.mobile ? it.mobile : it.src;
    video.poster = it.poster || "";
    video.muted = muted;
    caption.textContent = it.caption || it.alt || "";
    setBars();
    const p = video.play();
    if (p) p.catch(() => {});
  }
  function syncMute() {
    video.muted = muted;
    muteBtn.innerHTML = `<svg class="i" aria-hidden="true"><use href="#i-${muted ? "mute" : "sound"}"/></svg>`;
    muteBtn.setAttribute("aria-label", muted ? "Turn sound on" : "Turn sound off");
  }

  video.addEventListener("timeupdate", () => {
    const bar = bars.children[index]?.firstChild;
    if (bar && video.duration) bar.style.setProperty("--p", (video.currentTime / video.duration).toFixed(3));
  });
  video.addEventListener("ended", () => load(index + 1));

  $$("[data-sp-next]", player).forEach((b) => b.addEventListener("click", () => load(index + 1)));
  $$("[data-sp-prev]", player).forEach((b) => b.addEventListener("click", () => load(index - 1)));
  $("[data-sp-close]", player).addEventListener("click", () => closeDialog(player));
  muteBtn.addEventListener("click", () => {
    muted = !muted;
    syncMute();
  });
  player.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") load(index + 1);
    if (e.key === "ArrowLeft") load(index - 1);
    if (e.key === " ") {
      e.preventDefault();
      video.paused ? video.play() : video.pause();
    }
  });

  // press and hold pauses; swipe down closes
  let startY = 0;
  let holdTimer = null;
  let held = false;
  const stage = $(".story-player__stage", player);
  stage.addEventListener("pointerdown", (e) => {
    startY = e.clientY;
    held = false;
    holdTimer = setTimeout(() => {
      held = true;
      video.pause();
    }, 220);
  });
  stage.addEventListener("pointerup", (e) => {
    clearTimeout(holdTimer);
    if (held) {
      video.play().catch(() => {});
      e.preventDefault();
    }
    if (e.clientY - startY > 90) closeDialog(player);
  });
  // a held press should not also count as a tap on prev/next
  $$(".story-player__tap", player).forEach((t) => t.addEventListener("click", (e) => held && e.stopImmediatePropagation(), true));

  $$("[data-reel]").forEach((root) => {
    const data = readJSON($("[data-reel-items]", root)) || [];
    $$("[data-reel-open]", root).forEach((card) =>
      card.addEventListener("click", () => {
        items = data;
        renderBars();
        syncMute();
        openDialog(player, {
          onClose: () => {
            video.pause();
            video.removeAttribute("src");
            video.load();
          },
        });
        load(Number(card.dataset.reelOpen));
      })
    );
  });
}
