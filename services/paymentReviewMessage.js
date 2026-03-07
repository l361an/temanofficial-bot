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

function hasValue(value) {
  return !(value === null || value === undefined || value === "");
}

function fmtText(value, fallback = "-") {
  return hasValue(value) ? String(value) : fallback;
}

function fmtUsername(profile = null) {
  const raw = String(profile?.username || "").trim().replace(/^@/, "");
  return raw ? `@${raw}` : "-";
}

function fmtClassLabel(classId) {
  const raw = String(classId || "").trim().toLowerCase();
  if (raw === "bronze") return "Bronze";
  if (raw === "gold") return "Gold";
  if (raw === "platinum") return "Platinum";
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "-";
}

function fmtProviderLabel(provider) {
  const raw = String(provider || "").trim().toLowerCase();
  if (raw === "manual") return "Transfer / QRIS Manual";
  return raw || "-";
}

function fmtStatusLabel(status) {
  const raw = String(status || "").trim().toLowerCase();
  if (raw === "waiting_payment") return "Menunggu Pembayaran";
  if (raw === "waiting_confirmation") return "Menunggu Konfirmasi Superadmin";
  if (raw === "confirmed") return "Pembayaran Terkonfirmasi";
  if (raw === "rejected") return "Pembayaran Ditolak";
  if (raw === "expired") return "Tiket Kedaluwarsa";
  if (raw === "cancelled") return "Tiket Dibatalkan";
  return raw || "-";
}

function fmtMonthLabel(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return `${n} Bulan`;
}

function fmtRupiah(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "Rp0";
  return `Rp${n.toLocaleString("id-ID")}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function fmtDateTime(value) {
  if (!hasValue(value)) return "-";

  const raw = String(value).trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, yyyy, mm, dd, hh = "00", mi = "00"] = m;
    return `${dd}-${mm}-${yyyy} ${hh}:${mi}`;
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function buildPaymentReviewText(ticket, profile = null) {
  const lines = [
    "💳 <b>REVIEW PEMBAYARAN PARTNER</b>",
    "",
    "🧾 <b>Kode Tiket</b>",
    esc(fmtText(ticket?.ticket_code)),
    "",
    "👤 <b>Partner</b>",
    `ID Telegram : <code>${esc(fmtText(ticket?.partner_id))}</code>`,
    `Username    : <b>${esc(fmtUsername(profile))}</b>`,
    "",
    "🏷 <b>Kelas Partner</b>",
    esc(fmtClassLabel(ticket?.class_id)),
    "",
    "⏳ <b>Durasi Langganan</b>",
    esc(fmtMonthLabel(ticket?.duration_months)),
    "",
    "💰 <b>Rincian Pembayaran</b>",
    `Harga Dasar : <b>${esc(fmtRupiah(ticket?.amount_base))}</b>`,
    `Kode Unik   : <b>${esc(fmtText(ticket?.unique_code, "0"))}</b>`,
    `Total Bayar : <b>${esc(fmtRupiah(ticket?.amount_final))}</b>`,
    "",
    "🏦 <b>Metode Pembayaran</b>",
    esc(fmtProviderLabel(ticket?.provider)),
    "",
    "📌 <b>Status Tiket</b>",
    esc(fmtStatusLabel(ticket?.status)),
    "",
    "⏱ <b>Batas Waktu Pembayaran</b>",
    esc(fmtDateTime(ticket?.expires_at)),
    "",
    "📎 <b>Bukti Transfer</b>",
    "(File dikirim bersama pesan ini)",
  ];

  if (hasValue(ticket?.payer_name)) {
    lines.push("", "🙍 <b>Nama Pengirim</b>", esc(fmtText(ticket?.payer_name)));
  }

  if (hasValue(ticket?.payer_notes)) {
    lines.push("", "📝 <b>Catatan Pengirim</b>", esc(fmtText(ticket?.payer_notes)));
  }

  if (hasValue(ticket?.proof_caption)) {
    lines.push("", "🗒 <b>Keterangan Bukti</b>", esc(fmtText(ticket?.proof_caption)));
  }

  if (hasValue(ticket?.proof_uploaded_at)) {
    lines.push("", "🕓 <b>Waktu Upload Bukti</b>", esc(fmtDateTime(ticket?.proof_uploaded_at)));
  }

  lines.push("", "Silakan lakukan verifikasi pembayaran ini.");

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
