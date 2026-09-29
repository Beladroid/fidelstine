// "Already sent your gift? Tell us": donors report a GTBank transfer or PayPal gift. Staff confirm it in
// the admin panel once the money arrives, and the donor gets a thank-you email.
import { $, $$ } from "./util.js";
import { getCurrency } from "./currency.js";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function initReport() {
  $$("[data-report-form]").forEach(setup);
}

function setup(form) {
  const details = form.closest("[data-report]");
  const done = $("[data-report-done]", details);
  const status = $("[data-form-status]", form);
  form.date.value = today();
  form.date.max = today();

  // naira for bank transfers; the visitor's own currency for PayPal
  const syncCurrency = () => {
    const code = form.method.value === "PayPal" ? getCurrency() : "NGN";
    if ([...form.currency.options].some((o) => o.value === code)) form.currency.value = code;
  };
  form.method.addEventListener("change", syncCurrency);
  details.addEventListener("toggle", () => details.open && !form.name.value && form.name.focus({ preventScroll: true }));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const say = (msg, state) => {
      status.textContent = msg;
      status.dataset.state = state || "";
    };
    if (form.name.value.trim().length < 2) return say("Please tell us your name.", "error"), form.name.focus();
    if (!(Number(form.amount.value) > 0)) return say("Please enter the amount you sent.", "error"), form.amount.focus();

    const btn = $("button[type=submit]", form);
    btn.setAttribute("aria-busy", "true");
    say("Sending…");
    try {
      const res = await fetch("/api/donations/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: form.name.value.trim(),
          email: form.email.value.trim(),
          method: form.method.value,
          date: form.date.value,
          amount: Number(form.amount.value),
          currency: form.currency.value,
          campaign: form.campaign.value,
          reference: form.reference.value.trim(),
          note: form.note.value.trim(),
          website: form.website.value,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't go through. Please try again, or send us a WhatsApp message.");
      form.hidden = true;
      done.hidden = false;
    } catch (err) {
      say(err.message === "Failed to fetch" ? "No connection. Please check your internet and try again." : err.message, "error");
    } finally {
      btn.removeAttribute("aria-busy");
    }
  });
}
