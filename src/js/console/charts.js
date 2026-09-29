// Hand-made SVG charts: area/line, bars, donut, sparkline, progress ring. Animated, with tooltips.
import { h, svgEl, reduced } from "./ui.js";

const W = 800;

/** Smooth path through points (monotone cubic, so the line never overshoots). */
function smooth(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : "";
  const n = pts.length;
  const d = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0] || 1));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  let p = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const dx = (x1 - x0) / 3;
    p += ` C${x0 + dx},${y0 + m[i] * dx} ${x1 - dx},${y1 - m[i + 1] * dx} ${x1},${y1}`;
  }
  return p;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/**
 * Area chart. data: [{ label, tip, value }]. Returns the element.
 * format(value) formats axis labels and tooltips.
 */
export function areaChart(data, { height = 260, format = String, color = "var(--c2)", kind = "area" } = {}) {
  const wrap = h("div", { class: "chart", style: { height: `${height}px` } });
  if (!data.length || data.every((d) => !d.value)) {
    wrap.append(h("div", { class: "chart-empty", text: "No gifts in this period yet. They'll appear here as they come in." }));
    return wrap;
  }
  const padL = 58, padR = 12, padT = 16, padB = 30;
  const H = height;
  const max = niceMax(Math.max(...data.map((d) => d.value)) * 1.1);
  const x = (i) => padL + (data.length === 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (data.length - 1));
  const y = (v) => padT + (1 - v / max) * (H - padT - padB);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", role: "img", "aria-label": "Chart of gifts over time" });

  for (let g = 0; g <= 4; g++) {
    const v = (max / 4) * g;
    svg.append(svgEl("line", { class: "grid-line", x1: padL, x2: W - padR, y1: y(v), y2: y(v), "vector-effect": "non-scaling-stroke" }));
  }
  const id = `g${Math.random().toString(36).slice(2, 7)}`;
  if (kind === "bars") {
    const bw = Math.max(4, ((W - padL - padR) / data.length) * 0.62);
    data.forEach((d, i) => {
      const cx = padL + ((i + 0.5) * (W - padL - padR)) / data.length;
      const r = svgEl("rect", { class: "bar", x: cx - bw / 2, y: y(d.value), width: bw, height: Math.max(0, H - padB - y(d.value)), rx: 5, style: `--i:${i}` });
      r.dataset.i = i;
      svg.append(r);
    });
  } else {
    const pts = data.map((d, i) => [x(i), y(d.value)]);
    const line = smooth(pts);
    const defs = svgEl("defs");
    const grad = svgEl("linearGradient", { id, x1: 0, x2: 0, y1: 0, y2: 1 });
    grad.append(svgEl("stop", { offset: "0%", "stop-color": color, "stop-opacity": "0.28" }), svgEl("stop", { offset: "100%", "stop-color": color, "stop-opacity": "0" }));
    // the line draws itself from left to right: a clip rectangle grows across the chart
    const clip = svgEl("clipPath", { id: `${id}c` });
    const clipRect = svgEl("rect", { x: 0, y: 0, width: reduced() ? W : 0, height: H });
    clip.append(clipRect);
    defs.append(grad, clip);
    svg.append(defs);
    const g = svgEl("g", { "clip-path": `url(#${id}c)` });
    g.append(
      svgEl("path", { class: "area", d: `${line} L${pts[pts.length - 1][0]},${H - padB} L${pts[0][0]},${H - padB} Z`, fill: `url(#${id})` }),
      svgEl("path", { class: "line", d: line, style: `stroke:${color}`, "vector-effect": "non-scaling-stroke" })
    );
    svg.append(g);
    if (!reduced()) {
      const t0 = performance.now();
      const grow = (now) => {
        const p = Math.min(Math.max(0, (now - t0) / 1300), 1);
        clipRect.setAttribute("width", W * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(grow);
      };
      requestAnimationFrame(grow);
    }
  }
  const cursor = svgEl("line", { class: "cursor", y1: padT, y2: H - padB, "vector-effect": "non-scaling-stroke" });
  svg.append(cursor);
  wrap.append(svg);

  // axis labels as HTML so they don't stretch with the SVG
  const axisY = h("div", { style: { position: "absolute", left: 0, top: 0, bottom: 0, width: "52px", pointerEvents: "none" } });
  for (let g = 0; g <= 4; g++) {
    const v = (max / 4) * g;
    axisY.append(h("span", { class: "axis", text: format(v, true), style: { position: "absolute", right: "6px", top: `${(y(v) / H) * 100}%`, transform: "translateY(-50%)", fontSize: "11px", color: "var(--text-3)" } }));
  }
  const axisX = h("div", { style: { position: "absolute", left: `${(padL / W) * 100}%`, right: `${(padR / W) * 100}%`, bottom: "4px", height: "16px", pointerEvents: "none" } });
  const every = Math.max(1, Math.ceil(data.length / 7));
  data.forEach((d, i) => {
    if (i % every && i !== data.length - 1) return;
    const left = kind === "bars" ? ((i + 0.5) / data.length) * 100 : data.length === 1 ? 50 : (i / (data.length - 1)) * 100;
    axisX.append(h("span", { text: d.label, style: { position: "absolute", left: `${left}%`, transform: "translateX(-50%)", fontSize: "11px", color: "var(--text-3)", whiteSpace: "nowrap" } }));
  });
  const dot = h("span", { style: { position: "absolute", width: "12px", height: "12px", borderRadius: "50%", background: "var(--surface)", border: `3px solid ${color}`, transform: "translate(-50%,-50%)", pointerEvents: "none", opacity: 0, transition: "opacity .15s" } });
  const tip = h("div", { class: "tip" });
  wrap.append(axisY, axisX, dot, tip);

  const show = (clientX) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let i;
    if (kind === "bars") i = Math.floor(((px - padL) / (W - padL - padR)) * data.length);
    else i = Math.round(((px - padL) / (W - padL - padR)) * (data.length - 1));
    i = Math.max(0, Math.min(data.length - 1, i));
    const d = data[i];
    const cx = kind === "bars" ? padL + ((i + 0.5) * (W - padL - padR)) / data.length : x(i);
    const cy = y(d.value);
    cursor.setAttribute("x1", cx);
    cursor.setAttribute("x2", cx);
    const lx = (cx / W) * r.width;
    const ly = (cy / H) * r.height;
    dot.style.left = `${lx}px`;
    dot.style.top = `${ly}px`;
    dot.style.opacity = kind === "bars" ? 0 : 1;
    tip.replaceChildren(h("strong", { text: format(d.value) }), h("span", { text: d.tip || d.label }));
    tip.style.left = `${Math.min(Math.max(lx, 70), r.width - 70)}px`;
    tip.style.top = `${ly}px`;
    wrap.classList.add("is-hover");
    svg.querySelectorAll(".bar").forEach((b) => b.classList.toggle("is-on", Number(b.dataset.i) === i));
  };
  const hide = () => {
    wrap.classList.remove("is-hover");
    dot.style.opacity = 0;
    svg.querySelectorAll(".bar.is-on").forEach((b) => b.classList.remove("is-on"));
  };
  svg.addEventListener("pointermove", (e) => show(e.clientX));
  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("touchend", () => setTimeout(hide, 1600));
  return wrap;
}

