// routes/telegram.flow.selfPayment.js

import { getSetting } from "../repositories/settingsRepo.js";
import { createPaymentTicket } from "../repositories/paymentTicketsRepo.js";
import { sendPhoto } from "../services/telegramApi.js";
import { nowJakarta } from "../utils/time.js";

import {
  normalizeStatus,
  normalizeClassId,
  makeSqlDate,
  addHours,
  randomInt,
  makeTicketCode,
  sendHtml,
  buildTeManMenuKeyboard,
} from "./telegram.user.shared.js";

import {
  loadSelfPaymentContext,
  getLatestPaymentTicket,
  getPaymentExpiryHours,
  getUniqueCodeRange,
  resolvePriceByClassAndDuration,
} from "./telegram.flow.selfPayment.service.js";

import {
  buildPaymentMenuKeyboard,
  buildPaymentHomeMessage,
  buildChooseDurationMessage,
  buildPaymentDurationKeyboard,
  buildPaymentDurationConfirmKeyboard,
  buildPaymentDurationConfirmMessage,
  buildPaymentTicketSummary,
  buildPaymentInstructionMessage,
  buildPaymentUploadInfoMessage,
  buildOpenTicketWarningMessage,
  buildExpiredTicketHelpMessage,
  renderPaymentScreen,
} from "./telegram.flow.selfPayment.ui.js";

async function sendPaymentMenu(env, chatId, telegramId, options = {}) {
  const { sourceMessage = null } = options;

  const ctx = await loadSelfPaymentContext(env, telegramId);
  if (!ctx.profile) {
    await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  await renderPaymentScreen(
    env,
    chatId,
    sourceMessage,
    buildPaymentHomeMessage(ctx),
    buildPaymentMenuKeyboard({
      hasOpenTicket: Boolean(ctx.openTicket),
      primaryActionText: ctx.primaryActionText,
    })
  );
}

async function sendDurationPicker(env, chatId, telegramId, options = {}) {
  const { sourceMessage = null } = options;

  const ctx = await loadSelfPaymentContext(env, telegramId);
  if (!ctx.profile) {
    await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  const partnerStatus = normalizeStatus(ctx.profile.status);
  if (partnerStatus === "pending_approval") {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      "⚠️ Akun kamu masih <b>Pending</b>.\nTiket pembayaran baru bisa diajukan setelah registrasi disetujui.",
      buildPaymentMenuKeyboard({
        hasOpenTicket: false,
        primaryActionText: ctx.primaryActionText,
      })
    );
    return;
  }

  if (partnerStatus === "suspended") {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      "⚠️ Status partner kamu saat ini <b>Suspended</b>.\nSilakan hubungi admin TeMan untuk informasi lebih lanjut.",
      buildPaymentMenuKeyboard({
        hasOpenTicket: false,
        primaryActionText: ctx.primaryActionText,
      })
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
      buildPaymentMenuKeyboard({
        hasOpenTicket: false,
        primaryActionText: ctx.primaryActionText,
      })
    );
    return;
  }

  if (ctx.openTicket) {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      buildOpenTicketWarningMessage(ctx.openTicket),
      buildPaymentMenuKeyboard({
        hasOpenTicket: true,
        primaryActionText: ctx.primaryActionText,
      })
    );
    return;
  }

  await renderPaymentScreen(
    env,
    chatId,
    sourceMessage,
    buildChooseDurationMessage(ctx),
    buildPaymentDurationKeyboard()
  );
}

async function sendDurationConfirmation(env, chatId, telegramId, durationCode, options = {}) {
  const { sourceMessage = null } = options;

  const allowedDurationCodes = new Set(["1d", "3d", "7d", "1m"]);
  const normalizedDurationCode = String(durationCode || "").trim().toLowerCase();
  const finalDurationCode = allowedDurationCodes.has(normalizedDurationCode) ? normalizedDurationCode : "1m";

  const ctx = await loadSelfPaymentContext(env, telegramId);
  if (!ctx.profile) {
    await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  const partnerStatus = normalizeStatus(ctx.profile.status);
  if (partnerStatus === "pending_approval") {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      "⚠️ Akun kamu masih <b>Pending</b>.\nTiket pembayaran baru bisa diajukan setelah registrasi disetujui.",
      buildPaymentMenuKeyboard({
        hasOpenTicket: false,
        primaryActionText: ctx.primaryActionText,
      })
    );
    return;
  }

  if (partnerStatus === "suspended") {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      "⚠️ Status partner kamu saat ini <b>Suspended</b>.\nSilakan hubungi admin TeMan untuk informasi lebih lanjut.",
      buildPaymentMenuKeyboard({
        hasOpenTicket: false,
        primaryActionText: ctx.primaryActionText,
      })
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
      buildPaymentMenuKeyboard({
        hasOpenTicket: false,
        primaryActionText: ctx.primaryActionText,
      })
    );
    return;
  }

  if (ctx.openTicket) {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      buildOpenTicketWarningMessage(ctx.openTicket),
      buildPaymentMenuKeyboard({
        hasOpenTicket: true,
        primaryActionText: ctx.primaryActionText,
      })
    );
    return;
  }

  const classId = normalizeClassId(ctx.profile.class_id || "bronze");
  const price = await resolvePriceByClassAndDuration(env, classId, finalDurationCode);

  if (!Number(price.amount)) {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      `⚠️ Harga untuk class <b>${classId === "bronze" ? "Bronze" : classId === "gold" ? "Gold" : classId === "platinum" ? "Platinum" : classId}</b> durasi <b>${price.durationLabel}</b> belum diset di settings.`,
      buildPaymentDurationKeyboard()
    );
    return;
  }

  await renderPaymentScreen(
    env,
    chatId,
    sourceMessage,
    buildPaymentDurationConfirmMessage(ctx, price),
    buildPaymentDurationConfirmKeyboard(price.durationCode)
  );
}

