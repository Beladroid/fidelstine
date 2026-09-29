// Overview: greeting, headline figures, gifts over time, where gifts go, recent gifts, activity
// and quick actions. Amounts in other currencies are shown in naira using the console's exchange rates.
import { api, session, onChanged } from "../api.js";
import { go } from "../nav.js";
import { h, icon, cfg, isPhone, avatar, ngn, number, minorMoney, relTime, campaignTitle, countUp, skeleton, empty, seg, firstName, plural } from "../ui.js";
import { areaChart, donut, hbars, sparkline, ring } from "../charts.js";
import { activityIcon, activityText } from "./activity.js";

const DAY = 864e5;
const key = (d) => d.toISOString().slice(0, 10);
const COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c5)", "var(--c4)", "var(--c6)"];

function greeting() {
  const hr = new Date().getHours();
  return hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
}

export default async function overview(ctx) {
  const u = session.user;
  ctx.page.append(
    h(
      "div",
      { class: "ph" },
      h("div", null, h("h1", { class: "ph__title", text: `${greeting()}, ${firstName(u?.name)}` }), h("p", { class: "ph__sub", text: `${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · here's how Fidelstine is doing.` })),
      isPhone() ? null : h("div", { class: "ph__actions" }, h("a", { class: "btn", href: cfg.site.url, target: "_blank", rel: "noopener" }, icon("external"), "View website"))
    )
  );
  const body = h("div", { class: "stack stack--lg" }, skeleton("kpis"), h("div", { class: "sk sk-block", style: { height: "320px" } }));
  ctx.page.append(body);

  const load = async () => {
    const data = await api("/overview");
    if (ctx.alive()) paint(data);
  };
  ctx.onLeave(onChanged(() => load().catch(() => {})));
  try {
    await load();
  } catch (e) {
    body.replaceChildren(empty({ iconName: "alert", title: "Couldn't load the overview", text: e.message }));
  }

  function paint(d) {
    const byDay = new Map(d.series.map((s) => [s.d, s]));
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    let month = 0, monthN = 0, prev = 0, prevN = 0;
    for (const s of d.series) {
      const t = new Date(s.d);
      if (t >= monthStart) (month += s.ngn), (monthN += s.n);
      else if (t >= prevStart) (prev += s.ngn), (prevN += s.n);
    }
    const last30 = Array.from({ length: 30 }, (_, i) => byDay.get(key(new Date(now.getTime() - (29 - i) * DAY)))?.ngn || 0);

    const delta = (a, b) => {
      if (!b) return a ? h("span", { class: "delta delta--up" }, icon("trend-up"), "New") : h("span", { class: "delta delta--flat", text: "—" });
      const p = Math.round(((a - b) / b) * 100);
      return h("span", { class: `delta ${p > 0 ? "delta--up" : p < 0 ? "delta--down" : "delta--flat"}` }, icon(p >= 0 ? "trend-up" : "trend-down"), `${Math.abs(p)}%`);
    };
    const kpi = (label, iconName, tone, valueEl, foot, extra) =>
      h("div", { class: "card kpi enter", style: { "--i": 0 } }, h("div", { class: "kpi__top" }, h("span", { class: "kpi__label", text: label }), h("span", { class: `kpi__icon kpi__icon--${tone}` }, icon(iconName))), valueEl, h("div", { class: "kpi__foot" }, foot), extra);

    const v1 = h("div", { class: "kpi__value" });
    const v2 = h("div", { class: "kpi__value" });
    const v4 = h("div", { class: "kpi__value" });
    countUp(v1, month, (n) => ngn(n, { compact: isPhone() }));
    countUp(v2, monthN, (n) => number(Math.round(n)));
    countUp(v4, d.counts.subscribers, (n) => number(Math.round(n)));

    const camp = d.campaign;
    const pct = camp.targetNGN ? camp.raisedNGN / camp.targetNGN : 0;
    const daysLeft = Math.max(0, Math.ceil((new Date(camp.endsAt) - now) / DAY));
    const campCard = h(
      "a",
      { class: "card kpi kpi--ring card--hover enter kpi--wide", href: "#/content/campaign", style: { "--i": 2 } },
      ring(pct, `${Math.round(pct * 100)}%`),
      h("div", { class: "stack stack--sm", style: { minWidth: 0 } }, h("span", { class: "kpi__label" }, icon("gift", "i--sm"), "Christmas Scheme"), h("div", { class: "kpi__value", style: { fontSize: "22px" }, text: ngn(camp.raisedNGN, { compact: true }) }), h("div", { class: "kpi__foot" }, `of ${ngn(camp.targetNGN, { compact: true })} · ${daysLeft ? `${plural(daysLeft, "day")} left` : "closed"}`))
    );

    const kpis = h(
      "div",
      { class: "grid grid-4" },
      kpi("Raised this month", "wallet", "red", v1, [delta(month, prev), h("span", { text: "vs last month" })], sparkline(last30)),
      kpi("Gifts this month", "heart", "navy", v2, [delta(monthN, prevN), h("span", { text: `${plural(d.counts.donors, "donor")} in total` })]),
      campCard,
      kpi("Newsletter subscribers", "users", "green", v4, [h("span", { class: `delta ${d.counts.subscribersThisMonth ? "delta--up" : "delta--flat"}`, text: `+${d.counts.subscribersThisMonth}` }), h("span", { text: "this month" })])
    );
    [...kpis.children].forEach((c, i) => c.style.setProperty("--i", i));

    // attention
    const attention = [];
    if (d.counts.pendingReports) attention.push(h("div", { class: "banner" }, icon("gift"), h("span", { class: "banner__text", text: `${plural(d.counts.pendingReports, "gift")} reported by donors ${d.counts.pendingReports === 1 ? "needs" : "need"} checking against GTBank or PayPal.` }), h("a", { class: "btn btn--sm", href: "#/donations?kind=reports", text: "Check now" })));
    if (d.counts.unreadMessages) attention.push(h("div", { class: "banner banner--info" }, icon("mail"), h("span", { class: "banner__text", text: `${plural(d.counts.unreadMessages, "unread message")} from the website.` }), h("a", { class: "btn btn--sm", href: "#/inbox", text: "Open inbox" })));

    // chart
    let range = "90";
    const chartBox = h("div", { class: "card__body" });
    const drawChart = () => {
      let pts;
      if (range === "365") {
        pts = Array.from({ length: 12 }, (_, i) => {
          const m = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
          const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
          const v = d.series.filter((s) => new Date(s.d) >= m && new Date(s.d) < next).reduce((a, s) => a + s.ngn, 0);
          return { label: m.toLocaleDateString("en-GB", { month: "short" }), tip: m.toLocaleDateString("en-GB", { month: "long", year: "numeric" }), value: v };
        });
      } else if (range === "90") {
        pts = Array.from({ length: 13 }, (_, i) => {
          const end = new Date(now.getTime() - (12 - i) * 7 * DAY);
          let v = 0, n = 0;
          for (let k = 0; k < 7; k++) {
            const s = byDay.get(key(new Date(end.getTime() - k * DAY)));
            if (s) (v += s.ngn), (n += s.n);
          }
          const start = new Date(end.getTime() - 6 * DAY);
          return { label: start.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), tip: `Week of ${start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ${plural(n, "gift")}`, value: v };
        });
      } else {
        const n = Number(range);
        pts = Array.from({ length: n }, (_, i) => {
          const day = new Date(now.getTime() - (n - 1 - i) * DAY);
          const s = byDay.get(key(day));
          return { label: day.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), tip: `${day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · ${plural(s?.n || 0, "gift")}`, value: s?.ngn || 0 };
        });
      }
      chartBox.replaceChildren(areaChart(pts, { height: isPhone() ? 210 : 280, kind: range === "365" ? "bars" : "area", format: (v, axis) => ngn(v, { compact: axis }) }));
    };
    const rangeSeg = seg([["30", "30 days"], ["90", "90 days"], ["365", "12 months"]], range, (v) => ((range = v), drawChart()));
    const chartCard = h("div", { class: "card span-2 enter", style: { "--i": 4 } }, h("div", { class: "card__head" }, h("div", null, h("h2", { class: "card__title", text: "Gifts over time" }), h("p", { class: "card__sub", text: "All currencies, shown in naira" })), rangeSeg.el), chartBox);
    drawChart();

    // where gifts go
    const segs = d.byCampaign.slice(0, 6).map((c, i) => ({ label: c.title, value: c.ngn, color: COLORS[i % COLORS.length] }));
    const totalAll = d.byCampaign.reduce((a, c) => a + c.ngn, 0);
    const donutCard = h(
      "div",
      { class: "card enter", style: { "--i": 5 } },
      h("div", { class: "card__head" }, h("div", null, h("h2", { class: "card__title", text: "Where gifts go" }), h("p", { class: "card__sub", text: "All time, by campaign" }))),
      h("div", { class: "card__body" }, segs.length ? donut(segs, { center: ngn(totalAll, { compact: true }), centerSub: "raised in total", format: (v) => ngn(v) }) : h("div", { class: "chart-empty", style: { height: "180px" }, text: "No gifts yet." }))
    );

    // recent gifts
    const recent = h("div", { class: "feed" });
    if (!d.recent.length) recent.append(empty({ iconName: "heart", title: "No gifts yet", text: "Recorded and online gifts will appear here." }));
    d.recent.forEach((r, i) => {
      const it = h(
        "div",
        { class: "feed__item is-link", style: { "--i": i }, tabindex: "0", role: "button" },
        avatar(r, "sm"),
        h("div", { class: "who__text" }, h("span", { class: "who__name", text: r.anonymous ? `${r.donor_name} (anonymous)` : r.donor_name }), h("span", { class: "who__sub", text: `${campaignTitle(r.campaign)} · ${relTime(r.created_at)}` })),
        h("span", { class: "tcard__amount", style: { fontSize: "15px" }, text: minorMoney(r.amount, r.currency) })
      );
      it.addEventListener("click", () => go(`#/donations?q=${encodeURIComponent(r.tx_ref)}&status=&open=${r.id}`));
      recent.append(it);
    });
    const recentCard = h("div", { class: "card enter", style: { "--i": 6 } }, h("div", { class: "card__head" }, h("h2", { class: "card__title", text: "Latest gifts" }), h("a", { class: "link", href: "#/donations", text: "See all" })), h("div", { class: "card__body" }, recent));

    // how people give
    const methodsCard = h(
      "div",
      { class: "card enter", style: { "--i": 7 } },
      h("div", { class: "card__head" }, h("h2", { class: "card__title", text: "How people give" })),
      h("div", { class: "card__body" }, d.byMethod.length ? hbars(d.byMethod.map((m) => ({ label: m.key === "card" ? "Card" : m.key, value: m.ngn, display: `${ngn(m.ngn, { compact: true })} · ${m.n}` }))) : h("p", { class: "faint", text: "No gifts yet." }))
    );

    // activity
    const act = h("div", { class: "feed" });
    if (!d.activity.length) act.append(h("p", { class: "faint", text: "Changes made in the console will show here." }));
    d.activity.forEach((a, i) =>
      act.append(
        h(
          "div",
          { class: "feed__item", style: { "--i": i } },
          h("span", { class: "tl__icon", style: { width: "32px", height: "32px" } }, icon(activityIcon(a.action))),
          h("div", { class: "who__text" }, h("span", { class: "truncate", style: { fontSize: "13px" } }, h("strong", { text: a.actor }), ` ${activityText(a)}`), a.detail ? h("span", { class: "who__sub", text: a.detail }) : null),
          h("span", { class: "feed__time", text: relTime(a.at.endsWith("Z") ? a.at : a.at + "Z") })
        )
      )
    );
    const actCard = h("div", { class: "card enter", style: { "--i": 8 } }, h("div", { class: "card__head" }, h("h2", { class: "card__title", text: "Team activity" }), h("a", { class: "link", href: "#/activity", text: "See all" })), h("div", { class: "card__body" }, act));

    // quick actions
    const qa = (ic, label, hash) => h("a", { class: "card card--hover ccard", href: hash }, h("span", { class: "ccard__icon" }, icon(ic)), h("span", null, h("span", { class: "ccard__title", text: label })));
    const quick = h(
      "div",
      { class: "stack stack--sm" },
      h("h2", { class: "card__title", text: "Quick actions" }),
      h("div", { class: "grid grid-4" }, qa("upload", "Upload photos", "#/media?upload=1"), qa("megaphone", "Post an announcement", "#/content/announcement"), qa("chart", "Update impact numbers", "#/content/impact"), qa("quote", "Add a testimonial", "#/content/testimonials"))
    );

    body.replaceChildren(
      ...attention,
      kpis,
      h("div", { class: "grid grid-3" }, chartCard, donutCard),
      h("div", { class: "grid grid-3" }, recentCard, methodsCard, actCard),
      quick
    );
  }
}
