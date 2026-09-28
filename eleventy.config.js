import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";

/**
 * Fidelstine site build.
 * - Pages live in src/, shared layout and components in src/_includes/.
 * - Photos in src/media/photos are turned into responsive AVIF/WebP/JPEG by the image
 *   transform plugin wherever an <img> tag points at them.
 * - Videos and posters are copied as-is, or served from R2 when an item has host "r2".
 * - Every photo/video is described in src/_data/media.json (see docs/MEDIA-GUIDE.md).
 */
export default function (eleventyConfig) {
  // ---------- static files ----------
  eleventyConfig.addPassthroughCopy({ "src/js": "js" });
  eleventyConfig.addPassthroughCopy({ "src/media/videos": "media/videos" });
  eleventyConfig.addPassthroughCopy({ "src/media/posters": "media/posters" });
  // originals are also published so the lightbox can open a large version
  eleventyConfig.addPassthroughCopy({ "src/media/photos": "media/photos" });
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });
  eleventyConfig.addWatchTarget("src/_includes/css/");
  eleventyConfig.addWatchTarget("lib/");

  // ---------- responsive images ----------
  eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
    extensions: "html",
    formats: ["avif", "webp", "jpeg"],
    widths: [480, 960, 1600],
    outputDir: "_site/img/",
    urlPath: "/img/",
    failOnError: false,
    // high quality: photos are the heart of this site
    sharpJpegOptions: { mozjpeg: true, quality: 86 },
    sharpWebpOptions: { quality: 85 },
    sharpAvifOptions: { quality: 68 },
    htmlOptions: {
      imgAttributes: { loading: "lazy", decoding: "async", sizes: "100vw" },
    },
  });

  // ---------- media helpers ----------

  eleventyConfig.addFilter("tagged", (items, ...tags) =>
    (items || []).filter((m) => tags.every((t) => (m.tags || []).includes(t)))
  );
  eleventyConfig.addFilter("taggedAny", (items, tags) =>
    (items || []).filter((m) => (m.tags || []).some((t) => tags.includes(t)))
  );
  eleventyConfig.addFilter("ofType", (items, type) => (items || []).filter((m) => m.type === type));
  eleventyConfig.addFilter("byId", (items, id) => (items || []).find((m) => m.id === id));
  eleventyConfig.addFilter("pairs", (items) => {
    // before/after pairs share a "pair" key; returns [{ before, after, caption }]
    const groups = {};
    for (const m of items || []) {
      if (!m.pair) continue;
      groups[m.pair] ??= {};
      if ((m.tags || []).includes("before")) groups[m.pair].before = m;
      if ((m.tags || []).includes("after")) groups[m.pair].after = m;
    }
    return Object.entries(groups)
      .filter(([, g]) => g.before && g.after)
      .map(([pair, g]) => ({ pair, ...g }));
  });

  // URL of a media file. Items with host "r2" come from the R2 bucket, the rest from /media/.
  eleventyConfig.addFilter("mediaUrl", function (file, host) {
    if (!file) return "";
    if (/^https?:\/\//.test(file)) return file;
    const r2 = process.env.MEDIA_R2_BASE || "";
    if (host === "r2" && r2) return r2.replace(/\/$/, "") + "/" + file;
    return "/media/" + file;
  });

  // ---------- shortcodes ----------
  eleventyConfig.addShortcode(
    "icon",
    (name, cls = "") => `<svg class="i ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`
  );

  // Lightbox / player data for a list of media items, safe to embed in <script type="application/json">
  const mediaUrl = (file, host) => {
    if (!file) return null;
    if (/^https?:\/\//.test(file)) return file;
    const r2 = process.env.MEDIA_R2_BASE || "";
    return host === "r2" && r2 ? r2.replace(/\/$/, "") + "/" + file : "/media/" + file;
  };
  eleventyConfig.addFilter("mediaJson", (items) =>
    JSON.stringify(
      (items || []).map((m) => ({
        id: m.id,
        type: m.type,
        src: mediaUrl(m.src, m.type === "video" ? m.host : undefined),
        poster: m.poster ? mediaUrl(m.poster) : null,
        alt: m.alt || "",
        caption: m.caption || "",
        w: m.width || null,
        h: m.height || null,
        duration: m.duration || null,
        audio: !!m.audio,
      }))
    ).replace(/</g, "\\u003c")
  );
  eleventyConfig.addFilter("duration", (s) => {
    if (!s) return "";
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  });
  eleventyConfig.addFilter("newest", (items) =>
    [...(items || [])].sort((a, b) => String(b.added || "").localeCompare(String(a.added || "")))
  );
  eleventyConfig.addFilter("exclude", (items, tag) => (items || []).filter((m) => !(m.tags || []).includes(tag)));
  eleventyConfig.addFilter("countTagged", (items, tag) => (items || []).filter((m) => (m.tags || []).includes(tag)).length);
  eleventyConfig.addFilter("initials", (name = "") =>
    name
      .split(/\s+/)
      .filter((w) => /^[A-Za-z]/.test(w))
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("") || "F"
  );

  // ---------- general filters ----------
  eleventyConfig.addFilter("money", (amount, currency = "NGN") => {
    try {
      return new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${currency} ${amount}`;
    }
  });
  eleventyConfig.addFilter("json", (v) => JSON.stringify(v));
  eleventyConfig.addFilter("pad2", (n) => String(n).padStart(2, "0"));
  eleventyConfig.addFilter("findBy", (arr, key, val) => (arr || []).find((x) => x && x[key] === val));
  eleventyConfig.addFilter("limit", (arr, n) => (arr || []).slice(0, n));
  eleventyConfig.addFilter("year", () => new Date().getFullYear());
  eleventyConfig.addFilter("isoDate", (d) => new Date(d).toISOString());
  eleventyConfig.addFilter("absoluteUrl", (path, base) => {
    try {
      return new URL(path, base).href;
    } catch {
      return path;
    }
  });

  // ---------- CSS bundle minification ----------
  eleventyConfig.addTransform("minify-css", function (content) {
    if (!(this.page.outputPath || "").endsWith(".css")) return content;
    return content
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\n\s*\n/g, "\n")
      .replace(/^\s+/gm, "")
      .trim();
  });

  eleventyConfig.setServerOptions({ port: 8080, showAllHosts: false });

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    templateFormats: ["njk", "md", "html", "11ty.js"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
}
