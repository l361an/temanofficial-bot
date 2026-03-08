// routes/telegram.flow.superadminFinance.js

import { clearSession } from "../utils/session.js";
import { sendMessage } from "../services/telegramApi.js";
import { upsertSetting } from "../repositories/settingsRepo.js";
import { CALLBACKS } from "./telegram.constants.js";
import { buildFinanceKeyboard } from "./callbacks/keyboards.js";

function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "Rp 0";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function getPriceKey(classId) {
  return `payment_price_${classId}_1m`;
}

function getPriceLabel(classId) {
  const raw = String(classId || "").trim().toLowerCase();
  if (raw === "bronze") return "Bronze";
  if (raw === "gold") return "Gold";
  if (raw === "platinum") return "Platinum";
  return raw || "-";
}

function buildBackKeyboard() {
  return {
    inline_keyboard: [[{ text: "💰 Finance", callback_data: CALLBACKS.SUPERADMIN_FINANCE_MENU }]],
  };
}

export async function handleSuperadminFinanceInput({ env, chatId, text, session, STATE_KEY }) {
  const raw = String(text || "").trim();

  if (/^(batal|cancel|keluar)$/i.test(raw)) {
    await clearSession(env, STATE_KEY);
    await sendMessage(env, chatId, "✅ Oke, input harga dibatalkan.", {
      reply_markup: buildBackKeyboard(),
    });
    return true;
  }

  const area = String(session?.area || "");
  const classId = String(session?.class_id || "").trim().toLowerCase();

  if (area !== "price" || !["bronze", "gold", "platinum"].includes(classId)) {
    await clearSession(env, STATE_KEY);
    await sendMessage(env, chatId, "⚠️ Mode Finance tidak dikenal. Balik ke menu.", {
      reply_markup: buildBackKeyboard(),
    });
    return true;
  }

  const cleaned = raw.replace(/[^\d]/g, "");
  const amount = Number(cleaned);

  if (!Number.isFinite(amount) || amount <= 0) {
    await sendMessage(
      env,
      chatId,
      "⚠️ Nominal tidak valid.\nKirim angka harga tanpa simbol.\nContoh: 150000\n\nKetik batal untuk keluar."
    );
    return true;
  }

  const key = getPriceKey(classId);
  await upsertSetting(env, key, String(amount));
  await clearSession(env, STATE_KEY);

  await sendMessage(
    env,
    chatId,
    `✅ Harga class ${getPriceLabel(classId)} berhasil diupdate menjadi ${formatMoney(amount)}.`,
    {
      reply_markup: buildBackKeyboard(),
    }
  );
  return true;
}
