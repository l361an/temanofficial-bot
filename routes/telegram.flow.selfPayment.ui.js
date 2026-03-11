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

function normalizeTicketStatus(status) {
  return String(status || "").trim().toLowerCase();
}

export function buildWaitingPaymentKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📄 Cek Status", callback_data: "self:payment:status" }],
      [{ text: "📤 Upload Bukti Transfer", callback_data: "self:payment:upload_info" }],
      [{ text: "📋 Menu TeMan", callback_data: "teman:menu" }],
    ],
  };
}

export function buildWaitingConfirmationKeyboard() {
  return {
    inline_keyboard: [[
      { text: "📄 Cek Status", callback_data: "self:payment:status" },
      { text: "📋 Menu TeMan", callback_data: "teman:menu" },
    ]],
  };
}

export function buildRejectedPaymentKeyboard() {
  return {
    inline_keyboard: [[
      { text: "📤 Upload Ulang Bukti", callback_data: "self:payment:upload_info" },
      { text: "📋 Menu TeMan", callback_data: "teman:menu" },
    ]],
  };
}

export function buildExpiredPaymentKeyboard(primaryActionText = "💳 Aktivasi Premium") {
  return {
    inline_keyboard: [
      [{ text: primaryActionText, callback_data: "self:payment:create" }],
      [{ text: "📋 Menu TeMan", callback_data: "teman:menu" }],
    ],
  };
}

export function buildPaymentUploadModeKeyboard() {
  return {
    inline_keyboard: [[
      { text: "⬅️ Batal", callback_data: "self:payment" },
      { text: "📄 Cek Status", callback_data: "self:payment:status" },
    ]],
  };
}

export function buildPaymentMenuKeyboard({
  hasOpenTicket = false,
  primaryActionText = "💳 Aktivasi Premium",
  ticketStatus = null,
} = {}) {
  const status = normalizeTicketStatus(ticketStatus);

  if (status === "waiting_confirmation") {
    return buildWaitingConfirmationKeyboard();
  }

  if (status === "rejected") {
    return buildRejectedPaymentKeyboard();
  }

  if (status === "expired" || status === "cancelled") {
    return buildExpiredPaymentKeyboard(primaryActionText);
  }

  if (status === "waiting_payment") {
    return buildWaitingPaymentKeyboard();
  }

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
        { text: "1 Hari", callback_data: "self:payment:pick:1d" },
        { text: "3 Hari", callback_data: "self:payment:pick:3d" },
      ],
      [
        { text: "7 Hari", callback_data: "self:payment:pick:7d" },
        { text: "1 Bulan", callback_data: "self:payment:pick:1m" },
      ],
      [{ text: "⬅️ Kembali", callback_data: "self:payment" }],
    ],
  };
}

export function buildPaymentDurationConfirmKeyboard(durationCode) {
  const code = String(durationCode || "").trim().toLowerCase();
  return {
    inline_keyboard: [
      [
        { text: "✅ Konfirmasi", callback_data: `self:payment:confirm:${code}` },
        { text: "❌ Cancel", callback_data: "self:payment:create" },
      ],
      [{ text: "⬅️ Ganti Durasi", callback_data: "self:payment:create" }],
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

export function buildPaymentDurationConfirmMessage(ctx, price) {
  const classLabel = fmtClassId(ctx?.profile?.class_id || "bronze");

  return [
    "🧾 <b>KONFIRMASI DURASI PREMIUM</b>",
    "",
    `Status Partner: <b>${escapeHtml(ctx.partnerStatusLabel)}</b>`,
    `Akses Premium: <b>${escapeHtml(ctx.premiumAccessLabel)}</b>`,
    `Class Partner: <b>${escapeHtml(classLabel)}</b>`,
    "",
    `Durasi Dipilih: <b>${escapeHtml(price?.durationLabel || "-")}</b>`,
    `Harga Dasar: <b>${escapeHtml(formatMoney(price?.amount || 0))}</b>`,
    "",
    "Pastikan durasi yang kamu pilih sudah benar.",
    "Kalau sudah sesuai, klik <b>Konfirmasi</b> untuk membuat tiket pembayaran.",
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

export function buildPaymentInstructionMessage(ticket, durationLabel = null, options = {}) {
  const { hasQrisPhoto = false } = options;
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
    hasQrisPhoto
      ? "Silakan scan / simpan foto QRIS ini lalu transfer sesuai nominal di atas."
      : "Silakan transfer sesuai nominal di atas.",
    "",
    "Setelah transfer, gunakan tombol di bawah untuk cek status atau upload bukti transfer.",
  ];

  return lines.join("\n");
}

export function buildPaymentUploadInfoMessage(ticket = null) {
  const lines = [
    "📤 <b>UPLOAD BUKTI TRANSFER</b>",
    "",
    "Silakan kirim <b>1 foto bukti transfer</b> dengan klik icon lampiran / clip (📎), lalu pilih <b>Galeri</b>.",
    "",
    "<b>Format yang diproses:</b>",
    "• foto",
    "",
    "<b>Tidak diproses:</b>",
    "• file",
    "• dokumen",
    "",
    "Setelah foto dikirim, bukti pembayaran akan masuk ke proses review Superadmin.",
  ];

  if (ticket) {
    lines.push("");
    lines.push("<b>Detail Tiket</b>");
    lines.push(`• Kode: <code>${escapeHtml(String(ticket.ticket_code || "-"))}</code>`);
    lines.push(`• Status: <b>${escapeHtml(fmtTicketStatusLabel(ticket.status))}</b>`);
    lines.push(`• Nominal: <b>${escapeHtml(formatMoney(ticket.amount_final))}</b>`);
    lines.push(`• Batas Waktu: <b>${escapeHtml(formatDateTime(ticket.expires_at))}</b>`);
  } else {
    lines.push("");
    lines.push("⚠️ Saat ini belum ada tiket aktif.");
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
