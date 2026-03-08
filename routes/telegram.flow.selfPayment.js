// routes/telegram.flow.selfPayment.js

import { sendMessage } from "../services/telegramApi.js";
import { getSetting } from "../repositories/settingsRepo.js";
import {
  getOpenPaymentTicketByPartnerId,
  createPaymentTicket,
} from "../repositories/paymentTicketsRepo.js";
import { getProfileFullByTelegramId } from "../repositories/profilesRepo.js";
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

function buildPaymentMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🧾 Ajukan Tiket Payment", callback_data: "self:payment:create" }],
      [{ text: "📄 Status Tiket Payment", callback_data: "self:payment:status" }],
      [{ text: "📤 Upload Bukti Transfer", callback_data: "self:payment:upload_info" }],
      [{ text: "⬅️ Kembali", callback_data: "teman:menu" }],
      [{ text: "📋 Menu TeMan", callback_data: "teman:menu" }],
    ],
  };
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
    "💳 <b>Payment Ticket</b>",
    "",
    `Kode Tiket: <code>${escapeHtml(String(ticket.ticket_code || "-"))}</code>`,
    `Status: <b>${escapeHtml(String(ticket.status || "-"))}</b>`,
    `Class ID: <b>${escapeHtml(classLabel)}</b>`,
    `Durasi: <b>${escapeHtml(String(ticket.duration_months || "-"))}</b> bulan`,
    `Nominal: <b>${escapeHtml(formatMoney(ticket.amount_final))}</b>`,
    `Expired: <b>${escapeHtml(formatDateTime(ticket.expires_at))}</b>`,
  ];

  return lines.join("\n");
}

function buildPaymentInstructionMessage(ticket) {
  const classLabel = fmtClassId(ticket?.class_id);
  const lines = [
    "💳 <b>Tiket Payment Berhasil Dibuat</b>",
    "",
    `Kode Tiket: <code>${escapeHtml(String(ticket?.ticket_code || "-"))}</code>`,
    `Class ID: <b>${escapeHtml(classLabel)}</b>`,
    `Durasi: <b>${escapeHtml(String(ticket?.duration_months || "-"))}</b> bulan`,
    `Total Bayar: <b>${escapeHtml(formatMoney(ticket?.amount_final))}</b>`,
    `Batas Waktu: <b>${escapeHtml(formatDateTime(ticket?.expires_at))}</b>`,
    "",
    "Silakan transfer sesuai nominal di atas.",
    "Setelah transfer, kirim <b>foto bukti transfer</b> langsung di chat ini.",
    "",
    "Catatan:",
    "• 1 partner hanya boleh punya 1 tiket aktif",
    "• upload bukti hanya saat status waiting_payment",
    "• setelah upload, status jadi waiting_confirmation",
    "• jika tiket expired dan transfer sudah terlanjur dilakukan, hubungi Superadmin untuk manual check",
  ];

  return lines.join("\n");
}

function buildPaymentUploadInfoMessage(ticket = null) {
  const lines = [
    "📤 <b>Upload Bukti Payment</b>",
    "",
    "Kirim <b>foto bukti transfer</b> langsung di chat ini.",
    "Bukan file, bukan dokumen.",
    "",
    "Rule:",
    "• upload bukti hanya saat tiket status <b>waiting_payment</b>",
    "• setelah upload, tiket jadi <b>waiting_confirmation</b>",
    "• kalau tiket sudah expired, sistem tidak proses otomatis",
  ];

  if (ticket) {
    lines.push("");
    lines.push(`Tiket aktif: <code>${escapeHtml(String(ticket.ticket_code || "-"))}</code>`);
    lines.push(`Status: <b>${escapeHtml(String(ticket.status || "-"))}</b>`);
    lines.push(`Nominal: <b>${escapeHtml(formatMoney(ticket.amount_final))}</b>`);
    lines.push(`Expired: <b>${escapeHtml(formatDateTime(ticket.expires_at))}</b>`);
  }

  return lines.join("\n");
}