async function createPartnerPaymentTicket(env, chatId, telegramId, durationCode, options = {}) {
  const { sourceMessage = null } = options;

  const allowedDurationCodes = new Set(["1d", "3d", "7d", "1m"]);
  const normalizedDurationCode = String(durationCode || "").trim().toLowerCase();
  const finalDurationCode = allowedDurationCodes.has(normalizedDurationCode) ? normalizedDurationCode : "1m";

  const ctx = await loadSelfPaymentContext(env, telegramId);
  if (!ctx.profile) {
    await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  const partnerStatus = normalizeStatus(ctx.profile.status);
  if (partnerStatus === "pending_approval") {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      "⚠️ Akun kamu masih <b>Pending</b>.\nTiket pembayaran baru bisa diajukan setelah registrasi disetujui.",
      buildPaymentMenuKeyboard({
        hasOpenTicket: false,
        primaryActionText: ctx.primaryActionText,
      })
    );
    return;
  }

  if (partnerStatus === "suspended") {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      "⚠️ Status partner kamu saat ini <b>Suspended</b>.\nSilakan hubungi admin TeMan untuk informasi lebih lanjut.",
      buildPaymentMenuKeyboard({
        hasOpenTicket: false,
        primaryActionText: ctx.primaryActionText,
      })
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
      buildPaymentMenuKeyboard({
        hasOpenTicket: false,
        primaryActionText: ctx.primaryActionText,
      })
    );
    return;
  }

  if (ctx.openTicket) {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      buildOpenTicketWarningMessage(ctx.openTicket),
      buildPaymentMenuKeyboard({
        hasOpenTicket: true,
        primaryActionText: ctx.primaryActionText,
      })
    );
    return;
  }

  const classId = normalizeClassId(ctx.profile.class_id || "bronze");
  const price = await resolvePriceByClassAndDuration(env, classId, finalDurationCode);

  if (!Number(price.amount)) {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      `⚠️ Harga untuk class <b>${classId === "bronze" ? "Bronze" : classId === "gold" ? "Gold" : classId === "platinum" ? "Platinum" : classId}</b> durasi <b>${price.durationLabel}</b> belum diset di settings.`,
      buildPaymentDurationKeyboard()
    );
    return;
  }

  const uniqueRange = await getUniqueCodeRange(env);
  const uniqueCode = randomInt(uniqueRange.min, uniqueRange.max);
  const amountBase = Number(price.amount);
  const amountFinal = amountBase + uniqueCode;

  const now = nowJakarta();
  const expiryHours = await getPaymentExpiryHours(env);
  const expiresAt = makeSqlDate(addHours(now, expiryHours));

  const created = await createPaymentTicket(env, {
    ticketCode: makeTicketCode(telegramId),
    partnerId: telegramId,
    subscriptionId: null,
    classId,
    durationMonths: price.durationMonths,
    amountBase,
    uniqueCode,
    amountFinal,
    currency: "IDR",
    provider: "manual",
    status: "waiting_payment",
    expiresAt,
    pricingSnapshotJson: JSON.stringify({
      class_id: classId,
      class_label: classId,
      duration_code: price.durationCode,
      duration_label: price.durationLabel,
      duration_days: price.durationDays,
      duration_months: price.durationMonths,
      amount_base: amountBase,
      unique_code: uniqueCode,
      amount_final: amountFinal,
      price_setting_key: price.key,
    }),
    metadataJson: JSON.stringify({
      source: "partner_self_menu",
      action_label: ctx.primaryActionText,
      duration_code: price.durationCode,
      duration_days: price.durationDays,
    }),
  });

  const finalKeyboard = {
    inline_keyboard: [
      [{ text: "📄 Cek Status", callback_data: "self:payment:status" }],
      [{ text: "📤 Upload Bukti Transfer", callback_data: "self:payment:upload_info" }],
      [{ text: "📋 Menu TeMan", callback_data: "teman:menu" }],
    ],
  };

  const qrisPhotoFileId = String((await getSetting(env, "payment_qris_photo_file_id")) || "").trim();

  if (qrisPhotoFileId) {
    await sendPhoto(
      env,
      chatId,
      qrisPhotoFileId,
      buildPaymentInstructionMessage(created, price.durationLabel, { hasQrisPhoto: true }),
      {
        parse_mode: "HTML",
        reply_markup: finalKeyboard,
      }
    );
    return;
  }

  await renderPaymentScreen(
    env,
    chatId,
    sourceMessage,
    buildPaymentInstructionMessage(created, price.durationLabel, { hasQrisPhoto: false }),
    finalKeyboard
  );
}

