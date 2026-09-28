// Newsletter sign-up and contact form.
import { $, $$, postJSON } from "./util.js";

export default function initForms() {
  $$("[data-newsletter-form]").forEach((form) => wire(form, "/api/newsletter", "Thank you! You're on the list.", (d) => ({ email: d.email, website: d.website, source: location.pathname })));
  $$("[data-contact-form]").forEach((form) =>
    wire(form, "/api/contact", "Thank you. Your message has been sent and we will reply soon.", (d) => ({
      name: d.name,
      email: d.email,
      phone: d.phone,
      subject: d.subject,
      message: d.message,
      website: d.website,
    }))
  );
}

function wire(form, url, okMessage, shape) {
  const status = $("[data-form-status]", form);
  const button = $("button[type=submit]", form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const invalid = $$("input, textarea, select", form).find((f) => !f.checkValidity());
    if (invalid) {
      invalid.setAttribute("aria-invalid", "true");
      invalid.focus();
      return say("Please check the highlighted field.", "error");
    }
    $$("[aria-invalid]", form).forEach((f) => f.removeAttribute("aria-invalid"));
    button.setAttribute("aria-busy", "true");
    button.disabled = true;
    try {
      await postJSON(url, shape(Object.fromEntries(new FormData(form).entries())));
      form.reset();
      say(okMessage, "ok");
    } catch (err) {
      say(err.status === 404 || err instanceof TypeError ? "This form is not connected on this preview yet." : err.message || "Something went wrong. Please try again.", "error");
    } finally {
      button.removeAttribute("aria-busy");
      button.disabled = false;
    }
  });
  function say(msg, state) {
    if (!status) return;
    status.textContent = msg;
    status.dataset.state = state;
  }
}
