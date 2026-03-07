// routes/telegram.flow.paymentProofUpload.js

import { getOpenPaymentTicketByPartnerId, markPaymentProofUploaded } from "../repositories/paymentTicketsRepo.js";
import { buildPaymentReviewMessage } from "../services/paymentReviewMessage.js";

function extractPhotoFileId(msg) {
  if (!msg || !Array.isArray(msg.photo) || msg.photo.length === 0) {
    return null;
  }

  const largest = msg.photo[msg.photo.length - 1];
  return largest?.file_id || null;
}

export async function handlePaymentProofUpload(ctx, env) {
  const msg = ctx?.message;
  if (!msg) return false;

  const telegramId = String(msg.from?.id || "").trim();
  if (!telegramId) return false;

  const proofFileId = extractPhotoFileId(msg);
  if (!proofFileId) return false;

  const ticket = await getOpenPaymentTicketByPartnerId(env, telegramId);
  if (!ticket) return false;

  if (ticket.status !== "waiting_payment") {
    await ctx.reply(
      "Tidak ada pembayaran yang menunggu bukti transfer saat ini."
    );
    return true;
  }

  await markPaymentProofUploaded(env, ticket.id, proofFileId);

  const review = await buildPaymentReviewMessage(env, ticket.id);

  if (review?.superadmin_ids?.length) {
    for (const adminId of review.superadmin_ids) {
      try {
        await ctx.telegram.sendPhoto(
          adminId,
          proofFileId,
          {
            caption: review.caption,
            reply_markup: review.keyboard
          }
        );
      } catch (err) {
        console.error("send review payment error", err);
      }
    }
  }

  await ctx.reply(
    "Bukti pembayaran berhasil dikirim. Mohon tunggu verifikasi dari admin TeMan."
  );

  return true;
}
