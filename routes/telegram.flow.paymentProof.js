// routes/telegram.flow.paymentProof.js

import { sendMessage } from "../services/telegramApi.js";
import {
  getOpenPaymentTicketByPartnerId,
  markPaymentProofUploaded,
} from "../repositories/paymentTicketsRepo.js";

import { buildPaymentReviewMessage } from "../services/paymentReviewMessage.js";

export async function handlePaymentProofUpload({ env, chatId, telegramId, update }) {
  const photo = update?.message?.photo;
  if (!photo || !photo.length) return false;

  const fileId = photo[photo.length - 1]?.file_id;
  if (!fileId) return false;

  const ticket = await getOpenPaymentTicketByPartnerId(env, telegramId);
  if (!ticket) return false;

  if (String(ticket.status) !== "waiting_payment") {
    await sendMessage(
      env,
      chatId,
      "⚠️ Tidak ada pembayaran yang menunggu bukti transfer."
    );
    return true;
  }

  await markPaymentProofUploaded(env, ticket.id, fileId);

  const review = await buildPaymentReviewMessage(env, ticket.id);

  const superadmins = Array.isArray(review?.superadmin_ids)
    ? review.superadmin_ids
    : [];

  for (const adminId of superadmins) {
    try {
      await env.TELEGRAM_BOT.sendPhoto(adminId, fileId, {
        caption: review.caption,
        reply_markup: review.keyboard,
        parse_mode: "HTML",
      });
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
