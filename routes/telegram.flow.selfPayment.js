// routes/telegram.flow.selfPayment.js

import { sendMessage, upsertCallbackMessage } from "../services/telegramApi.js";
import { getSetting } from "../repositories/settingsRepo.js";
import {
  getOpenPaymentTicketByPartnerId,
  createPaymentTicket,
} from "../repositories/paymentTicketsRepo.js";
import { getProfileFullByTelegramId } from "../repositories/profilesRepo.js";
import { getSubscriptionInfoByTelegramId } from "../repositories/partnerSubscriptionsRepo.js";
import { fmtClassId } from "../utils/partnerHelpers.js";

import {
  escapeHtml,
  normalizeStatus,
  normalizeClassId,
  formatMoney,
  formatDateTime,
  makeSqlDate,
  addHours,
  randomInt,
  makeTicketCode,
  sendHtml,
  buildTeManMenuKeyboard,
} from "./telegram.user.shared.js";

function buildPaymentMenuKeyboard({ hasOpenTicket = false } = {}) {
  const rows = [];

  if (!hasOpenTicket) {
    rows.push([
      { text: "🧾 Upgrade Premium", callback_data: "self:payment:create" }
    ]);
  }

  if (hasOpenTicket) {
    rows.push([
      { text: "📄 Cek Status", callback_data: "self:payment:status" }
    ]);

    rows.push([
      { text: "📤 Upload Bukti Transfer", callback_data: "self:payment:upload_info" }
    ]);
  }

  rows.push([
    { text: "📋 Menu TeMan", callback_data: "teman:menu" }
  ]);

  return { inline_keyboard: rows };
}

function fmtPartnerStatusLabel(status) {
  const raw = String(status || "").trim().toLowerCase();
  if (raw === "pending_approval") return "Menunggu Persetujuan";
  if (raw === "approved") return "Approved";
  if (raw === "active") return "Premium Aktif";
  if (raw === "suspended") return "Suspended";
  return raw ? raw.replaceAll("_", " ") : "-";
}

function fmtTicketStatusLabel(status) {
  const raw = String(status || "").trim().toLowerCase();
  if (raw === "waiting_payment") return "Menunggu Pembayaran";
  if (raw === "waiting_confirmation") return "Menunggu Konfirmasi Superadmin";
  if (raw === "confirmed") return "Terkonfirmasi";
  if (raw === "rejected") return "Ditolak";
  if (raw === "expired") return "Kedaluwarsa";
  if (raw === "cancelled") return "Dibatalkan";
  return raw ? raw.replaceAll("_", " ") : "-";
}

function fmtPremiumStatusLabel(profile, subInfo) {
  if (subInfo?.is_active && subInfo?.row) return "Aktif";

  const latestSubStatus = String(subInfo?.row?.status || "").trim().toLowerCase();
  if (latestSubStatus === "expired") return "Expired";
  if (latestSubStatus === "cancelled") return "Cancelled";

  const partnerStatus = String(profile?.status || "").trim().toLowerCase();
  if (partnerStatus === "active") return "Aktif";
  if (partnerStatus === "suspended") return "Suspended";

  return "Belum Aktif";
}

async function getLatestPaymentTicket(env, partnerId) {
  const row = await env.DB.prepare(`
    SELECT *
    FROM payment_tickets
    WHERE partner_id = ?
    ORDER BY datetime(created_at) DESC, datetime(updated_at) DESC, id DESC
    LIMIT 1
  `)
    .bind(String(partnerId))
    .first();

  return row ?? null;
}

async function getPaymentExpiryHours(env) {
  const raw = await getSetting(env, "pp_ticket_expiry_hours");
  const hours = Number(raw || 24);
  return Number.isFinite(hours) && hours > 0 ? hours : 24;
}

async function getUniqueCodeRange(env) {
  const rawMin = await getSetting(env, "pp_unique_min");
  const rawMax = await getSetting(env, "pp_unique_max");

  const min = Number(rawMin || 500);
  const max = Number(rawMax || 999);

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 500, max: 999 };
  }

  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
  };
}

async function resolveBasePriceByClass(env, classId) {
  const keyCandidates = [
    `payment_price_${classId}_1m`,
    `payment_price_${classId}`,
    `payment_${classId}_1m`,
    `payment_${classId}`,
    `pp_price_${classId}_1m`,
    `pp_price_${classId}`,
    `${classId}_price_1m`,
    `${classId}_price`,
  ];

  for (const key of keyCandidates) {
    const raw = await getSetting(env, key);
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) {
      return { amount: num, key };
    }
  }

  return { amount: 0, key: null };
}

