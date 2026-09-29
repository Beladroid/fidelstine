// Site content: a card for each editable section, and an editor built from the section's field list
// (text, numbers, dates, lists with drag-to-reorder, photos). Unsaved changes show a save bar and are
// protected when leaving the page. Impact numbers use their own small editor.
import { api, changed } from "../api.js";
import { go } from "../nav.js";
import { h, icon, cfg, isPhone, relTime, fmtDateTime, empty, skeleton, toast, busy, confirmDialog, select, switchEl, input, $, $$ } from "../ui.js";
import { pickPhoto } from "../images.js";

const META = {
  campaign: { icon: "gift", group: "Giving", page: "/christmas-scheme/" },
  giftImpact: { icon: "heart", group: "Giving", page: "/donate/" },
  rates: { icon: "repeat", group: "Giving", page: "/donate/" },
  impact: { icon: "chart", group: "Stories and trust", page: "/" },
  testimonials: { icon: "quote", group: "Stories and trust", page: "/about/" },
  team: { icon: "users", group: "Stories and trust", page: "/about/" },
  spending: { icon: "percent", group: "Stories and trust", page: "/transparency/" },
  documents: { icon: "folder", group: "Stories and trust", page: "/transparency/" },
  contact: { icon: "phone", group: "Contact and notices", page: "/contact/" },
  faqs: { icon: "help", group: "Contact and notices", page: "/donate/" },
  announcement: { icon: "megaphone", group: "Contact and notices", page: "/" },
};
const IMPACT = { key: "impact", title: "Impact numbers", help: "The five figures on the home page, such as children sheltered and communities reached." };
const stamp = (s) => (s && !s.endsWith("Z") ? `${s}Z` : s);

export default async function content(ctx) {
  const key = ctx.params[0];
  if (key) return editor(ctx, key);
  ctx.page.append(h("div", { class: "ph" }, h("div", null, h("h1", { class: "ph__title", text: "Site content" }), h("p", { class: "ph__sub", text: "Change the words, figures and photos on the website. Changes go live straight away." }))));
  const box = h("div", null, skeleton("list", 6));
  ctx.page.append(box);
  let data, stats;
  try {
    [data, stats] = await Promise.all([api("/content"), api("/stats")]);
  } catch (e) {
    box.replaceChildren(empty({ iconName: "alert", title: "Couldn't load site content", text: e.message }));
    return;
  }
  if (!ctx.alive()) return;
  const all = [...data.sections, { ...IMPACT, custom: stats.custom, updatedAt: stats.updatedAt, updatedBy: stats.updatedBy }];
  const groups = {};
  for (const s of all) (groups[META[s.key]?.group || "Other"] ||= []).push(s);
  let i = 0;
  box.replaceChildren(
    h(
      "div",
      { class: "content-groups" },
      Object.entries(groups).map(([g, list]) =>
        h(
          "section",
          { class: "content-group" },
          h("h2", { text: g }),
          h(
            "div",
            { class: "grid grid-3" },
            list.map((s) =>
              h(
                "a",
                { class: "card card--hover ccard enter", href: `#/content/${s.key}`, style: { "--i": i++ } },
                h("span", { class: "ccard__icon" }, icon(META[s.key]?.icon || "layers")),
                h(
                  "span",
                  { style: { minWidth: 0 } },
                  h("span", { class: "ccard__title" }, s.title, s.custom ? h("span", { class: "pill pill--ok", text: "Edited" }) : null),
                  h("span", { class: "ccard__text", text: s.help }),
                  h("span", { class: "ccard__meta" }, icon("clock", "i--sm"), s.custom ? `Edited ${relTime(stamp(s.updatedAt))}${s.updatedBy ? ` by ${s.updatedBy}` : ""}` : "Showing the starting text")
                )
              )
            )
          )
        )
      )
    )
  );
}

/* ---------------------------------------------------------------- editor */

