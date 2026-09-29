// Fidelstine staff console: sign-in, the app shell (laptop sidebar / phone tab bar), routing,
// command search, notifications and the user menu. Each page lives in ./views/.
import { api, session, refreshSession, onChanged } from "./api.js";
import { h, icon, avatar, cfg, isPhone, phoneQuery, toast, overlay, closeOverlays, field, input, passwordInput, strengthMeter, busy, debounce, firstName, $, $$, minorMoney, relTime } from "./ui.js";
import { go, toggleTheme } from "./nav.js";

const app = document.getElementById("app");

const ROUTES = {
  overview: { title: "Overview", icon: "home", load: () => import("./views/overview.js") },
  donations: { title: "Donations", icon: "heart", load: () => import("./views/donations.js") },
  inbox: { title: "Inbox", icon: "inbox", load: () => import("./views/inbox.js") },
  content: { title: "Site content", icon: "layers", load: () => import("./views/content.js") },
  media: { title: "Media library", icon: "image", load: () => import("./views/media.js") },
  subscribers: { title: "Subscribers", icon: "users", load: () => import("./views/subscribers.js") },
  activity: { title: "Activity", icon: "activity", load: () => import("./views/activity.js") },
  settings: { title: "Settings", icon: "settings", load: () => import("./views/settings.js") },
};
const NAV = [
  ["Workspace", ["overview", "donations", "inbox"]],
  ["Website", ["content", "media"]],
  ["People", ["subscribers", "activity"]],
  ["Account", ["settings"]],
];

/* ---------------- boot ---------------- */
async function boot() {
  try {
    const s = await api("/session");
    if (s.user) {
      session.set({ user: s.user, status: s.status || {}, counts: s.counts || session.counts });
      renderShell();
    } else if (s.needsSetup) renderSetup();
    else renderLogin();
  } catch (e) {
    app.replaceChildren(h("div", { class: "auth__panel", style: { minHeight: "100dvh" } }, h("div", { class: "auth__card" }, h("h1", { text: "The console can't load" }), h("p", { class: "muted", text: e.message }), h("button", { class: "btn btn--primary", type: "button", text: "Try again", onclick: () => location.reload() }))));
  }
}
document.addEventListener("console:signed-out", () => {
  if (!session.user) return;
  session.set({ user: null });
  toast("Your session has ended. Please sign in again.", { type: "bad" });
  renderLogin();
});

/* ---------------- sign in / set up ---------------- */
function authFrame(card) {
  const brand = h(
    "div",
    { class: "auth__brand" },
    h("div", { class: "auth__logo" }, h("img", { src: "/brand/crest-128.webp", alt: "", width: 52, height: 52 }), h("div", null, h("strong", { text: "Fidelstine" }), h("span", { text: "Staff console" }))),
    h("p", { class: "auth__quote" }, "Nurturing hope, ", h("em", { text: "building futures" }), ", defending dignity."),
    h("p", { class: "auth__foot", text: "For Fidelstine staff only. Every change is recorded with your name." })
  );
  app.replaceChildren(h("div", { class: "auth" }, brand, h("div", { class: "auth__panel" }, card)));
}

function renderLogin() {
  const email = input({ type: "email", autocomplete: "username", required: true, autofocus: true, placeholder: "you@example.com" });
  const pw = passwordInput({ required: true });
  const err = h("p", { class: "form-error", role: "alert", hidden: true });
  const btn = h("button", { class: "btn btn--primary btn--lg btn--block", type: "submit" }, "Sign in", icon("right"));
  const form = h(
    "form",
    { class: "auth__card", novalidate: true },
    h("div", { class: "stack stack--sm" }, h("h1", { text: "Welcome back" }), h("p", { class: "lead", text: "Sign in to manage donations, messages and the website." })),
    field("Email", email),
    field("Password", pw.el),
    err,
    btn,
    h("p", { class: "hint", text: "Forgotten your password? Ask an owner to reset it from Settings > Team." })
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    try {
      const r = await busy(btn, () => api("/login", { method: "POST", body: { email: email.value.trim(), password: pw.input.value } }));
      session.set({ user: r.user });
      await refreshSession();
      renderShell();
      toast(`Welcome back, ${firstName(r.user.name)}.`, { type: "ok" });
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      form.animate?.([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }], { duration: 280 });
    }
  });
  authFrame(form);
  setTimeout(() => email.focus(), 50);
}

