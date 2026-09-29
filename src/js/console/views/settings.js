// Settings: your profile (photo, name, password), the team (owners add, edit, reset and remove people),
// and the site (console address, payments, emails, appearance).
import { api, session, refreshSession } from "../api.js";
import { setTheme, themeMode, signOut } from "../nav.js";
import { h, icon, cfg, avatar, relTime, fmtDate, empty, skeleton, toast, busy, confirmDialog, overlay, field, input, select, switchEl, passwordInput, strengthMeter, generatePassword, copy, seg } from "../ui.js";
import { uploadPhoto, pickFiles } from "../images.js";

const TABS = [["profile", "Your profile"], ["team", "Team"], ["site", "Site and appearance"]];
const stamp = (s) => (s && !s.endsWith("Z") ? `${s}Z` : s);

export default async function settings(ctx) {
  const tab = TABS.some(([k]) => k === ctx.params[0]) ? ctx.params[0] : "profile";
  ctx.setCrumbs([["Settings", "#/settings"], [TABS.find(([k]) => k === tab)[1]]]);
  ctx.page.append(
    h("div", { class: "ph" }, h("div", null, h("h1", { class: "ph__title", text: "Settings" }), h("p", { class: "ph__sub", text: "Your account, the team and how the console looks." }))),
    h("nav", { class: "tabs" }, TABS.map(([k, label]) => h("a", { href: `#/settings/${k}`, text: label, "aria-current": k === tab ? "page" : undefined })))
  );
  const body = h("div");
  ctx.page.append(body);
  if (tab === "profile") profile(body);
  if (tab === "team") await team(body, ctx);
  if (tab === "site") site(body);
}

const block = (title, text, ...content) => h("section", { class: "settings-grid" }, h("div", null, h("h3", { text: title }), text ? h("p", { class: "muted", text }) : null), h("div", { class: "stack", style: { maxWidth: "560px" } }, ...content));

/* ---------------- profile ---------------- */
function profile(body) {
  const u = session.user;
  if (!u.id) {
    body.append(block("Your profile", "", h("p", { class: "muted", text: "You're signed in with a development or Cloudflare Access login, which has no profile to edit." })));
    return;
  }
  const photo = h("div");
  const paintPhoto = () => photo.replaceChildren(avatar(session.user, "xl"));
  const change = h("button", { class: "btn", type: "button" }, icon("camera"), "Change photo");
  const remove = h("button", { class: "btn btn--ghost", type: "button", text: "Remove", hidden: !u.avatarId });
  change.addEventListener("click", async () => {
    const [file] = await pickFiles();
    if (!file) return;
    try {
      const img = await busy(change, () => uploadPhoto(file, { kind: "avatar", inGallery: false, alt: session.user.name }));
      const r = await api("/me", { method: "PUT", body: { avatarId: img.id } });
      session.set({ user: { ...session.user, avatarId: r.user.avatarId } });
      paintPhoto();
      remove.hidden = false;
      toast("Profile photo updated", { type: "ok" });
    } catch (e) {
      toast(e.message, { type: "bad" });
    }
  });
  remove.addEventListener("click", async () => {
    try {
      await busy(remove, () => api("/me", { method: "PUT", body: { avatarId: "" } }));
      session.set({ user: { ...session.user, avatarId: null } });
      paintPhoto();
      remove.hidden = true;
    } catch (e) {
      toast(e.message, { type: "bad" });
    }
  });
  paintPhoto();

  const name = input({ value: u.name, maxLength: 60, autocomplete: "name" });
  const saveName = h("button", { class: "btn btn--primary", type: "button", text: "Save" });
  saveName.addEventListener("click", async () => {
    try {
      const r = await busy(saveName, () => api("/me", { method: "PUT", body: { name: name.value.trim() } }));
      session.set({ user: { ...session.user, name: r.user.name } });
      toast("Name updated", { type: "ok" });
    } catch (e) {
      toast(e.message, { type: "bad" });
    }
  });

  const cur = passwordInput({ autocomplete: "current-password" });
  const next = passwordInput({ autocomplete: "new-password" });
  const again = passwordInput({ autocomplete: "new-password" });
  const savePw = h("button", { class: "btn btn--primary", type: "button", text: "Change password" });
  savePw.addEventListener("click", async () => {
    if (next.input.value !== again.input.value) return toast("The new passwords don't match.", { type: "bad" });
    try {
      await busy(savePw, () => api("/me", { method: "PUT", body: { currentPassword: cur.input.value, newPassword: next.input.value } }));
      [cur, next, again].forEach((p) => (p.input.value = ""));
      toast("Password changed. You're still signed in here.", { type: "ok" });
    } catch (e) {
      toast(e.message, { type: "bad" });
    }
  });

  body.append(
    block("Profile photo", "Shown next to your name in the console and the activity log.", h("div", { class: "profile-photo" }, photo, h("div", { class: "row row--wrap" }, change, remove))),
    block("Your details", "Your name appears on every change you make.", field("Name", name), field("Email", input({ value: u.email, disabled: true }), "You sign in with this. An owner can change it in Team."), h("div", null, saveName)),
    block("Password", "Use at least 10 characters. Changing it signs you out on other devices.", field("Current password", cur.el), h("div", { class: "field" }, h("label", { text: "New password" }), next.el, strengthMeter(next.input)), field("New password again", again.el), h("div", null, savePw))
  );
}

