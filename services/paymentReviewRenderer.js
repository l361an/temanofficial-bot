// services/paymentReviewRenderer.js

import { escapeHtml } from "../routes/callbacks/shared.js";
import {
  enrichWaitingRowsWithProfile,
  buildPartnerIdentity,
  formatClassLabel,
  formatDateTime,
  formatDurationLabel,
  formatMoney,
  formatNickname,
  formatProviderLabel,
  formatStatusLabel,
  hasValue,
  normalizeStatus,
  resolveDurationLabelFromTicket,
} from "./paymentReviewHelpers.js";

export function buildPaymentReviewText(ticket, profile = null) {
  const username = profile?.username || "";
  const nickname =
    profile?.nickname ??
    profile?.nama ??
    profile?.name ??
    profile?.full_name ??
    "";

  const lines = [
    "💳 <b>REVIEW PEMBAYARAN PARTNER</b>",
    "",
    "🧾 <b>Kode Tiket</b>",
    escapeHtml(String(ticket?.ticket_code || "-")),
    "",
    "👤 <b>Partner</b>",
    `ID Telegram : <code>${escapeHtml(String(ticket?.partner_id || "-"))}</code>`,
    `Username    : <b>${escapeHtml(username ? `@${String(username).replace(/^@/, "")}` : "-")}</b>`,
    `Nickname    : <b>${escapeHtml(formatNickname(nickname))}</b>`,
    "",
    "🏷 <b>Kelas Partner</b>",
    escapeHtml(formatClassLabel(ticket?.class_id)),
    "",
    "⏳ <b>Durasi Langganan</b>",
    escapeHtml(resolveDurationLabelFromTicket(ticket)),
    "",
    "💰 <b>Rincian Pembayaran</b>",
    `Harga Dasar : <b>${escapeHtml(formatMoney(ticket?.amount_base))}</b>`,
    `Kode Unik   : <b>${escapeHtml(String(ticket?.unique_code || "0"))}</b>`,
    `Total Bayar : <b>${escapeHtml(formatMoney(ticket?.amount_final))}</b>`,
    "",
    "🏦 <b>Metode Pembayaran</b>",
    escapeHtml(formatProviderLabel(ticket?.provider)),
    "",
    "📌 <b>Status Tiket</b>",
    escapeHtml(formatStatusLabel(ticket?.status)),
    "",
    "⏱ <b>Batas Waktu Pembayaran</b>",
    escapeHtml(formatDateTime(ticket?.expires_at)),
    "",
    "📎 <b>Bukti Transfer</b>",
    "(File dikirim bersama pesan ini)",
  ];

  if (hasValue(ticket?.payer_name)) {
    lines.push("", "🙍 <b>Nama Pengirim</b>", escapeHtml(String(ticket?.payer_name)));
  }

  if (hasValue(ticket?.payer_notes)) {
    lines.push("", "📝 <b>Catatan Pengirim</b>", escapeHtml(String(ticket?.payer_notes)));
  }

  if (hasValue(ticket?.proof_caption)) {
    lines.push("", "🗒 <b>Keterangan Bukti</b>", escapeHtml(String(ticket?.proof_caption)));
  }

  if (hasValue(ticket?.proof_uploaded_at)) {
    lines.push("", "🕓 <b>Waktu Upload Bukti</b>", escapeHtml(formatDateTime(ticket?.proof_uploaded_at)));
  }

  lines.push(
    "",
    "Reviewer: <b>Owner & Superadmin</b>",
    "Siapa yang klik lebih dulu akan menjadi keputusan final."
  );

  return lines.join("\n");
}

export async function buildWaitingListText(env, rows, page, total) {
  const totalPages = Math.max(1, Math.ceil(total / 10));
  const enrichedRows = await enrichWaitingRowsWithProfile(env, rows);

  const lines = [
    "🕓 <b>WAITING CONFIRMATION LIST</b>",
    "",
    `Total pending: <b>${total}</b>`,
    `Page: <b>${page}</b>/<b>${totalPages}</b>`,
    "",
  ];

  if (!enrichedRows.length) {
    lines.push("Tidak ada payment yang menunggu konfirmasi.");
    return lines.join("\n");
  }

  enrichedRows.forEach((row, index) => {
    lines.push(
      `${index + 1}. <b>${escapeHtml(String(row.ticket_code || `#${row.id}`))}</b>`,
      `Username: <b>${escapeHtml(String(row.partner_username || "-"))}</b>`,
      `Nickname: <b>${escapeHtml(String(row.partner_nickname || "-"))}</b>`,
      `Partner ID: <code>${escapeHtml(String(row.partner_id || "-"))}</code>`,
      `Nominal: <b>${escapeHtml(String(row.amount_final_label || formatMoney(row.amount_final)))}</b>`,
      `Uploaded: <b>${escapeHtml(formatDateTime(row.proof_uploaded_at))}</b>`,
      ""
    );
  });

  lines.push("Pilih tiket dari tombol di bawah untuk lihat detail.");
  return lines.join("\n");
}

