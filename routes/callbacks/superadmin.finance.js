// routes/callbacks/superadmin.finance.js

import { sendMessage, upsertCallbackMessage } from "../../services/telegramApi.js";
import { getSetting, upsertSetting } from "../../repositories/settingsRepo.js";
import { saveSession, clearSession } from "../../utils/session.js";

import {
  buildFinanceKeyboard,
  buildFinancePricingKeyboard,
  buildFinanceClassPricingKeyboard,
} from "./keyboards.js";

import { CALLBACKS, SESSION_MODES } from "../telegram.constants.js";
import { escapeHtml } from "./shared.js";

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

function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "Rp 0";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

async function getFinanceState(env) {
  const manualRaw = (await getSetting(env, "payment_manual_enabled")) ?? "1";
  const manualOn = String(manualRaw) !== "0";

  const keys = [
    "payment_price_bronze_1d",
    "payment_price_bronze_3d",
    "payment_price_bronze_7d",
    "payment_price_bronze_1m",

    "payment_price_gold_1d",
    "payment_price_gold_3d",
    "payment_price_gold_7d",
    "payment_price_gold_1m",

    "payment_price_platinum_1d",
    "payment_price_platinum_3d",
    "payment_price_platinum_7d",
    "payment_price_platinum_1m",
  ];

  const values = {};
  for (const key of keys) {
    values[key] = Number((await getSetting(env, key)) || 0);
  }

  return { manualOn, prices: values };
}

function buildFinanceText(state) {
  return [
    "💰 <b>Finance</b>",
    "",
    `Set Manual: <b>${state.manualOn ? "ON" : "OFF"}</b>`,
  ].join("\n");
}

function buildFinancePricingText(state) {
  return [
    "🏷️ <b>Set Pricing</b>",
    "",
    `Bronze 1 Hari: <b>${escapeHtml(formatMoney(state.prices.payment_price_bronze_1d))}</b>`,
    `Bronze 3 Hari: <b>${escapeHtml(formatMoney(state.prices.payment_price_bronze_3d))}</b>`,
    `Bronze 7 Hari: <b>${escapeHtml(formatMoney(state.prices.payment_price_bronze_7d))}</b>`,
    `Bronze 1 Bulan: <b>${escapeHtml(formatMoney(state.prices.payment_price_bronze_1m))}</b>`,
    "",
    `Gold 1 Hari: <b>${escapeHtml(formatMoney(state.prices.payment_price_gold_1d))}</b>`,
    `Gold 3 Hari: <b>${escapeHtml(formatMoney(state.prices.payment_price_gold_3d))}</b>`,
    `Gold 7 Hari: <b>${escapeHtml(formatMoney(state.prices.payment_price_gold_7d))}</b>`,
    `Gold 1 Bulan: <b>${escapeHtml(formatMoney(state.prices.payment_price_gold_1m))}</b>`,
    "",
    `Platinum 1 Hari: <b>${escapeHtml(formatMoney(state.prices.payment_price_platinum_1d))}</b>`,
    `Platinum 3 Hari: <b>${escapeHtml(formatMoney(state.prices.payment_price_platinum_3d))}</b>`,
    `Platinum 7 Hari: <b>${escapeHtml(formatMoney(state.prices.payment_price_platinum_7d))}</b>`,
    `Platinum 1 Bulan: <b>${escapeHtml(formatMoney(state.prices.payment_price_platinum_1m))}</b>`,
  ].join("\n");
}

function buildFinanceClassText(state, classId) {
  const key1d = `payment_price_${classId}_1d`;
  const key3d = `payment_price_${classId}_3d`;
  const key7d = `payment_price_${classId}_7d`;
  const key1m = `payment_price_${classId}_1m`;

  return [
    `🏷️ <b>Pricing ${escapeHtml(formatClassLabel(classId))}</b>`,
    "",
    `1 Hari: <b>${escapeHtml(formatMoney(state.prices[key1d]))}</b>`,
    `3 Hari: <b>${escapeHtml(formatMoney(state.prices[key3d]))}</b>`,
    `7 Hari: <b>${escapeHtml(formatMoney(state.prices[key7d]))}</b>`,
    `1 Bulan: <b>${escapeHtml(formatMoney(state.prices[key1m]))}</b>`,
  ].join("\n");
}