async function sendPaymentTicketStatus(env, chatId, telegramId, options = {}) {
  const { sourceMessage = null } = options;

  const ctx = await loadSelfPaymentContext(env, telegramId);
  if (!ctx.profile) {
    await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  if (ctx.openTicket) {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      buildPaymentTicketSummary(ctx.openTicket),
      buildPaymentMenuKeyboard({
        hasOpenTicket: true,
        primaryActionText: ctx.primaryActionText,
      })
    );
    return;
  }

  const latestTicket = await getLatestPaymentTicket(env, telegramId);
  if (!latestTicket) {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      "Belum ada tiket pembayaran.",
      buildPaymentMenuKeyboard({
        hasOpenTicket: false,
        primaryActionText: ctx.primaryActionText,
      })
    );
    return;
  }

  if (normalizeStatus(latestTicket.status) === "expired") {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      buildExpiredTicketHelpMessage(latestTicket),
      buildPaymentMenuKeyboard({
        hasOpenTicket: false,
        primaryActionText: ctx.primaryActionText,
      })
    );
    return;
  }

  await renderPaymentScreen(
    env,
    chatId,
    sourceMessage,
    buildPaymentTicketSummary(latestTicket),
    buildPaymentMenuKeyboard({
      hasOpenTicket: false,
      primaryActionText: ctx.primaryActionText,
    })
  );
}

export async function handleSelfPaymentInlineCallback(update, env) {
  const data = update?.callback_query?.data || "";
  const msg = update?.callback_query?.message;
  const chatId = msg?.chat?.id;
  const telegramId = String(update?.callback_query?.from?.id || "");

  if (!chatId || !telegramId) return true;

  if (data === "self:payment") {
    await sendPaymentMenu(env, chatId, telegramId, { sourceMessage: msg });
    return true;
  }

  if (data === "self:payment:create") {
    await sendDurationPicker(env, chatId, telegramId, { sourceMessage: msg });
    return true;
  }

  if (data === "self:payment:pick:1d") {
    await sendDurationConfirmation(env, chatId, telegramId, "1d", { sourceMessage: msg });
    return true;
  }

  if (data === "self:payment:pick:3d") {
    await sendDurationConfirmation(env, chatId, telegramId, "3d", { sourceMessage: msg });
    return true;
  }

  if (data === "self:payment:pick:7d") {
    await sendDurationConfirmation(env, chatId, telegramId, "7d", { sourceMessage: msg });
    return true;
  }

  if (data === "self:payment:pick:1m") {
    await sendDurationConfirmation(env, chatId, telegramId, "1m", { sourceMessage: msg });
    return true;
  }

  if (data === "self:payment:confirm:1d") {
    await createPartnerPaymentTicket(env, chatId, telegramId, "1d", { sourceMessage: msg });
    return true;
  }

  if (data === "self:payment:confirm:3d") {
    await createPartnerPaymentTicket(env, chatId, telegramId, "3d", { sourceMessage: msg });
    return true;
  }

  if (data === "self:payment:confirm:7d") {
    await createPartnerPaymentTicket(env, chatId, telegramId, "7d", { sourceMessage: msg });
    return true;
  }

  if (data === "self:payment:confirm:1m") {
    await createPartnerPaymentTicket(env, chatId, telegramId, "1m", { sourceMessage: msg });
    return true;
  }

  if (data === "self:payment:status") {
    await sendPaymentTicketStatus(env, chatId, telegramId, { sourceMessage: msg });
    return true;
  }

  if (data === "self:payment:upload_info") {
    const ctx = await loadSelfPaymentContext(env, telegramId);
    if (!ctx.profile) {
      await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return true;
    }

    await renderPaymentScreen(
      env,
      chatId,
      msg,
      buildPaymentUploadInfoMessage(ctx.openTicket),
      buildPaymentMenuKeyboard({
        hasOpenTicket: Boolean(ctx.openTicket),
        primaryActionText: ctx.primaryActionText,
      })
    );
    return true;
  }

  return false;
}
