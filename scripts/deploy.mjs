// Publish the site so every visitor gets the new version straight away.
//
//   node scripts/deploy.mjs                 build, then publish to the live site (branch main)
//   node scripts/deploy.mjs --branch test   publish a preview copy on test.<project>.pages.dev
//   node scripts/deploy.mjs --no-build      publish what is already built
//
// Why this exists: Cloudflare keeps its own copy of every page. Pages that still exist update
// within seconds of a publish, but a page that is REMOVED keeps being served from that copy for
// up to a week. So this script:
//   1. remembers every page ever published (deploy/pages-<project>-<branch>.txt, keep it in git)
//      and sends any page that has disappeared to the home page with a redirect, which takes
//      effect at once;
//   2. stamps every page with a release number;
//   3. publishes, then (if CF_ZONE_ID and CF_API_TOKEN are set, i.e. once the site is on its own
//      domain) empties Cloudflare's cache for the domain;
//   4. checks every page until it shows the new release number, and every removed page until it
//      redirects, and reports anything still showing an old version.
//
// Each Fidelstine site has its own copy of this file (sites never share code). Only CONFIG differs.
import { execSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const CONFIG = {
  project: "fidelstine",
  out: "_site",               // what gets published
  build: "npx eleventy",       // how to build it (null: nothing to build)
  stampAssets: false,           // true: add ?v=<content hash> to local css/js/img links (sites without a build step)
  private: ["/console-app/"],    // pages that are never shown at their own address (not checked)
  domain: "https://charity.fidelstine.org", // the live address, checked after publishing to main (null: <project>.pages.dev)
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const branch = args.includes("--branch") ? args[args.indexOf("--branch") + 1] : "main";
const noBuild = args.includes("--no-build");
// for trying the script out on a throwaway project: --project <name> --out <folder>
if (args.includes("--project")) CONFIG.project = args[args.indexOf("--project") + 1];
if (args.includes("--out")) { CONFIG.out = args[args.indexOf("--out") + 1]; CONFIG.build = null; }
const release = Date.now().toString(36) + "-" + crypto.randomBytes(2).toString("hex");
// the address to check: SITE_ORIGIN if set, else the live domain (or alias) for main, or the branch alias
const origin = (process.env.SITE_ORIGIN || (branch === "main" ? CONFIG.domain || `https://${CONFIG.project}.pages.dev` : `https://${branch}.${CONFIG.project}.pages.dev`)).replace(/\/$/, "");
const log = (...a) => console.log("•", ...a);

/* ---------- 1. build ---------- */
if (CONFIG.build && !noBuild) {
  log(`Building (${CONFIG.build})`);
  // the live site takes card payments (Flutterwave live keys set 2 Oct 2026); ONLINE_GIVING=0 switches them off
  const giving = branch === "main" ? { ONLINE_GIVING: "1" } : {};
  execSync(CONFIG.build, { cwd: root, stdio: "inherit", shell: true, env: { ...giving, ...process.env } });
}
let dir = path.resolve(root, CONFIG.out);
if (!fs.existsSync(dir)) throw new Error(`Nothing to publish: ${dir} is missing.`);

// sites without a build step are stamped in a temporary copy, so the source stays clean
const useCopy = CONFIG.stampAssets || !CONFIG.build;
if (useCopy) {
  const tmp = path.join(root, ".deploy");
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.cpSync(dir, tmp, { recursive: true });
  dir = tmp;
}

/* ---------- 2. pages, removed pages, release stamp ---------- */
const htmlFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".html")) htmlFiles.push(p);
  }
})(dir);
const urlOf = (file) => {
  const rel = path.relative(dir, file).split(path.sep).join("/");
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return "/" + rel.slice(0, -"index.html".length);
  return "/" + rel.replace(/\.html$/, "");
};
const allPages = htmlFiles.map((f) => ({ file: f, url: urlOf(f) })).filter((p) => p.url !== "/404");
const pages = allPages.filter((p) => !CONFIG.private.includes(p.url));

const hashOf = (file) => crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 10);
for (const p of allPages) {
  let html = fs.readFileSync(p.file, "utf8");
  html = html.replace(/<meta name="fid-release"[^>]*>\s*/g, "");
  html = html.replace(/<\/head>/i, `<meta name="fid-release" content="${release}">\n</head>`);
  if (CONFIG.stampAssets) {
    // /css/x.css, /js/x.js, /img/x.webp, /brand/x.png, /og.jpg ... -> ?v=<hash of that file>
    html = html.replace(/((?:href|src|content)=")(\/[^"?#\s]+\.(?:css|js|webp|avif|jpe?g|png|svg|woff2))(")/g, (m, a, url, b) => {
      const f = path.join(dir, url);
      return fs.existsSync(f) ? `${a}${url}?v=${hashOf(f)}${b}` : m;
    });
    html = html.replace(/(srcset=")([^"]+)(")/g, (m, a, set, b) =>
      a + set.split(",").map((part) => part.trim().replace(/^(\/\S+)/, (url) => {
        const f = path.join(dir, url);
        return fs.existsSync(f) ? `${url}?v=${hashOf(f)}` : url;
      })).join(", ") + b);
  }
  fs.writeFileSync(p.file, html);
}