function renderSetup() {
  const name = input({ autocomplete: "name", required: true, autofocus: true });
  const email = input({ type: "email", autocomplete: "username", required: true });
  const pw = passwordInput({ autocomplete: "new-password" });
  const key = passwordInput({ autocomplete: "off" });
  const err = h("p", { class: "form-error", role: "alert", hidden: true });
  const btn = h("button", { class: "btn btn--primary btn--lg btn--block", type: "submit" }, "Create my account", icon("right"));
  const form = h(
    "form",
    { class: "auth__card", novalidate: true },
    h("div", { class: "stack stack--sm" }, h("span", { class: "pill pill--accent pill--plain", text: "First-time setup" }), h("h1", { text: "Set up the console" }), h("p", { class: "lead", text: "Create the first owner account. You can add the rest of the team afterwards." })),
    field("Your name", name),
    field("Your email", email, "You'll sign in with this."),
    h("div", { class: "field" }, h("label", { text: "Choose a password" }), pw.el, strengthMeter(pw.input), h("p", { class: "hint", text: "At least 10 characters. A short sentence works well." })),
    field("Setup key", key.el, "The staff password you were given. It's only needed once."),
    err,
    btn
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    try {
      const r = await busy(btn, () => api("/setup", { method: "POST", body: { name: name.value.trim(), email: email.value.trim(), password: pw.input.value, setupKey: key.input.value } }));
      session.set({ user: r.user });
      await refreshSession();
      renderShell();
      toast("Your console is ready. Welcome!", { type: "ok" });
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });
  authFrame(form);
}

/* ---------------- shell ---------------- */
let shell, page, crumbsEl, appTitle, cleanups = [], guard = null, currentHash = "", ignoreHash = false, navToken = 0;

function navItem(key, cls = "nav__item") {
  const r = ROUTES[key];
  const a = h("a", { class: cls, href: `#/${key}`, dataset: { route: key } }, icon(r.icon), h("span", { class: cls === "tab" ? "" : "nav__label", text: cls === "tab" ? shortTitle(key) : r.title }));
  if (key === "donations" || key === "inbox") {
    a.append(h("span", { class: "count", hidden: true, dataset: { badge: key } }));
    if (cls !== "tab") a.append(h("span", { class: "badge-dot", hidden: true, dataset: { dot: key } }));
  }
  return a;
}
const shortTitle = (k) => ({ overview: "Home", donations: "Donations", inbox: "Inbox", content: "Content" })[k] || ROUTES[k].title;

