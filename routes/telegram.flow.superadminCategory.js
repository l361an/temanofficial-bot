// routes/telegram.flow.superadminCategory.js

import { clearSession } from "../utils/session.js";
import { sendMessage } from "../services/telegramApi.js";
import { addCategory, delCategoryByKode } from "../repositories/categoriesRepo.js";

export async function handleSuperadminCategoryInput({ env, chatId, text, session, STATE_KEY }) {
  const raw = String(text || "").trim();

  if (/^(batal|cancel|keluar)$/i.test(raw)) {
    await clearSession(env, STATE_KEY);
    await sendMessage(env, chatId, "✅ Oke, dibatalkan.\nBalik ke Category menu.", {
      reply_markup: { inline_keyboard: [[{ text: "🗂️ Category", callback_data: "sa:cat:menu" }]] },
    });
    return true;
  }

  const action = String(session?.action || "");
  const kode = raw;

  if (!kode) {
    await sendMessage(env, chatId, "⚠️ Kode kategori kosong. Kirim ulang, atau ketik <b>batal</b>.", {
      parse_mode: "HTML",
    });
    return true;
  }

  if (action === "add") {
    const res = await addCategory(env, kode);
    await clearSession(env, STATE_KEY);

    if (!res.ok) {
      const msg =
        res.reason === "exists"
          ? `⚠️ Kategori "${kode}" sudah ada.`
          : res.reason === "empty"
            ? "⚠️ Kode kategori kosong."
            : "⚠️ Gagal menambah kategori.";
      await sendMessage(env, chatId, msg, {
        reply_markup: { inline_keyboard: [[{ text: "🗂️ Category", callback_data: "sa:cat:menu" }]] },
      });
      return true;
    }

    await sendMessage(env, chatId, `✅ Kategori ditambahkan: ${res.kode}`, {
      reply_markup: { inline_keyboard: [[{ text: "🗂️ Category", callback_data: "sa:cat:menu" }]] },
    });
    return true;
  }

  if (action === "del") {
    const res = await delCategoryByKode(env, kode);
    await clearSession(env, STATE_KEY);

    if (!res.ok) {
      const msg =
        res.reason === "not_found"
          ? `⚠️ Kategori "${kode}" tidak ditemukan.`
          : res.reason === "empty"
            ? "⚠️ Kode kategori kosong."
            : "⚠️ Gagal menghapus kategori.";
      await sendMessage(env, chatId, msg, {
        reply_markup: { inline_keyboard: [[{ text: "🗂️ Category", callback_data: "sa:cat:menu" }]] },
      });
      return true;
    }

    await sendMessage(env, chatId, `✅ Kategori dihapus: ${res.kode}`, {
      reply_markup: { inline_keyboard: [[{ text: "🗂️ Category", callback_data: "sa:cat:menu" }]] },
    });
    return true;
  }

  await clearSession(env, STATE_KEY);
  await sendMessage(env, chatId, "⚠️ Aksi Category tidak dikenal. Balik ke menu.", {
    reply_markup: { inline_keyboard: [[{ text: "🗂️ Category", callback_data: "sa:cat:menu" }]] },
  });
  return true;
}
