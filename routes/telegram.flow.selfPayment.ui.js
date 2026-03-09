// routes/telegram.flow.selfPayment.ui.js

import { sendMessage, upsertCallbackMessage } from "../services/telegramApi.js";
import { fmtClassId } from "../utils/partnerHelpers.js";
import {
  escapeHtml,
  formatMoney,
  formatDateTime,
} from "./telegram.user.shared.js";

export function fmtTicketStatusLabel(status) {
  const raw = String(status || "").trim().toLowerCase();
  if (raw === "waiting_payment") return "Menunggu Pembayaran";
  if (raw === "waiting_confirmation") return "Menunggu Konfirmasi Superadmin";
  if (raw === "confirmed") return "Terkonfirmasi";
  if (raw === "rejected") return "Ditolak";
  if (raw === "expired") return "Kedaluwarsa";
  if (raw === "cancelled") return "Dibatalkan";
  return raw ? raw.replaceAll("_", " ") : "-";
}

export function fmtDurationLabel(durationCode, durationMonths) {
  const raw = String(durationCode || "").trim().toLowerCase();

  if (raw === "1d") return "1 Hari";
  if (raw === "3d") return "3 Hari";
  if (raw === "7d") return "7 Hari";
  if (raw === "1m") return "1 Bulan";

  const months = Number(durationMonths || 0);
  if (months === 1) return "1 Bulan";

  return months > 0 ? `${months} Bulan` : "-";
}

function readDurationCodeFromTicket(ticket) {
  const pricingSnapshot = String(ticket?.pricing_snapshot_json || "").trim();
  if (pricingSnapshot) {
    try {
      const parsed = JSON.parse(pricingSnapshot);
      const raw = String(parsed?.duration_code || "").trim().toLowerCase();
      if (raw === "1d" || raw === "3d" || raw === "7d" || raw === "1m") return raw;
    } catch {}
  }

  const metadata = String(ticket?.metadata_json || "").trim();
  if (metadata) {
    try {
      const parsed = JSON.parse(metadata);
      const raw = String(parsed?.duration_code || "").trim().toLowerCase();
      if (raw === "1d" || raw === "3d" || raw === "7d" || raw === "1m") return raw;
    } catch {}
  }

  if (Number(ticket?.duration_months || 0) === 1) return "1m";
  return "";
}

export function buildPaymentMenuKeyboard({
  hasOpenTicket = false,
  primaryActionText = "💳 Aktivasi Premium",
} = {}) {
  const rows = [];

  if (!hasOpenTicket) {
    rows.push([{ text: primaryActionText, callback_data: "self:payment:create" }]);
  }

  if (hasOpenTicket) {
    rows.push([{ text: "📄 Cek Status", callback_data: "self:payment:status" }]);
    rows.push([{ text: "📤 Upload Bukti Transfer", callback_data: "self:payment:upload_info" }]);
  }

  rows.push([{ text: "📋 Menu TeMan", callback_data: "teman:menu" }]);

  return { inline_keyboard: rows };
}

export function buildPaymentDurationKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "1 Hari", callback_data: "self:payment:create:1d" },
        { text: "3 Hari", callback_data: "self:payment:create:3d" },
      ],
      [
        { text: "7 Hari", callback_data: "self:payment:create:7d" },
        { text: "1 Bulan", callback_data: "self:payment:create:1m" },
      ],
      [{ text: "⬅️ Kembali", callback_data: "self:payment" }],
    ],
  };
}

export function buildPaymentHomeMessage(ctx) {
  return [
    "💎 <b>PREMIUM PARTNER</b>",
    "",
    `Status Partner: <b>${escapeHtml(ctx.partnerStatusLabel)}</b>`,
    `Akses Premium: <b>${escapeHtml(ctx.premiumAccessLabel)}</b>`,
    `Class Partner: <b>${escapeHtml(fmtClassId(ctx.profile?.class_id || "bronze"))}</b>`,
  ].join("\n");
}

export function buildChooseDurationMessage(ctx) {
  return [
    "💎 <b>PILIH DURASI PREMIUM</b>",
    "",
    `Status Partner: <b>${escapeHtml(ctx.partnerStatusLabel)}</b>`,
    `Akses Premium: <b>${escapeHtml(ctx.premiumAccessLabel)}</b>`,
    `Class Partner: <b>${escapeHtml(fmtClassId(ctx.profile?.class_id || "bronze"))}</b>`,
    "",
    "Pilih durasi yang ingin kamu aktifkan:",
    "• 1 Hari",
    "• 3 Hari",
    "• 7 Hari",
    "• 1 Bulan",
  ].join("\n");
}

