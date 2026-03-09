// routes/telegram.flow.superadminFinance.js

import { clearSession } from "../utils/session.js";
import { sendMessage } from "../services/telegramApi.js";
import { upsertSetting, getSetting } from "../repositories/settingsRepo.js";
import { CALLBACKS } from "./telegram.constants.js";
import {
  buildFinanceKeyboard,
  buildFinancePricingKeyboard,
  buildFinanceClassPricingKeyboard,
} from "./callbacks/keyboards.js";

function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "Rp 0";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function formatClassLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "bronze") return "Bronze";
  if (raw === "gold") return "Gold";
  if (raw === "platinum") return "Platinum";
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "-";
}

function formatDurationLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "1d") return "1 Hari";
  if (raw === "3d") return "3 Hari";
  if (raw === "7d") return "7 Hari";
  return "1 Bulan";
}

function getPriceKey(classId, durationCode) {
  return `payment_price_${classId}_${durationCode}`;
}

async function getFinanceManualOn(env) {
  const raw = (await getSetting(env, "payment_manual_enabled")) ?? "1";
  return String(raw) !== "0";
}

async function buildFinanceClassText(env, classId) {
  const key1d = `payment_price_${classId}_1d`;
  const key3d = `payment_price_${classId}_3d`;
  const key7d = `payment_price_${classId}_7d`;
  const key1m = `payment_price_${classId}_1m`;

  const price1d = Number((await getSetting(env, key1d)) || 0);
  const price3d = Number((await getSetting(env, key3d)) || 0);
  const price7d = Number((await getSetting(env, key7d)) || 0);
  const price1m = Number((await getSetting(env, key1m)) || 0);

  return [
    `🏷️ <b>Pricing ${formatClassLabel(classId)}</b>`,
    "",
    `1 Hari: <b>${formatMoney(price1d)}</b>`,
    `3 Hari: <b>${formatMoney(price3d)}</b>`,
    `7 Hari: <b>${formatMoney(price7d)}</b>`,
    `1 Bulan: <b>${formatMoney(price1m)}</b>`,
  ].join("\n");
}

function getClassMenuCallback(classId) {
  if (classId === "bronze") return CALLBACKS.SUPERADMIN_FINANCE_PRICING_BRONZE_MENU;
  if (classId === "gold") return CALLBACKS.SUPERADMIN_FINANCE_PRICING_GOLD_MENU;
  return CALLBACKS.SUPERADMIN_FINANCE_PRICING_PLATINUM_MENU;
}

function buildPromptKeyboard(classId) {
  return {
    inline_keyboard: [
      [
        { text: "⬅️ Back", callback_data: getClassMenuCallback(classId) },
        { text: "🏠 Officer Home", callback_data: CALLBACKS.OFFICER_HOME },
      ],
    ],
  };
}

export async function handleSuperadminFinanceInput({ env, chatId, text, session, STATE_KEY }) {
  const raw = String(text || "").trim();

  const area = String(session?.area || "").trim().toLowerCase();
  const classId = String(session?.class_id || "").trim().toLowerCase();
  const durationCode = String(session?.duration_code || "").trim().toLowerCase();

  const validClass = ["bronze", "gold", "platinum"].includes(classId);
  const validDuration = ["1d", "3d", "7d", "1m"].includes(durationCode);

  if (/^(batal|cancel|keluar)$/i.test(raw)) {
    await clearSession(env, STATE_KEY);

    if (area === "price" && validClass) {
      await sendMessage(env, chatId, "✅ Oke, input harga dibatalkan.", {
        parse_mode: "HTML",
        reply_markup: buildFinanceClassPricingKeyboard(classId),
      });

      await sendMessage(env, chatId, await buildFinanceClassText(env, classId), {
        parse_mode: "HTML",
        reply_markup: buildFinanceClassPricingKeyboard(classId),
      });

      return true;
    }

    const manualOn = await getFinanceManualOn(env);
    await sendMessage(env, chatId, "✅ Oke, input finance dibatalkan.", {
      reply_markup: buildFinanceKeyboard(manualOn),
    });
    return true;
  }

  if (area !== "price" || !validClass || !validDuration) {
    await clearSession(env, STATE_KEY);

    const manualOn = await getFinanceManualOn(env);
    await sendMessage(env, chatId, "⚠️ Mode Finance tidak dikenal. Balik ke menu.", {
      reply_markup: buildFinanceKeyboard(manualOn),
    });
    return true;
  }

  const cleaned = raw.replace(/[^\d]/g, "");
  const amount = Number(cleaned);

  if (!Number.isFinite(amount) || amount <= 0) {
    await sendMessage(
      env,
      chatId,
      [
        `⚠️ Nominal tidak valid untuk <b>${formatClassLabel(classId)} - ${formatDurationLabel(durationCode)}</b>.`,
        "",
        "Kirim angka harga tanpa simbol.",
        "Contoh: <code>150000</code>",
        "",
        "Ketik <b>batal</b> untuk keluar.",
      ].join("\n"),
      {
        parse_mode: "HTML",
        reply_markup: buildPromptKeyboard(classId),
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
    `✅ Harga <b>${formatClassLabel(classId)}</b> untuk <b>${formatDurationLabel(durationCode)}</b> berhasil diupdate menjadi <b>${formatMoney(amount)}</b>.`,
    {
      parse_mode: "HTML",
      reply_markup: buildFinanceClassPricingKeyboard(classId),
    }
  );

  await sendMessage(env, chatId, await buildFinanceClassText(env, classId), {
    parse_mode: "HTML",
    reply_markup: buildFinanceClassPricingKeyboard(classId),
  });

  return true;
}