function renderShell() {
  let rail = false;
  try {
    rail = localStorage.getItem("fc-rail") === "1";
  } catch {}
  const collapse = h("button", { class: "icon-btn icon-btn--sm side__collapse", type: "button", "aria-label": "Collapse the sidebar" }, icon("panel"));
  const userBtn = h("button", { class: "side__user", type: "button", "aria-label": "Your account" });
  const side = h(
    "aside",
    { class: "side", "aria-label": "Console" },
    h("div", { class: "side__brand" }, h("img", { src: "/brand/crest-128.webp", alt: "" }), h("div", null, h("strong", { text: "Fidelstine" }), h("span", { text: "Staff console" }))),
    h("nav", { class: "side__nav" }, NAV.map(([title, keys]) => h("div", { class: "nav__group" }, h("p", { class: "nav__title", text: title }), keys.map((k) => navItem(k))))),
    h("div", { class: "side__card" }, h("p", { text: "See your changes the way visitors do." }), h("a", { class: "btn btn--sm", href: cfg.site.url, target: "_blank", rel: "noopener", style: { background: "rgba(255,255,255,.08)", color: "#fff", borderColor: "transparent" } }, icon("external"), "Open the website")),
    h("div", { class: "row" }, userBtn, collapse)
  );
  crumbsEl = h("nav", { class: "crumbs", "aria-label": "Breadcrumb" });
  const searchBtn = h("button", { class: "top__search", type: "button" }, icon("search"), h("span", { text: "Search or jump to…" }), h("kbd", { text: navigator.platform?.includes("Mac") ? "⌘K" : "Ctrl K" }));
  const bell = h("button", { class: "icon-btn", type: "button", "aria-label": "Notifications" }, icon("bell"), h("span", { class: "dot", hidden: true }));
  const themeBtn = h("button", { class: "icon-btn", type: "button", "aria-label": "Switch light or dark mode" }, icon(document.documentElement.dataset.theme === "dark" ? "sun" : "moon"));
  const recordBtn = h("button", { class: "btn btn--primary", type: "button" }, icon("plus"), "Record donation");
  const top = h("header", { class: "top" }, crumbsEl, searchBtn, h("div", { class: "top__actions" }, themeBtn, bell), recordBtn);

  appTitle = h("h1", { class: "appbar__title", text: "" });
  const bellPhone = h("button", { class: "icon-btn", type: "button", "aria-label": "Notifications" }, icon("bell"), h("span", { class: "dot", hidden: true }));
  const avatarPhone = h("button", { class: "icon-btn", type: "button", "aria-label": "Your account" });
  const appbar = h(
    "header",
    { class: "appbar" },
    h("img", { class: "appbar__logo", src: "/brand/crest-128.webp", alt: "" }),
    appTitle,
    h("button", { class: "icon-btn", type: "button", "aria-label": "Search", onclick: () => palette() }, icon("search")),
    bellPhone,
    avatarPhone
  );
  page = h("main", { class: "page", id: "page", tabindex: "-1" });
  const fab = h("button", { class: "tab tab--fab", type: "button", "aria-label": "Record a donation" }, h("span", { class: "fab" }, icon("plus")));
  const moreBtn = h("button", { class: "tab", type: "button", dataset: { route: "more" } }, icon("menu"), h("span", { text: "More" }));
  const tabbar = h("nav", { class: "tabbar", "aria-label": "Console" }, navItem("overview", "tab"), navItem("donations", "tab"), fab, navItem("inbox", "tab"), moreBtn);

  shell = h("div", { class: `shell ${rail ? "is-rail" : ""}` }, side, h("div", { class: "main" }, top, appbar, page), tabbar);
  app.replaceChildren(shell);

  collapse.addEventListener("click", () => {
    const on = shell.classList.toggle("is-rail");
    try {
      localStorage.setItem("fc-rail", on ? "1" : "0");
    } catch {}
    setTimeout(() => window.dispatchEvent(new Event("resize")), 360);
  });
  const openRecord = () => import("./views/record.js").then((m) => m.openRecord());
  recordBtn.addEventListener("click", openRecord);
  fab.addEventListener("click", openRecord);
  searchBtn.addEventListener("click", () => palette());
  themeBtn.addEventListener("click", toggleTheme);
  document.addEventListener("console:theme", () => themeBtn.replaceChildren(icon(document.documentElement.dataset.theme === "dark" ? "sun" : "moon")));
  bell.addEventListener("click", (e) => notifications(e.currentTarget));
  bellPhone.addEventListener("click", () => notifications(null));
  userBtn.addEventListener("click", (e) => userMenu(e.currentTarget));
  avatarPhone.addEventListener("click", () => userMenu(null));
  moreBtn.addEventListener("click", moreSheet);

  const paintUser = () => {
    const u = session.user;
    if (!u) return;
    userBtn.replaceChildren(avatar(u, "sm"), h("span", { class: "who__text" }, h("span", { class: "who__name", text: u.name }), h("span", { class: "who__sub", text: u.role === "owner" ? "Owner" : "Staff" })));
    avatarPhone.replaceChildren(avatar(u, "sm"));
  };
  const paintCounts = () => {
    const c = session.counts || {};
    const set = (key, n) => {
      $$(`[data-badge="${key}"]`).forEach((b) => {
        b.textContent = n > 99 ? "99+" : n;
        b.hidden = !n;
      });
      $$(`[data-dot="${key}"]`).forEach((d) => (d.hidden = !n));
    };
    set("donations", c.pendingReports);
    set("inbox", c.unreadMessages);
    const any = (c.pendingReports || 0) + (c.unreadMessages || 0) > 0;
    $$(".icon-btn .dot").forEach((d) => (d.hidden = !any));
  };
  session.on(paintUser);
  session.on(paintCounts);
  paintUser();
  paintCounts();

  // subtle border under the bars once the page scrolls
  const onScroll = () => {
    const s = window.scrollY > 4;
    top.classList.toggle("is-scrolled", s);
    appbar.classList.toggle("is-scrolled", s);
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  // keep badge counts fresh
  setInterval(() => document.visibilityState === "visible" && refreshSession().catch(() => {}), 60000);
  window.addEventListener("focus", () => refreshSession().catch(() => {}));
  onChanged(() => refreshSession().catch(() => {}));

  if (!location.hash || location.hash === "#" || location.hash === "#/") location.replace("#/overview");
  else route();
}

/* ---------------- routing ---------------- */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs] = raw.split("?");
  const [name, ...params] = path.split("/").filter(Boolean);
  return { name: ROUTES[name] ? name : "overview", params, query: new URLSearchParams(qs || "") };
}

