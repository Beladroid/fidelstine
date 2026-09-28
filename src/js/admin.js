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
    tr.append(date, donor, amount, el("td", d.campaign), el("td", d.payment_type || "-"), status, el("td", d.tx_ref, "mono"));
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
      if (name === "messages") loadSimple("messages", $("[data-admin-messages]", root), [(i) => fmt(i.created_at), (i) => `${i.name} <${i.email}>${i.phone ? " " + i.phone : ""}`, (i) => i.subject || "", (i) => i.message]);
    })
  );

  loadDonations();
}
