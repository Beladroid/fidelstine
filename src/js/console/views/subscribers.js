// Subscribers: newsletter sign-ups with search, where they signed up, CSV export and removal.
import { api, changed } from "../api.js";
import { h, icon, avatar, relTime, fmtDate, empty, skeleton, toast, busy, confirmDialog, input, debounce, isPhone, number, countUp } from "../ui.js";

const SOURCES = { footer: "Website footer", donation: "When donating", contact: "Contact form" };
const stamp = (s) => (s && !s.endsWith("Z") ? `${s}Z` : s);

export default async function subscribers(ctx) {
  const exportBtn = h("a", { class: "btn", href: "/api/admin/newsletter?format=csv" }, icon("download"), "Export CSV");
  ctx.page.append(h("div", { class: "ph" }, h("div", null, h("h1", { class: "ph__title", text: "Subscribers" }), h("p", { class: "ph__sub", text: "People who asked for updates. Export the list to send a newsletter." })), h("div", { class: "ph__actions" }, exportBtn)));
  const kpis = h("div", { class: "grid grid-4" });
  const search = input({ type: "search", placeholder: "Search by email", "aria-label": "Search subscribers" });
  const list = h("div", null, skeleton("list", 6));
  ctx.page.append(kpis, h("div", { class: "toolbar" }, h("div", { class: "search" }, icon("search"), search)), list);

  let items = [];
  try {
    items = (await api("/newsletter")).items;
  } catch (e) {
    list.replaceChildren(empty({ iconName: "alert", title: "Couldn't load subscribers", text: e.message }));
    return;
  }
  if (!ctx.alive()) return;

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const kpi = (label, value, iconName, tone, i) => {
    const v = h("div", { class: "kpi__value" });
    countUp(v, value);
    return h("div", { class: "card kpi enter", style: { "--i": i } }, h("div", { class: "kpi__top" }, h("span", { class: "kpi__label", text: label }), h("span", { class: `kpi__icon kpi__icon--${tone}` }, icon(iconName))), v);
  };
  const paintKpis = () =>
    kpis.replaceChildren(
      kpi("Subscribers", items.length, "users", "green", 0),
      kpi("Joined this month", items.filter((s) => new Date(stamp(s.created_at)) >= monthStart).length, "trend-up", "red", 1),
      kpi("From the footer", items.filter((s) => s.source === "footer").length, "mail", "navy", 2),
      kpi("While donating", items.filter((s) => s.source === "donation").length, "heart", "gold", 3)
    );

  const paint = () => {
    const q = search.value.trim().toLowerCase();
    const shown = items.filter((s) => !q || s.email.includes(q));
    list.replaceChildren();
    if (!shown.length) {
      list.append(empty({ iconName: "users", title: items.length ? "No one matches" : "No subscribers yet", text: items.length ? "Try another search." : "People who sign up on the website appear here." }));
      return;
    }
    const remove = async (s, btn) => {
      const ok = await confirmDialog({ title: "Remove this subscriber?", text: `${s.email} will no longer be on the updates list. Do this when someone asks to be removed.`, confirmLabel: "Remove" });
      if (!ok) return;
      try {
        await busy(btn, () => api(`/newsletter/${s.id}`, { method: "DELETE" }));
        items = items.filter((x) => x.id !== s.id);
        paintKpis();
        paint();
        changed("subscribers");
        toast("Subscriber removed", { type: "ok" });
      } catch (e) {
        toast(e.message, { type: "bad" });
      }
    };
    if (isPhone()) {
      const wrap = h("div", { class: "tcards" });
      shown.forEach((s, i) => {
        const rm = h("button", { class: "icon-btn icon-btn--sm", type: "button", "aria-label": `Remove ${s.email}` }, icon("trash", "i--sm"));
        rm.addEventListener("click", () => remove(s, rm));
        wrap.append(h("div", { class: "tcard", style: { "--i": i % 12 } }, avatar({ name: s.email }, "sm"), h("div", { style: { minWidth: 0 } }, h("div", { class: "who__name", text: s.email }), h("div", { class: "tcard__meta", text: `${SOURCES[s.source] || s.source || "Website"} · ${relTime(stamp(s.created_at))}` })), rm));
      });
      list.append(wrap);
      return;
    }
    const tbody = h("tbody");
    shown.forEach((s) => {
      const rm = h("button", { class: "btn btn--sm btn--ghost", type: "button" }, icon("trash", "i--sm"), "Remove");
      rm.addEventListener("click", () => remove(s, rm));
      tbody.append(h("tr", null, h("td", null, h("div", { class: "who" }, avatar({ name: s.email }, "sm"), h("span", { class: "who__name", text: s.email }))), h("td", { class: "muted", text: SOURCES[s.source] || s.source || "Website" }), h("td", { class: "muted", text: fmtDate(stamp(s.created_at)) }), h("td", { class: "right" }, rm)));
    });
    list.append(h("div", { class: "card table-wrap" }, h("table", { class: "table" }, h("thead", null, h("tr", null, ["Email", "Signed up from", "Joined", ""].map((t) => h("th", { text: t })))), tbody)));
  };
  search.addEventListener("input", debounce(paint, 200));
  paintKpis();
  paint();
}