async function editor(ctx, key) {
  const meta = META[key] || {};
  ctx.setCrumbs([["Site content", "#/content"], [key === "impact" ? IMPACT.title : "…"]]);
  ctx.page.append(h("a", { class: "back", href: "#/content" }, icon("back", "i--sm"), "Site content"));
  const head = h("div", { class: "ph" });
  const layout = h("div", { class: "editor" }, h("div", null, skeleton("list", 5)), h("div"));
  ctx.page.append(head, layout);

  let section;
  try {
    if (key === "impact") {
      const s = await api("/stats");
      section = { ...IMPACT, value: s.items, custom: s.custom, updatedAt: s.updatedAt, updatedBy: s.updatedBy };
    } else {
      const data = await api("/content");
      section = data.sections.find((s) => s.key === key);
      if (!section) throw new Error("That section doesn't exist.");
    }
  } catch (e) {
    layout.replaceChildren(empty({ iconName: "alert", title: "Couldn't open this section", text: e.message }));
    return;
  }
  if (!ctx.alive()) return;
  ctx.setCrumbs([["Site content", "#/content"], [section.title]]);
  ctx.setTitle(section.title);

  const errBox = h("div", { class: "banner", hidden: true, style: { background: "var(--bad-soft)", color: "var(--bad)" } }, icon("alert"), h("span", { class: "banner__text" }));
  const form = h("form", { class: "efields", novalidate: true });
  const card = h("div", { class: "card card--pad" }, form);
  const statusCard = h("div", { class: "card card--pad stack stack--sm" });
  const viewBtn = h("a", { class: "btn btn--block", href: `${cfg.site.url}${meta.page || "/"}`, target: "_blank", rel: "noopener" }, icon("external"), "View on the website");
  const resetBtn = h("button", { class: "btn btn--ghost btn--block", type: "button" }, icon("refresh"), "Go back to the starting text");
  layout.replaceChildren(h("div", { class: "stack" }, errBox, card), h("aside", { class: "editor__aside" }, statusCard, h("div", { class: "card card--pad stack stack--sm" }, viewBtn, resetBtn)));

  let read;
  let snapshot;
  const savebar = h("div", { class: "savebar", hidden: true });
  ctx.page.append(savebar);

  function paintHead() {
    head.replaceChildren(h("div", null, h("h1", { class: "ph__title", text: section.title }), h("p", { class: "ph__sub", text: section.help })));
    statusCard.replaceChildren(
      h("p", { class: "section-label", text: "Status" }),
      section.custom ? h("span", { class: "pill pill--ok", text: "Edited" }) : h("span", { class: "pill", text: "Starting text" }),
      h("p", { class: "muted", style: { fontSize: "13px" }, text: section.custom ? `Last changed ${fmtDateTime(stamp(section.updatedAt))}${section.updatedBy ? ` by ${section.updatedBy}` : ""}.` : "Nothing has been changed yet." }),
      h("p", { class: "faint", style: { fontSize: "12.5px" }, text: "Saved changes appear on the website within seconds." })
    );
    resetBtn.hidden = !section.custom;
  }

  function build() {
    form.replaceChildren();
    if (key === "impact") read = impactEditor(form, section.value);
    else {
      const readers = section.fields.map((f) => {
        const c = control(f, section.value[f.name]);
        form.append(c.el);
        return [f.name, c.read];
      });
      read = () => Object.fromEntries(readers.map(([n, r]) => [n, r()]));
    }
    snapshot = JSON.stringify(read());
    dirty();
  }
  const isDirty = () => JSON.stringify(read()) !== snapshot;
  function dirty() {
    const d = isDirty();
    savebar.hidden = !d;
    ctx.setGuard(d ? () => confirmDialog({ title: "Leave without saving?", text: "You have changes that haven't been saved. If you leave now, they'll be lost.", confirmLabel: "Leave without saving" }) : null);
  }
  form.addEventListener("input", dirty);
  form.addEventListener("change", dirty);
  form.addEventListener("content:changed", dirty);

  const saveBtn = h("button", { class: "btn btn--primary", type: "button" }, icon("check"), "Save changes");
  const discard = h("button", { class: "btn btn--ghost", type: "button", text: "Discard" });
  savebar.append(h("span", { class: "savebar__text", text: isPhone() ? "Unsaved changes" : "You have unsaved changes" }), discard, saveBtn);
  discard.addEventListener("click", () => build());
  saveBtn.addEventListener("click", save);
  form.addEventListener("submit", (e) => (e.preventDefault(), save()));
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (isDirty()) save();
    }
  };
  document.addEventListener("keydown", onKey);
  ctx.onLeave(() => document.removeEventListener("keydown", onKey));

  async function save() {
    errBox.hidden = true;
    try {
      const body = read();
      const r = await busy(saveBtn, () => (key === "impact" ? api("/stats", { method: "PUT", body: { items: body } }) : api(`/content/${key}`, { method: "PUT", body })));
      if (key === "impact") Object.assign(section, { value: r.items, custom: true, updatedAt: r.updatedAt, updatedBy: null });
      else Object.assign(section, { value: r.value, custom: r.custom, updatedAt: r.updatedAt, updatedBy: r.updatedBy });
      paintHead();
      build();
      changed("content");
      toast("Saved. The website shows the change now.", { type: "ok" });
    } catch (e) {
      errBox.querySelector(".banner__text").textContent = e.message;
      errBox.hidden = false;
      errBox.scrollIntoView({ behavior: "smooth", block: "center" });
      toast("Not saved. Please check the highlighted message.", { type: "bad" });
    }
  }

  resetBtn.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "Go back to the starting text?", text: `Everything changed in "${section.title}" will be undone and the website will show the original text again.`, confirmLabel: "Undo my changes" });
    if (!ok) return;
    try {
      if (key === "impact") {
        toast("Impact numbers can't be reset automatically. Edit the figures instead.");
        return;
      }
      const r = await busy(resetBtn, () => api(`/content/${key}`, { method: "DELETE" }));
      Object.assign(section, { value: r.value, custom: r.custom, updatedAt: null, updatedBy: null });
      paintHead();
      build();
      changed("content");
      toast("Back to the starting text.", { type: "ok" });
    } catch (e) {
      toast(e.message, { type: "bad" });
    }
  });

  paintHead();
  build();
}

