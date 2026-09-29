// Staff dashboard: donations with filters, totals and CSV export; newsletter sign-ups; messages.
// Protected by Cloudflare Access in front of /admin and /api/admin. All values are written with
// textContent, so nothing from the database is ever interpreted as HTML.
import { $, $$, formatMoney } from "./util.js";

export default function initAdmin() {
  const root = $("[data-admin]");
  const rows = $("[data-admin-rows]", root);
  const totals = $("[data-admin-totals]", root);
  const filters = $("[data-admin-filters]", root);
  const csv = $("[data-admin-csv]", root);
  const more = $("[data-admin-more]", root);
  const errorBox = $("[data-admin-error]", root);
  const userEl = $("[data-admin-user]", root);
  let cursor = null;

  const el = (tag, text, cls) => {
    const e = document.createElement(tag);
    if (text !== undefined && text !== null) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
  const showError = (msg) => {
    errorBox.textContent = msg;
    errorBox.hidden = !msg;
  };
  const query = () => {
    const p = new URLSearchParams();
    new FormData(filters).forEach((v, k) => v && p.set(k, v));
    return p;
  };

  async function get(url) {
    const res = await fetch(url, { headers: { Accept: "application/json" }, credentials: "same-origin" });
    if (res.status === 401 || res.status === 403) throw new Error("You are not signed in as an admin. Sign in through Cloudflare Access, then reload.");
    if (!res.ok) throw new Error(`Could not load data (${res.status}).`);
    return res.json();
  }

  async function loadDonations(append = false) {
    showError("");
    const p = query();
    if (append && cursor) p.set("cursor", cursor);
    csv.href = `/api/admin/donations?${new URLSearchParams([...p, ["format", "csv"]])}`;
    try {
      const data = await get(`/api/admin/donations?${p}`);
      if (data.user) userEl.textContent = `Signed in as ${data.user}`;
      if (!append) rows.innerHTML = "";
      renderTotals(data.totals || []);
      if (!data.items.length && !append) {
        const tr = el("tr");
        const td = el("td", "No donations match these filters.", "muted");
        td.colSpan = 7;
        tr.appendChild(td);
        rows.appendChild(tr);
      }
      data.items.forEach((d) => rows.appendChild(row(d)));
      cursor = data.nextCursor || null;
      more.hidden = !cursor;
    } catch (e) {
      showError(e.message);
      rows.innerHTML = "";
      userEl.textContent = "";
    }
  }

  function row(d) {
    const tr = el("tr");
    const date = el("td", new Date(d.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }));
    const donor = el("td", d.anonymous ? `${d.donor_name} (anonymous)` : d.donor_name);
    donor.appendChild(el("small", d.donor_email));
    if (d.message) donor.appendChild(el("small", `"${d.message}"`));
    const amount = el("td", formatMoney(d.amount / 100, d.currency));
    if (d.amount_settled) amount.appendChild(el("small", `Settled: ${d.amount_settled}`));
    const status = el("td");
    status.appendChild(el("span", d.status, `status status--${d.status}`));
    const ref = el("td", d.tx_ref, "mono");
    if (d.tx_ref.startsWith("MAN-")) {
      // recorded by staff: show the note and allow removal of mistakes (two clicks, no pop-up)
      if (d.notes) ref.appendChild(el("small", d.notes));
      const rm = el("button", "Remove", "remove-btn");
      rm.type = "button";
      rm.addEventListener("click", async () => {
        if (!rm.dataset.armed) {
          rm.dataset.armed = "1";
          rm.textContent = "Click again to remove";
          return;
        }
        rm.disabled = true;
        try {
          const res = await fetch(`/api/admin/gifts/${d.id}`, { method: "DELETE", credentials: "same-origin" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `Could not remove (${res.status}).`);
          loadDonations();
        } catch (e) {
          showError(e.message);
          rm.disabled = false;
        }
      });
      ref.appendChild(rm);
    }
    tr.append(date, donor, amount, el("td", d.campaign), el("td", d.payment_type || "-"), status, ref);
    return tr;
  }

  function renderTotals(list) {
    totals.innerHTML = "";
    if (!list.length) return;
    list.forEach((t) => {
      const box = el("div", null, "admin__total");
      box.append(el("strong", formatMoney(t.total / 100, t.currency)), el("span", `${t.count} gift${t.count === 1 ? "" : "s"} in ${t.currency}`));
      totals.appendChild(box);
    });
  }

  async function loadSimple(kind, target, cols) {
    try {
      const data = await get(`/api/admin/${kind}`);
      target.innerHTML = "";
      if (!data.items.length) {
        const tr = el("tr");
        const td = el("td", "Nothing yet.", "muted");
        td.colSpan = cols.length;
        tr.appendChild(td);
        target.appendChild(tr);
      }
      data.items.forEach((item) => {
        const tr = el("tr");
        cols.forEach((c) => tr.appendChild(el("td", c(item))));
        target.appendChild(tr);
      });
    } catch (e) {
      showError(e.message);
    }
  }

  filters.addEventListener("submit", (e) => {
    e.preventDefault();
    cursor = null;
    loadDonations();
  });
  more.addEventListener("click", () => loadDonations(true));

  const loaded = new Set(["donations"]);
  $$("[data-tab]", root).forEach((tab) =>
    tab.addEventListener("click", () => {
      const name = tab.dataset.tab;
      $$("[data-tab]", root).forEach((t) => {
        t.classList.toggle("is-active", t === tab);
        t.setAttribute("aria-selected", String(t === tab));
      });
      $$("[data-panel]", root).forEach((p) => (p.hidden = p.dataset.panel !== name));
      if (loaded.has(name)) return;
      loaded.add(name);
      const fmt = (s) => new Date(s).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
      if (name === "newsletter") loadSimple("newsletter", $("[data-admin-newsletter]", root), [(i) => fmt(i.created_at), (i) => i.email, (i) => i.source || ""]);
      if (name === "stats") loadStatsEditor();
      if (name === "content") loadContent();
      if (name === "messages") loadSimple("messages", $("[data-admin-messages]", root), [(i) => fmt(i.created_at), (i) => `${i.name} <${i.email}>${i.phone ? " " + i.phone : ""}`, (i) => i.subject || "", (i) => i.message]);
    })
  );

  /* ---------- impact numbers editor ---------- */
  const statsForm = $("[data-stats-form]", root);
  const statsRows = $("[data-stats-rows]", root);
  const statsStatus = $("[data-stats-status]", root);
  const SUFFIXES = ["", "+", "%", "k", "k+", "m", "m+"];
  const say = (msg, state) => {
    statsStatus.textContent = msg;
    statsStatus.dataset.state = state || "";
  };

  function field(labelText, input) {
    const wrap = el("div", null, "field");
    const lab = el("label", labelText);
    lab.htmlFor = input.id;
    wrap.append(lab, input);
    return wrap;
  }

  function renderStats(items, meta) {
    statsRows.innerHTML = "";
    items.forEach((item) => {
      const row = el("div", null, "stats-editor__row");
      row.dataset.key = item.key;
      const label = el("input");
      label.id = `st-label-${item.key}`;
      label.name = "label";
      label.value = item.label;
      label.maxLength = 40;
      label.required = true;
      const value = el("input");
      value.id = `st-value-${item.key}`;
      value.name = "value";
      value.type = "number";
      value.min = "0";
      value.step = "1";
      value.inputMode = "numeric";
      value.value = item.value;
      value.required = true;
      const suffix = el("select");
      suffix.id = `st-suffix-${item.key}`;
      suffix.name = "suffix";
      SUFFIXES.forEach((s) => {
        const o = el("option", s || "(none)");
        o.value = s;
        if (s === (item.suffix || "")) o.selected = true;
        suffix.appendChild(o);
      });
      row.append(field("Label", label), field("Number", value), field("After", suffix));
      statsRows.appendChild(row);
    });
    if (meta?.updatedAt) say(`Last changed ${new Date(meta.updatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}${meta.updatedBy ? ` by ${meta.updatedBy}` : ""}.`);
    else say("Showing the starting figures. Nothing has been changed yet.");
  }

  async function loadStatsEditor() {
    try {
      const data = await get("/api/admin/stats");
      renderStats(data.items, data);
    } catch (e) {
      statsRows.innerHTML = "";
      say(e.message, "error");
    }
  }

  statsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const items = $$(".stats-editor__row", statsRows).map((row) => ({
      key: row.dataset.key,
      label: row.querySelector("[name=label]").value.trim(),
      value: Number(row.querySelector("[name=value]").value),
      suffix: row.querySelector("[name=suffix]").value,
    }));
    const btn = statsForm.querySelector("button[type=submit]");
    btn.setAttribute("aria-busy", "true");
    try {
      const res = await fetch("/api/admin/stats", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ items }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Could not save (${res.status}).`);
      renderStats(data.items, { updatedAt: data.updatedAt });
      say("Saved. The home page shows the new numbers now.", "ok");
    } catch (err) {
      say(err.message, "error");
    } finally {
      btn.removeAttribute("aria-busy");
    }
  });

  /* ---------- record a gift (bank transfer, PayPal, cash) ---------- */
  const giftForm = $("[data-gift-form]", root);
  const giftStatus = $("[data-gift-status]", root);
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  giftForm.date.value = today();
  giftForm.date.max = today();

  giftForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = giftForm;
    const body = {
      amount: Number(f.amount.value),
      currency: f.currency.value,
      method: f.method.value,
      date: f.date.value,
      campaign: f.campaign.value,
      name: f.name.value.trim(),
      email: f.email.value.trim(),
      reference: f.reference.value.trim(),
      note: f.note.value.trim(),
      anonymous: f.anonymous.checked,
    };
    if (!(body.amount > 0)) {
      giftStatus.textContent = "Enter the amount received.";
      giftStatus.dataset.state = "error";
      f.amount.focus();
      return;
    }
    const btn = $("button[type=submit]", f);
    btn.setAttribute("aria-busy", "true");
    try {
      const res = await fetch("/api/admin/gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Could not record the gift (${res.status}).`);
      giftStatus.textContent = `Recorded ${formatMoney(body.amount, body.currency)}. It now counts in the totals and on the site.`;
      giftStatus.dataset.state = "ok";
      ["amount", "name", "email", "reference", "note"].forEach((n) => (f[n].value = ""));
      f.anonymous.checked = false;
      loadDonations();
    } catch (err) {
      giftStatus.textContent = err.message;
      giftStatus.dataset.state = "error";
    } finally {
      btn.removeAttribute("aria-busy");
    }
  });

  /* ---------- site content: one editor for every section, built from its field list ---------- */
  const contentNav = $("[data-content-nav]", root);
  const contentForm = $("[data-content-form]", root);
  let sections = [];
  let active = null;
  let readValue = null;
  let uidN = 0;
  const uid = () => `cf-${++uidN}`;
  const when = (s) => new Date(s).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

  async function loadContent() {
    try {
      const data = await get("/api/admin/content");
      sections = data.sections;
      openSection(active || sections[0].key);
    } catch (e) {
      contentNav.innerHTML = "";
      contentNav.appendChild(el("p", e.message, "form-error"));
    }
  }

  function renderNav() {
    contentNav.innerHTML = "";
    sections.forEach((s) => {
      const b = el("button", s.title);
      b.type = "button";
      if (s.key === active) b.setAttribute("aria-current", "true");
      if (s.custom) b.appendChild(el("small", "Changed"));
      b.addEventListener("click", () => openSection(s.key));
      contentNav.appendChild(b);
    });
  }

  function makeField(f, value) {
    const wrap = el("div", null, "field");
    if (f.type === "list") return makeList(f, value);
    if (f.type === "bool") {
      const lab = el("label", null, "check");
      const box = el("input");
      box.type = "checkbox";
      box.checked = !!value;
      lab.append(box, document.createTextNode(f.label));
      wrap.appendChild(lab);
      return { wrap, read: () => box.checked };
    }
    const id = uid();
    let input;
    if (f.type === "textarea" || f.type === "lines") {
      input = el("textarea");
      input.rows = f.type === "lines" ? 3 : 4;
      input.value = f.type === "lines" ? (value || []).join("\n") : value ?? "";
      wrap.classList.add("field--wide");
    } else if (f.type === "select") {
      input = el("select");
      f.options.forEach(([v, label]) => {
        const o = el("option", label);
        o.value = v;
        if (v === value) o.selected = true;
        input.appendChild(o);
      });
    } else {
      input = el("input");
      input.type = { number: "number", email: "email", url: "url", phone: "tel", date: "date" }[f.type] || "text";
      if (f.type === "number") {
        input.step = f.int ? "1" : "any";
        input.inputMode = f.int ? "numeric" : "decimal";
      }
      input.value = value ?? "";
    }
    if (f.max && (f.type === "text" || f.type === "textarea")) input.maxLength = f.max;
    input.id = id;
    const lab = el("label", f.label);
    lab.htmlFor = id;
    wrap.append(lab, input);
    if (f.help) wrap.appendChild(el("p", f.help, "hint-line"));
    return {
      wrap,
      read() {
        if (f.type === "number") return input.value === "" ? null : Number(input.value);
        if (f.type === "lines") return input.value.split("\n").map((l) => l.trim()).filter(Boolean);
        return input.value.trim();
      },
    };
  }

  function makeList(f, value) {
    const wrap = el("div", null, "content-list");
    const box = el("div", null, "content-list");
    const add = el("button", `+ ${f.addLabel || "Add"}`, "btn btn--outline btn--sm");
    add.type = "button";
    let items = (value || []).map((v) => ({ ...v }));
    let readers = [];
    const sync = () => (items = readers.map((r) => r()));
    const tool = (label, text, disabled, fn) => {
      const b = el("button", text);
      b.type = "button";
      b.setAttribute("aria-label", label);
      b.disabled = disabled;
      b.addEventListener("click", () => {
        sync();
        fn();
        draw();
      });
      return b;
    };
    function draw() {
      box.innerHTML = "";
      readers = [];
      items.forEach((item, i) => {
        const card = el("div", null, "content-list__item");
        const head = el("div", null, "content-list__head");
        head.appendChild(el("span", `${f.itemLabel || "Item"} ${i + 1}`));
        if (!f.fixed) {
          const tools = el("div", null, "content-list__tools");
          tools.append(
            tool("Move up", "↑", i === 0, () => items.splice(i - 1, 0, items.splice(i, 1)[0])),
            tool("Move down", "↓", i === items.length - 1, () => items.splice(i + 1, 0, items.splice(i, 1)[0])),
            tool("Remove", "✕", items.length <= f.min, () => items.splice(i, 1))
          );
          head.appendChild(tools);
        }
        const grid = el("div", null, "content-list__fields");
        const subs = f.item.map((sub) => {
          const c = makeField(sub, item[sub.name]);
          grid.appendChild(c.wrap);
          return [sub.name, c.read];
        });
        readers.push(() => Object.fromEntries(subs.map(([n, r]) => [n, r()])));
        card.append(head, grid);
        box.appendChild(card);
      });
      if (!items.length) box.appendChild(el("p", "None yet.", "muted"));
      add.hidden = !!f.fixed || items.length >= f.max;
    }
    add.addEventListener("click", () => {
      sync();
      items.push(Object.fromEntries(f.item.map((s) => [s.name, s.type === "select" ? s.options[0][0] : ""])));
      draw();
      box.lastElementChild?.querySelector("input, textarea")?.focus();
    });
    draw();
    wrap.append(box, add);
    return { wrap, read: () => readers.map((r) => r()) };
  }

  function openSection(key) {
    active = key;
    renderNav();
    const s = sections.find((x) => x.key === key);
    contentForm.innerHTML = "";
    const head = el("div", null, "stack");
    head.append(el("h2", s.title), el("p", s.help, "muted"));
    const meta = el("p", null, "content-admin__meta");
    if (s.custom) {
      meta.textContent = `Last changed ${when(s.updatedAt)}${s.updatedBy ? ` by ${s.updatedBy}` : ""}. `;
      const reset = el("button", "Go back to the starting text", "content-admin__reset");
      reset.type = "button";
      reset.addEventListener("click", async () => {
        if (!reset.dataset.armed) {
          reset.dataset.armed = "1";
          reset.textContent = "Click again to undo all changes in this section";
          return;
        }
        await save("DELETE");
      });
      meta.appendChild(reset);
    } else meta.textContent = "Showing the starting text. Nothing has been changed yet.";
    head.appendChild(meta);

    const fields = el("div", null, "content-fields");
    const readers = s.fields.map((f) => {
      const c = makeField(f, s.value[f.name]);
      fields.appendChild(c.wrap);
      return [f.name, c.read];
    });
    readValue = () => Object.fromEntries(readers.map(([n, r]) => [n, r()]));

    const actions = el("div", null, "admin__filter-actions");
    const btn = el("button", "Save changes", "btn btn--primary");
    btn.type = "submit";
    const status = el("span", null, "form-status");
    status.setAttribute("role", "status");
    status.dataset.contentStatus = "";
    actions.append(btn, status);
    contentForm.append(head, fields, actions);
  }

  async function save(method) {
    const status = $("[data-content-status]", contentForm);
    const btn = $("button[type=submit]", contentForm);
    btn.setAttribute("aria-busy", "true");
    try {
      const res = await fetch(`/api/admin/content/${active}`, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: method === "PUT" ? JSON.stringify(readValue()) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Could not save (${res.status}).`);
      const s = sections.find((x) => x.key === active);
      Object.assign(s, { value: data.value, custom: data.custom, updatedAt: data.updatedAt, updatedBy: data.updatedBy });
      openSection(active);
      const done = $("[data-content-status]", contentForm);
      done.textContent = method === "PUT" ? "Saved. The site shows the change now." : "Back to the starting text.";
      done.dataset.state = "ok";
    } catch (e) {
      status.textContent = e.message;
      status.dataset.state = "error";
    } finally {
      btn.removeAttribute("aria-busy");
    }
  }

  contentForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (active) save("PUT");
  });

  loadDonations();
}
