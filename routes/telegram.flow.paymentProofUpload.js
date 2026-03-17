// routes/telegram.flow.paymentProofUpload.js

import {
  getOpenPaymentTicketByPartnerId,
  markPaymentProofUploaded,
} from "../repositories/paymentTicketsRepo.js";
import { buildPaymentReviewMessage } from "../services/paymentReviewMessage.js";

function extractPhotoFileId(msg) {
  if (!msg || !Array.isArray(msg.photo) || msg.photo.length === 0) {
    return null;
  }

  const largest = msg.photo[msg.photo.length - 1];
  return largest?.file_id || null;
}

async function replyUser(ctx, text) {
  try {
    await ctx.reply(text);
  } catch (err) {
    console.error("reply payment proof upload error", err);
  }
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
    await replyUser(
      ctx,
      "Tidak ada pembayaran yang menunggu bukti transfer saat ini."
    );
    return true;
  }

  let review = null;
  try {
    review = await buildPaymentReviewMessage(env, ticket.id);
  } catch (err) {
    console.error("build payment review message error", err);
    await replyUser(
      ctx,
      "Bukti pembayaran belum bisa diproses saat ini. Silakan coba lagi beberapa saat lagi."
    );
    return true;
  }

  const reviewerIds = Array.isArray(review?.superadmin_ids)
    ? review.superadmin_ids
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    : [];

  if (!review || reviewerIds.length === 0) {
    console.error("payment reviewer unavailable", {
      ticketId: ticket.id,
      partnerId: telegramId,
    });

    await replyUser(
      ctx,
      "Admin pembayaran sedang tidak tersedia. Bukti transfer belum disimpan. Silakan coba lagi beberapa saat lagi."
    );
    return true;
  }

  let deliveredCount = 0;

  for (const adminId of reviewerIds) {
    try {
      await ctx.telegram.sendPhoto(adminId, proofFileId, {
        caption: review.caption,
        reply_markup: review.keyboard,
      });
      deliveredCount += 1;
    } catch (err) {
      console.error("send review payment error", {
        adminId,
        ticketId: ticket.id,
        error: String(err?.message || err),
      });
    }
  }

  if (deliveredCount === 0) {
    await replyUser(
      ctx,
      "Bukti transfer belum berhasil dikirim ke admin. Silakan coba lagi beberapa saat lagi."
    );
    return true;
  }

  try {
    await markPaymentProofUploaded(env, ticket.id, proofFileId);
  } catch (err) {
    console.error("mark payment proof uploaded error", {
      ticketId: ticket.id,
      error: String(err?.message || err),
    });

    await replyUser(
      ctx,
      "Bukti transfer sudah terdeteksi, tetapi sistem gagal menyimpan status pembayaran. Mohon segera hubungi admin TeMan."
    );
    return true;
  }

  await replyUser(
    ctx,
    "Bukti pembayaran berhasil dikirim. Mohon tunggu verifikasi dari admin TeMan."
  );

  return true;
}
