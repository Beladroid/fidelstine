// Photos uploaded from the console (profile photos, team, testimonials, gallery).
// The browser resizes each photo before upload, so the server only checks and stores two sizes:
//   large  up to 1600px on the long side (lightbox, big displays)
//   small  up to 480px (cards, avatars, gallery tiles)
// Both live in D1 (free, no extra service). Public URLs: /api/images/<id>/l and /api/images/<id>/s
import { HttpError } from "./http.js";
import { cleanText } from "./validate.js";

export const IMAGE_KINDS = ["gallery", "team", "testimonial", "avatar", "other"];
export const IMAGE_ID = /^[a-z0-9]{16}$/;
const TYPES = ["image/webp", "image/jpeg", "image/png"];
const MAX_LARGE = 1_500_000;
const MAX_SMALL = 250_000;

export const imageUrl = (id, size = "s") => `/api/images/${id}/${size}`;

export function newImageId() {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => a[b % a.length]).join("");
}

/** Reads and checks an upload (multipart form: large, small, width, height, kind, alt, caption, inGallery). */
export async function readUpload(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError("Send the photo as a form upload.", 415);
  }
  const large = form.get("large");
  const small = form.get("small");
  if (!(large instanceof File) || !(small instanceof File)) throw new HttpError("The photo didn't arrive. Please try again.", 422);
  if (!TYPES.includes(large.type) || !TYPES.includes(small.type)) throw new HttpError("Use a JPEG, PNG or WebP photo.", 415);
  if (large.size > MAX_LARGE || small.size > MAX_SMALL) throw new HttpError("That photo is too large even after resizing. Try a smaller one.", 413);
  const kind = IMAGE_KINDS.includes(form.get("kind")) ? form.get("kind") : "gallery";
  return {
    kind,
    mime: large.type,
    width: Math.round(Number(form.get("width"))) || null,
    height: Math.round(Number(form.get("height"))) || null,
    data: new Uint8Array(await large.arrayBuffer()),
    thumb: new Uint8Array(await small.arrayBuffer()),
    alt: cleanText(form.get("alt"), 200),
    caption: cleanText(form.get("caption"), 200),
    inGallery: form.get("inGallery") === "1" || (form.get("inGallery") === null && kind === "gallery"),
  };
}

export const publicImage = (r) => ({
  id: r.id,
  kind: r.kind,
  width: r.width,
  height: r.height,
  bytes: r.bytes,
  alt: r.alt,
  caption: r.caption,
  inGallery: !!r.in_gallery,
  createdAt: r.created_at,
  createdBy: r.created_by,
  small: imageUrl(r.id, "s"),
  large: imageUrl(r.id, "l"),
});

export const LIST_COLUMNS = "id, kind, width, height, bytes, alt, caption, in_gallery, created_at, created_by";

/** Photos shown in the "Just added" part of the Gallery page (newest first). */
export async function galleryImages(db, limit = 48) {
  const { results } = await db
    .prepare(`SELECT id, width, height, alt, caption FROM images WHERE in_gallery = 1 ORDER BY created_at DESC LIMIT ?`)
    .bind(limit)
    .all();
  return (results || []).map((r) => ({ id: r.id, w: r.width, h: r.height, alt: r.alt, caption: r.caption }));
}
