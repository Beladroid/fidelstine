// "Record a donation": a gift that arrived by GTBank transfer, PayPal or cash.
// Laptop: centred modal. Phone: bottom sheet. Ends with a success state and "record another".
import { api, changed } from "../api.js";
import { h, icon, cfg, overlay, field, input, select, switchEl, seg, busy, today, money, toast, svgEl } from "../ui.js";

export function checkMark() {
  const svg = svgEl("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" });
  svg.append(svgEl("path", { d: "M5 12.5l4.5 4.5L19 7.5" }));
  return svg;
}

const METHODS = [["GTBank transfer", "GTBank"], ["PayPal", "PayPal"], ["Cash", "Cash"], ["Other", "Other"]];

export function openRecord({ preset = {} } = {}) {
  const ov = overlay({ kind: "modal", title: "Record a donation", subtitle: "For gifts that arrived by bank transfer, PayPal or cash." });
  form();

  function form() {
    let method = preset.method || "GTBank transfer";
    const currencies = Object.entries(cfg.money.currencies).map(([code, c]) => [code, `${code} ${c.symbol}`]);
    const cur = select(currencies, preset.currency || "NGN", { "aria-label": "Currency" });
    const amount = input({ type: "number", min: "0", step: "any", inputmode: "decimal", placeholder: "0", class: "input input--lg", autofocus: true, "aria-label": "Amount received" });
    const methodSeg = seg(METHODS.map(([v, l]) => [v, l]), method, (v) => {
      method = v;
      if (v === "GTBank transfer") cur.value = "NGN";
    });
    const date = input({ type: "date", value: today(), max: today() });
    const camp = select(Object.entries(cfg.money.campaigns).map(([k, c]) => [k, c.title]), preset.campaign || "general");
    const name = input({ autocomplete: "off", placeholder: "Leave empty for anonymous" });
    const email = input({ type: "email", autocomplete: "off", placeholder: "For the thank-you email" });
    const ref = input({ autocomplete: "off", placeholder: "e.g. the bank or PayPal reference" });
    const note = input({ autocomplete: "off" });
    const anon = switchEl("The donor asked to stay anonymous");
    const thank = switchEl("Send a thank-you email", true);
    const err = h("p", { class: "form-error", role: "alert", hidden: true });

    ov.body.replaceChildren(
      h("div", { class: "field" }, h("label", { class: "label", text: "Amount received" }), h("div", { class: "input-group" }, cur, amount)),
      h("div", { class: "field" }, h("span", { class: "label", text: "Received by" }), methodSeg.el),
      h("div", { class: "form-grid" }, field("Date received", date), field("For", camp), field("Donor name", name), field("Donor email", email), h("div", { class: "span-2" }, field("Reference", ref)), h("div", { class: "span-2" }, field("Note", note))),
      h("div", { class: "stack stack--sm" }, anon.el, thank.el),
      err
    );
    const save = h("button", { class: "btn btn--primary", type: "button" }, icon("check"), "Record donation");
    ov.showFoot(h("button", { class: "btn", type: "button", text: "Cancel", onclick: () => ov.close() }), save);

    const submit = async () => {
      err.hidden = true;
      const amt = Number(amount.value);
      if (!(amt > 0)) {
        err.textContent = "Enter the amount received.";
        err.hidden = false;
        amount.focus();
        return;
      }
      try {
        const r = await busy(save, () =>
          api("/gifts", {
            method: "POST",
            body: {
              amount: amt,
              currency: cur.value,
              method,
              date: date.value,
              campaign: camp.value,
              name: name.value.trim(),
              email: email.value.trim(),
              reference: ref.value.trim(),
              note: note.value.trim(),
              anonymous: anon.box.checked,
              thank: thank.box.checked,
            },
          })
        );
        changed("donations");
        success(money(amt, cur.value), name.value.trim() || "Anonymous", r.emailed, { method, currency: cur.value, campaign: camp.value });
      } catch (e) {
        err.textContent = e.message;
        err.hidden = false;
      }
    };
    save.addEventListener("click", submit);
    ov.body.addEventListener("keydown", (e) => e.key === "Enter" && e.target.tagName === "INPUT" && (e.preventDefault(), submit()));
  }

  function success(amount, who, emailed, last) {
    ov.setTitle("Donation recorded", "");
    ov.body.replaceChildren(
      h(
        "div",
        { class: "success" },
        h("div", { class: "success__check" }, checkMark()),
        h("h3", { text: amount }),
        h("p", { class: "muted", text: `from ${who}. It now counts in the totals and on the website.${emailed ? " A thank-you email is on its way." : ""}` })
      )
    );
    ov.showFoot(
      h("button", { class: "btn", type: "button", text: "Done", onclick: () => ov.close() }),
      h("button", { class: "btn btn--primary", type: "button", onclick: () => ((preset = last), ov.setTitle("Record a donation", "For gifts that arrived by bank transfer, PayPal or cash."), form()) }, icon("plus"), "Record another")
    );
    toast(`${amount} recorded`, { type: "ok" });
  }
}