/** Donut with legend. segments: [{ label, value, color, sub }] */
export function donut(segments, { center = "", centerSub = "", format = String } = {}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const el = h("div", { class: "donut" });
  const r = 60;
  const c = 2 * Math.PI * r;
  const svg = svgEl("svg", { viewBox: "0 0 150 150", "aria-hidden": "true" });
  svg.append(svgEl("circle", { cx: 75, cy: 75, r, stroke: "var(--surface-3)" }));
  let offset = 0;
  const arcs = [];
  for (const s of segments) {
    const len = total ? (s.value / total) * c : 0;
    const arc = svgEl("circle", { cx: 75, cy: 75, r, stroke: s.color, "stroke-dasharray": `0 ${c}`, "stroke-dashoffset": -offset });
    arc.append(svgEl("title"));
    arc.firstChild.textContent = `${s.label}: ${format(s.value)}`;
    svg.append(arc);
    arcs.push([arc, `${Math.max(0, len - 2)} ${c}`]);
    offset += len;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => arcs.forEach(([a, v]) => a.setAttribute("stroke-dasharray", v))));
  el.append(
    h("div", { class: "donut__wrap" }, svg, h("div", { class: "donut__center" }, h("div", null, h("strong", { text: center }), h("span", { text: centerSub })))),
    h(
      "ul",
      { class: "legend" },
      segments.map((s) => h("li", null, h("i", { style: { background: s.color } }), h("span", { class: "truncate", text: s.label }), h("b", { text: total ? `${Math.round((s.value / total) * 100)}%` : "0%" })))
    )
  );
  return el;
}

/** Horizontal bars. rows: [{ label, value, display }] */
export function hbars(rows) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const el = h("div", { class: "hbars" });
  const fills = [];
  for (const r of rows) {
    const fill = h("div", { class: "hbar__fill" });
    fills.push([fill, `${(r.value / max) * 100}%`]);
    el.append(h("div", null, h("div", { class: "hbar__top" }, h("span", { class: "truncate", text: r.label }), h("b", { class: "num", text: r.display })), h("div", { class: "hbar__track" }, fill)));
  }
  requestAnimationFrame(() => requestAnimationFrame(() => fills.forEach(([f, w]) => (f.style.width = w))));
  return el;
}

export function sparkline(values, color = "var(--c2)") {
  const w = 160, hgt = 56;
  const svg = svgEl("svg", { class: "kpi__spark", viewBox: `0 0 ${w} ${hgt}`, preserveAspectRatio: "none", "aria-hidden": "true" });
  if (values.length < 2 || values.every((v) => !v)) return svg;
  const max = Math.max(...values) || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, hgt - 6 - (v / max) * (hgt - 14)]);
  const line = smooth(pts);
  const id = `s${Math.random().toString(36).slice(2, 7)}`;
  const defs = svgEl("defs");
  const g = svgEl("linearGradient", { id, x1: 0, x2: 0, y1: 0, y2: 1 });
  g.append(svgEl("stop", { offset: "0%", "stop-color": color, "stop-opacity": "0.22" }), svgEl("stop", { offset: "100%", "stop-color": color, "stop-opacity": "0" }));
  defs.append(g);
  svg.append(defs, svgEl("path", { d: `${line} L${w},${hgt} L0,${hgt} Z`, fill: `url(#${id})` }), svgEl("path", { d: line, fill: "none", stroke: color, "stroke-width": 2, "vector-effect": "non-scaling-stroke" }));
  return svg;
}

export function ring(pct, label) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const fg = svgEl("circle", { class: "ring__fg", cx: 38, cy: 38, r, "stroke-dasharray": c, "stroke-dashoffset": c });
  const svg = svgEl("svg", { viewBox: "0 0 76 76", "aria-hidden": "true" });
  svg.append(svgEl("circle", { class: "ring__bg", cx: 38, cy: 38, r }), fg);
  const el = h("div", { class: "ring" }, svg, h("span", { class: "ring__label", text: label }));
  const target = c * (1 - Math.min(1, Math.max(0, pct)));
  if (reduced()) fg.setAttribute("stroke-dashoffset", target);
  else requestAnimationFrame(() => requestAnimationFrame(() => fg.setAttribute("stroke-dashoffset", target)));
  return el;
}
