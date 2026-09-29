// Donations: tabs (all / needs checking / offline / online), search and filters, per-currency totals,
// a table on laptops and cards on phones, infinite scroll, and a detail drawer with actions.
import { api, changed, onChanged, session } from "../api.js";
import { go } from "../nav.js";
import {
  h, icon, cfg, isPhone, avatar, minorMoney, money, relTime, fmtDateTime, campaignTitle, statusPill, empty, skeleton,
  overlay, confirmDialog, toast, busy, copy, debounce, select, input, seg, field, $,
} from "../ui.js";

const METHODS = ["GTBank transfer", "PayPal", "Cash", "Other", "Card", "card", "bank_transfer", "ussd"];
const methodLabel = (m) => ({ card: "Card", bank_transfer: "Bank transfer", ussd: "USSD", mobilemoneyghana: "Mobile money" })[m] || m || "Card";
const isOffline = (d) => /^(MAN|REP)-/.test(d.tx_ref);
const donorName = (d) => (d.anonymous ? `${d.donor_name} (anonymous)` : d.donor_name);

export default async function donations(ctx) {
  const q = ctx.query;
  const f = {
    kind: q.get("kind") || "all",
    status: q.has("status") ? q.get("status") : q.get("kind") === "reports" ? "pending" : "successful",
    campaign: q.get("campaign") || "",
    currency: q.get("currency") || "",
    method: q.get("method") || "",
    from: q.get("from") || "",
    to: q.get("to") || "",
    q: q.get("q") || "",
  };
  let cursor = null;
  let loading = false;

  const exportLink = h("a", { class: "btn", href: "#" }, icon("download"), "Export CSV");
  ctx.page.append(
    h("div", { class: "ph" }, h("div", null, h("h1", { class: "ph__title", text: "Donations" }), h("p", { class: "ph__sub", text: "Every gift, online and offline. Tap one for the details." })), h("div", { class: "ph__actions" }, exportLink))
  );

  const tabs = seg(
    [
      ["all", "All"],
      ["reports", "Needs checking", session.counts.pendingReports || ""],
      ["offline", "Bank & PayPal"],
      ["online", "Online"],
    ],
    f.kind,
    (v) => {
      f.kind = v;
      f.status = v === "reports" ? "pending" : v === "all" ? "successful" : "";
      statusSel.value = f.status;
      load();
    }
  );
  const search = input({ type: "search", placeholder: "Search name, email or reference", value: f.q, "aria-label": "Search donations" });
  const statusSel = select([["", "Any status"], ["successful", "Received"], ["pending", "Pending"], ["failed", "Failed"], ["abandoned", "Abandoned"]], f.status, { "aria-label": "Status" });
  const campSel = select([["", "All campaigns"], ...Object.entries(cfg.money.campaigns).map(([k, c]) => [k, c.title])], f.campaign, { "aria-label": "Campaign" });
  const moreBtn = h("button", { class: "btn", type: "button" }, icon("filter"), "Filters", h("span", { class: "count count--soft", hidden: true }));
  const paintMore = () => {
    const n = ["currency", "method", "from", "to"].filter((k) => f[k]).length + (isPhone() ? ["status", "campaign"].filter((k) => f[k] && !(k === "status" && f.status === "successful")).length : 0);
    const c = moreBtn.querySelector(".count");
    c.textContent = n;
    c.hidden = !n;
  };
  search.addEventListener("input", debounce(() => ((f.q = search.value.trim()), load()), 300));
  statusSel.addEventListener("change", () => ((f.status = statusSel.value), load()));
  campSel.addEventListener("change", () => ((f.campaign = campSel.value), load()));
  moreBtn.addEventListener("click", filtersSheet);
  ctx.page.append(
    h("div", { class: "stack stack--sm" }, tabs.el, h("div", { class: "toolbar" }, h("div", { class: "search" }, icon("search"), search), isPhone() ? null : statusSel, isPhone() ? null : campSel, moreBtn))
  );

  const totals = h("div", { class: "chips" });
  const list = h("div");
  const sentinel = h("div", { class: "more-row" });
  ctx.page.append(totals, list, sentinel);

  const io = new IntersectionObserver((e) => e[0].isIntersecting && cursor && !loading && load(true), { rootMargin: "400px" });
  io.observe(sentinel);
  ctx.onLeave(() => io.disconnect());
  ctx.onLeave(onChanged((what) => what === "donations" && load()));

  function params(extra = {}) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v && k !== "kind") p.set(k, v);
    if (f.kind !== "all") p.set("kind", f.kind);
    p.set("status", f.status || "");
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p;
  }

  async function load(more = false) {
    loading = true;
    exportLink.href = `/api/admin/donations?${params({ format: "csv" })}`;
    paintMore();
    if (!more) {
      cursor = null;
      list.replaceChildren(skeleton("list", 6));
      sentinel.replaceChildren();
    }
    try {
      const data = await api(`/donations?${params(more && cursor ? { cursor } : {})}`);
      if (!ctx.alive()) return;
      if (!more) {
        totals.replaceChildren(...data.totals.map((t) => h("span", { class: "pill pill--plain", style: { height: "30px", padding: "0 12px" } }, h("b", { class: "num", text: minorMoney(t.total, t.currency) }), h("span", { class: "faint", text: `· ${t.count} gift${t.count === 1 ? "" : "s"}` }))));
        list.replaceChildren();
        if (!data.items.length) {
          list.append(
            empty({
              iconName: f.kind === "reports" ? "check-circle" : "heart",
              title: f.kind === "reports" ? "Nothing to check" : "No donations match",
              text: f.kind === "reports" ? "When donors tell you they've sent a gift, it appears here for you to confirm." : "Try a different search, tab or filter.",
            })
          );
        }
      }
      render(data.items);
      cursor = data.nextCursor;
      sentinel.replaceChildren(cursor ? h("button", { class: "btn btn--soft", type: "button", text: "Load more", onclick: () => load(true) }) : data.items.length && !more ? h("span", { class: "faint", text: "That's everything." }) : "");
      const openId = Number(q.get("open"));
      if (!more && openId) {
        const d = data.items.find((x) => x.id === openId);
        if (d) openDonation(d);
      }
    } catch (e) {
      list.replaceChildren(empty({ iconName: "alert", title: "Couldn't load donations", text: e.message }));
    } finally {
      loading = false;
    }
  }

  function render(items) {
    if (isPhone()) {
      let wrap = list.querySelector(".tcards");
      if (!wrap) list.append((wrap = h("div", { class: "tcards" })));
      items.forEach((d, i) => {
        const card = h(
          "button",
          { class: "tcard", type: "button", style: { "--i": i % 12 }, "aria-label": `${donorName(d)}, ${minorMoney(d.amount, d.currency)}` },
          avatar(d),
          h("div", { style: { minWidth: 0 } }, h("div", { class: "who__name", text: donorName(d) }), h("div", { class: "tcard__meta" }, h("span", { text: campaignTitle(d.campaign) }), "·", h("span", { text: relTime(d.created_at) }))),
          h("div", { style: { display: "grid", justifyItems: "end", gap: "4px" } }, h("span", { class: "tcard__amount", text: minorMoney(d.amount, d.currency) }), statusPill(d.status, d.tx_ref))
        );
        card.addEventListener("click", () => openDonation(d));
        wrap.append(card);
      });
      return;
    }
    let tbody = list.querySelector("tbody");
    if (!tbody) {
      tbody = h("tbody");
      list.append(
        h("div", { class: "card table-wrap" }, h("table", { class: "table" }, h("thead", null, h("tr", null, ["Donor", "Amount", "Campaign", "Method", "Date", "Status", ""].map((t, i) => h("th", { class: i === 1 ? "right" : "", text: t })))), tbody))
      );
    }
    items.forEach((d) => {
      const tr = h(
        "tr",
        { class: "is-link", tabindex: "0" },
        h("td", null, h("div", { class: "who" }, avatar(d, "sm"), h("div", { class: "who__text" }, h("span", { class: "who__name", text: donorName(d) }), h("span", { class: "who__sub", text: d.donor_email || d.tx_ref })))),
        h("td", { class: "right amount", text: minorMoney(d.amount, d.currency) }),
        h("td", null, h("span", { class: "pill pill--plain", text: campaignTitle(d.campaign) })),
        h("td", { class: "muted", text: methodLabel(d.payment_type) }),
        h("td", { class: "muted", title: fmtDateTime(d.created_at), text: relTime(d.created_at) }),
        h("td", null, statusPill(d.status, d.tx_ref)),
        h("td", { class: "right faint" }, icon("right", "i--sm"))
      );
      tr.addEventListener("click", () => openDonation(d));
      tr.addEventListener("keydown", (e) => e.key === "Enter" && openDonation(d));
      tbody.append(tr);
    });
  }

  function filtersSheet() {
    const ov = overlay({ kind: "drawer", title: "Filter donations" });
    const cur = select([["", "Any currency"], ...Object.keys(cfg.money.currencies).map((c) => [c, c])], f.currency);
    const meth = select([["", "Any method"], ...["GTBank transfer", "PayPal", "Cash", "Other", "card", "bank_transfer", "ussd"].map((m) => [m, methodLabel(m)])], f.method);
    const from = input({ type: "date", value: f.from });
    const to = input({ type: "date", value: f.to });
    const st = select([["", "Any status"], ["successful", "Received"], ["pending", "Pending"], ["failed", "Failed"], ["abandoned", "Abandoned"]], f.status);
    const cp = select([["", "All campaigns"], ...Object.entries(cfg.money.campaigns).map(([k, c]) => [k, c.title])], f.campaign);
    ov.body.append(h("div", { class: "form-grid" }, isPhone() ? field("Status", st) : null, isPhone() ? field("Campaign", cp) : null, field("Currency", cur), field("Method", meth), field("From", from), field("To", to)));
    ov.showFoot(
      h("button", { class: "btn btn--ghost spacer", type: "button", text: "Clear all", onclick: () => ((f.currency = f.method = f.from = f.to = ""), isPhone() && (f.campaign = ""), ov.close(), load()) }),
      h("button", {
        class: "btn btn--primary",
        type: "button",
        text: "Show results",
        onclick: () => {
          Object.assign(f, { currency: cur.value, method: meth.value, from: from.value, to: to.value });
          if (isPhone()) Object.assign(f, { status: st.value, campaign: cp.value });
          statusSel.value = f.status;
          campSel.value = f.campaign;
          ov.close();
          load();
        },
      })
    );
  }

  await load();
}

