// routes/telegram.flow.paymentProof.js

import { sendMessage, sendPhoto } from "../services/telegramApi.js";
import {
  getOpenPaymentTicketByPartnerId,
  markPaymentProofUploaded,
  getPaymentTicketById,
} from "../repositories/paymentTicketsRepo.js";
import * as paymentReviewMessageService from "../services/paymentReviewMessage.js";

async function buildReviewPayload(env, ticketId) {
  const candidates = [
    paymentReviewMessageService.buildPaymentReviewMessage,
    paymentReviewMessageService.createPaymentReviewMessage,
    paymentReviewMessageService.makePaymentReviewMessage,
    paymentReviewMessageService.getPaymentReviewMessage,
    paymentReviewMessageService.default,
  ].filter((fn) => typeof fn === "function");

  for (const fn of candidates) {
    try {
      const res = await fn(env, ticketId);
      if (res) return res;
    } catch (err) {
      console.error("PAYMENT REVIEW BUILDER ERROR:", err);
    }
  }

  return null;
}

export async function handlePaymentProofUpload({ env, chatId, telegramId, update }) {
  const photos = update?.message?.photo || [];
  if (!photos.length) return false;

  const best = photos[photos.length - 1];
  const fileId = best?.file_id ? String(best.file_id) : "";
  if (!fileId) return false;

  const ticket = await getOpenPaymentTicketByPartnerId(env, telegramId);

  if (!ticket) {
    await sendMessage(
      env,
      chatId,
      "⚠️ Tidak ada payment ticket yang sedang menunggu bukti transfer.\nSilakan buat ticket payment dulu."
    );
    return true;
  }

  if (String(ticket.status) !== "waiting_payment") {
    await sendMessage(
      env,
      chatId,
      "⚠️ Payment ticket saat ini tidak dalam status menunggu pembayaran.\nSilakan cek menu payment kamu."
    );
    return true;
  }

  await markPaymentProofUploaded(env, ticket.id, fileId);

  const freshTicket = await getPaymentTicketById(env, ticket.id);
  const review = await buildReviewPayload(env, freshTicket?.id || ticket.id);

  const superadminIds = Array.isArray(review?.superadmin_ids)
    ? review.superadmin_ids
    : Array.isArray(review?.superadminIds)
      ? review.superadminIds
      : [];

  for (const adminId of superadminIds) {
    try {
      await sendPhoto(
        env,
        adminId,
        fileId,
        review?.caption || "🧾 Review pembayaran baru",
        {
          parse_mode: "HTML",
          reply_markup: review?.keyboard || review?.reply_markup || undefined,
        }
      );
    } catch (err) {
      console.error("SEND PAYMENT REVIEW ERROR:", err);
    }
  }

  await sendMessage(
    env,
    chatId,
    "✅ Bukti pembayaran berhasil dikirim.\nMenunggu verifikasi admin."
  );

  return true;
}
