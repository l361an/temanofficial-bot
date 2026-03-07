// services/paymentReviewMessage.js

import { buildPaymentReviewKeyboard } from "../routes/callbacks/keyboards.js";

export function buildPaymentReviewText(ticket, profile = null) {
  const lines = [
    "💳 <b>Review Payment</b>",
    "",
    `Ticket ID: <code>${String(ticket?.id || "-")}</code>`,
    `Partner ID: <code>${String(ticket?.partner_id || "-")}</code>`,
    `Username: <b>${String(profile?.username || "-")}</b>`,
    `Class ID: <b>${String(ticket?.class_id || "-")}</b>`,
    `Durasi: <b>${String(ticket?.duration_months || "-")}</b> bulan`,
    `Base Amount: <b>${String(ticket?.base_amount || 0)}</b>`,
    `Unique Amount: <b>${String(ticket?.unique_amount || 0)}</b>`,
    `Final Amount: <b>${String(ticket?.final_amount || 0)}</b>`,
    `Status: <b>${String(ticket?.status || "-")}</b>`,
    `Proof File ID: <code>${String(ticket?.proof_file_id || "-")}</code>`,
  ];

  return lines.join("\n");
}

export function buildPaymentReviewPayload(ticket, profile = null) {
  return {
    text: buildPaymentReviewText(ticket, profile),
    options: {
      parse_mode: "HTML",
      reply_markup: buildPaymentReviewKeyboard(ticket.id),
    },
  };
}
