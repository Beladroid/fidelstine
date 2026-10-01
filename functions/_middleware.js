// Runs in front of every page (static files are excluded by _routes.json).
//  0. Sends visitors on the free address (fidelstine.pages.dev) to the live domain (SITE_URL).
//  1. Serves the staff console at its private address (the ADMIN_PATH secret). The console page is
//     built to /console-app/, which is never served directly, so its address isn't in the code.
//  2. Swaps in content that staff have changed in the console; see lib/content.js.
import copy from "../src/_data/copy.json";
import { contentDefaults, mergeContent, readLiveCached } from "../lib/content.js";
import { liveRewriter } from "../lib/live.js";

const SKIP = /^\/(api|media|css|js|img|brand|fonts)\//;
const CONSOLE_BUILD = "/console-app/";
const defaults = contentDefaults(copy);

const notFound = (context, url) => context.env.ASSETS.fetch(new URL("/__not-found__/", url));

async function serveConsole(context, url) {
  const page = await context.env.ASSETS.fetch(new URL(CONSOLE_BUILD, url));
  const res = new Response(page.body, page);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.delete("ETag");
  return res;
}

// Only the production alias moves: preview copies (flutterwave-test.…) and API calls
// (webhooks, form posts) stay where they are.
function toLiveDomain(request, env, url) {
  if (!env.SITE_URL || url.hostname !== "fidelstine.pages.dev") return null;
  if (!["GET", "HEAD"].includes(request.method) || url.pathname.startsWith("/api/")) return null;
  return Response.redirect(new URL(url.pathname + url.search, env.SITE_URL), 301);
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const moved = toLiveDomain(request, env, url);
  if (moved) return moved;

  // the console's build folder is never reachable by its own name
  if (url.pathname.startsWith(CONSOLE_BUILD.slice(0, -1))) return notFound(context, url);
  const slug = String(env.ADMIN_PATH || "").replace(/^\/+|\/+$/g, "");
  if (slug && /^[a-z0-9-]{6,64}$/i.test(slug)) {
    if (url.pathname === `/${slug}`) return Response.redirect(new URL(`/${slug}/`, url), 301);
    if (url.pathname === `/${slug}/`) return serveConsole(context, url);
  }

  const isPage = request.method === "GET" && !SKIP.test(url.pathname) && !/\.(?!html$)[a-z0-9]{2,5}$/i.test(url.pathname);
  if (!isPage) return context.next();

  // always fetch the full page: a browser's cached copy may hold older content
  const headers = new Headers(request.headers);
  headers.delete("If-None-Match");
  headers.delete("If-Modified-Since");
  const res = await context.next(new Request(request, { headers }));
  if (!(res.headers.get("Content-Type") || "").includes("text/html")) return res;

  let live;
  try {
    live = await readLiveCached(context);
  } catch (e) {
    console.error("Live content unavailable", e && e.stack ? e.stack : e);
    return res;
  }
  const changed = Object.keys(live.sections);
  if (live.gallery.length) changed.push("gallery");
  const body = changed.length ? liveRewriter(copy, mergeContent(defaults, live.sections), changed, live.gallery).transform(res).body : res.body;
  const out = new Response(body, res);
  out.headers.delete("ETag");
  return out;
}
