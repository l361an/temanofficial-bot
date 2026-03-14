// routes/callbacks/partner.category.js

import { CALLBACKS } from "../telegram.constants.js";
import { encodeSelectedCategoryIds } from "./partner.utils.js";

export const PM_CATEGORY_TOGGLE_PREFIX = "pm_cat_toggle:";
export const PM_CATEGORY_SAVE_PREFIX = "pm_cat_save:";
export const PM_CATEGORY_BACK_PREFIX = "pm_cat_back:";

export async function loadCategoryOptions(env) {
  const rows = await env.DB.prepare(
    `
    SELECT id, kode
    FROM categories
    ORDER BY kode ASC
  `
  ).all();

  return (rows?.results || []).map((row) => ({
    id: String(row.id),
    kode: String(row.kode || "").trim(),
  }));
}

export function buildCategoryPickerKeyboard(telegramId, categories = [], selectedIds = []) {
  const selectedSet = new Set(encodeSelectedCategoryIds(selectedIds));
  const rows = [];
  const max = Math.min(categories.length, 30);

  for (let i = 0; i < max; i += 2) {
    const a = categories[i];
    const b = categories[i + 1];
    const row = [];

    const aSelected = selectedSet.has(a.id);
    row.push({
      text: `${aSelected ? "✅ TERPILIH" : "⬜ PILIH"} • ${a.kode || a.id}`,
      callback_data: `${PM_CATEGORY_TOGGLE_PREFIX}${telegramId}:${a.id}`,
    });

    if (b) {
      const bSelected = selectedSet.has(b.id);
      row.push({
        text: `${bSelected ? "✅ TERPILIH" : "⬜ PILIH"} • ${b.kode || b.id}`,
        callback_data: `${PM_CATEGORY_TOGGLE_PREFIX}${telegramId}:${b.id}`,
      });
    }

    rows.push(row);
  }

  rows.push([
    {
      text: "💾 Simpan Category",
      callback_data: `${PM_CATEGORY_SAVE_PREFIX}${telegramId}`,
    },
  ]);

  rows.push([
    {
      text: "⬅️ Back",
      callback_data: `${PM_CATEGORY_BACK_PREFIX}${telegramId}`,
    },
    {
      text: "🏠 Officer Home",
      callback_data: CALLBACKS.OFFICER_HOME,
    },
  ]);

  return { inline_keyboard: rows };
}
