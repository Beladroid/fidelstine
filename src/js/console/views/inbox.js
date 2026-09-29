// Inbox: messages from the website's contact form. Laptop: list and reader side by side.
// Phone: the list, then the message full screen with a back button. Opening a message marks it read.
import { api, changed, session } from "../api.js";
import { h, icon, avatar, relTime, fmtDateTime, empty, skeleton, toast, busy, confirmDialog, input, seg, debounce, isPhone, $$ } from "../ui.js";

const stamp = (s) => (s && !s.endsWith("Z") ? `${s}Z` : s);

export default async function inbox(ctx) {
  let items = [];
  let filter = "all";
  let q = "";
  let current = null;

  ctx.page.append(h("div", { class: "ph" }, h("div", null, h("h1", { class: "ph__title", text: "Inbox" }), h("p", { class: "ph__sub", text: "Messages sent through the website's contact form." }))));
  const search = input({ type: "search", placeholder: "Search messages", "aria-label": "Search messages" });
  const filterSeg = seg([["all", "All"], ["unread", "Unread"]], filter, (v) => ((filter = v), paintList()));
  const scroll = h("div", { class: "inbox__scroll" }, skeleton("list", 6));
  const view = h("div", { class: "inbox__view" });
  const box = h("div", { class: "card inbox" }, h("div", { class: "inbox__list" }, h("div", { class: "inbox__tools" }, h("div", { class: "search" }, icon("search"), search), filterSeg.el), scroll), view);
  ctx.page.append(box);
  search.addEventListener("input", debounce(() => ((q = search.value.trim().toLowerCase()), paintList()), 200));

  try {
    items = (await api("/messages")).items;
  } catch (e) {
    scroll.replaceChildren(empty({ iconName: "alert", title: "Couldn't load messages", text: e.message }));
    return;
  }
  if (!ctx.alive()) return;
  paintList();
  if (!isPhone() && items.length) open(items[0], false);
  else if (!items.length) view.replaceChildren(empty({ iconName: "inbox", title: "No messages yet", text: "When someone writes to Fidelstine through the website, their message lands here." }));

  function visible() {
    return items.filter((m) => (filter === "all" || !m.read_at) && (!q || `${m.name} ${m.email} ${m.subject} ${m.message}`.toLowerCase().includes(q)));
  }

  function paintList() {
    const list = visible();
    scroll.replaceChildren();
    if (!list.length) {
      scroll.append(empty({ iconName: filter === "unread" ? "check-circle" : "inbox", title: filter === "unread" ? "All read" : "Nothing here", text: filter === "unread" ? "You've read every message." : "No messages match your search." }));
      return;
    }
    list.forEach((m) => {
      const b = h(
        "button",
        { class: `msg ${m.read_at ? "" : "is-unread"}`, type: "button", "aria-current": String(current?.id === m.id) },
        avatar({ name: m.name }, "sm"),
        h("div", { style: { minWidth: 0 } }, h("div", { class: "msg__top" }, h("span", { class: "msg__name", text: m.name }), h("span", { class: "feed__time", text: relTime(stamp(m.created_at)) })), h("div", { class: "msg__subject", text: m.subject || "General question" }), h("div", { class: "msg__snippet", text: m.message }))
      );
      b.addEventListener("click", () => open(m, true));
      scroll.append(b);
    });
  }

  async function markRead(m, read) {
    try {
      const r = await api(`/messages/${m.id}`, { method: "PATCH", body: { read } });
      m.read_at = r.readAt;
      session.set({ counts: { ...session.counts, unreadMessages: items.filter((x) => !x.read_at).length } });
      paintList();
    } catch (e) {
      toast(e.message, { type: "bad" });
    }
  }

  function open(m, focus) {
    current = m;
    if (!m.read_at) markRead(m, true);
    $$(".msg", scroll).forEach((b, i) => b.setAttribute("aria-current", String(visible()[i]?.id === m.id)));
    box.classList.add("is-reading");
    const digits = String(m.phone || "").replace(/\D/g, "");
    const reply = h("a", { class: "btn btn--primary", href: `mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject || "your message to Fidelstine"}`)}` }, icon("mail"), "Reply by email");
    const unread = h("button", { class: "btn", type: "button" }, icon("eye-off"), "Mark unread");
    const del = h("button", { class: "btn btn--danger", type: "button" }, icon("trash"), "Delete");
    unread.addEventListener("click", () => markRead(m, false));
    del.addEventListener("click", async () => {
      const ok = await confirmDialog({ title: "Delete this message?", text: `The message from ${m.name} will be removed for everyone. This can't be undone.`, confirmLabel: "Delete message" });
      if (!ok) return;
      try {
        await busy(del, () => api(`/messages/${m.id}`, { method: "DELETE" }));
        items = items.filter((x) => x.id !== m.id);
        current = null;
        box.classList.remove("is-reading");
        paintList();
        view.replaceChildren(empty({ iconName: "inbox", title: "Message deleted", text: "Choose another message from the list." }));
        changed("messages");
        toast("Message deleted", { type: "ok" });
      } catch (e) {
        toast(e.message, { type: "bad" });
      }
    });
    view.replaceChildren(
      h(
        "article",
        { class: "reader" },
        isPhone() ? h("button", { class: "back", type: "button", onclick: () => (box.classList.remove("is-reading"), window.scrollTo({ top: 0 })) }, icon("back", "i--sm"), "All messages") : null,
        h("div", { class: "stack stack--sm" }, h("span", { class: "pill pill--info pill--plain", text: m.subject || "General question" }), h("h2", { class: "reader__subject", text: m.message.split(/[.!?\n]/)[0].slice(0, 90) || "Message" })),
        h("div", { class: "who" }, avatar({ name: m.name }, "lg"), h("div", { class: "who__text" }, h("span", { class: "who__name", text: m.name }), h("span", { class: "who__sub", text: [m.email, m.phone].filter(Boolean).join(" · ") }), h("span", { class: "who__sub", text: fmtDateTime(stamp(m.created_at)) }))),
        h("p", { class: "reader__body", text: m.message }),
        h(
          "div",
          { class: "reader__actions" },
          reply,
          digits ? h("a", { class: "btn", href: `https://wa.me/${digits}`, target: "_blank", rel: "noopener" }, icon("whatsapp"), "WhatsApp") : null,
          digits ? h("a", { class: "btn", href: `tel:${m.phone}` }, icon("phone"), "Call") : null,
          unread,
          del
        )
      )
    );
    if (focus && isPhone()) window.scrollTo({ top: 0 });
  }
}
