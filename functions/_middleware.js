// Runs in front of every page (static files are excluded by _routes.json).
// Swaps in content that staff have changed in the admin panel; see lib/content.js.
import copy from "../src/_data/copy.json";
import { contentDefaults, mergeContent, readSavedContentCached } from "../lib/content.js";
import { liveRewriter } from "../lib/live.js";

const SKIP = /^\/(api|admin|media|css|js|img|brand)\//;
const defaults = contentDefaults(copy);

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const isPage = request.method === "GET" && !SKIP.test(url.pathname) && !/\.(?!html$)[a-z0-9]{2,5}$/i.test(url.pathname);
  if (!isPage) return context.next();

  // always fetch the full page: a browser's cached copy may hold older content
  const headers = new Headers(request.headers);
  headers.delete("If-None-Match");
  headers.delete("If-Modified-Since");
  const res = await context.next(new Request(request, { headers }));
  if (!(res.headers.get("Content-Type") || "").includes("text/html")) return res;

  let saved;
  try {
    saved = await readSavedContentCached(context);
  } catch (e) {
    console.error("Live content unavailable", e && e.stack ? e.stack : e);
    return res;
  }
  const changed = Object.keys(saved);
  const out = new Response(changed.length ? liveRewriter(copy, mergeContent(defaults, saved), changed).transform(res).body : res.body, res);
  out.headers.delete("ETag");
  return out;
}