/** Full details of one donation, with confirm / remove for bank & PayPal entries. */
export function openDonation(d, { onChange } = {}) {
  const ov = overlay({ kind: "drawer", title: donorName(d), subtitle: d.tx_ref });
  const offline = isOffline(d);
  const row = (label, value) => (value ? h("div", null, h("dt", { text: label }), h("dd", null, value)) : null);
  const copyBtn = (text) => h("button", { class: "icon-btn icon-btn--sm", type: "button", "aria-label": "Copy", onclick: () => copy(text, "Reference copied") }, icon("copy", "i--sm"));
  ov.body.append(
    ...[
    h("div", { class: "stack stack--sm" }, h("div", { class: "row row--between row--wrap" }, h("span", { class: "hero-amount", text: minorMoney(d.amount, d.currency) }), statusPill(d.status, d.tx_ref)), d.amount_settled ? h("p", { class: "faint", text: `Settled: ${money(d.amount_settled, "NGN")}` }) : null),
    d.status === "pending" && d.tx_ref.startsWith("REP-") ? h("div", { class: "banner" }, icon("alert"), h("span", { class: "banner__text", text: "The donor says they sent this. Check your GTBank or PayPal account, then confirm it." })) : null,
    h("div", null, h("p", { class: "section-label", text: "Donor" }), h("dl", { class: "dl" }, row("Name", donorName(d)), row("Email", d.donor_email && h("a", { class: "link", href: `mailto:${d.donor_email}`, text: d.donor_email })), row("Phone", d.donor_phone && h("a", { class: "link", href: `tel:${d.donor_phone}`, text: d.donor_phone })), row("Country", d.donor_country))),
    h(
      "div",
      null,
      h("p", { class: "section-label", text: "Gift" }),
      h(
        "dl",
        { class: "dl" },
        row("For", campaignTitle(d.campaign)),
        row("Method", methodLabel(d.payment_type)),
        row("Date", fmtDateTime(d.created_at)),
        row("Confirmed", d.verified_at && fmtDateTime(d.verified_at)),
        row("Thank-you email", d.receipt_sent_at ? `Sent ${fmtDateTime(d.receipt_sent_at)}` : d.donor_email ? "Not sent yet" : ""),
        row("Reference", h("span", { class: "row" }, h("code", { text: d.tx_ref }), copyBtn(d.tx_ref)))
      )
    ),
    d.message ? h("div", null, h("p", { class: "section-label", text: "Message from the donor" }), h("p", { class: "note-box", text: d.message })) : null,
    d.notes ? h("div", null, h("p", { class: "section-label", text: "Notes" }), h("p", { class: "note-box", text: d.notes.split(" | ").join("\n") })) : null,
    ].filter(Boolean)
  );

  const actions = [];
  if (d.donor_email) actions.push(h("a", { class: "btn spacer", href: `mailto:${d.donor_email}?subject=${encodeURIComponent("Thank you from Fidelstine")}` }, icon("mail"), "Email donor"));
  if (offline) {
    const rm = h("button", { class: "btn btn--danger", type: "button" }, icon("trash"), "Remove");
    rm.addEventListener("click", async () => {
      const ok = await confirmDialog({ title: "Remove this donation?", text: `${minorMoney(d.amount, d.currency)} from ${d.donor_name} will be taken out of the totals. Only do this if it was entered by mistake.`, confirmLabel: "Remove" });
      if (!ok) return;
      try {
        await busy(rm, () => api(`/gifts/${d.id}`, { method: "DELETE" }));
        toast("Donation removed", { type: "ok" });
        ov.close();
        changed("donations");
        onChange?.();
      } catch (e) {
        toast(e.message, { type: "bad" });
      }
    });
    actions.push(rm);
  }
  if (offline && d.status === "pending") {
    const ok = h("button", { class: "btn btn--ok", type: "button" }, icon("check"), "Confirm received");
    ok.addEventListener("click", async () => {
      try {
        const r = await busy(ok, () => api(`/gifts/${d.id}`, { method: "PATCH", body: { status: "successful" } }));
        toast(`Confirmed. ${r.emailed ? "A thank-you email is on its way." : "It now counts in the totals."}`, { type: "ok" });
        ov.close();
        changed("donations");
        onChange?.();
      } catch (e) {
        toast(e.message, { type: "bad" });
      }
    });
    actions.push(ok);
  }
  if (actions.length) ov.showFoot(...actions);
  return ov;
}
