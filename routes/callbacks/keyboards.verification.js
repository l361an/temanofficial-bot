// routes/callbacks/keyboards.verification.js
import { cb } from "../telegram.constants.js";
import { officerHomeButton, backAndHomeRow } from "./keyboards.shared.js";

export function buildMainKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [{ text: "👤 Pilih Verificator", callback_data: cb.pickVer(telegramId) }],
      [officerHomeButton()],
    ],
  };
}

export function buildApproveRejectKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: cb.approve(telegramId) },
        { text: "❌ Reject", callback_data: cb.reject(telegramId) },
      ],
      [officerHomeButton()],
    ],
  };
}

export function buildVerificatorKeyboard(telegramId, verificators) {
  const rows = [];
  const max = Math.min(verificators.length, 20);

  for (let i = 0; i < max; i += 2) {
    const a = verificators[i];
    const b = verificators[i + 1];
    const row = [{ text: a.label, callback_data: cb.setVer(telegramId, a.telegram_id) }];
    if (b) row.push({ text: b.label, callback_data: cb.setVer(telegramId, b.telegram_id) });
    rows.push(row);
  }

  rows.push(backAndHomeRow(cb.backVer(telegramId)));
  return { inline_keyboard: rows };
}