function buildPaymentTicketSummary(ticket) {
  if (!ticket) return "Belum ada tiket payment.";

  const classLabel = fmtClassId(ticket.class_id);
  const lines = [
    "💳 <b>STATUS TIKET PAYMENT</b>",
    "",
    `Kode Tiket: <code>${escapeHtml(String(ticket.ticket_code || "-"))}</code>`,
    `Status Tiket: <b>${escapeHtml(fmtTicketStatusLabel(ticket.status))}</b>`,
    `Class Partner: <b>${escapeHtml(classLabel)}</b>`,
    `Durasi: <b>${escapeHtml(String(ticket.duration_months || "-"))}</b> bulan`,
    `Nominal Transfer: <b>${escapeHtml(formatMoney(ticket.amount_final))}</b>`,
    `Batas Waktu: <b>${escapeHtml(formatDateTime(ticket.expires_at))}</b>`,
  ];

  if (ticket.proof_uploaded_at) {
    lines.push(`Upload Bukti: <b>${escapeHtml(formatDateTime(ticket.proof_uploaded_at))}</b>`);
  }

  return lines.join("\n");
}

function buildPaymentInstructionMessage(ticket) {
  const classLabel = fmtClassId(ticket?.class_id);
  const lines = [
    "✅ <b>TIKET PAYMENT BERHASIL DIBUAT</b>",
    "",
    `Kode Tiket: <code>${escapeHtml(String(ticket?.ticket_code || "-"))}</code>`,
    `Class Partner: <b>${escapeHtml(classLabel)}</b>`,
    `Durasi: <b>${escapeHtml(String(ticket?.duration_months || "-"))}</b> bulan`,
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

function buildPaymentUploadInfoMessage(ticket = null) {
  const lines = [
    "📤 <b>UPLOAD BUKTI PAYMENT</b>",
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

function buildOpenTicketWarningMessage(ticket) {
  return [
    "⚠️ <b>KAMU MASIH PUNYA TIKET AKTIF</b>",
    "",
    "Sesuai rule, 1 partner hanya boleh punya 1 tiket aktif.",
    "",
    buildPaymentTicketSummary(ticket),
  ].join("\n");
}

function buildExpiredTicketHelpMessage(ticket) {
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

async function renderPaymentScreen(env, chatId, sourceMessage, text, replyMarkup) {
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

async function sendPaymentMenu(env, chatId, telegramId, options = {}) {
  const { sourceMessage = null } = options;

  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile) {
    await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  const subInfo = await getSubscriptionInfoByTelegramId(env, telegramId).catch(() => ({
    found: false,
    is_active: false,
    row: null,
  }));

  const openTicket = await getOpenPaymentTicketByPartnerId(env, telegramId);
  const latestTicket = openTicket || (await getLatestPaymentTicket(env, telegramId));

  const lines = [
    "💎 <b>PREMIUM PARTNER</b>",
    "",
    `Status Partner: <b>${escapeHtml(fmtPartnerStatusLabel(profile.status))}</b>`,
    `Status Premium: <b>${escapeHtml(fmtPremiumStatusLabel(profile, subInfo))}</b>`,
    `Class Partner: <b>${escapeHtml(fmtClassId(profile.class_id || "bronze"))}</b>`,
  ];

  if (subInfo?.row?.end_at) {
    lines.push(`Masa Aktif Premium: <b>${escapeHtml(formatDateTime(subInfo.row.end_at))}</b>`);
  }

  lines.push("");

  if (latestTicket) {
    lines.push(`Tiket Terakhir: <code>${escapeHtml(String(latestTicket.ticket_code || "-"))}</code>`);
    lines.push(`Status Tiket: <b>${escapeHtml(fmtTicketStatusLabel(latestTicket.status))}</b>`);
  } else {
    lines.push("Tiket Terakhir: <b>-</b>");
  }

  await renderPaymentScreen(
    env,
    chatId,
    sourceMessage,
    lines.join("\n"),
    buildPaymentMenuKeyboard({ hasOpenTicket: Boolean(openTicket) })
  );
}

async function createPartnerPaymentTicket(env, chatId, telegramId, options = {}) {
  const { sourceMessage = null } = options;

  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile) {
    await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  const partnerStatus = normalizeStatus(profile.status);
  if (partnerStatus === "pending_approval") {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      "⚠️ Akun kamu masih <b>Menunggu Persetujuan</b>.\nTiket payment baru bisa diajukan setelah registrasi disetujui.",
      buildPaymentMenuKeyboard()
    );
    return;
  }

  const paymentEnabled = (await getSetting(env, "payment_manual_enabled")) ?? "1";
  if (String(paymentEnabled) === "0") {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      "⚠️ Payment manual sedang dinonaktifkan oleh Superadmin.",
      buildPaymentMenuKeyboard()
    );
    return;
  }

  const openTicket = await getOpenPaymentTicketByPartnerId(env, telegramId);
  if (openTicket) {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      buildOpenTicketWarningMessage(openTicket),
      buildPaymentMenuKeyboard({ hasOpenTicket: true })
    );
    return;
  }

  const classId = normalizeClassId(profile.class_id || "bronze");
  const price = await resolveBasePriceByClass(env, classId);
  if (!Number(price.amount)) {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      `⚠️ Harga untuk class <b>${escapeHtml(fmtClassId(classId))}</b> belum diset di settings.`,
      buildPaymentMenuKeyboard()
    );
    return;
  }

  const uniqueRange = await getUniqueCodeRange(env);
  const uniqueCode = randomInt(uniqueRange.min, uniqueRange.max);
  const amountBase = Number(price.amount);
  const amountFinal = amountBase + uniqueCode;

  const now = new Date();
  const expiryHours = await getPaymentExpiryHours(env);
  const expiresAt = makeSqlDate(addHours(now, expiryHours));

  const created = await createPaymentTicket(env, {
    ticketCode: makeTicketCode(telegramId),
    partnerId: telegramId,
    subscriptionId: null,
    classId,
    durationMonths: 1,
    amountBase,
    uniqueCode,
    amountFinal,
    currency: "IDR",
    provider: "manual",
    status: "waiting_payment",
    expiresAt,
    pricingSnapshotJson: JSON.stringify({
      class_id: classId,
      class_label: fmtClassId(classId),
      duration_months: 1,
      amount_base: amountBase,
      unique_code: uniqueCode,
      amount_final: amountFinal,
      price_setting_key: price.key,
    }),
    metadataJson: JSON.stringify({
      source: "partner_self_menu",
    }),
  });

  await renderPaymentScreen(
    env,
    chatId,
    sourceMessage,
    buildPaymentInstructionMessage(created),
    buildPaymentMenuKeyboard({ hasOpenTicket: true })
  );
}

async function sendPaymentTicketStatus(env, chatId, telegramId, options = {}) {
  const { sourceMessage = null } = options;

  const openTicket = await getOpenPaymentTicketByPartnerId(env, telegramId);
  if (openTicket) {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      buildPaymentTicketSummary(openTicket),
      buildPaymentMenuKeyboard({ hasOpenTicket: true })
    );
    return;
  }

  const latestTicket = await getLatestPaymentTicket(env, telegramId);
  if (!latestTicket) {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      "Belum ada tiket payment.",
      buildPaymentMenuKeyboard()
    );
    return;
  }

  if (normalizeStatus(latestTicket.status) === "expired") {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      buildExpiredTicketHelpMessage(latestTicket),
      buildPaymentMenuKeyboard()
    );
    return;
  }

  await renderPaymentScreen(
    env,
    chatId,
    sourceMessage,
    buildPaymentTicketSummary(latestTicket),
    buildPaymentMenuKeyboard()
  );
}

