// routes/telegram.flow.selfPayment.js

import { getSetting } from "../repositories/settingsRepo.js";
import {
  getOpenPaymentTicketByPartnerId,
  createPaymentTicket,
} from "../repositories/paymentTicketsRepo.js";

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
  resolveBasePriceByClass,
} from "./telegram.flow.selfPayment.service.js";

import {
  buildPaymentMenuKeyboard,
  buildPaymentHomeMessage,
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

async function createPartnerPaymentTicket(env, chatId, telegramId, options = {}) {
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
  const price = await resolveBasePriceByClass(env, classId);
  if (!Number(price.amount)) {
    await renderPaymentScreen(
      env,
      chatId,
      sourceMessage,
      `⚠️ Harga untuk class <b>${ctx.classId === "bronze" ? "Bronze" : ctx.classId === "gold" ? "Gold" : ctx.classId === "platinum" ? "Platinum" : ctx.classId}</b> belum diset di settings.`,
      buildPaymentMenuKeyboard({
        hasOpenTicket: false,
        primaryActionText: ctx.primaryActionText,
      })
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
      class_label: classId,
      duration_months: 1,
      amount_base: amountBase,
      unique_code: uniqueCode,
      amount_final: amountFinal,
      price_setting_key: price.key,
    }),
    metadataJson: JSON.stringify({
      source: "partner_self_menu",
      action_label: ctx.primaryActionText,
    }),
  });

  await renderPaymentScreen(
    env,
    chatId,
    sourceMessage,
    buildPaymentInstructionMessage(created),
    buildPaymentMenuKeyboard({
      hasOpenTicket: true,
      primaryActionText: ctx.primaryActionText,
    })
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
    await createPartnerPaymentTicket(env, chatId, telegramId, { sourceMessage: msg });
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
