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

async function getLatestPaymentTicketByPartnerId(env, partnerId) {
  const row = await env.DB.prepare(
    `
    SELECT *
    FROM payment_tickets
    WHERE partner_id = ?
    ORDER BY datetime(created_at) DESC, datetime(updated_at) DESC, id DESC
    LIMIT 1
  `
  )
    .bind(String(partnerId))
    .first();

  return row ?? null;
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

async function sendTicketStatusMessage(env, chatId, ticket) {
  const status = normalizeStatus(ticket?.status);

  if (status === "waiting_confirmation") {
    await sendMessage(
      env,
      chatId,
      "⏳ Bukti pembayaran untuk tiket kamu sudah pernah dikirim dan saat ini sedang menunggu konfirmasi superadmin.\n\nSilakan tunggu proses review ya."
    );
    return true;
  }

  if (status === "expired") {
    await sendMessage(
      env,
      chatId,
      "⚠️ Tiket pembayaran kamu sudah melewati batas waktu dan tidak bisa diproses otomatis.\n\nKalau kamu belum transfer, silakan buat tiket payment baru.\nKalau kamu sudah terlanjur transfer, silakan hubungi admin TeMan dan kirim bukti pembayaran untuk pengecekan manual."
    );
    return true;
  }

  if (status === "confirmed") {
    await sendMessage(
      env,
      chatId,
      "✅ Pembayaran untuk tiket ini sudah dikonfirmasi sebelumnya.\nTidak perlu kirim bukti lagi ya."
    );
    return true;
  }

  if (status === "rejected") {
    await sendMessage(
      env,
      chatId,
      "❌ Bukti pembayaran untuk tiket sebelumnya sudah ditolak.\nSilakan buat tiket payment baru atau hubungi admin jika perlu bantuan."
    );
    return true;
  }

  if (status === "cancelled") {
    await sendMessage(
      env,
      chatId,
      "⚠️ Tiket pembayaran sebelumnya sudah dibatalkan.\nSilakan buat tiket payment baru ya."
    );
    return true;
  }

  await sendMessage(
    env,
    chatId,
    "⚠️ Tidak ada tiket payment aktif yang bisa menerima bukti transfer.\nSilakan buat tiket payment baru dulu."
  );
  return true;
}

export async function handlePaymentProofUpload({ env, chatId, telegramId, update }) {
  const photos = update?.message?.photo || [];
  if (!photos.length) return false;

  const best = photos[photos.length - 1];
  const fileId = best?.file_id ? String(best.file_id) : "";
  if (!fileId) return false;

  const openTicket = await getOpenPaymentTicketByPartnerId(env, telegramId);

  if (!openTicket) {
    const latestTicket = await getLatestPaymentTicketByPartnerId(env, telegramId);

    if (!latestTicket) {
      await sendMessage(
        env,
        chatId,
        "⚠️ Tidak ada payment ticket yang sedang aktif.\nSilakan buat tiket payment dulu sebelum kirim bukti transfer."
      );
      return true;
    }

    return sendTicketStatusMessage(env, chatId, latestTicket);
  }

  const status = normalizeStatus(openTicket.status);

  if (status !== "waiting_payment") {
    return sendTicketStatusMessage(env, chatId, openTicket);
  }

  await markPaymentProofUploaded(env, openTicket.id, fileId);

  const freshTicket = await getPaymentTicketById(env, openTicket.id);
  const review = await buildReviewPayload(env, freshTicket?.id || openTicket.id);

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
    "✅ Bukti pembayaran berhasil dikirim.\nMenunggu verifikasi superadmin."
  );

  return true;
}
