// utils/categoryFlow.js
//
// Shared category flow utilities
// - render numbered category list message
// - parse input like "1,3,5" (NO SKIP, must choose at least 1)
// - map chosen indexes -> category ids

import { listCategories } from "../repositories/categoriesRepo.js";

export async function loadCategoriesForChoice(env) {
  const cats = await listCategories(env);
  return Array.isArray(cats) ? cats : [];
}

export function buildCategoryChoiceMessage(categories, { title = "🧾 Tipe Layanan" } = {}) {
  const cats = Array.isArray(categories) ? categories : [];

  if (!cats.length) {
    return `${title}\n\n- (belum ada kategori)`;
  }

  let msg = `${title}\nPilih minimal 1 kategori (boleh lebih dari satu).\n\n`;
  cats.forEach((c, i) => {
    msg += `${i + 1}. ${String(c.kode ?? "-")}\n`;
  });
  msg += `\nKetik nomor pilihan dipisah koma.\nContoh: 1,3`;
  return msg;
}

export function parseMultiIndexInputRequired(text, max) {
  const raw = String(text || "").trim();

  // wajib pilih minimal 1
  if (!raw) return { ok: false, reason: "empty" };

  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (!parts.length) return { ok: false, reason: "empty" };

  const nums = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return { ok: false, reason: "nan" };
    const n = Number(p);
    if (!Number.isInteger(n) || n < 1 || n > max) return { ok: false, reason: "range" };
    nums.push(n);
  }

  const uniq = Array.from(new Set(nums));
  if (!uniq.length) return { ok: false, reason: "empty" };

  return { ok: true, indexes: uniq };
}

export function mapIndexesToCategoryIds(indexes, categories) {
  const cats = Array.isArray(categories) ? categories : [];
  const idxs = Array.isArray(indexes) ? indexes : [];
  const picked = idxs.map((n) => cats[n - 1]).filter(Boolean);
  return picked.map((c) => c.id).filter(Boolean);
}
