// Activity: who changed what in the console, grouped by day.
import { api } from "../api.js";
import { h, icon, relTime, fmtDate, empty, skeleton } from "../ui.js";

const ICONS = [
  [/signed in|set up/, "login"],
  [/donation/, "heart"],
  [/photo/, "image"],
  [/content|impact/, "layers"],
  [/team member|password|profile/, "user"],
  [/message/, "mail"],
  [/subscriber/, "users"],
];
export const activityIcon = (action) => (ICONS.find(([re]) => re.test(action)) || [null, "activity"])[1];
export const activityText = (a) => a.action;
const stamp = (at) => (at.endsWith("Z") ? at : `${at}Z`);

function dayLabel(iso) {
  const d = new Date(iso);
  const t = new Date();
  const y = new Date(t.getTime() - 864e5);
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return fmtDate(iso, { weekday: "long", day: "numeric", month: "long" });
}

export default async function activity(ctx) {
  ctx.page.append(h("div", { class: "ph" }, h("div", null, h("h1", { class: "ph__title", text: "Activity" }), h("p", { class: "ph__sub", text: "Every change made in the console, with who made it and when." }))));
  const box = h("div", { class: "card card--pad" }, skeleton("list", 8));
  const more = h("div", { class: "more-row" });
  ctx.page.append(box, more);
  let next = null;
  let lastDay = "";
  let group = null;
  let i = 0;

  async function load(append = false) {
    try {
      const data = await api(`/activity${append && next ? `?before=${next}` : ""}`);
      if (!ctx.alive()) return;
      if (!append) {
        box.replaceChildren();
        if (!data.items.length) box.append(empty({ iconName: "activity", title: "Nothing yet", text: "When someone records a donation, edits the website or uploads a photo, it shows up here." }));
      }
      let tl = box.querySelector(".tl");
      if (!tl && data.items.length) box.append((tl = h("div", { class: "tl" })));
      for (const a of data.items) {
        const at = stamp(a.at);
        const day = dayLabel(at);
        if (day !== lastDay) {
          lastDay = day;
          group = h("div", { class: "tl__items" });
          tl.append(h("section", null, h("p", { class: "tl__day", text: day }), group));
        }
        group.append(
          h(
            "div",
            { class: "tl__item", style: { "--i": i++ % 20 } },
            h("span", { class: "tl__icon" }, icon(activityIcon(a.action))),
            h("div", { class: "tl__text" }, h("strong", { text: a.actor }), ` ${a.action}`, a.detail ? h("p", { class: "tl__detail", text: a.detail }) : null),
            h("span", { class: "tl__time", title: new Date(at).toLocaleString("en-GB"), text: relTime(at) })
          )
        );
      }
      next = data.next;
      more.replaceChildren(next ? h("button", { class: "btn btn--soft", type: "button", text: "Show older activity", onclick: () => load(true) }) : "");
    } catch (e) {
      box.replaceChildren(empty({ iconName: "alert", title: "Couldn't load activity", text: e.message }));
    }
  }
  await load();
}