function buildFinancePromptText(classId, durationCode) {
  return [
    `💰 <b>Set Harga ${escapeHtml(formatClassLabel(classId))} - ${escapeHtml(formatDurationLabel(durationCode))}</b>`,
    "",
    "Ketik Harga Baru.",
    "Contoh: <code>150000</code>",
    "",
    "Ketik <b>batal</b> untuk keluar.",
  ].join("\n");
}

async function renderMenuMessage(ctx, text, extra) {
  const { env, adminId, msg } = ctx;

  if (msg) {
    await upsertCallbackMessage(env, msg, text, extra).catch(async () => {
      await sendMessage(env, adminId, text, extra);
    });
    return true;
  }

  await sendMessage(env, adminId, text, extra);
  return true;
}

export function buildSuperadminFinanceHandlers() {
  const EXACT = {};

  EXACT[CALLBACKS.SUPERADMIN_FINANCE_MENU] = async (ctx) => {
    const { env, adminId } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    const state = await getFinanceState(env);

    return renderMenuMessage(ctx, buildFinanceText(state), {
      parse_mode: "HTML",
      reply_markup: buildFinanceKeyboard(state.manualOn),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_FINANCE_MANUAL_TOGGLE] = async (ctx) => {
    const { env } = ctx;

    const raw = (await getSetting(env, "payment_manual_enabled")) ?? "1";
    const manualOn = String(raw) !== "0";
    await upsertSetting(env, "payment_manual_enabled", manualOn ? "0" : "1");

    const state = await getFinanceState(env);

    return renderMenuMessage(ctx, `✅ Set Manual sekarang: ${state.manualOn ? "ON" : "OFF"}`, {
      reply_markup: buildFinanceKeyboard(state.manualOn),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_FINANCE_PRICING_MENU] = async (ctx) => {
    const { env } = ctx;

    const state = await getFinanceState(env);

    return renderMenuMessage(ctx, buildFinancePricingText(state), {
      parse_mode: "HTML",
      reply_markup: buildFinancePricingKeyboard(),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_FINANCE_PRICING_BRONZE_MENU] = async (ctx) => {
    const { env } = ctx;

    const state = await getFinanceState(env);

    return renderMenuMessage(ctx, buildFinanceClassText(state, "bronze"), {
      parse_mode: "HTML",
      reply_markup: buildFinanceClassPricingKeyboard("bronze"),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_FINANCE_PRICING_GOLD_MENU] = async (ctx) => {
    const { env } = ctx;

    const state = await getFinanceState(env);

    return renderMenuMessage(ctx, buildFinanceClassText(state, "gold"), {
      parse_mode: "HTML",
      reply_markup: buildFinanceClassPricingKeyboard("gold"),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_FINANCE_PRICING_PLATINUM_MENU] = async (ctx) => {
    const { env } = ctx;

    const state = await getFinanceState(env);

    return renderMenuMessage(ctx, buildFinanceClassText(state, "platinum"), {
      parse_mode: "HTML",
      reply_markup: buildFinanceClassPricingKeyboard("platinum"),
    });
  };

  const financePriceActions = [
    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_BRONZE_1D, "bronze", "1d"],
    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_BRONZE_3D, "bronze", "3d"],
    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_BRONZE_7D, "bronze", "7d"],
    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_BRONZE_1M, "bronze", "1m"],

    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_GOLD_1D, "gold", "1d"],
    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_GOLD_3D, "gold", "3d"],
    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_GOLD_7D, "gold", "7d"],
    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_GOLD_1M, "gold", "1m"],

    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_PLATINUM_1D, "platinum", "1d"],
    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_PLATINUM_3D, "platinum", "3d"],
    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_PLATINUM_7D, "platinum", "7d"],
    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_PLATINUM_1M, "platinum", "1m"],
  ];

  for (const [callbackKey, classId, durationCode] of financePriceActions) {
    EXACT[callbackKey] = async (ctx) => {
      const { env, adminId } = ctx;

      await saveSession(env, `state:${adminId}`, {
        mode: SESSION_MODES.SA_FINANCE,
        area: "price",
        class_id: classId,
        duration_code: durationCode,
        step: "await_text",
      });

      await sendMessage(env, adminId, buildFinancePromptText(classId, durationCode), {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICING_MENU }]],
        },
      });

      return true;
    };
  }

  return { EXACT, PREFIX: [] };
}