async function route() {
  if (!shell) return;
  const token = ++navToken;
  const { name, params, query } = parseHash();
  const r = ROUTES[name];
  closeOverlays();
  cleanups.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
  cleanups = [];
  guard = null;
  currentHash = location.hash;

  $$("[data-route]").forEach((a) => (a.dataset.route === name ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  setCrumbs([[r.title]]);
  document.title = `${r.title} · Fidelstine Console`;
  appTitle.textContent = r.title;

  const fresh = h("main", { class: "page", id: "page", tabindex: "-1" });
  page.replaceWith(fresh);
  page = fresh;
  window.scrollTo({ top: 0 });
  let mod;
  try {
    mod = await r.load();
  } catch (e) {
    page.append(h("div", { class: "card card--pad", text: "This page couldn't load. Check your connection and refresh." }));
    return;
  }
  if (token !== navToken) return;
  const ctx = {
    page,
    params,
    query,
    setCrumbs,
    setTitle: (t) => {
      appTitle.textContent = t;
      document.title = `${t} · Fidelstine Console`;
    },
    onLeave: (fn) => cleanups.push(fn),
    setGuard: (fn) => (guard = fn),
    alive: () => token === navToken,
  };
  try {
    await mod.default(ctx);
  } catch (e) {
    console.error(e);
    if (token === navToken) page.append(h("div", { class: "banner" }, icon("alert"), h("span", { class: "banner__text", text: e.message || "Something went wrong on this page." })));
  }
}

function setCrumbs(items) {
  crumbsEl.replaceChildren();
  items.forEach(([label, href], i) => {
    if (i) crumbsEl.append(icon("right"));
    crumbsEl.append(href ? h("a", { href, text: label }) : h(i === items.length - 1 ? "strong" : "span", { text: label }));
  });
}

window.addEventListener("hashchange", async () => {
  if (ignoreHash) {
    ignoreHash = false;
    return;
  }
  if (guard && location.hash !== currentHash) {
    const target = location.hash;
    ignoreHash = true;
    location.hash = currentHash;
    if (await guard()) {
      guard = null;
      location.hash = target;
    }
    return;
  }
  route();
});
window.addEventListener("beforeunload", (e) => {
  if (guard) {
    e.preventDefault();
    e.returnValue = "";
  }
});
phoneQuery.addEventListener("change", () => shell && !guard && route());

/* ---------------- popovers ---------------- */
function popover(anchor, build) {
  if (!anchor || isPhone()) {
    const ov = overlay({ kind: "drawer" });
    build(ov.body, () => ov.close(), ov);
    return;
  }
  $(".pop")?.remove();
  const r = anchor.getBoundingClientRect();
  const pop = h("div", { class: "pop", role: "menu" });
  const close = () => {
    pop.remove();
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", esc);
  };
  const outside = (e) => !pop.contains(e.target) && !anchor.contains(e.target) && close();
  const esc = (e) => e.key === "Escape" && close();
  build(pop, close);
  document.body.append(pop);
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  const left = Math.min(Math.max(8, r.right - pw), innerWidth - pw - 8);
  const topPos = r.bottom + 8 + ph > innerHeight ? Math.max(8, r.top - ph - 8) : r.bottom + 8;
  Object.assign(pop.style, { left: `${left}px`, top: `${topPos + window.scrollY}px` });
  setTimeout(() => {
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", esc);
  });
}

function notifications(anchor) {
  popover(anchor, (box, close, ov) => {
    ov?.setTitle("Notifications");
    const c = session.counts || {};
    const items = [];
    if (c.pendingReports)
      items.push(h("a", { class: "pop__item", href: "#/donations?kind=reports", onclick: close }, h("span", { class: "kpi__icon kpi__icon--gold" }, icon("gift")), h("span", null, h("strong", { text: `${c.pendingReports} gift${c.pendingReports === 1 ? "" : "s"} to check` }), h("span", { class: "who__sub", style: { display: "block" }, text: "Donors say they've sent these. Confirm once you see the money." }))));
    if (c.unreadMessages)
      items.push(h("a", { class: "pop__item", href: "#/inbox", onclick: close }, h("span", { class: "kpi__icon kpi__icon--navy" }, icon("mail")), h("span", null, h("strong", { text: `${c.unreadMessages} unread message${c.unreadMessages === 1 ? "" : "s"}` }), h("span", { class: "who__sub", style: { display: "block" }, text: "From the website's contact form." }))));
    box.append(anchor ? h("div", { class: "pop__head" }, h("strong", { text: "Notifications" })) : "", ...(items.length ? items : [h("div", { class: "empty", style: { padding: "22px" } }, h("div", { class: "empty__icon" }, icon("check-circle")), h("h3", { text: "You're all caught up" }), h("p", { text: "Nothing needs your attention right now." }))]));
  });
}

function userMenu(anchor) {
  popover(anchor, (box, close, ov) => {
    const u = session.user;
    ov?.setTitle("Your account");
    const item = (ic, label, fn) => h("button", { class: "pop__item", type: "button", onclick: () => (close(), fn()) }, icon(ic), label);
    box.append(
      h("div", { class: "pop__head row" }, avatar(u, "lg"), h("div", { class: "who__text" }, h("strong", { class: "who__name", text: u.name }), h("span", { class: "who__sub", text: u.email }))),
      h("hr"),
      item("user", "Your profile", () => go("#/settings/profile")),
      item("users", "Team", () => go("#/settings/team")),
      item(document.documentElement.dataset.theme === "dark" ? "sun" : "moon", document.documentElement.dataset.theme === "dark" ? "Light mode" : "Dark mode", toggleTheme),
      h("a", { class: "pop__item", href: cfg.site.url, target: "_blank", rel: "noopener", onclick: close }, icon("external"), "Open the website"),
      h("hr"),
      item("logout", "Sign out", signOut)
    );
  });
}

function moreSheet() {
  const ov = overlay({ kind: "drawer", title: "More" });
  const link = (key) => h("a", { class: "pop__item", href: `#/${key}`, onclick: () => ov.close() }, icon(ROUTES[key].icon), ROUTES[key].title, h("span", { style: { marginLeft: "auto" } }, icon("right", "i--sm")));
  ov.body.append(
    h("div", { class: "stack stack--sm" }, ["content", "media", "subscribers", "activity", "settings"].map(link)),
    h("hr", { class: "divider" }),
    h("div", { class: "stack stack--sm" },
      h("button", { class: "pop__item", type: "button", onclick: () => (ov.close(), palette()) }, icon("search"), "Search"),
      h("button", { class: "pop__item", type: "button", onclick: () => (toggleTheme(), ov.close()) }, icon(document.documentElement.dataset.theme === "dark" ? "sun" : "moon"), document.documentElement.dataset.theme === "dark" ? "Light mode" : "Dark mode"),
      h("a", { class: "pop__item", href: cfg.site.url, target: "_blank", rel: "noopener" }, icon("external"), "Open the website"),
      h("button", { class: "pop__item", type: "button", onclick: () => (ov.close(), signOut()) }, icon("logout"), "Sign out")
    )
  );
}

async function signOut() {
  await api("/login", { method: "DELETE" }).catch(() => {});
  session.set({ user: null });
  shell = null;
  renderLogin();
  toast("You've signed out.");
}

/* ---------------- command palette ---------------- */
let paletteOpen = false;
function palette() {
  if (paletteOpen || !shell) return;
  paletteOpen = true;
  const prev = document.activeElement;
  const scrim = h("div", { class: "scrim" });
  const inp = h("input", { type: "text", placeholder: "Search pages, actions and donors…", "aria-label": "Search", autocomplete: "off" });
  const list = h("div", { class: "cmdk__list", role: "listbox" });
  const box = h("div", { class: "cmdk", role: "dialog", "aria-label": "Search" }, h("div", { class: "cmdk__input" }, icon("search"), inp, h("kbd", { text: "Esc" })), list, h("div", { class: "cmdk__foot" }, h("span", null, h("kbd", { text: "↑↓" }), " move"), h("span", null, h("kbd", { text: "Enter" }), " open")));
  document.body.append(scrim, box);
  const close = () => {
    paletteOpen = false;
    scrim.remove();
    box.remove();
    prev?.focus?.();
  };
  scrim.addEventListener("click", close);
  const record = () => import("./views/record.js").then((m) => m.openRecord());
  const actions = [
    ...Object.entries(ROUTES).map(([k, r]) => ({ group: "Go to", label: r.title, icon: r.icon, run: () => go(`#/${k}`) })),
    { group: "Actions", label: "Record a donation", icon: "plus", run: record },
    { group: "Actions", label: "Check gifts donors reported", icon: "gift", run: () => go("#/donations?kind=reports") },
    { group: "Actions", label: "Upload photos", icon: "upload", run: () => go("#/media?upload=1") },
    { group: "Actions", label: "Post an announcement", icon: "megaphone", run: () => go("#/content/announcement") },
    { group: "Actions", label: "Update the Christmas Scheme", icon: "gift", run: () => go("#/content/campaign") },
    { group: "Actions", label: "Update impact numbers", icon: "chart", run: () => go("#/content/impact") },
    { group: "Actions", label: "Add a team member", icon: "user-plus", run: () => go("#/settings/team") },
    { group: "Actions", label: "Switch light or dark mode", icon: "moon", run: toggleTheme },
    { group: "Actions", label: "Sign out", icon: "logout", run: signOut },
  ];
  let shown = [];
  let sel = 0;
  let donors = [];
  const paint = () => {
    const q = inp.value.trim().toLowerCase();
    const base = actions.filter((a) => !q || a.label.toLowerCase().includes(q));
    shown = [...base, ...donors];
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.replaceChildren();
    let group = "";
    shown.forEach((a, i) => {
      if (a.group !== group) {
        group = a.group;
        list.append(h("div", { class: "cmdk__group", text: group }));
      }
      const it = h("button", { class: "cmdk__item", type: "button", role: "option", "aria-selected": String(i === sel) }, a.avatar || icon(a.icon), h("span", { class: "truncate", text: a.label }), a.hint ? h("small", { text: a.hint }) : null);
      it.addEventListener("click", () => (close(), a.run()));
      it.addEventListener("mousemove", () => {
        if (sel !== i) {
          sel = i;
          $$(".cmdk__item", list).forEach((x, j) => x.setAttribute("aria-selected", String(j === sel)));
        }
      });
      list.append(it);
    });
    if (!shown.length) list.append(h("div", { class: "empty", style: { padding: "26px" } }, h("p", { text: "Nothing matches. Try a donor's name or a page." })));
  };
  const findDonors = debounce(async (q) => {
    if (q.length < 2) {
      donors = [];
      paint();
      return;
    }
    try {
      const data = await api(`/donations?status=&q=${encodeURIComponent(q)}`);
      donors = data.items.slice(0, 6).map((d) => ({ group: "Donors", label: d.donor_name, avatar: avatar(d, "xs"), hint: `${minorMoney(d.amount, d.currency)} · ${relTime(d.created_at)}`, run: () => go(`#/donations?q=${encodeURIComponent(d.donor_name)}&status=&open=${d.id}`) }));
      if (paletteOpen) paint();
    } catch {}
  }, 250);
  inp.addEventListener("input", () => {
    sel = 0;
    paint();
    findDonors(inp.value.trim());
  });
  box.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % Math.max(1, shown.length);
      $$(".cmdk__item", list).forEach((x, j) => x.setAttribute("aria-selected", String(j === sel)));
      $$(".cmdk__item", list)[sel]?.scrollIntoView({ block: "nearest" });
    }
    if (e.key === "Enter" && shown[sel]) {
      e.preventDefault();
      const a = shown[sel];
      close();
      a.run();
    }
  });
  paint();
  inp.focus();
}
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    palette();
  }
});

document.addEventListener("console:sign-out", signOut);
document.addEventListener("console:palette", () => palette());
boot();
