// Photos: resize in the browser (so uploads are small and quick on Nigerian mobile data), upload with
// progress, and a picker used by image fields (team, testimonials, profile photo).
import { api, upload, changed } from "./api.js";
import { h, icon, overlay, toast, empty, skeleton, isPhone, $$ } from "./ui.js";

const KIND_LABELS = { gallery: "Gallery", team: "Team", testimonial: "Testimonials", avatar: "Profile photos", other: "Other" };
export const kindLabel = (k) => KIND_LABELS[k] || k;
export const KINDS = Object.entries(KIND_LABELS);

async function toBlob(canvas) {
  const webp = await new Promise((r) => canvas.toBlob(r, "image/webp", 0.82));
  if (webp && webp.type === "image/webp") return webp;
  return new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85)); // older Safari can't make WebP
}

function draw(bitmap, max, square) {
  let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
  if (square) {
    const s = Math.min(sw, sh);
    sx = (sw - s) / 2;
    sy = (sh - s) / 2;
    sw = sh = s;
  }
  const scale = Math.min(1, max / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.round(sw * scale);
  c.height = Math.round(sh * scale);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/** Makes the two sizes the server stores. Profile photos are cropped square. */
export async function prepare(file, { square = false } = {}) {
  if (!/^image\//.test(file.type)) throw new Error(`"${file.name}" is not a photo.`);
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`"${file.name}" couldn't be read. Try a JPEG or PNG.`);
  }
  const large = draw(bitmap, square ? 640 : 1600, square);
  const small = draw(bitmap, square ? 200 : 480, square);
  const [lb, sb] = await Promise.all([toBlob(large), toBlob(small)]);
  return { large: lb, small: sb, width: large.width, height: large.height };
}

/** Uploads one file. meta: { kind, alt, caption, inGallery }. Returns the saved photo. */
export async function uploadPhoto(file, meta = {}, onProgress) {
  const p = await prepare(file, { square: meta.kind === "avatar" });
  const form = new FormData();
  const ext = p.large.type === "image/webp" ? "webp" : "jpg";
  form.append("large", p.large, `large.${ext}`);
  form.append("small", p.small, `small.${ext}`);
  form.append("width", p.width);
  form.append("height", p.height);
  form.append("kind", meta.kind || "gallery");
  form.append("alt", meta.alt || "");
  form.append("caption", meta.caption || "");
  form.append("inGallery", meta.inGallery ? "1" : "0");
  const data = await upload("/images", form, onProgress);
  changed("images");
  return data.item;
}

export function pickFiles({ multiple = false } = {}) {
  return new Promise((resolve) => {
    const inp = h("input", { type: "file", accept: "image/*", multiple, style: { display: "none" } });
    inp.addEventListener("change", () => {
      resolve([...inp.files]);
      inp.remove();
    });
    document.body.append(inp);
    inp.click();
  });
}

/**
 * Photo picker: choose from the library or upload a new one. Resolves with a photo or null.
 * kind: the category new uploads are saved under, and the default filter.
 */
export function pickPhoto({ kind = "other", title = "Choose a photo" } = {}) {
  return new Promise((resolve) => {
    let chosen = null;
    let done = false;
    const ov = overlay({ kind: "modal", wide: true, title, subtitle: "Pick one from your media library, or upload a new one.", onClose: () => !done && resolve(null) });
    const grid = h("div");
    let filter = kind;
    const chips = h("div", { class: "chips" });
    const drawChips = () => {
      chips.replaceChildren(
        ...[[kind, KIND_LABELS[kind] || "This type"], ["", "All photos"]].map(([k, label]) =>
          h("button", { class: "chip", type: "button", "aria-pressed": String(filter === k), text: label, onclick: () => ((filter = k), drawChips(), load()) })
        )
      );
    };
    const uploadBtn = h("button", { class: "btn btn--primary", type: "button" }, icon("upload"), "Upload new");
    uploadBtn.addEventListener("click", async () => {
      const [file] = await pickFiles();
      if (!file) return;
      uploadBtn.setAttribute("aria-busy", "true");
      try {
        const item = await uploadPhoto(file, { kind, inGallery: false });
        finish(item);
      } catch (e) {
        toast(e.message, { type: "bad" });
      } finally {
        uploadBtn.removeAttribute("aria-busy");
      }
    });
    ov.body.append(h("div", { class: "row row--between row--wrap" }, chips, uploadBtn), grid);
    const useBtn = h("button", { class: "btn btn--primary", type: "button", text: "Use this photo", disabled: true, onclick: () => chosen && finish(chosen) });
    ov.showFoot(h("button", { class: "btn", type: "button", text: "Cancel", onclick: () => ov.close() }), useBtn);

    function finish(item) {
      done = true;
      resolve(item);
      ov.close();
    }
    async function load() {
      grid.replaceChildren(skeleton("grid", isPhone() ? 6 : 10));
      try {
        const data = await api(`/images${filter ? `?kind=${filter}` : ""}`);
        if (!data.items.length) {
          grid.replaceChildren(empty({ iconName: "image", title: "No photos here yet", text: "Upload one with the button above." }));
          return;
        }
        const g = h("div", { class: "mgrid" });
        data.items.forEach((it, i) => {
          const tile = h("button", { class: "mtile", type: "button", style: { "--i": i }, "aria-label": it.caption || it.alt || "Photo" }, h("img", { src: it.small, alt: "", loading: "lazy" }));
          tile.addEventListener("click", () => {
            $$(".mtile", g).forEach((t) => {
              t.classList.remove("is-selected");
              t.querySelector(".mtile__check")?.remove();
            });
            tile.classList.add("is-selected");
            tile.append(h("span", { class: "mtile__check" }, icon("check", "i--sm")));
            chosen = it;
            useBtn.disabled = false;
          });
          tile.addEventListener("dblclick", () => finish(it));
          g.append(tile);
        });
        grid.replaceChildren(g);
      } catch (e) {
        grid.replaceChildren(empty({ iconName: "alert", title: "Couldn't load photos", text: e.message }));
      }
    }
    drawChips();
    load();
  });
}