/* ---------------------------------------------------------------- controls */

const notify = (el) => el.dispatchEvent(new Event("content:changed", { bubbles: true }));
let uid = 0;

function control(f, value) {
  const id = `cf${++uid}`;
  const wrap = h("div", { class: "field" });
  if (f.type === "list") return listControl(f, value);
  if (f.type === "bool") {
    const s = switchEl(f.label, !!value);
    wrap.append(s.el);
    if (f.help) wrap.append(h("p", { class: "hint", text: f.help }));
    return { el: wrap, read: () => s.box.checked };
  }
  if (f.type === "image") return imageControl(f, value);
  let el;
  if (f.type === "textarea" || f.type === "lines") {
    el = h("textarea", { class: "textarea", id, rows: f.type === "lines" ? 3 : 4, maxLength: f.max || undefined });
    el.value = f.type === "lines" ? (value || []).join("\n") : value ?? "";
  } else if (f.type === "select") {
    el = select(f.options, value, { id });
  } else {
    const type = { number: "number", email: "email", url: "url", phone: "tel", date: "date" }[f.type] || "text";
    el = input({ id, type, value: value ?? "", maxLength: f.max || undefined, step: f.type === "number" ? (f.int ? "1" : "any") : undefined, inputmode: f.type === "number" ? (f.int ? "numeric" : "decimal") : undefined });
  }
  wrap.append(h("label", { for: id, text: f.label + (f.optional ? "" : "") }), el);
  if (f.optional && f.type !== "select") wrap.querySelector("label").append(h("span", { class: "hint", text: " · optional" }));
  if (f.help) wrap.append(h("p", { class: "hint", text: f.help }));
  if (f.type === "textarea" || f.type === "lines") wrap.classList.add("wide");
  return {
    el: wrap,
    read() {
      if (f.type === "number") return el.value === "" ? null : Number(el.value);
      if (f.type === "lines") return el.value.split("\n").map((s) => s.trim()).filter(Boolean);
      return el.value.trim();
    },
  };
}

function imageControl(f, value) {
  let current = value || "";
  const preview = h("div", { class: "imgfield__preview" });
  const choose = h("button", { class: "btn btn--sm", type: "button" }, icon("image"), "Choose photo");
  const remove = h("button", { class: "btn btn--sm btn--ghost", type: "button" }, icon("trash"), "Remove");
  const paint = () => {
    preview.replaceChildren(current ? h("img", { src: `/api/images/${current}/s`, alt: "" }) : icon("camera"));
    remove.hidden = !current;
    choose.lastChild.textContent = current ? "Change photo" : "Choose photo";
  };
  const el = h("div", { class: "field wide" }, h("span", { class: "label", text: f.label }), h("div", { class: "imgfield" }, preview, h("div", { class: "stack stack--sm" }, h("span", { class: "hint", text: current ? "Shown on the website." : "No photo: initials are shown instead." }), h("div", { class: "imgfield__actions" }, choose, remove))));
  choose.addEventListener("click", async () => {
    const photo = await pickPhoto({ kind: f.kind || "other", title: `Choose a photo` });
    if (photo) {
      current = photo.id;
      paint();
      el.querySelector(".hint").textContent = "Shown on the website.";
      notify(el);
    }
  });
  remove.addEventListener("click", () => {
    current = "";
    paint();
    el.querySelector(".hint").textContent = "No photo: initials are shown instead.";
    notify(el);
  });
  paint();
  return { el, read: () => current };
}

