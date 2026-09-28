// Donate forms: currency switching, amount pills, gift-impact text, validation, and handing the
// donor to Flutterwave's secure checkout through /api/donations/init.
import { $, $$, moneyConfig, formatMoney, postJSON } from "./util.js";
import { currencyReady, getCurrency, setCurrency, onCurrencyChange } from "./currency.js";

const IMPACT = {
  // mirrors copy.json giftImpact (kept small and client-side)
  generic: "Every gift goes straight to shelter, food, schooling and care for children and vulnerable adults.",
};

export default function initDonate() {
  const cfg = moneyConfig();
  const params = new URLSearchParams(location.search);

  $$("[data-donate-form]").forEach((form) => {
    const isPageForm = !form.closest("[data-donate-sheet]");
    const ui = {
      currency: $("[data-currency]", form),
      amounts: $("[data-amounts]", form),
      custom: $("[data-custom]", form),
      customInput: $("[data-custom] input", form),
      symbol: $("[data-symbol]", form),
      impact: $("[data-gift-impact]", form),
      impactText: $("[data-gift-impact-text]", form),
      error: $("[data-form-error]", form),
      submit: $("[data-donate-submit]", form),
      label: $("[data-submit-label]", form),
      campaign: $("[data-campaign-input]", form),
    };
    const name = ui.amounts.querySelector("input")?.name || "preset";
    const impactMap = readImpactMap(form);

    function renderPills(currency, selectAmount) {
      const c = cfg.currencies[currency];
      if (!c) return;
      const def = selectAmount ?? c.presets[1] ?? c.presets[0];
      const isPreset = c.presets.includes(Number(def));
      ui.amounts.innerHTML =
        c.presets
          .map(
            (a) =>
              `<label class="amount-pill"><input type="radio" name="${name}" value="${a}"${isPreset && Number(def) === a ? " checked" : ""}><span>${formatMoney(a, currency)}</span></label>`
          )
          .join("") +
        `<label class="amount-pill"><input type="radio" name="${name}" value="other"${isPreset ? "" : " checked"}><span>Other</span></label>`;
      ui.symbol.textContent = c.symbol;
      ui.customInput.min = c.min;
      ui.customInput.placeholder = `Minimum ${formatMoney(c.min, currency)}`;
      if (!isPreset) {
        ui.custom.hidden = false;
        ui.customInput.value = def;
      } else {
        ui.custom.hidden = true;
      }
      update();
    }

    function currentAmount() {
      const checked = $("input[type=radio]:checked", ui.amounts);
      if (!checked) return 0;
      if (checked.value === "other") return Number(ui.customInput.value) || 0;
      return Number(checked.value);
    }

    function update() {
      const currency = ui.currency.value;
      const amount = currentAmount();
      const checked = $("input[type=radio]:checked", ui.amounts);
      ui.custom.hidden = !(checked && checked.value === "other");
      ui.label.textContent = amount > 0 ? `Donate ${formatMoney(amount, currency)}` : "Donate";
      const text = impactText(impactMap, currency, amount);
      if (ui.impactText && ui.impactText.textContent !== text) {
        ui.impact.classList.add("is-changing");
        setTimeout(() => {
          ui.impactText.textContent = text;
          ui.impact.classList.remove("is-changing");
        }, 160);
      }
    }

    // the donor picked a currency: switch this form, the rest of the page, and remember it
    ui.currency.addEventListener("change", () => {
      renderPills(ui.currency.value);
      setCurrency(ui.currency.value, { remember: true });
    });
    ui.amounts.addEventListener("change", () => {
      update();
      const checked = $("input[type=radio]:checked", ui.amounts);
      if (checked?.value === "other") setTimeout(() => ui.customInput.focus(), 50);
    });
    ui.customInput.addEventListener("input", update);

    // initial state: the visitor's currency (link, their own choice, their country, or time zone).
    // The page form also honours ?amount= from quick-give links.
    const urlAmount = isPageForm ? Number(params.get("amount")) : NaN;
    const start = (code) => {
      ui.currency.value = code;
      renderPills(code, urlAmount > 0 ? urlAmount : undefined);
    };
    start(getCurrency() || ui.currency.value);
    currencyReady.then((code) => {
      if (ui.currency.value !== code) start(code);
      // follow later switches made anywhere on the page
      onCurrencyChange((next) => {
        if (ui.currency.value !== next) {
          ui.currency.value = next;
          renderPills(next);
        }
      });
    });
    const urlCampaign = params.get("campaign");
    if (isPageForm && urlCampaign && ui.campaign && cfg.campaigns[urlCampaign]) ui.campaign.value = urlCampaign;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showError("");
      const data = Object.fromEntries(new FormData(form).entries());
      const currency = ui.currency.value;
      const c = cfg.currencies[currency];
      const amount = currentAmount();

      if (!amount || amount < c.min) return showError(`Please enter at least ${formatMoney(c.min, currency)}.`, ui.customInput);
      if (amount > c.max) return showError(`For gifts above ${formatMoney(c.max, currency)} please contact us directly.`);
      const nameField = form.elements.name;
      const emailField = form.elements.email;
      if (!nameField.value.trim()) return showError("Please tell us your name.", nameField);
      if (!emailField.value.trim() || !emailField.checkValidity()) return showError("Please enter a valid email address for your receipt.", emailField);

      setBusy(true);
      try {
        const res = await postJSON("/api/donations/init", {
          amount,
          currency,
          campaign: ui.campaign?.value || form.dataset.defaultCampaign || "general",
          name: nameField.value.trim(),
          email: emailField.value.trim(),
          phone: data.phone || "",
          country: data.country || "",
          message: data.message || "",
          anonymous: !!data.anonymous,
          newsletter: !!data.newsletter,
          website: data.website || "",
        });
        if (!res.link) throw new Error("No checkout link returned");
        ui.label.textContent = "Opening secure checkout…";
        window.location.assign(res.link);
      } catch (err) {
        setBusy(false);
        if (err.status === 404 || err.status === 405 || err instanceof TypeError) {
          showError("Online giving is not connected on this preview yet. Please use the bank details or contact us.");
        } else {
          showError(err.message || "Something went wrong. Please try again.");
        }
      }
    });

    function setBusy(on) {
      ui.submit.toggleAttribute("disabled", on);
      ui.submit.setAttribute("aria-busy", String(on));
    }
    function showError(msg, field) {
      ui.error.textContent = msg;
      ui.error.hidden = !msg;
      $$("[aria-invalid]", form).forEach((f) => f.removeAttribute("aria-invalid"));
      if (field) {
        field.setAttribute("aria-invalid", "true");
        field.focus();
      }
      return false;
    }
  });
}

function readImpactMap(form) {
  // gift-impact lines rendered server-side for NGN are passed through data on the page
  const el = document.getElementById("gift-impact-data");
  if (el) {
    try {
      return JSON.parse(el.textContent);
    } catch {}
  }
  return null;
}

function impactText(map, currency, amount) {
  // the examples are written in naira; other currencies are compared by approximate value
  const rate = moneyConfig().approxNgnRate?.[currency];
  if (map && Array.isArray(map.NGN) && rate && amount > 0) {
    const inNaira = amount * rate;
    const sorted = [...map.NGN].sort((a, b) => a.amount - b.amount);
    let best = null;
    for (const row of sorted) if (inNaira >= row.amount * 0.95) best = row;
    if (best) {
      const exact = currency === "NGN" && amount === best.amount;
      return exact ? best.text : `Could provide: ${best.text.charAt(0).toLowerCase()}${best.text.slice(1)}, and more.`;
    }
  }
  return (map && map.generic) || IMPACT.generic;
}
