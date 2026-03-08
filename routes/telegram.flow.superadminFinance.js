// routes/telegram.flow.superadminFinance.js

import { clearSession } from "../utils/session.js";
import { sendMessage } from "../services/telegramApi.js";
import { upsertSetting } from "../repositories/settingsRepo.js";
import { CALLBACKS } from "./telegram.constants.js";
import {
  buildFinanceKeyboard,
  buildFinancePricingKeyboard,
} from "./callbacks/keyboards.js";

function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "Rp 0";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function getPriceKey(classId, durationCode) {
  return `payment_price_${classId}_${durationCode}`;
}

function getPriceLabel(classId) {
  const raw = String(classId || "").trim().toLowerCase();
  if (raw === "bronze") return "Bronze";
  if (raw === "gold") return "Gold";
  if (raw === "platinum") return "Platinum";
  return raw || "-";
}

function getDurationLabel(durationCode) {
  const raw = String(durationCode || "").trim().toLowerCase();
  if (raw === "1d") return "1 Hari";
  if (raw === "3d") return "3 Hari";
  if (raw === "7d") return "7 Hari";
  return "1 Bulan";
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
      reply_markup: buildFinancePricingKeyboard(),
    });
    return true;
  }

  const area = String(session?.area || "");
  const classId = String(session?.class_id || "").trim().toLowerCase();
  const durationCode = String(session?.duration_code || "").trim().toLowerCase();

  if (
    area !== "price" ||
    !["bronze", "gold", "platinum"].includes(classId) ||
    !["1d", "3d", "7d", "1m"].includes(durationCode)
  ) {
    await clearSession(env, STATE_KEY);
    await sendMessage(env, chatId, "⚠️ Mode Finance tidak dikenal. Balik ke menu.", {
      reply_markup: buildFinanceKeyboard(true),
    });
    return true;
  }

  const cleaned = raw.replace(/[^\d]/g, "");
  const amount = Number(cleaned);

  if (!Number.isFinite(amount) || amount <= 0) {
    await sendMessage(
      env,
      chatId,
      "⚠️ Nominal tidak valid.\nKirim angka harga tanpa simbol.\nContoh: 150000\n\nKetik batal untuk keluar.",
      {
        reply_markup: buildFinancePricingKeyboard(),
      }
    );
    return true;
  }

  const key = getPriceKey(classId, durationCode);
  await upsertSetting(env, key, String(amount));
  await clearSession(env, STATE_KEY);

  await sendMessage(
    env,
    chatId,
    `✅ Harga class ${getPriceLabel(classId)} untuk ${getDurationLabel(durationCode)} berhasil diupdate menjadi ${formatMoney(amount)}.`,
    {
      reply_markup: buildFinancePricingKeyboard(),
    }
  );
  return true;
}