export function buildPaymentTicketSummary(ticket) {
  if (!ticket) return "Belum ada tiket pembayaran.";

  const classLabel = fmtClassId(ticket.class_id);
  const durationCode = readDurationCodeFromTicket(ticket);

  const lines = [
    "💳 <b>STATUS TIKET PEMBAYARAN</b>",
    "",
    `Kode Tiket: <code>${escapeHtml(String(ticket.ticket_code || "-"))}</code>`,
    `Status Tiket: <b>${escapeHtml(fmtTicketStatusLabel(ticket.status))}</b>`,
    `Class Partner: <b>${escapeHtml(classLabel)}</b>`,
    `Durasi: <b>${escapeHtml(fmtDurationLabel(durationCode, ticket.duration_months))}</b>`,
    `Nominal Transfer: <b>${escapeHtml(formatMoney(ticket.amount_final))}</b>`,
    `Batas Waktu: <b>${escapeHtml(formatDateTime(ticket.expires_at))}</b>`,
  ];

  if (ticket.proof_uploaded_at) {
    lines.push(`Upload Bukti: <b>${escapeHtml(formatDateTime(ticket.proof_uploaded_at))}</b>`);
  }

  return lines.join("\n");
}

export function buildPaymentInstructionMessage(ticket, durationLabel = null) {
  const classLabel = fmtClassId(ticket?.class_id);
  const durationCode = readDurationCodeFromTicket(ticket);
  const finalDurationLabel = durationLabel || fmtDurationLabel(durationCode, ticket?.duration_months);

  const lines = [
    "✅ <b>TIKET PEMBAYARAN BERHASIL DIBUAT</b>",
    "",
    `Kode Tiket: <code>${escapeHtml(String(ticket?.ticket_code || "-"))}</code>`,
    `Class Partner: <b>${escapeHtml(classLabel)}</b>`,
    `Durasi: <b>${escapeHtml(finalDurationLabel)}</b>`,
    `Total Bayar: <b>${escapeHtml(formatMoney(ticket?.amount_final))}</b>`,
    `Batas Waktu: <b>${escapeHtml(formatDateTime(ticket?.expires_at))}</b>`,
    "",
    "Silakan transfer sesuai nominal di atas.",
    "Setelah transfer, kirim <b>foto bukti transfer</b> langsung di chat ini.",
    "",
    "Catatan:",
    "• 1 partner hanya boleh punya 1 tiket aktif",
    "• upload bukti hanya saat status <b>Menunggu Pembayaran</b>",
    "• setelah upload, status menjadi <b>Menunggu Konfirmasi Superadmin</b>",
    "• tiket expired tetap tersimpan di sistem",
    "• jika tiket expired dan transfer sudah terlanjur dilakukan, hubungi Superadmin untuk manual check",
  ];

  return lines.join("\n");
}

export function buildPaymentUploadInfoMessage(ticket = null) {
  const lines = [
    "📤 <b>UPLOAD BUKTI TRANSFER</b>",
    "",
    "Kirim <b>foto bukti transfer</b> langsung di chat ini.",
    "Format yang diproses hanya <b>photo</b>, bukan file atau dokumen.",
    "",
    "Rule:",
    "• upload bukti hanya saat tiket status <b>Menunggu Pembayaran</b>",
    "• setelah upload, tiket menjadi <b>Menunggu Konfirmasi Superadmin</b>",
    "• kalau tiket sudah expired, sistem tidak proses otomatis",
  ];

  if (ticket) {
    lines.push("");
    lines.push(`Tiket Aktif: <code>${escapeHtml(String(ticket.ticket_code || "-"))}</code>`);
    lines.push(`Status Tiket: <b>${escapeHtml(fmtTicketStatusLabel(ticket.status))}</b>`);
    lines.push(`Nominal: <b>${escapeHtml(formatMoney(ticket.amount_final))}</b>`);
    lines.push(`Batas Waktu: <b>${escapeHtml(formatDateTime(ticket.expires_at))}</b>`);
  } else {
    lines.push("", "Saat ini belum ada tiket aktif.");
  }

  return lines.join("\n");
}

export function buildOpenTicketWarningMessage(ticket) {
  return [
    "⚠️ <b>KAMU MASIH PUNYA TIKET AKTIF</b>",
    "",
    "Sesuai rule, 1 partner hanya boleh punya 1 tiket aktif.",
    "",
    buildPaymentTicketSummary(ticket),
  ].join("\n");
}

export function buildExpiredTicketHelpMessage(ticket) {
  return [
    "⚠️ <b>TIKET SUDAH KEDALUWARSA</b>",
    "",
    `Kode Tiket: <code>${escapeHtml(String(ticket?.ticket_code || "-"))}</code>`,
    `Status Tiket: <b>${escapeHtml(fmtTicketStatusLabel(ticket?.status))}</b>`,
    `Nominal: <b>${escapeHtml(formatMoney(ticket?.amount_final))}</b>`,
    "",
    "Kalau belum transfer, silakan buat tiket baru.",
    "Kalau sudah terlanjur transfer, hubungi Superadmin untuk manual check.",
  ].join("\n");
}

export async function renderPaymentScreen(env, chatId, sourceMessage, text, replyMarkup) {
  const extra = {
    parse_mode: "HTML",
    reply_markup: replyMarkup,
    disable_web_page_preview: true,
  };

  if (sourceMessage) {
    await upsertCallbackMessage(env, sourceMessage, text, extra);
    return;
  }

  await sendMessage(env, chatId, text, extra);
}
