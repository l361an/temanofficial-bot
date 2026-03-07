// services/paymentReviewMessage.js

import { buildPaymentReviewKeyboard } from "../routes/callbacks/keyboards.js";
import { getPaymentTicketById } from "../repositories/paymentTicketsRepo.js";
import { getProfileFullByTelegramId } from "../repositories/profilesRepo.js";
import { getFirstActiveSuperadminId } from "../repositories/adminsRepo.js";

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtValue(value, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function fmtCurrency(value, currency = "IDR") {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return `${currency} 0`;
  return `${currency} ${amount}`;
}

function fmtUsername(profile = null) {
  const raw = String(profile?.username || "").trim().replace(/^@/, "");
  return raw ? `@${raw}` : "-";
}

function fmtExpiry(ticket) {
  return fmtValue(ticket?.expires_at);
}

export function buildPaymentReviewText(ticket, profile = null) {
  const lines = [
    "💳 <b>Review Payment</b>",
    "",
    `Ticket ID: <code>${esc(fmtValue(ticket?.id))}</code>`,
    `Ticket Code: <code>${esc(fmtValue(ticket?.ticket_code))}</code>`,
    `Partner ID: <code>${esc(fmtValue(ticket?.partner_id))}</code>`,
    `Username: <b>${esc(fmtUsername(profile))}</b>`,
    `Class ID: <b>${esc(fmtValue(ticket?.class_id))}</b>`,
    `Durasi: <b>${esc(fmtValue(ticket?.duration_months))}</b> bulan`,
    `Amount Base: <b>${esc(fmtCurrency(ticket?.amount_base, ticket?.currency || "IDR"))}</b>`,
    `Unique Code: <b>${esc(fmtValue(ticket?.unique_code, "0"))}</b>`,
    `Amount Final: <b>${esc(fmtCurrency(ticket?.amount_final, ticket?.currency || "IDR"))}</b>`,
    `Provider: <b>${esc(fmtValue(ticket?.provider))}</b>`,
    `Status: <b>${esc(fmtValue(ticket?.status))}</b>`,
    `Expires At: <code>${esc(fmtExpiry(ticket))}</code>`,
    `Proof Asset ID: <code>${esc(fmtValue(ticket?.proof_asset_id))}</code>`,
  ];

  if (ticket?.payer_name) {
    lines.push(`Payer Name: <b>${esc(ticket.payer_name)}</b>`);
  }

  if (ticket?.payer_notes) {
    lines.push(`Payer Notes: ${esc(ticket.payer_notes)}`);
  }

  if (ticket?.proof_caption) {
    lines.push(`Proof Caption: ${esc(ticket.proof_caption)}`);
  }

  if (ticket?.proof_uploaded_at) {
    lines.push(`Proof Uploaded At: <code>${esc(fmtValue(ticket.proof_uploaded_at))}</code>`);
  }

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

export async function buildPaymentReviewMessage(env, ticketId) {
  const ticket = await getPaymentTicketById(env, ticketId);
  if (!ticket) return null;

  const profile = await getProfileFullByTelegramId(env, String(ticket.partner_id)).catch(() => null);
  const superadminId = await getFirstActiveSuperadminId(env).catch(() => null);

  return {
    ticket,
    profile,
    caption: buildPaymentReviewText(ticket, profile),
    keyboard: buildPaymentReviewKeyboard(ticket.id),
    superadmin_ids: superadminId ? [String(superadminId)] : [],
  };
}
