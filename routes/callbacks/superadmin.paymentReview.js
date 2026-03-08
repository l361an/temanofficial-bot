// routes/callbacks/superadmin.paymentReview.js

import { sendMessage, editMessageReplyMarkup } from "../../services/telegramApi.js";
import {
  getPaymentTicketById,
  rejectPaymentTicket,
} from "../../repositories/paymentTicketsRepo.js";

import { confirmPaymentAndActivateSubscription } from "../../services/paymentActivationService.js";
import { CALLBACK_PREFIX } from "../telegram.constants.js";

export function buildSuperadminPaymentReviewHandlers() {
  const PREFIX = [];

  PREFIX.push({
    match: (d) =>
      d.startsWith(CALLBACK_PREFIX.PAYCONFIRM_OK) ||
      d.startsWith(CALLBACK_PREFIX.PAYCONFIRM_REJECT),

    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;

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

        if (String(ticket.status) === "confirmed") {
          await sendMessage(env, adminId, "⚠️ Ticket ini sudah dikonfirmasi sebelumnya.");
          return true;
        }

        const res = await confirmPaymentAndActivateSubscription(
          env,
          ticketId,
          adminId,
          null
        );

        if (!res.ok) {
          await sendMessage(env, adminId, `⚠️ Gagal confirm payment.`);
          return true;
        }

        await sendMessage(env, adminId, "✅ Payment berhasil dikonfirmasi.");

        return true;
      }

      if (data.startsWith(CALLBACK_PREFIX.PAYCONFIRM_REJECT)) {
        const ticketId = data.slice(CALLBACK_PREFIX.PAYCONFIRM_REJECT.length);

        const ticket = await getPaymentTicketById(env, ticketId);

        if (!ticket) {
          await sendMessage(env, adminId, "⚠️ Ticket payment tidak ditemukan.");
          return true;
        }

        await rejectPaymentTicket(env, ticketId, adminId, "Rejected by superadmin");

        await sendMessage(env, adminId, "❌ Payment ticket direject.");

        return true;
      }

      return true;
    },
  });

  return { EXACT: {}, PREFIX };
}
