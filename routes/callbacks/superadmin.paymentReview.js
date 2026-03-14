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
  listAdmins,
} from "../../repositories/adminsRepo.js";
import { getProfileFullByTelegramId } from "../../repositories/profilesRepo.js";
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

function formatUsername(value) {
  const raw = String(value || "").trim().replace(/^@/, "");
  return raw ? `@${raw}` : "-";
}

function formatNickname(value) {
  const raw = String(value || "").trim();
  return raw || "-";
}

function safeJsonParse(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;

  const raw = String(value).trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isFilled(value) {
  if (value == null) return false;
  return String(value).trim() !== "";
}

function resolveDurationCode(ticket) {
  const pricing = safeJsonParse(ticket?.pricing_snapshot_json);
  const metadata = safeJsonParse(ticket?.metadata_json);

  const pricingCode = String(pricing?.duration_code || "").trim().toLowerCase();
  if (pricingCode) return pricingCode;

  const metadataCode = String(metadata?.duration_code || "").trim().toLowerCase();
  if (metadataCode) return metadataCode;

  const durationMonths = Number(ticket?.duration_months || 0);
  if (durationMonths > 0) return `${durationMonths}m`;

  return "";
}

function resolveDurationLabelFromTicket(ticket) {
  const durationCode = resolveDurationCode(ticket);
  if (durationCode) return formatDurationLabel(durationCode);

  const durationMonths = Number(ticket?.duration_months || 0);
  if (durationMonths > 1) return `${durationMonths} Bulan`;
  if (durationMonths === 1) return "1 Bulan";
  return "-";
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

async function listActivePaymentReviewerIds(env) {
  const adminRows = await listAdmins(env, { activeOnly: true }).catch(() => []);
  const ids = new Set();

  for (const row of adminRows || []) {
    if (!row?.is_active) continue;

    const role = String(row?.normRole || "").trim().toLowerCase();
    if (role !== "owner" && role !== "superadmin") continue;

    const telegramId = String(row?.telegram_id || "").trim();
    if (!telegramId) continue;

    ids.add(telegramId);
  }

  return Array.from(ids);
}

async function buildPartnerIdentity(env, partnerId) {
  const profile = await getProfileFullByTelegramId(env, String(partnerId || "")).catch(() => null);

  return {
    profile,
    partnerUsername: formatUsername(profile?.username),
    partnerNickname: formatNickname(
      profile?.nickname ??
      profile?.nama ??
      profile?.name ??
      profile?.full_name
    ),
  };
}

async function broadcastFinalStatusToOtherReviewers(env, ticket, actorAdminId, action) {
  const reviewerIds = await listActivePaymentReviewerIds(env);
  const actorLabel = await getReviewerLabel(env, actorAdminId);
  const { partnerUsername, partnerNickname } = await buildPartnerIdentity(env, ticket?.partner_id);

  const actionLabel = action === "confirm" ? "dikonfirmasi" : "direject";
  const actionEmoji = action === "confirm" ? "✅" : "❌";
  const processedAt =
    action === "confirm"
      ? formatDateTime(ticket?.confirmed_at)
      : formatDateTime(ticket?.rejected_at);

  const text = [
    `${actionEmoji} <b>Payment Sudah ${action === "confirm" ? "Confirmed" : "Rejected"}</b>`,
    "",
    `Kode Tiket: <code>${escapeHtml(String(ticket?.ticket_code || "-"))}</code>`,
    `Username: <b>${escapeHtml(String(partnerUsername || "-"))}</b>`,
    `Nickname: <b>${escapeHtml(String(partnerNickname || "-"))}</b>`,
    `Partner ID: <code>${escapeHtml(String(ticket?.partner_id || "-"))}</code>`,
    `Nominal: <b>${escapeHtml(formatMoney(ticket?.amount_final || 0))}</b>`,
    `Status Final: <b>${escapeHtml(actionLabel)}</b>`,
    `Diproses oleh: <b>${escapeHtml(actorLabel)}</b>`,
    `Waktu proses: <b>${escapeHtml(processedAt)}</b>`,
  ].join("\n");

  for (const reviewerId of reviewerIds) {
    if (String(reviewerId) === String(actorAdminId)) continue;

    await sendMessage(env, reviewerId, text, {
      parse_mode: "HTML",
    }).catch(() => {});
  }
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
  const nickname =
    profile?.nickname ??
    profile?.nama ??
    profile?.name ??
    profile?.full_name ??
    "";

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
    `Nickname: <b>${escapeHtml(formatNickname(nickname))}</b>`,
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
    "Gunakan Waiting Confirmation List sebagai backup monitor pending ticket.",
  ].join("\n");
}

async function enrichWaitingRowsWithProfile(env, rows = []) {
  const out = [];

  for (const row of rows || []) {
    const { partnerUsername, partnerNickname } = await buildPartnerIdentity(env, row.partner_id);

    out.push({
      ...row,
      partner_username: partnerUsername,
      partner_nickname: partnerNickname,
    });
  }

  return out;
}

async function buildWaitingListText(env, rows, page, total) {
  const totalPages = Math.max(1, Math.ceil(total / 10));
  const enrichedRows = await enrichWaitingRowsWithProfile(env, rows);

  const lines = [
    "🕓 <b>WAITING CONFIRMATION LIST</b>",
    "",
    `Total pending: <b>${total}</b>`,
    `Page: <b>${page}</b>/<b>${totalPages}</b>`,
    "",
  ];

  if (!enrichedRows.length) {
    lines.push("Tidak ada payment yang menunggu konfirmasi.");
    return lines.join("\n");
  }

  enrichedRows.forEach((row, index) => {
    lines.push(
      `${index + 1}. <b>${escapeHtml(String(row.ticket_code || `#${row.id}`))}</b>`,
      `Username: <b>${escapeHtml(String(row.partner_username || "-"))}</b>`,
      `Nickname: <b>${escapeHtml(String(row.partner_nickname || "-"))}</b>`,
      `Partner ID: <code>${escapeHtml(String(row.partner_id || "-"))}</code>`,
      `Nominal: <b>${escapeHtml(String(row.amount_final_label || formatMoney(row.amount_final)))}</b>`,
      `Uploaded: <b>${escapeHtml(formatDateTime(row.proof_uploaded_at))}</b>`,
      ""
    );
  });

  lines.push("Pilih tiket dari tombol di bawah untuk lihat detail.");
  return lines.join("\n");
}

async function buildWaitingDetailText(env, ticket) {
  const { partnerUsername, partnerNickname } = await buildPartnerIdentity(env, ticket?.partner_id);

  const lines = [
    "💳 <b>DETAIL REVIEW PEMBAYARAN</b>",
    "",
    `Kode Tiket: <code>${escapeHtml(String(ticket?.ticket_code || "-"))}</code>`,
    `Username: <b>${escapeHtml(partnerUsername)}</b>`,
    `Nickname: <b>${escapeHtml(partnerNickname)}</b>`,
    `Partner ID: <code>${escapeHtml(String(ticket?.partner_id || "-"))}</code>`,
    `Class: <b>${escapeHtml(formatClassLabel(ticket?.class_id))}</b>`,
    `Durasi: <b>${escapeHtml(resolveDurationLabelFromTicket(ticket))}</b>`,
    `Provider: <b>${escapeHtml(String(ticket?.provider || "-"))}</b>`,
    `Harga Dasar: <b>${escapeHtml(formatMoney(ticket?.amount_base || 0))}</b>`,
    `Kode Unik: <b>${escapeHtml(String(ticket?.unique_code || "0"))}</b>`,
    `Total Bayar: <b>${escapeHtml(formatMoney(ticket?.amount_final || 0))}</b>`,
  ];

  if (isFilled(ticket?.payer_name)) {
    lines.push(`Nama Pengirim: <b>${escapeHtml(String(ticket.payer_name))}</b>`);
  }

  if (isFilled(ticket?.payer_notes)) {
    lines.push(`Catatan: <b>${escapeHtml(String(ticket.payer_notes))}</b>`);
  }

  if (isFilled(ticket?.proof_caption)) {
    lines.push(`Caption Bukti: <b>${escapeHtml(String(ticket.proof_caption))}</b>`);
  }

  lines.push(
    `Uploaded At: <b>${escapeHtml(formatDateTime(ticket?.proof_uploaded_at))}</b>`,
    `Expires At: <b>${escapeHtml(formatDateTime(ticket?.expires_at))}</b>`,
    `Status: <b>${escapeHtml(String(ticket?.status || "-"))}</b>`
  );

  return lines.join("\n");
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
