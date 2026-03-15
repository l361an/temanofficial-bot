// routes/callbacks/superadmin.paymentReview.js

import { sendMessage, sendPhoto, editMessageReplyMarkup } from "../../services/telegramApi.js";
import {
  getPaymentTicketById,
  rejectPaymentTicket,
} from "../../repositories/paymentTicketsRepo.js";
import { getSetting } from "../../repositories/settingsRepo.js";
import {
  getAdminByTelegramId,
  getFirstActiveSuperadminId,
} from "../../repositories/adminsRepo.js";
import { confirmPaymentAndActivateSubscription } from "../../services/paymentActivationService.js";
import {
  buildFinanceKeyboard,
  buildWaitingConfirmationItemKeyboard,
  buildWaitingConfirmationListKeyboard,
} from "./keyboards.finance.js";
import { escapeHtml } from "./shared.js";
import { CALLBACK_PREFIX } from "../telegram.constants.js";
import {
  countWaitingConfirmationTickets,
  getWaitingConfirmationTicketById,
  listWaitingConfirmationTickets,
} from "../../repositories/paymentWaitingRepo.js";
import {
  formatMoney,
  getReviewerLabel,
  listActivePaymentReviewerIds,
  normalizeStatus,
} from "../../services/paymentReviewHelpers.js";
import {
  buildAlreadyProcessedMessage,
  buildFinalReviewerBroadcastText,
  buildPaymentConfirmSummary,
  buildWaitingDetailText,
  buildWaitingListText,
} from "../../services/paymentReviewRenderer.js";

async function getFinanceState(env) {
  const manualRaw = (await getSetting(env, "payment_manual_enabled")) ?? "1";
  return {
    manualOn: String(manualRaw) !== "0",
  };
}

async function getPrimarySuperadminContact(env) {
  const superadminId = await getFirstActiveSuperadminId(env).catch(() => null);
  if (!superadminId) return null;

  const admin = await getAdminByTelegramId(env, superadminId).catch(() => null);
  if (!admin) return null;

  const username = String(admin.username || "").trim().replace(/^@/, "");
  return {
    telegram_id: String(admin.telegram_id || superadminId),
    username: username || null,
    label: admin.label || (username ? `@${username}` : String(admin.telegram_id || superadminId)),
    url: username ? `https://t.me/${username}` : null,
  };
}

function buildPartnerMenuKeyboard() {
  return {
    inline_keyboard: [[{ text: "📋 Menu TeMan", callback_data: "teman:menu" }]],
  };
}

async function buildPartnerRejectKeyboard(env) {
  const contact = await getPrimarySuperadminContact(env);

  if (contact?.url) {
    return {
      inline_keyboard: [[
        { text: "☎️ Hubungi Superadmin", url: contact.url },
        { text: "📋 Menu TeMan", callback_data: "teman:menu" },
      ]],
    };
  }

  return buildPartnerMenuKeyboard();
}

async function broadcastFinalStatusToOtherReviewers(env, ticket, actorAdminId, action) {
  const reviewerIds = await listActivePaymentReviewerIds(env);
  const actorLabel = await getReviewerLabel(env, actorAdminId);
  const text = await buildFinalReviewerBroadcastText(env, ticket, actorLabel, action);

  for (const reviewerId of reviewerIds) {
    if (String(reviewerId) === String(actorAdminId)) continue;

    await sendMessage(env, reviewerId, text, {
      parse_mode: "HTML",
    }).catch(() => {});
  }
}

