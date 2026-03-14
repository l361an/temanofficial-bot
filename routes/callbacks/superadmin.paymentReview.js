// routes/callbacks/superadmin.paymentReview.js

import { sendMessage, editMessageReplyMarkup } from "../../services/telegramApi.js";
import {
  getPaymentTicketById,
  rejectPaymentTicket,
} from "../../repositories/paymentTicketsRepo.js";
import { getSetting } from "../../repositories/settingsRepo.js";
import { getAdminByTelegramId, getFirstActiveSuperadminId } from "../../repositories/adminsRepo.js";
import { confirmPaymentAndActivateSubscription } from "../../services/paymentActivationService.js";
import { buildFinanceKeyboard } from "./keyboards.finance.js";
import { escapeHtml } from "./shared.js";
import { CALLBACK_PREFIX } from "../telegram.constants.js";

function formatClassLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "bronze") return "Bronze";
  if (raw === "gold") return "Gold";
  if (raw === "platinum") return "Platinum";
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "-";
}

function formatDurationLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "1d") return "1 Hari";
  if (raw === "3d") return "3 Hari";
  if (raw === "7d") return "7 Hari";
  return "1 Bulan";
}

function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "Rp 0";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateTime(value) {
  if (!value) return "-";

  const raw = String(value).trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, yyyy, mm, dd, hh = "00", mi = "00"] = m;
    return `${dd}-${mm}-${yyyy} ${hh}:${mi}`;
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()} ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

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

async function getReviewerLabel(env, adminId) {
  const admin = await getAdminByTelegramId(env, adminId).catch(() => null);
  if (!admin) return String(adminId || "-");

  const username = String(admin.username || "").trim().replace(/^@/, "");
  if (username) return `@${username}`;
  if (admin.nama) return String(admin.nama);
  return String(admin.telegram_id || adminId || "-");
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

function buildPaymentConfirmSummary(ticket, profile = null, subscription = null) {
  const username = String(profile?.username || "").trim().replace(/^@/, "");
  const durationCode = String(
    subscription?.duration_code || ticket?.duration_code || ticket?.duration_months || ""
  )
    .trim()
    .toLowerCase();

  return [
    "💳 <b>Payment Confirmed</b>",
    "",
    `Kode Tiket: <code>${escapeHtml(String(ticket?.ticket_code || "-"))}</code>`,
    `Partner ID: <code>${escapeHtml(String(ticket?.partner_id || "-"))}</code>`,
    `Username: <b>${escapeHtml(username ? `@${username}` : "-")}</b>`,
    `Class Partner: <b>${escapeHtml(formatClassLabel(ticket?.class_id))}</b>`,
    `Durasi: <b>${escapeHtml(formatDurationLabel(durationCode))}</b>`,
    `Masa Aktif: <b>${escapeHtml(formatDateTime(subscription?.start_at))}</b> s.d <b>${escapeHtml(formatDateTime(subscription?.end_at))}</b>`,
    `Nominal: <b>${escapeHtml(formatMoney(ticket?.amount_final))}</b>`,
  ].join("\n");
}

function buildAlreadyProcessedMessage(ticket, actorLabel) {
  const status = normalizeStatus(ticket?.status);
  const ticketCode = String(ticket?.ticket_code || "-");
  const processedAt =
    status === "confirmed"
      ? formatDateTime(ticket?.confirmed_at)
      : status === "rejected"
        ? formatDateTime(ticket?.rejected_at)
        : "-";

  const statusLabel =
    status === "confirmed"
      ? "dikonfirmasi"
      : status === "rejected"
        ? "direject"
        : "diproses";

  return [
    `⚠️ Payment ticket <b>${escapeHtml(ticketCode)}</b> sudah ${statusLabel} sebelumnya.`,
    "",
    `Diproses oleh: <b>${escapeHtml(actorLabel || "-")}</b>`,
    `Waktu proses: <b>${escapeHtml(processedAt)}</b>`,
    "",
    "Gunakan Waiting Confirmation List nanti sebagai backup monitor pending ticket.",
  ].join("\n");
}

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
