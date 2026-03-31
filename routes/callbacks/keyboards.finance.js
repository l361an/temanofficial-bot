// routes/callbacks/keyboards.finance.js
import { CALLBACKS, cb } from "../telegram.constants.js";
import { officerHomeButton, backAndHomeRow } from "./keyboards.shared.js";
import { listActivePartnerClasses } from "../../repositories/partnerClassesRepo.js";

const WAITING_LIST_CB = "paywait:list:1";

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

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
      [{ text: "🕓 Waiting Confirmation List", callback_data: WAITING_LIST_CB }],
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

export async function buildFinancePricingKeyboard(env) {
  const rows = [];
  const activeClasses = await listActivePartnerClasses(env).catch(() => []);
  const buttons = (activeClasses.length ? activeClasses : [{ id: "general", label: "General" }]).map((item) => ({
    text: String(item.label || item.id),
    callback_data: cb.saFinancePricingClass(item.id),
  }));

  rows.push(...chunk(buttons, 2));
  rows.push(backAndHomeRow(CALLBACKS.SUPERADMIN_FINANCE_MENU));
  return { inline_keyboard: rows };
}

export function buildFinanceClassPricingKeyboard(classId) {
  return {
    inline_keyboard: [
      [
        { text: "1H", callback_data: cb.saFinancePriceSet(classId, "1d") },
        { text: "3H", callback_data: cb.saFinancePriceSet(classId, "3d") },
      ],
      [
        { text: "7H", callback_data: cb.saFinancePriceSet(classId, "7d") },
        { text: "1M", callback_data: cb.saFinancePriceSet(classId, "1m") },
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
      [{ text: "🕓 Waiting Confirmation List", callback_data: WAITING_LIST_CB }],
      [
        { text: "⬅️ Finance", callback_data: CALLBACKS.SUPERADMIN_FINANCE_MENU },
        officerHomeButton(),
      ],
    ],
  };
}

export function buildWaitingConfirmationListKeyboard(rows = [], page = 1, hasNext = false) {
  const buttons = (rows || []).map((item) => ({
    text: `${item.ticket_code || `#${item.id}`} • ${item.amount_final_label || "Rp 0"}`,
    callback_data: `paywait:view:${item.id}:${page}`,
  }));

  const keyboard = chunk(buttons, 1).map((row) => row);

  const nav = [];
  if (page > 1) nav.push({ text: "⬅️ Prev", callback_data: `paywait:list:${page - 1}` });
  if (hasNext) nav.push({ text: "➡️ Next", callback_data: `paywait:list:${page + 1}` });
  if (nav.length) keyboard.push(nav);

  keyboard.push([{ text: "⬅️ Finance", callback_data: CALLBACKS.SUPERADMIN_FINANCE_MENU }]);
  keyboard.push([officerHomeButton()]);

  return { inline_keyboard: keyboard };
}

export function buildWaitingConfirmationItemKeyboard(ticketId, page = 1) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Confirm", callback_data: cb.payConfirmOk(ticketId) },
        { text: "❌ Reject", callback_data: cb.payConfirmReject(ticketId) },
      ],
      [{ text: "⬅️ Back to List", callback_data: `paywait:list:${page}` }],
      [
        { text: "⬅️ Finance", callback_data: CALLBACKS.SUPERADMIN_FINANCE_MENU },
        officerHomeButton(),
      ],
    ],
  };
}