async function sendPaymentMenu(env, chatId, telegramId) {
  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile) {
    await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  const latestTicket = await getLatestPaymentTicket(env, telegramId);
  const lines = [
    "💳 <b>Payment Menu</b>",
    "",
    `Status Partner: <b>${escapeHtml(String(profile.status || "-"))}</b>`,
    `Class ID: <b>${escapeHtml(fmtClassId(profile.class_id))}</b>`,
  ];

  if (latestTicket) {
    lines.push(`Tiket Terakhir: <code>${escapeHtml(String(latestTicket.ticket_code || "-"))}</code>`);
    lines.push(`Status Tiket: <b>${escapeHtml(String(latestTicket.status || "-"))}</b>`);
  } else {
    lines.push("Tiket Terakhir: <b>-</b>");
  }

  await sendMessage(env, chatId, lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: buildPaymentMenuKeyboard(),
    disable_web_page_preview: true,
  });
}

async function createPartnerPaymentTicket(env, chatId, telegramId) {
  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile) {
    await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  const partnerStatus = normalizeStatus(profile.status);
  if (partnerStatus === "pending_approval") {
    await sendHtml(
      env,
      chatId,
      "⚠️ Akun kamu masih <b>pending_approval</b>.\nTiket payment baru bisa diajukan setelah registrasi disetujui.",
      { reply_markup: buildPaymentMenuKeyboard() }
    );
    return;
  }

  const paymentEnabled = (await getSetting(env, "payment_manual_enabled")) ?? "1";
  if (String(paymentEnabled) === "0") {
    await sendHtml(
      env,
      chatId,
      "⚠️ Payment manual sedang dinonaktifkan oleh Superadmin.",
      { reply_markup: buildPaymentMenuKeyboard() }
    );
    return;
  }

  const openTicket = await getOpenPaymentTicketByPartnerId(env, telegramId);
  if (openTicket) {
    await sendMessage(env, chatId, buildPaymentTicketSummary(openTicket), {
      parse_mode: "HTML",
      reply_markup: buildPaymentMenuKeyboard(),
      disable_web_page_preview: true,
    });
    return;
  }

  const classId = normalizeClassId(profile.class_id || "bronze");
  const price = await resolveBasePriceByClass(env, classId);
  if (!Number(price.amount)) {
    await sendHtml(
      env,
      chatId,
      `⚠️ Harga untuk class <b>${escapeHtml(fmtClassId(classId))}</b> belum diset di settings.`,
      { reply_markup: buildPaymentMenuKeyboard() }
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

  await sendMessage(env, chatId, buildPaymentInstructionMessage(created), {
    parse_mode: "HTML",
    reply_markup: buildPaymentMenuKeyboard(),
    disable_web_page_preview: true,
  });
}

async function sendPaymentTicketStatus(env, chatId, telegramId) {
  const openTicket = await getOpenPaymentTicketByPartnerId(env, telegramId);
  if (openTicket) {
    await sendMessage(env, chatId, buildPaymentTicketSummary(openTicket), {
      parse_mode: "HTML",
      reply_markup: buildPaymentMenuKeyboard(),
      disable_web_page_preview: true,
    });
    return;
  }

  const latestTicket = await getLatestPaymentTicket(env, telegramId);
  if (!latestTicket) {
    await sendHtml(env, chatId, "Belum ada tiket payment.", {
      reply_markup: buildPaymentMenuKeyboard(),
    });
    return;
  }

  await sendMessage(env, chatId, buildPaymentTicketSummary(latestTicket), {
    parse_mode: "HTML",
    reply_markup: buildPaymentMenuKeyboard(),
    disable_web_page_preview: true,
  });
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

    await sendPaymentMenu(env, chatId, telegramId);
    return true;
  }

  if (data === "self:payment:create") {
    const p = await ensureRegistered();
    if (!p) return true;

    await createPartnerPaymentTicket(env, chatId, telegramId);
    return true;
  }

  if (data === "self:payment:status") {
    const p = await ensureRegistered();
    if (!p) return true;

    await sendPaymentTicketStatus(env, chatId, telegramId);
    return true;
  }

  if (data === "self:payment:upload_info") {
    const p = await ensureRegistered();
    if (!p) return true;

    const openTicket = await getOpenPaymentTicketByPartnerId(env, telegramId);
    await sendMessage(env, chatId, buildPaymentUploadInfoMessage(openTicket), {
      parse_mode: "HTML",
      reply_markup: buildPaymentMenuKeyboard(),
      disable_web_page_preview: true,
    });
    return true;
  }

  return false;
}