export function buildSuperadminPaymentReviewHandlers() {
  const PREFIX = [];

  PREFIX.push({
    match: (d) =>
      d.startsWith(CALLBACK_PREFIX.PAYCONFIRM_OK) ||
      d.startsWith(CALLBACK_PREFIX.PAYCONFIRM_REJECT) ||
      d.startsWith("paywait:list:") ||
      d.startsWith("paywait:view:"),

    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;

      if (data.startsWith("paywait:list:")) {
        const page = Math.max(1, Number(data.split(":")[2] || 1));
        const total = await countWaitingConfirmationTickets(env);
        const rows = await listWaitingConfirmationTickets(env, { page, pageSize: 10 });
        const hasNext = page * 10 < total;

        await sendMessage(env, adminId, await buildWaitingListText(env, rows, page, total), {
          parse_mode: "HTML",
          reply_markup: buildWaitingConfirmationListKeyboard(rows, page, hasNext),
        });

        return true;
      }

      if (data.startsWith("paywait:view:")) {
        const parts = data.split(":");
        const ticketId = parts[2];
        const page = Math.max(1, Number(parts[3] || 1));
        const ticket = await getWaitingConfirmationTicketById(env, ticketId);

        if (!ticket) {
          await sendMessage(env, adminId, "⚠️ Ticket payment tidak ditemukan.");
          return true;
        }

        const detailText = await buildWaitingDetailText(env, ticket);
        const replyMarkup = buildWaitingConfirmationItemKeyboard(ticket.id, page);

        if (ticket?.proof_asset_id) {
          await sendPhoto(
            env,
            adminId,
            String(ticket.proof_asset_id),
            detailText,
            {
              parse_mode: "HTML",
              reply_markup: replyMarkup,
            }
          ).catch(async () => {
            await sendMessage(env, adminId, detailText, {
              parse_mode: "HTML",
              reply_markup: replyMarkup,
            });
          });

          return true;
        }

        await sendMessage(env, adminId, detailText, {
          parse_mode: "HTML",
          reply_markup: replyMarkup,
        });

        return true;
      }

      if (msgChatId && msgId) {
        await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      }

      if (data.startsWith(CALLBACK_PREFIX.PAYCONFIRM_OK)) {
        const ticketId = data.slice(CALLBACK_PREFIX.PAYCONFIRM_OK.length);
        const ticket = await getPaymentTicketById(env, ticketId);

        if (!ticket) {
          await sendMessage(env, adminId, "⚠️ Ticket payment tidak ditemukan.");
          return true;
        }

        const currentStatus = normalizeStatus(ticket.status);

        if (currentStatus === "confirmed" || currentStatus === "rejected") {
          const actorId =
            currentStatus === "confirmed"
              ? String(ticket.confirmed_by || "")
              : String(ticket.rejected_by || "");
          const actorLabel = actorId ? await getReviewerLabel(env, actorId) : actorId || "-";

          await sendMessage(env, adminId, buildAlreadyProcessedMessage(ticket, actorLabel), {
            parse_mode: "HTML",
          });
          return true;
        }

        const res = await confirmPaymentAndActivateSubscription(env, ticketId, adminId, null);

        if (!res?.ok) {
          await sendMessage(
            env,
            adminId,
            `⚠️ Gagal confirm payment. Reason: ${escapeHtml(String(res?.reason || "-"))}`,
            { parse_mode: "HTML" }
          );
          return true;
        }

        const freshTicket = await getPaymentTicketById(env, ticketId).catch(() => ticket);
        const state = await getFinanceState(env);

        await sendMessage(
          env,
          adminId,
          buildPaymentConfirmSummary(freshTicket || ticket, res.profile, res.subscription),
          {
            parse_mode: "HTML",
            reply_markup: buildFinanceKeyboard(state.manualOn),
          }
        );

        await broadcastFinalStatusToOtherReviewers(
          env,
          freshTicket || ticket,
          adminId,
          "confirm"
        );

        if (res?.profile?.telegram_id) {
          await sendMessage(
            env,
            res.profile.telegram_id,
            res.user_message || "✅ Pembayaran berhasil dikonfirmasi. Premium kamu sudah aktif.",
            {
              parse_mode: "HTML",
              reply_markup: res.user_reply_markup,
            }
          ).catch(() => {});
        }

        return true;
      }

      if (data.startsWith(CALLBACK_PREFIX.PAYCONFIRM_REJECT)) {
        const ticketId = data.slice(CALLBACK_PREFIX.PAYCONFIRM_REJECT.length);
        const ticket = await getPaymentTicketById(env, ticketId);

        if (!ticket) {
          await sendMessage(env, adminId, "⚠️ Ticket payment tidak ditemukan.");
          return true;
        }

        const currentStatus = normalizeStatus(ticket.status);

        if (currentStatus === "confirmed" || currentStatus === "rejected") {
          const actorId =
            currentStatus === "confirmed"
              ? String(ticket.confirmed_by || "")
              : String(ticket.rejected_by || "");
          const actorLabel = actorId ? await getReviewerLabel(env, actorId) : actorId || "-";

          await sendMessage(env, adminId, buildAlreadyProcessedMessage(ticket, actorLabel), {
            parse_mode: "HTML",
          });
          return true;
        }

        await rejectPaymentTicket(env, ticketId, adminId, "Rejected by owner/superadmin callback");

        const freshTicket = await getPaymentTicketById(env, ticketId).catch(() => ticket);
        const state = await getFinanceState(env);

        await sendMessage(
          env,
          adminId,
          [
            "❌ <b>Payment Rejected</b>",
            "",
            `Kode Tiket: <code>${escapeHtml(String(freshTicket?.ticket_code || ticket?.ticket_code || "-"))}</code>`,
            `Partner ID: <code>${escapeHtml(String(freshTicket?.partner_id || ticket?.partner_id || "-"))}</code>`,
            `Nominal: <b>${escapeHtml(formatMoney(freshTicket?.amount_final || ticket?.amount_final || 0))}</b>`,
          ].join("\n"),
          {
            parse_mode: "HTML",
            reply_markup: buildFinanceKeyboard(state.manualOn),
          }
        );

        await broadcastFinalStatusToOtherReviewers(
          env,
          freshTicket || ticket,
          adminId,
          "reject"
        );

        await sendMessage(
          env,
          ticket.partner_id,
          "❌ Bukti pembayaran kamu ditolak. Silakan hubungi admin untuk pengecekan lebih lanjut atau kembali ke Menu TeMan.",
          {
            reply_markup: await buildPartnerRejectKeyboard(env),
          }
        ).catch(() => {});

        return true;
      }

      return true;
    },
  });

  return { EXACT: {}, PREFIX };
}