export async function handleSelfPaymentInlineCallback(update, env) {
  const data = update?.callback_query?.data || "";
  const msg = update?.callback_query?.message;
  const chatId = msg?.chat?.id;
  const telegramId = String(update?.callback_query?.from?.id || "");

  if (!chatId || !telegramId) return true;

  const ensureRegistered = async () => {
    const p = await getProfileFullByTelegramId(env, telegramId);
    if (!p) {
      await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return null;
    }
    return p;
  };

  if (data === "self:payment") {
    const p = await ensureRegistered();
    if (!p) return true;

    await sendPaymentMenu(env, chatId, telegramId, { sourceMessage: msg });
    return true;
  }

  if (data === "self:payment:create") {
    const p = await ensureRegistered();
    if (!p) return true;

    await createPartnerPaymentTicket(env, chatId, telegramId, { sourceMessage: msg });
    return true;
  }

  if (data === "self:payment:status") {
    const p = await ensureRegistered();
    if (!p) return true;

    await sendPaymentTicketStatus(env, chatId, telegramId, { sourceMessage: msg });
    return true;
  }

  if (data === "self:payment:upload_info") {
    const p = await ensureRegistered();
    if (!p) return true;

    const openTicket = await getOpenPaymentTicketByPartnerId(env, telegramId);
    await renderPaymentScreen(
      env,
      chatId,
      msg,
      buildPaymentUploadInfoMessage(openTicket),
      buildPaymentMenuKeyboard({ hasOpenTicket: Boolean(openTicket) })
    );
    return true;
  }

  return false;
}
