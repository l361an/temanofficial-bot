// routes/telegram.flow.paymentProof.js

import { sendMessage, sendPhoto } from "../services/telegramApi.js";
import {
  getOpenPaymentTicketByPartnerId,
  markPaymentProofUploaded,
  getPaymentTicketById,
} from "../repositories/paymentTicketsRepo.js";
import { getAdminByTelegramId, getFirstActiveSuperadminId } from "../repositories/adminsRepo.js";
import * as paymentReviewMessageService from "../services/paymentReviewMessage.js";

function isPrivateChat(chat) {
  return String(chat?.type || "").trim().toLowerCase() === "private";
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function formatIDR(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("id-ID");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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

async function getLatestTicket(env, partnerId) {
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

async function getPrimarySuperadminContact(env) {
  const superadminId = await getFirstActiveSuperadminId(env).catch(() => null);
  if (!superadminId) return null;

  const admin = await getAdminByTelegramId(env, superadminId).catch(() => null);
  if (!admin) {
    return null;
  }

  const username = String(admin.username || "").trim().replace(/^@/, "");
  return {
    telegram_id: String(admin.telegram_id || superadminId),
    username: username || null,
    label: admin.label || (username ? `@${username}` : String(admin.telegram_id || superadminId)),
    url: username ? `https://t.me/${username}` : null,
  };
}

async function buildSuperadminContactKeyboard(env) {
  const contact = await getPrimarySuperadminContact(env);
  if (!contact?.url) return undefined;

  return {
    inline_keyboard: [
      [{ text: "📞 Hubungi Superadmin", url: contact.url }],
    ],
  };
}

async function sendTicketStatusMessage(env, chatId, ticket) {
  const status = normalizeStatus(ticket?.status);
  const totalBayar = formatIDR(ticket?.amount_final);
  const ticketCode = String(ticket?.ticket_code || "-");
  const keyboard = await buildSuperadminContactKeyboard(env);

  if (status === "waiting_confirmation") {
    await sendMessage(
      env,
      chatId,
      `⏳ Bukti Pembayaran tiket kamu senilai <b>IDR ${escapeHtml(totalBayar)}</b> sedang dalam proses Review dan menunggu Konfirmasi dari SuperAdmin.`,
      {
        parse_mode: "HTML",
        reply_markup: keyboard,
      }
    );
    return true;
  }

  if (status === "expired") {
    await sendMessage(
      env,
      chatId,
      `⚠️ Tiket pembayaran <b>${escapeHtml(ticketCode)}</b> sudah melewati batas waktu dan tidak bisa diproses otomatis.\n\nJika kamu belum melakukan transfer, silakan buat tiket payment baru.\nJika kamu sudah terlanjur transfer, silakan hubungi Superadmin untuk pengecekan manual.`,
      {
        parse_mode: "HTML",
        reply_markup: keyboard,
      }
    );
    return true;
  }

  if (status === "confirmed") {
    await sendMessage(
      env,
      chatId,
      `✅ Pembayaran untuk tiket <b>${escapeHtml(ticketCode)}</b> sudah dikonfirmasi sebelumnya.\nTidak perlu mengirim bukti pembayaran lagi.`,
      {
        parse_mode: "HTML",
      }
    );
    return true;
  }

  if (status === "rejected") {
    await sendMessage(
      env,
      chatId,
      `❌ Bukti pembayaran untuk tiket <b>${escapeHtml(ticketCode)}</b> ditolak.\nSilakan buat tiket payment baru atau hubungi Superadmin jika memerlukan bantuan.`,
      {
        parse_mode: "HTML",
        reply_markup: keyboard,
      }
    );
    return true;
  }

  if (status === "cancelled") {
    await sendMessage(
      env,
      chatId,
      `⚠️ Tiket pembayaran <b>${escapeHtml(ticketCode)}</b> sudah dibatalkan.\nSilakan buat tiket payment baru.`,
      {
        parse_mode: "HTML",
      }
    );
    return true;
  }

  await sendMessage(
    env,
    chatId,
    "⚠️ Tidak ada tiket payment aktif yang bisa menerima bukti transfer.\nSilakan buat tiket payment terlebih dahulu.",
    {
      parse_mode: "HTML",
    }
  );

  return true;
}

export async function handlePaymentProofUpload({ env, chat, chatId, telegramId, update }) {
  // HARD GUARD
  if (!isPrivateChat(chat)) return false;

  const photos = update?.message?.photo || [];
  if (!photos.length) return false;

  const best = photos[photos.length - 1];
  const fileId = best?.file_id ? String(best.file_id) : "";
  if (!fileId) return false;

  const openTicket = await getOpenPaymentTicketByPartnerId(env, telegramId);

  if (!openTicket) {
    const latestTicket = await getLatestTicket(env, telegramId);

    if (!latestTicket) {
      await sendMessage(
        env,
        chatId,
        "⚠️ Tidak ada tiket payment aktif.\nSilakan buat tiket payment terlebih dahulu sebelum mengirim bukti transfer.",
        { parse_mode: "HTML" }
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
          reply_markup: review?.keyboard,
        }
      );
    } catch (err) {
      console.error("SEND PAYMENT REVIEW ERROR:", err);
    }
  }

  const keyboard = await buildSuperadminContactKeyboard(env);

  await sendMessage(
    env,
    chatId,
    `⏳ Bukti Pembayaran tiket kamu senilai <b>IDR ${escapeHtml(formatIDR(freshTicket?.amount_final))}</b> sedang dalam proses Review dan menunggu Konfirmasi dari SuperAdmin.`,
    {
      parse_mode: "HTML",
      reply_markup: keyboard,
    }
  );

  return true;
}
