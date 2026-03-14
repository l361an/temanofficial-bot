// routes/callbacks/partner.utils.js

import { escapeHtml } from "./shared.js";

export function fmtKV(label, value) {
  const v = value === null || value === undefined || value === "" ? "-" : String(value);
  return `• <b>${escapeHtml(label)}:</b> ${escapeHtml(v)}`;
}

export function encodeSelectedCategoryIds(ids = []) {
  return Array.from(
    new Set(
      (ids || [])
        .map((v) => String(v).trim())
        .filter(Boolean)
    )
  ).sort();
}
