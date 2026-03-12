// routes/callbacks/keyboards.finance.js
import { CALLBACKS, cb } from "../telegram.constants.js";
import { officerHomeButton, backAndHomeRow } from "./keyboards.shared.js";

export function buildFinanceKeyboard(manualOn) {
  return {
    inline_keyboard: [
      [
        {
          text: manualOn ? "🛑 Set Manual OFF" : "✅ Set Manual ON",
          callback_data: CALLBACKS.SUPERADMIN_FINANCE_MANUAL_TOGGLE,
        },
      ],
      [{ text: "🏷️ Set Pricing", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICING_MENU }],
      [{ text: "🖼️ Set QRIS", callback_data: CALLBACKS.SUPERADMIN_FINANCE_QRIS_MENU }],
      backAndHomeRow(CALLBACKS.SUPERADMIN_TOOLS_MENU),
    ],
  };
}

export function buildFinanceQrisKeyboard(hasQris = false) {
  const rows = [];

  if (hasQris) {
    rows.push([{ text: "👁️ Lihat QRIS", callback_data: CALLBACKS.SUPERADMIN_FINANCE_QRIS_VIEW }]);
  }

  rows.push([
    {
      text: hasQris ? "♻️ Update QRIS" : "📸 Upload QRIS",
      callback_data: CALLBACKS.SUPERADMIN_FINANCE_QRIS_SET,
    },
  ]);

  rows.push(backAndHomeRow(CALLBACKS.SUPERADMIN_FINANCE_MENU));
  return { inline_keyboard: rows };
}

export function buildFinancePricingKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🥉 Bronze", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICING_BRONZE_MENU },
        { text: "🥇 Gold", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICING_GOLD_MENU },
      ],
      [{ text: "💠 Platinum", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICING_PLATINUM_MENU }],
      backAndHomeRow(CALLBACKS.SUPERADMIN_FINANCE_MENU),
    ],
  };
}

export function buildFinanceClassPricingKeyboard(classId) {
  const map = {
    bronze: {
      d1: CALLBACKS.SUPERADMIN_FINANCE_PRICE_BRONZE_1D,
      d3: CALLBACKS.SUPERADMIN_FINANCE_PRICE_BRONZE_3D,
      d7: CALLBACKS.SUPERADMIN_FINANCE_PRICE_BRONZE_7D,
      m1: CALLBACKS.SUPERADMIN_FINANCE_PRICE_BRONZE_1M,
    },
    gold: {
      d1: CALLBACKS.SUPERADMIN_FINANCE_PRICE_GOLD_1D,
      d3: CALLBACKS.SUPERADMIN_FINANCE_PRICE_GOLD_3D,
      d7: CALLBACKS.SUPERADMIN_FINANCE_PRICE_GOLD_7D,
      m1: CALLBACKS.SUPERADMIN_FINANCE_PRICE_GOLD_1M,
    },
    platinum: {
      d1: CALLBACKS.SUPERADMIN_FINANCE_PRICE_PLATINUM_1D,
      d3: CALLBACKS.SUPERADMIN_FINANCE_PRICE_PLATINUM_3D,
      d7: CALLBACKS.SUPERADMIN_FINANCE_PRICE_PLATINUM_7D,
      m1: CALLBACKS.SUPERADMIN_FINANCE_PRICE_PLATINUM_1M,
    },
  };

  const selected = map[String(classId || "").trim().toLowerCase()] || map.bronze;

  return {
    inline_keyboard: [
      [
        { text: "1H", callback_data: selected.d1 },
        { text: "3H", callback_data: selected.d3 },
      ],
      [
        { text: "7H", callback_data: selected.d7 },
        { text: "1M", callback_data: selected.m1 },
      ],
      backAndHomeRow(CALLBACKS.SUPERADMIN_FINANCE_PRICING_MENU),
    ],
  };
}

export function buildPaymentReviewKeyboard(ticketId) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Confirm Payment", callback_data: cb.payConfirmOk(ticketId) },
        { text: "❌ Reject Payment", callback_data: cb.payConfirmReject(ticketId) },
      ],
      [
        { text: "⬅️ Finance", callback_data: CALLBACKS.SUPERADMIN_FINANCE_MENU },
        officerHomeButton(),
      ],
    ],
  };
}