const TITLE_KEYS = ["name", "title", "label", "q", "text", "quote"];
const SUB_KEYS = ["role", "a", "url", "percent", "amount"];

function listControl(f, value) {
  let items = (value || []).map((v) => ({ ...v }));
  let open = new Set(items.length === 1 ? [0] : []);
  let readers = [];
  const box = h("div", { class: "stack stack--sm" });
  const add = h("button", { class: "add-row", type: "button" }, icon("plus"), f.addLabel || "Add");
  const el = h("div", { class: "field wide" }, h("span", { class: "label", text: f.label }), box, f.fixed ? null : add);
  const sync = () => (items = readers.map((r) => r()));
  let dragFrom = null;

  function summary(item, i) {
    const t = TITLE_KEYS.map((k) => item[k]).find((v) => v !== undefined && v !== "" && v !== null);
    const s = SUB_KEYS.map((k) => item[k]).find((v) => v !== undefined && v !== "" && v !== null && v !== t);
    const title = typeof t === "number" ? t.toLocaleString("en") : t;
    const sub = f.name === "NGN" && item.amount ? `₦${Number(item.amount).toLocaleString("en")}` : typeof s === "number" ? `${s}${f.item.find((x) => x.name === "percent") ? "%" : ""}` : s;
    return [title || `${f.itemLabel || "Item"} ${i + 1}`, sub || ""];
  }

  function draw() {
    box.replaceChildren();
    readers = [];
    items.forEach((item, i) => {
      const [title, sub] = summary(item, i);
      const photo = item.photo;
      const thumb = h("span", { class: "litem__thumb" }, photo ? h("img", { src: `/api/images/${photo}/s`, alt: "" }) : String(i + 1));
      const tools = h("span", { class: "litem__tools" });
      const tool = (ic, label, disabled, fn) => {
        const b = h("button", { class: "icon-btn icon-btn--sm", type: "button", "aria-label": label, title: label, disabled }, icon(ic, "i--sm"));
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          sync();
          fn();
          draw();
          notify(el);
        });
        return b;
      };
      if (!f.fixed) {
        tools.append(
          tool("up", "Move up", i === 0, () => {
            items.splice(i - 1, 0, items.splice(i, 1)[0]);
            open = new Set([...open].map((x) => (x === i ? i - 1 : x === i - 1 ? i : x)));
          }),
          tool("down", "Move down", i === items.length - 1, () => {
            items.splice(i + 1, 0, items.splice(i, 1)[0]);
            open = new Set([...open].map((x) => (x === i ? i + 1 : x === i + 1 ? i : x)));
          }),
          tool("trash", "Remove", items.length <= f.min, () => {
            items.splice(i, 1);
            open = new Set([...open].filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)));
          })
        );
      }
      const grip = f.fixed ? null : h("span", { class: "litem__grip", draggable: "true", title: "Drag to reorder", "aria-hidden": "true" }, icon("grip", "i--sm"));
      const titleEl = h("span", { class: "litem__title" }, h("span", { class: "truncate", style: { display: "block" }, text: title }), sub ? h("small", { text: String(sub) }) : null);
      const headEl = h("div", { class: "litem__head" }, grip, thumb, titleEl, tools, h("span", { class: "litem__chev" }, icon("down", "i--sm")));
      const bodyEl = h("div", { class: "litem__body", hidden: !open.has(i) });
      // phones: move and remove buttons sit inside the open item instead of a crowded header
      const phoneTools = f.fixed
        ? null
        : h(
            "div",
            { class: "litem__foot wide" },
            tool("up", "Move up", i === 0, () => {
              items.splice(i - 1, 0, items.splice(i, 1)[0]);
              open = new Set([i - 1]);
            }),
            tool("down", "Move down", i === items.length - 1, () => {
              items.splice(i + 1, 0, items.splice(i, 1)[0]);
              open = new Set([i + 1]);
            }),
            tool("trash", "Remove", items.length <= f.min, () => {
              items.splice(i, 1);
              open = new Set();
            })
          );
      const subs = f.item.map((sub) => {
        const c = control(sub, item[sub.name]);
        if (sub.type === "textarea" || sub.type === "image") c.el.classList.add("wide");
        bodyEl.append(c.el);
        return [sub.name, c.read];
      });
      if (phoneTools) bodyEl.append(phoneTools);
      readers.push(() => Object.fromEntries(subs.map(([n, r]) => [n, r()])));
      const li = h("div", { class: `litem ${open.has(i) ? "is-open" : ""}`, style: { animationDelay: `${i * 30}ms` } }, headEl, bodyEl);
      headEl.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        const nowOpen = bodyEl.hidden;
        bodyEl.hidden = !nowOpen;
        li.classList.toggle("is-open", nowOpen);
        nowOpen ? open.add(i) : open.delete(i);
        if (nowOpen) bodyEl.querySelector("input, textarea")?.focus({ preventScroll: true });
      });
      // keep the summary line up to date while typing
      bodyEl.addEventListener("input", () => {
        const [t, s] = summary(readers[i](), i);
        titleEl.firstChild.textContent = t;
        const small = titleEl.querySelector("small");
        if (small) small.textContent = String(s);
      });
      bodyEl.addEventListener("content:changed", () => {
        const p = readers[i]().photo;
        thumb.replaceChildren(p ? h("img", { src: `/api/images/${p}/s`, alt: "" }) : String(i + 1));
      });
      if (grip) {
        grip.addEventListener("dragstart", (e) => {
          dragFrom = i;
          li.classList.add("is-dragging");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(i));
        });
        grip.addEventListener("dragend", () => li.classList.remove("is-dragging"));
      }
      li.addEventListener("dragover", (e) => {
        if (dragFrom === null) return;
        e.preventDefault();
        li.classList.add("is-over");
      });
      li.addEventListener("dragleave", () => li.classList.remove("is-over"));
      li.addEventListener("drop", (e) => {
        e.preventDefault();
        li.classList.remove("is-over");
        if (dragFrom === null || dragFrom === i) return;
        sync();
        const [moved] = items.splice(dragFrom, 1);
        items.splice(i, 0, moved);
        open = new Set();
        dragFrom = null;
        draw();
        notify(el);
      });
      box.append(li);
    });
    if (!items.length) box.append(h("p", { class: "faint", style: { padding: "8px 2px" }, text: "Nothing here yet." }));
    add.hidden = !!f.fixed || items.length >= f.max;
  }
  add.addEventListener("click", () => {
    sync();
    items.push(Object.fromEntries(f.item.map((s) => [s.name, s.type === "select" ? s.options[0][0] : s.type === "number" ? null : ""])));
    open.add(items.length - 1);
    draw();
    notify(el);
    const last = box.lastElementChild;
    last?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => last?.querySelector(".litem__body input, .litem__body textarea")?.focus({ preventScroll: true }), 250);
  });
  draw();
  return { el, read: () => readers.map((r) => r()) };
}

function impactEditor(form, items) {
  const SUFFIX = ["", "+", "%", "k", "k+", "m", "m+"];
  const rows = items.map((it) => {
    const label = input({ value: it.label, maxLength: 40, "aria-label": "Label" });
    const value = input({ type: "number", min: "0", step: "1", inputmode: "numeric", value: it.value, "aria-label": "Number" });
    const suffix = select(SUFFIX.map((s) => [s, s || "(none)"]), it.suffix || "", { "aria-label": "After the number" });
    form.append(h("div", { class: "stat-row" }, h("div", { class: "field" }, h("span", { class: "label", text: "Label" }), label), h("div", { class: "field" }, h("span", { class: "label", text: "Number" }), value), h("div", { class: "field" }, h("span", { class: "label", text: "After" }), suffix)));
    return () => ({ key: it.key, label: label.value.trim(), value: Number(value.value), suffix: suffix.value });
  });
  return () => rows.map((r) => r());
}