/* ---------------- team ---------------- */
async function team(body, ctx) {
  const me = session.user;
  const owner = me.role === "owner";
  const addBtn = h("button", { class: "btn btn--primary", type: "button", hidden: !owner }, icon("user-plus"), "Add a person");
  const grid = h("div", { class: "people" }, skeleton("list", 3));
  body.append(block("Team", owner ? "Everyone who can use this console. Owners can add people, reset passwords and manage access." : "Everyone who can use this console. Only owners can make changes here.", h("div", null, addBtn)), grid);

  let items = [];
  const load = async () => {
    try {
      items = (await api("/staff")).items;
      if (ctx.alive()) paint();
    } catch (e) {
      grid.replaceChildren(empty({ iconName: "alert", title: "Couldn't load the team", text: e.message }));
    }
  };
  const paint = () => {
    if (!items.length) {
      grid.replaceChildren(empty({ iconName: "users", title: "No accounts yet", text: owner ? "Add the people who help run Fidelstine. Each person gets their own sign-in." : "An owner can add people here." }));
      return;
    }
    grid.replaceChildren(
      ...items.map((p, i) => {
        const menu = h("button", { class: "icon-btn icon-btn--sm", type: "button", "aria-label": `Manage ${p.name}`, hidden: !owner }, icon("more"));
        menu.addEventListener("click", () => manage(p));
        return h(
          "div",
          { class: "card person enter", style: { "--i": i } },
          h("div", { class: "person__top" }, avatar(p, "lg"), h("div", { class: "who__text", style: { flex: 1 } }, h("span", { class: "who__name", text: p.name + (p.id === me.id ? " (you)" : "") }), h("span", { class: "who__sub", text: p.email })), menu),
          h("div", { class: "person__foot" }, h("span", { class: `pill ${p.role === "owner" ? "pill--accent" : "pill--info"}`, text: p.role === "owner" ? "Owner" : "Staff" }), p.disabled ? h("span", { class: "pill pill--bad", text: "Switched off" }) : h("span", { text: p.lastLoginAt ? `Active ${relTime(stamp(p.lastLoginAt))}` : "Hasn't signed in yet" }))
        );
      })
    );
  };

  function credentials(title, person, password) {
    const ov = overlay({ kind: "modal", title, subtitle: "Share these privately, for example in a WhatsApp message. The password won't be shown again." });
    const link = location.origin + location.pathname;
    const text = `Fidelstine staff console\n${link}\nEmail: ${person.email}\nPassword: ${password}`;
    ov.body.append(
      h("div", { class: "stack stack--sm" }, h("span", { class: "label", text: "Console address" }), h("div", { class: "secret" }, h("span", { text: link }))),
      h("div", { class: "stack stack--sm" }, h("span", { class: "label", text: "Email" }), h("div", { class: "secret" }, h("span", { text: person.email }))),
      h("div", { class: "stack stack--sm" }, h("span", { class: "label", text: "Password" }), h("div", { class: "secret" }, h("span", { text: password })))
    );
    ov.showFoot(h("button", { class: "btn", type: "button", text: "Done", onclick: () => ov.close() }), h("button", { class: "btn btn--primary", type: "button", onclick: () => copy(text, "Sign-in details copied") }, icon("copy"), "Copy all"));
  }

  addBtn.addEventListener("click", () => {
    const ov = overlay({ kind: "modal", title: "Add a person", subtitle: "They'll sign in with their email and the password below." });
    const name = input({ autofocus: true, maxLength: 60 });
    const email = input({ type: "email", maxLength: 160 });
    const role = select([["editor", "Staff: everything except managing the team"], ["owner", "Owner: can also manage the team"]], "editor");
    const pw = input({ value: generatePassword() });
    const regen = h("button", { class: "icon-btn", type: "button", "aria-label": "Make a new password" }, icon("refresh"));
    regen.addEventListener("click", () => (pw.value = generatePassword()));
    ov.body.append(h("div", { class: "form-grid" }, field("Name", name), field("Email", email), h("div", { class: "span-2" }, field("Access", role)), h("div", { class: "span-2 field" }, h("label", { text: "Starting password" }), h("div", { class: "row" }, pw, regen), h("p", { class: "hint", text: "They can change it in Settings after signing in." }))));
    const save = h("button", { class: "btn btn--primary", type: "button" }, icon("check"), "Add person");
    ov.showFoot(h("button", { class: "btn", type: "button", text: "Cancel", onclick: () => ov.close() }), save);
    save.addEventListener("click", async () => {
      try {
        const r = await busy(save, () => api("/staff", { method: "POST", body: { name: name.value.trim(), email: email.value.trim(), role: role.value, password: pw.value } }));
        ov.close();
        items.push(r.item);
        paint();
        credentials(`${r.item.name} can now sign in`, r.item, pw.value);
      } catch (e) {
        toast(e.message, { type: "bad" });
      }
    });
  });

  function manage(p) {
    const ov = overlay({ kind: "drawer", title: p.name, subtitle: p.email });
    const name = input({ value: p.name, maxLength: 60 });
    const email = input({ type: "email", value: p.email, maxLength: 160 });
    const role = select([["editor", "Staff"], ["owner", "Owner"]], p.role);
    const active = switchEl("Can sign in", !p.disabled);
    const save = h("button", { class: "btn btn--primary", type: "button" }, icon("check"), "Save");
    const reset = h("button", { class: "btn", type: "button" }, icon("key"), "Reset password");
    const del = h("button", { class: "btn btn--danger spacer", type: "button", hidden: p.id === me.id }, icon("trash"), "Remove");
    ov.body.append(
      h("div", { class: "row" }, avatar(p, "lg"), h("div", { class: "who__text" }, h("span", { class: "who__name", text: p.name }), h("span", { class: "who__sub", text: `Added ${fmtDate(stamp(p.createdAt))}` }))),
      field("Name", name),
      field("Email", email),
      field("Access", role),
      active.el,
      h("div", null, reset)
    );
    ov.showFoot(del, save);
    const patch = async (bodyData, btn) => {
      const r = await busy(btn, () => api(`/staff/${p.id}`, { method: "PATCH", body: bodyData }));
      Object.assign(p, r.item);
      paint();
      if (p.id === me.id) refreshSession().catch(() => {});
      return r;
    };
    save.addEventListener("click", async () => {
      try {
        await patch({ name: name.value.trim(), email: email.value.trim(), role: role.value, disabled: !active.box.checked }, save);
        toast("Saved", { type: "ok" });
        ov.close();
      } catch (e) {
        toast(e.message, { type: "bad" });
      }
    });
    reset.addEventListener("click", async () => {
      const ok = await confirmDialog({ title: `Reset ${p.name}'s password?`, text: "They'll be signed out everywhere and will need the new password to sign in.", confirmLabel: "Reset password", danger: false, iconName: "key" });
      if (!ok) return;
      const pw = generatePassword();
      try {
        await patch({ password: pw }, reset);
        ov.close();
        credentials("New password ready", p, pw);
      } catch (e) {
        toast(e.message, { type: "bad" });
      }
    });
    del.addEventListener("click", async () => {
      const ok = await confirmDialog({ title: `Remove ${p.name}?`, text: "They won't be able to sign in any more. Their past changes stay in the activity log.", confirmLabel: "Remove" });
      if (!ok) return;
      try {
        await busy(del, () => api(`/staff/${p.id}`, { method: "DELETE" }));
        items = items.filter((x) => x.id !== p.id);
        paint();
        ov.close();
        toast(`${p.name} removed`, { type: "ok" });
      } catch (e) {
        toast(e.message, { type: "bad" });
      }
    });
  }

  await load();
}

