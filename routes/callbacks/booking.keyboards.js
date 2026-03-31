// routes/callbacks/booking.keyboards.js

import { cb } from "../telegram.constants.js";

function normalizeString(value) {
  return String(value || "").trim().toLowerCase();
}

function isTerminalStatus(status) {
  return ["cancelled", "completed", "expired"].includes(normalizeString(status));
}

export function buildBookingPanelKeyboard(booking, actorSide) {
  const safeBookingId = String(booking?.id || "").trim();
  if (!safeBookingId) return undefined;

  const rows = [];
  const status = normalizeString(booking?.status);

  const canPropose = !isTerminalStatus(status);
  const canAcceptExact =
    status === "negotiating" &&
    normalizeString(booking?.last_proposal_kind) === "exact" &&
    normalizeString(booking?.last_proposed_by) &&
    normalizeString(booking?.last_proposed_by) !== normalizeString(actorSide);

  if (canAcceptExact) {
    rows.push([{ text: "✅ Setuju Jam Ini", callback_data: cb.bkAcceptExact(safeBookingId) }]);
  }

  if (canPropose) {
    rows.push([
      { text: "🕒 Usul Jam Pas", callback_data: cb.bkPromptExact(safeBookingId) },
      { text: "🪟 Usul Rentang", callback_data: cb.bkPromptWindow(safeBookingId) },
    ]);
  }

  if (!isTerminalStatus(status)) {
    rows.push([
      { text: "📋 Ringkasan", callback_data: cb.bkSummary(safeBookingId) },
      { text: "❌ Batalkan", callback_data: cb.bkCancel(safeBookingId) },
    ]);
  }

  return rows.length ? { inline_keyboard: rows } : undefined;
}

export function buildBookingInputKeyboard(bookingId) {
  const safeBookingId = String(bookingId || "").trim();
  if (!safeBookingId) return undefined;

  return {
    inline_keyboard: [
      [{ text: "📋 Kembali ke Ringkasan", callback_data: cb.bkSummary(safeBookingId) }],
      [{ text: "❌ Batalkan Booking", callback_data: cb.bkCancel(safeBookingId) }],
    ],
  };
}