export async function buildWaitingDetailText(env, ticket) {
  const { partnerUsername, partnerNickname } = await buildPartnerIdentity(env, ticket?.partner_id);

  const lines = [
    "💳 <b>DETAIL REVIEW PEMBAYARAN</b>",
    "",
    `Kode Tiket: <code>${escapeHtml(String(ticket?.ticket_code || "-"))}</code>`,
    `Username: <b>${escapeHtml(partnerUsername)}</b>`,
    `Nickname: <b>${escapeHtml(partnerNickname)}</b>`,
    `Partner ID: <code>${escapeHtml(String(ticket?.partner_id || "-"))}</code>`,
    `Class: <b>${escapeHtml(formatClassLabel(ticket?.class_id))}</b>`,
    `Durasi: <b>${escapeHtml(resolveDurationLabelFromTicket(ticket))}</b>`,
    `Provider: <b>${escapeHtml(formatProviderLabel(ticket?.provider))}</b>`,
    `Harga Dasar: <b>${escapeHtml(formatMoney(ticket?.amount_base || 0))}</b>`,
    `Kode Unik: <b>${escapeHtml(String(ticket?.unique_code || "0"))}</b>`,
    `Total Bayar: <b>${escapeHtml(formatMoney(ticket?.amount_final || 0))}</b>`,
  ];

  if (hasValue(ticket?.payer_name)) {
    lines.push(`Nama Pengirim: <b>${escapeHtml(String(ticket.payer_name))}</b>`);
  }

  if (hasValue(ticket?.payer_notes)) {
    lines.push(`Catatan: <b>${escapeHtml(String(ticket.payer_notes))}</b>`);
  }

  if (hasValue(ticket?.proof_caption)) {
    lines.push(`Caption Bukti: <b>${escapeHtml(String(ticket.proof_caption))}</b>`);
  }

  lines.push(
    `Uploaded At: <b>${escapeHtml(formatDateTime(ticket?.proof_uploaded_at))}</b>`,
    `Expires At: <b>${escapeHtml(formatDateTime(ticket?.expires_at))}</b>`,
    `Status: <b>${escapeHtml(formatStatusLabel(ticket?.status || "-"))}</b>`
  );

  return lines.join("\n");
}

export function buildPaymentConfirmSummary(ticket, profile = null, subscription = null) {
  const username = String(profile?.username || "").trim().replace(/^@/, "");
  const nickname =
    profile?.nickname ??
    profile?.nama ??
    profile?.name ??
    profile?.full_name ??
    "";

  const durationCode = String(
    subscription?.duration_code || ticket?.duration_code || ""
  )
    .trim()
    .toLowerCase();

  const durationLabel = durationCode
    ? formatDurationLabel(durationCode)
    : resolveDurationLabelFromTicket(ticket);

  return [
    "💳 <b>Payment Confirmed</b>",
    "",
    `Kode Tiket: <code>${escapeHtml(String(ticket?.ticket_code || "-"))}</code>`,
    `Partner ID: <code>${escapeHtml(String(ticket?.partner_id || "-"))}</code>`,
    `Username: <b>${escapeHtml(username ? `@${username}` : "-")}</b>`,
    `Nickname: <b>${escapeHtml(formatNickname(nickname))}</b>`,
    `Class Partner: <b>${escapeHtml(formatClassLabel(ticket?.class_id))}</b>`,
    `Durasi: <b>${escapeHtml(durationLabel)}</b>`,
    `Masa Aktif: <b>${escapeHtml(formatDateTime(subscription?.start_at))}</b> s.d <b>${escapeHtml(formatDateTime(subscription?.end_at))}</b>`,
    `Nominal: <b>${escapeHtml(formatMoney(ticket?.amount_final))}</b>`,
  ].join("\n");
}

export function buildAlreadyProcessedMessage(ticket, actorLabel) {
  const status = normalizeStatus(ticket?.status);
  const ticketCode = String(ticket?.ticket_code || "-");
  const processedAt =
    status === "confirmed"
      ? formatDateTime(ticket?.confirmed_at)
      : status === "rejected"
        ? formatDateTime(ticket?.rejected_at)
        : "-";

  const statusLabel =
    status === "confirmed"
      ? "dikonfirmasi"
      : status === "rejected"
        ? "direject"
        : "diproses";

  return [
    `⚠️ Payment ticket <b>${escapeHtml(ticketCode)}</b> sudah ${statusLabel} sebelumnya.`,
    "",
    `Diproses oleh: <b>${escapeHtml(actorLabel || "-")}</b>`,
    `Waktu proses: <b>${escapeHtml(processedAt)}</b>`,
    "",
    "Gunakan Waiting Confirmation List sebagai backup monitor pending ticket.",
  ].join("\n");
}

export async function buildFinalReviewerBroadcastText(env, ticket, actorLabel, action) {
  const { partnerUsername, partnerNickname } = await buildPartnerIdentity(env, ticket?.partner_id);

  const actionLabel = action === "confirm" ? "dikonfirmasi" : "direject";
  const actionEmoji = action === "confirm" ? "✅" : "❌";
  const processedAt =
    action === "confirm"
      ? formatDateTime(ticket?.confirmed_at)
      : formatDateTime(ticket?.rejected_at);

  return [
    `${actionEmoji} <b>Payment Sudah ${action === "confirm" ? "Confirmed" : "Rejected"}</b>`,
    "",
    `Kode Tiket: <code>${escapeHtml(String(ticket?.ticket_code || "-"))}</code>`,
    `Username: <b>${escapeHtml(String(partnerUsername || "-"))}</b>`,
    `Nickname: <b>${escapeHtml(String(partnerNickname || "-"))}</b>`,
    `Partner ID: <code>${escapeHtml(String(ticket?.partner_id || "-"))}</code>`,
    `Nominal: <b>${escapeHtml(formatMoney(ticket?.amount_final || 0))}</b>`,
    `Status Final: <b>${escapeHtml(actionLabel)}</b>`,
    `Diproses oleh: <b>${escapeHtml(actorLabel)}</b>`,
    `Waktu proses: <b>${escapeHtml(processedAt)}</b>`,
  ].join("\n");
}