/* ---------------- site ---------------- */
function site(body) {
  const st = session.status || {};
  const status = (iconName, tone, title, text, action) =>
    h("div", { class: "card status-item" }, h("span", { class: "status-item__icon", style: { background: `var(--${tone}-soft)`, color: `var(--${tone})` } }, icon(iconName)), h("div", { style: { flex: 1, minWidth: 0 } }, h("strong", { text: title }), h("p", { class: "muted", style: { fontSize: "13px" }, text })), action);
  const themeSeg = seg([["light", "Light"], ["dark", "Dark"], ["system", "Match my device"]], themeMode(), (v) => setTheme(v));
  const link = location.origin + location.pathname;
  body.append(
    block(
      "Console address",
      "Only people with this link can find the sign-in page. Keep it private and bookmark it.",
      h("div", { class: "secret" }, h("span", { text: link }), h("button", { class: "btn btn--sm", type: "button", onclick: () => copy(link, "Address copied") }, icon("copy", "i--sm"), "Copy"))
    ),
    block(
      "How the site is set up",
      "What's switched on right now.",
      h(
        "div",
        { class: "status-list" },
        cfg.site.onlineGiving
          ? status("zap", "ok", "Card payments are live", "Donors can pay by card, bank transfer and USSD through Flutterwave.")
          : status("bank", "warn", "Giving is by bank transfer and PayPal", "Card payments switch on once the Flutterwave account is approved. Record those gifts under Donations."),
        st.emailReady ? status("mail", "ok", "Thank-you emails are on", "Donors with an email address get a thank-you when their gift is recorded or confirmed.") : status("mail", "warn", "Thank-you emails are off", "They start once the charity's domain and email service are connected. Everything else works."),
        status("globe", "info", "Public website", cfg.site.url.replace(/^https?:\/\//, ""), h("a", { class: "btn btn--sm", href: cfg.site.url, target: "_blank", rel: "noopener" }, icon("external", "i--sm"), "Open"))
      )
    ),
    block("Appearance", "Choose how the console looks on this device.", themeSeg.el),
    block("Sign out", "Sign out of the console on this device.", h("div", null, h("button", { class: "btn", type: "button", onclick: signOut }, icon("logout"), "Sign out")))
  );
}