const ledgerFile = path.join(root, "deploy", `pages-${CONFIG.project}-${branch}.txt`);
const ledger = fs.existsSync(ledgerFile) ? fs.readFileSync(ledgerFile, "utf8").split(/\r?\n/).map((s) => s.trim()).filter((s) => s.startsWith("/")) : [];
const current = new Set(allPages.map((p) => p.url));
const removed = ledger.filter((u) => !current.has(u) && u !== "/" && !CONFIG.private.includes(u));
if (removed.length) {
  const file = path.join(dir, "_redirects");
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const lines = removed.flatMap((u) => (u.endsWith("/") ? [u, u.slice(0, -1)] : [u, u + "/"]))
    .filter((u) => u && !new RegExp(`^${u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s`, "m").test(existing))
    .map((u) => `${u}  /  302`);
  fs.writeFileSync(file, (existing.trimEnd() ? existing.trimEnd() + "\n" : "") + "# removed pages (added by scripts/deploy.mjs)\n" + lines.join("\n") + "\n");
  log(`${removed.length} removed page(s) will redirect to the home page: ${removed.join(", ")}`);
}

/* ---------- 3. publish ---------- */
const localWrangler = [path.join(root, "node_modules/wrangler/bin/wrangler.js"), path.join(root, "../international/node_modules/wrangler/bin/wrangler.js")].find((p) => fs.existsSync(p));
const wranglerArgs = ["pages", "deploy", dir, "--project-name", CONFIG.project, "--branch", branch, "--commit-dirty=true"];
log(`Publishing release ${release} to ${CONFIG.project} (${branch})`);
if (localWrangler) execFileSync(process.execPath, [localWrangler, ...wranglerArgs], { cwd: root, stdio: "inherit" });
else execSync(`npx wrangler ${wranglerArgs.map((a) => JSON.stringify(a)).join(" ")}`, { cwd: root, stdio: "inherit", shell: true });

if (process.env.CF_ZONE_ID && process.env.CF_API_TOKEN) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${process.env.CF_ZONE_ID}/purge_cache`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CF_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ purge_everything: true }),
  });
  log(r.ok ? "Emptied Cloudflare's cache for the domain" : `Could not empty the cache (${r.status}); pages still update, just check below`);
}

/* ---------- 4. check every page ---------- */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fresh = new Set();
const redirected = new Set();
const deadline = Date.now() + 180_000;
log(`Checking ${pages.length} page(s)${removed.length ? ` and ${removed.length} removed page(s)` : ""} on ${origin}`);
while (Date.now() < deadline && (fresh.size < pages.length || redirected.size < removed.length)) {
  await Promise.all([
    ...pages.filter((p) => !fresh.has(p.url)).map(async (p) => {
      try {
        const body = await (await fetch(origin + p.url, { headers: { "User-Agent": "fidelstine-deploy-check" } })).text();
        if (body.includes(release)) fresh.add(p.url);
      } catch {}
    }),
    ...removed.filter((u) => !redirected.has(u)).map(async (u) => {
      try {
        const r = await fetch(origin + u, { redirect: "manual", headers: { "User-Agent": "fidelstine-deploy-check" } });
        if (r.status >= 300 && r.status < 400) redirected.add(u);
      } catch {}
    }),
  ]);
  if (fresh.size < pages.length || redirected.size < removed.length) await wait(5000);
}

const stale = pages.filter((p) => !fresh.has(p.url)).map((p) => p.url);
const stuck = removed.filter((u) => !redirected.has(u));
if (!stale.length && !stuck.length) {
  // remember every page published so far, so a page removed later still gets its redirect
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
  const all = [...new Set([...ledger, ...current])].sort();
  fs.writeFileSync(ledgerFile, "# Every page ever published to this branch. scripts/deploy.mjs redirects any that disappear.\n" + all.join("\n") + "\n");
  log(`Done: all ${pages.length} page(s) show release ${release}${removed.length ? `, and ${removed.length} removed page(s) redirect` : ""}.`);
} else {
  if (stale.length) console.error(`! Still showing an older version after 3 minutes: ${stale.join(", ")}`);
  if (stuck.length) console.error(`! Removed but not redirecting yet: ${stuck.join(", ")}`);
  process.exitCode = 1;
}
if (useCopy) fs.rmSync(dir, { recursive: true, force: true });
