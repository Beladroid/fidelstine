// Media library: drag-and-drop uploads with progress, filter by type, search, and a details drawer to
// edit captions, choose where a photo is used and whether it appears in the website's gallery.
import { api, changed, onChanged } from "../api.js";
import { h, icon, cfg, isPhone, relTime, fmtDateTime, empty, skeleton, toast, busy, confirmDialog, overlay, field, input, select, switchEl, debounce, copy, $$ } from "../ui.js";
import { uploadPhoto, pickFiles, KINDS, kindLabel } from "../images.js";

const mb = (bytes) => `${(bytes / 1048576).toFixed(bytes > 10485760 ? 0 : 1)} MB`;

export default async function media(ctx) {
  let filter = ctx.query.get("kind") || "";
  let q = "";
  const uploadBtn = h("button", { class: "btn btn--primary", type: "button" }, icon("upload"), "Upload photos");
  const sub = h("p", { class: "ph__sub", text: "Photos for the gallery, team, testimonials and profiles." });
  ctx.page.append(h("div", { class: "ph" }, h("div", null, h("h1", { class: "ph__title", text: "Media library" }), sub), h("div", { class: "ph__actions" }, uploadBtn)));

  const drop = h(
    "button",
    { class: "drop", type: "button" },
    h("span", { class: "drop__icon" }, icon("upload", "i--lg")),
    h("strong", { text: isPhone() ? "Tap to add photos" : "Drop photos here, or click to choose" }),
    h("span", { class: "hint", text: "JPEG, PNG or WebP. Big photos are resized automatically, so uploads stay quick on mobile data." })
  );
  const queue = h("div", { class: "upq" });
  const chips = h("div", { class: "chips" });
  const search = input({ type: "search", placeholder: "Search captions", "aria-label": "Search photos" });
  const grid = h("div");
  ctx.page.append(drop, queue, h("div", { class: "toolbar" }, chips, h("div", { class: "search", style: { marginLeft: isPhone() ? 0 : "auto" } }, icon("search"), search)), grid);

  const drawChips = () =>
    chips.replaceChildren(
      ...[["", "All"], ...KINDS].map(([k, label]) => h("button", { class: "chip", type: "button", "aria-pressed": String(filter === k), text: label, onclick: () => ((filter = k), drawChips(), load()) }))
    );
  search.addEventListener("input", debounce(() => ((q = search.value.trim()), load()), 300));

  async function start(files) {
    if (!files.length) return;
    const kind = filter && filter !== "avatar" ? filter : "gallery";
    for (const file of files) {
      const bar = h("i");
      const status = h("span", { class: "hint", text: "Preparing…" });
      const preview = h("img", { alt: "" });
      preview.src = URL.createObjectURL(file);
      const row = h("div", { class: "upq__item" }, preview, h("div", { style: { minWidth: 0 } }, h("div", { class: "truncate", style: { fontWeight: 600 }, text: file.name }), status, h("div", { class: "bar" }, bar)), h("span"));
      queue.prepend(row);
      try {
        const item = await uploadPhoto(file, { kind, inGallery: kind === "gallery", alt: "", caption: "" }, (p) => {
          bar.style.width = `${Math.round(p * 100)}%`;
          status.textContent = `Uploading… ${Math.round(p * 100)}%`;
        });
        bar.style.width = "100%";
        status.textContent = kind === "gallery" ? "Uploaded. It's now on the Gallery page — add a caption." : "Uploaded.";
        row.lastChild.replaceChildren(h("button", { class: "btn btn--sm", type: "button", text: "Add caption", onclick: () => openPhoto(item, load) }));
        setTimeout(() => row.remove(), 12000);
      } catch (e) {
        status.textContent = e.message;
        status.style.color = "var(--bad)";
        row.lastChild.replaceChildren(h("button", { class: "icon-btn icon-btn--sm", type: "button", "aria-label": "Dismiss", onclick: () => row.remove() }, icon("x", "i--sm")));
      } finally {
        URL.revokeObjectURL(preview.src);
      }
    }
    load();
  }
  const choose = async () => start(await pickFiles({ multiple: true }));
  uploadBtn.addEventListener("click", choose);
  drop.addEventListener("click", choose);

  // drag files anywhere on the page
  let depth = 0;
  let overlayEl = null;
  const onEnter = (e) => {
    if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
    e.preventDefault();
    depth++;
    if (!overlayEl) document.body.append((overlayEl = h("div", { class: "drop-overlay" }, h("div", null, icon("upload", "i--lg"), "Drop to upload"))));
    drop.classList.add("is-over");
  };
  const onLeave = () => {
    depth = Math.max(0, depth - 1);
    if (!depth) {
      overlayEl?.remove();
      overlayEl = null;
      drop.classList.remove("is-over");
    }
  };
  const onOver = (e) => [...(e.dataTransfer?.types || [])].includes("Files") && e.preventDefault();
  const onDrop = (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    depth = 1;
    onLeave();
    start([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")));
  };
  window.addEventListener("dragenter", onEnter);
  window.addEventListener("dragleave", onLeave);
  window.addEventListener("dragover", onOver);
  window.addEventListener("drop", onDrop);
  ctx.onLeave(() => {
    window.removeEventListener("dragenter", onEnter);
    window.removeEventListener("dragleave", onLeave);
    window.removeEventListener("dragover", onOver);
    window.removeEventListener("drop", onDrop);
    overlayEl?.remove();
  });
  ctx.onLeave(onChanged((w) => w === "images" && !queue.children.length && load()));

  async function load() {
    grid.replaceChildren(skeleton("grid", isPhone() ? 9 : 12));
    try {
      const p = new URLSearchParams();
      if (filter) p.set("kind", filter);
      if (q) p.set("q", q);
      const data = await api(`/images?${p}`);
      if (!ctx.alive()) return;
      sub.textContent = `${data.total} photo${data.total === 1 ? "" : "s"} · ${mb(data.bytes)} used`;
      if (!data.items.length) {
        grid.replaceChildren(empty({ iconName: "image", title: q || filter ? "No photos match" : "No photos yet", text: q || filter ? "Try another filter." : "Upload photos from the home, events and outreach. Gallery photos appear on the website straight away." }));
        return;
      }
      const g = h("div", { class: "mgrid" });
      data.items.forEach((it, i) => {
        const tile = h(
          "button",
          { class: "mtile", type: "button", style: { "--i": i % 24 }, "aria-label": it.caption || it.alt || "Photo" },
          h("img", { src: it.small, alt: "", loading: "lazy" }),
          h("span", { class: "mtile__badges" }, it.inGallery ? h("span", { class: "pill pill--ok", text: "On site" }) : null, it.kind !== "gallery" ? h("span", { class: "pill pill--plain", text: kindLabel(it.kind) }) : null),
          h("span", { class: "mtile__over", text: it.caption || "No caption yet" })
        );
        tile.addEventListener("click", () => openPhoto(it, load));
        g.append(tile);
      });
      grid.replaceChildren(g);
    } catch (e) {
      grid.replaceChildren(empty({ iconName: "alert", title: "Couldn't load photos", text: e.message }));
    }
  }

  drawChips();
  await load();
  if (ctx.query.get("upload") === "1") choose();
}

export function openPhoto(it, onChange) {
  const ov = overlay({ kind: "drawer", title: it.caption || "Photo details", subtitle: `${it.width || "?"} × ${it.height || "?"} px · ${(it.bytes / 1024).toFixed(0)} KB` });
  const caption = input({ value: it.caption, maxLength: 200, placeholder: "e.g. New school bags for the new term" });
  const alt = h("textarea", { class: "textarea", rows: 2, maxLength: 200, placeholder: "Describe the photo for people using screen readers" });
  alt.value = it.alt;
  const kind = select(KINDS, it.kind);
  const gal = switchEl("Show on the website's Gallery page", it.inGallery);
  ov.body.append(
    h("a", { class: "preview-img", href: it.large, target: "_blank", rel: "noopener", title: "Open full size" }, h("img", { src: it.large, alt: "" })),
    field("Caption", caption, "Shown under the photo in the gallery."),
    field("Description (alt text)", alt, "Say what's in the photo. Never include a child's full name."),
    field("Category", kind),
    gal.el,
    h("dl", { class: "dl" }, h("div", null, h("dt", { text: "Uploaded" }), h("dd", { text: `${fmtDateTime(it.createdAt.endsWith("Z") ? it.createdAt : it.createdAt + "Z")}${it.createdBy ? ` by ${it.createdBy}` : ""}` })), h("div", null, h("dt", { text: "Link" }), h("dd", null, h("button", { class: "btn btn--sm", type: "button", onclick: () => copy(`${cfg.site.url}${it.large}`, "Link copied") }, icon("copy", "i--sm"), "Copy link"))))
  );
  const save = h("button", { class: "btn btn--primary", type: "button" }, icon("check"), "Save");
  const del = h("button", { class: "btn btn--danger spacer", type: "button" }, icon("trash"), "Delete");
  ov.showFoot(del, save);
  save.addEventListener("click", async () => {
    try {
      const r = await busy(save, () => api(`/images/${it.id}`, { method: "PATCH", body: { caption: caption.value, alt: alt.value, kind: kind.value, inGallery: gal.box.checked } }));
      Object.assign(it, r.item);
      toast("Photo updated", { type: "ok" });
      ov.close();
      changed("images");
      onChange?.();
    } catch (e) {
      toast(e.message, { type: "bad" });
    }
  });
  del.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "Delete this photo?", text: "It will be removed from the media library and the website. This can't be undone.", confirmLabel: "Delete photo" });
    if (!ok) return;
    try {
      await busy(del, () => api(`/images/${it.id}`, { method: "DELETE" }));
    } catch (e) {
      if (e.status !== 409) return toast(e.message, { type: "bad" });
      const force = await confirmDialog({ title: "This photo is in use", text: `${e.message} Delete it anyway? Those places will show initials instead.`, confirmLabel: "Delete anyway" });
      if (!force) return;
      try {
        await busy(del, () => api(`/images/${it.id}?force=1`, { method: "DELETE" }));
      } catch (e2) {
        return toast(e2.message, { type: "bad" });
      }
    }
    toast("Photo deleted", { type: "ok" });
    ov.close();
    changed("images");
    onChange?.();
  });
}
