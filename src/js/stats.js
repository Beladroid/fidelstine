// Loads the latest impact numbers (editable by staff in the admin panel) into the stats row.
// The numbers built into the page are shown until the latest ones arrive.
import { $, $$ } from "./util.js";

export default async function initStats() {
  const root = $("[data-stats]");
  if (!root) return;
  let data;
  try {
    const res = await fetch("/api/stats", { headers: { Accept: "application/json" } });
    if (!res.ok) return;
    data = await res.json();
  } catch {
    return; // offline or static preview: keep the built-in numbers
  }
  for (const item of data.items || []) {
    const stat = $(`[data-stat-key="${CSS.escape(item.key)}"]`, root);
    if (!stat) continue;
    const num = $(".stat__num", stat);
    const label = $(".stat__label", stat);
    num.dataset.count = item.value;
    num.dataset.suffix = item.suffix || "";
    // if the count-up animation already ran, show the new figure directly
    if (num.dataset.counted) num.textContent = Number(item.value).toLocaleString("en") + (item.suffix || "");
    if (label && item.label) label.textContent = item.label;
  }
}
