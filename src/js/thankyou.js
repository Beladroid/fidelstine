// Thank-you page: confirms the payment with our server (which re-checks it with Flutterwave),
// then celebrates. Retries while a bank transfer or USSD payment is still pending.
import { $, postJSON, formatMoney, reducedMotion } from "./util.js";

export default async function initThankYou() {
  const root = $("[data-thankyou]");
  const params = new URLSearchParams(location.search);
  const txRef = params.get("tx_ref") || "";
  const transactionId = params.get("transaction_id") || "";
  const status = (params.get("status") || "").toLowerCase();
  const set = (state) => (root.dataset.state = state);

  if (!txRef) return set("failed");
  if (status === "cancelled") {
    set("cancelled");
    postJSON("/api/donations/verify", { tx_ref: txRef, transaction_id: transactionId, cancelled: true }).catch(() => {});
    return;
  }

  set("verifying");
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await postJSON("/api/donations/verify", { tx_ref: txRef, transaction_id: transactionId });
      if (res.status === "successful") {
        fill(res);
        set("success");
        confetti();
        return;
      }
      if (res.status === "failed" || res.status === "abandoned") {
        set("failed");
        return;
      }
    } catch (e) {
      if (e.status === 404) return set("failed");
    }
    await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
  }
  set("pending");

  function fill(res) {
    const put = (sel, v) => {
      const el = $(sel, root);
      if (el) el.textContent = v;
    };
    put("[data-ty-amount]", formatMoney(res.amount, res.currency));
    put("[data-ty-campaign]", res.campaignTitle || "Where it's needed most");
    put("[data-ty-ref]", txRef);
    put("[data-ty-name]", res.firstName ? `, ${res.firstName}` : "");
  }
}

function confetti() {
  if (reducedMotion()) return;
  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  };
  resize();
  const colors = ["#A33234", "#E8B4BC", "#2F5F8F", "#D9C08A", "#FFFFFF"];
  const pieces = Array.from({ length: 140 }, () => ({
    x: Math.random() * canvas.width,
    y: -Math.random() * canvas.height * 0.6,
    w: (6 + Math.random() * 6) * dpr,
    h: (8 + Math.random() * 10) * dpr,
    vy: (2 + Math.random() * 3) * dpr,
    vx: (Math.random() - 0.5) * 2 * dpr,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.2,
    c: colors[(Math.random() * colors.length) | 0],
  }));
  const t0 = performance.now();
  const frame = (now) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fade = Math.max(0, 1 - (now - t0 - 3000) / 1200);
    ctx.globalAlpha = fade;
    for (const p of pieces) {
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (fade > 0) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
