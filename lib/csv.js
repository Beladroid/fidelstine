// CSV export with quoting, and protection against spreadsheet formula injection
// (cells starting with = + - @ are prefixed with an apostrophe).
export function toCsv(rows) {
  if (!rows || !rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}
