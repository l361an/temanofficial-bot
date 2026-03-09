// services/paymentActivationService.js

import { getProfileFullByTelegramId } from "../repositories/profilesRepo.js";
import { getPaymentTicketById, confirmPaymentTicket } from "../repositories/paymentTicketsRepo.js";
import { createPartnerSubscription } from "../repositories/partnerSubscriptionsRepo.js";
import { markPaymentConfirmedAndActivate } from "./partnerStatusService.js";
import { CALLBACKS } from "../routes/telegram.constants.js";

function addMonthsSqlDate(baseDate, monthsToAdd) {
  const d = new Date(baseDate);
  if (Number.isNaN(d.getTime())) {
    throw new Error("invalid_base_date");
  }

  const originalDate = d.getDate();
  d.setMonth(d.getMonth() + Number(monthsToAdd || 0));

  if (d.getDate() !== originalDate) {
    d.setDate(0);
  }

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function addDaysSqlDate(baseDate, daysToAdd) {
  const d = new Date(baseDate);
  if (Number.isNaN(d.getTime())) {
    throw new Error("invalid_base_date");
  }

  d.setDate(d.getDate() + Number(daysToAdd || 0));

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function makeId(prefix = "sub") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";

  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, yyyy, mm, dd, hh = "00", mi = "00"] = m;
    return `${dd}-${mm}-${yyyy} ${hh}:${mi}`;
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function getDurationCode(ticket) {
  const metadata = String(ticket?.metadata_json || "").trim();
  if (metadata) {
    try {
      const parsed = JSON.parse(metadata);
      const raw = String(parsed?.duration_code || "").trim().toLowerCase();
      if (raw === "1d" || raw === "3d" || raw === "7d" || raw === "1m") return raw;
    } catch {}
  }

  const pricingSnapshot = String(ticket?.pricing_snapshot_json || "").trim();
  if (pricingSnapshot) {
    try {
      const parsed = JSON.parse(pricingSnapshot);
      const raw = String(parsed?.duration_code || "").trim().toLowerCase();
      if (raw === "1d" || raw === "3d" || raw === "7d" || raw === "1m") return raw;
    } catch {}
  }

  const months = Number(ticket?.duration_months || 0);
  if (months === 1) return "1m";
  return "1d";
}

function resolveEndedAt(startedAt, durationCode) {
  if (durationCode === "1d") return addDaysSqlDate(startedAt, 1);
  if (durationCode === "3d") return addDaysSqlDate(startedAt, 3);
  if (durationCode === "7d") return addDaysSqlDate(startedAt, 7);
  return addMonthsSqlDate(startedAt, 1);
}

function buildDurationLabel(durationCode) {
  if (durationCode === "1d") return "1 Hari";
  if (durationCode === "3d") return "3 Hari";
  if (durationCode === "7d") return "7 Hari";
  return "1 Bulan";
}

function buildPartnerPaymentConfirmedMessage(subscription) {
  const durationLabel = buildDurationLabel(subscription?.duration_code);

  return [
    "✨ <b>Pembayaran Berhasil Dikonfirmasi</b>",
    "",
    "Pembayaran kamu telah berhasil dikonfirmasi dan fitur <b>PREMIUM TeMan</b> sekarang sudah aktif.",
    "",
    "<b>Informasi Premium</b>",
    "• Status: <b>Aktif</b>",
    `• Durasi: <b>${durationLabel}</b>`,
    `• Periode Aktif: <b>${formatDateTime(subscription?.start_at)}</b> s.d <b>${formatDateTime(subscription?.end_at)}</b>`,
    "",
    "Silakan lakukan perpanjangan sebelum masa aktif berakhir agar layanan <b>PREMIUM TeMan</b> tetap dapat digunakan tanpa terputus.",
    "",
    "Terima kasih telah menggunakan <b>TeMan Official</b>.",
  ].join("\n");
}

function buildPartnerPaymentConfirmedKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📋 Menu TeMan", callback_data: CALLBACKS.PARTNER_TOOLS_MENU }],
    ],
  };
}

export async function confirmPaymentAndActivateSubscription(env, ticketId, actorId, adminNote = null) {
  const ticket = await getPaymentTicketById(env, ticketId);
  if (!ticket) return { ok: false, reason: "ticket_not_found" };

  if (String(ticket.status) === "confirmed") {
    return { ok: false, reason: "ticket_already_confirmed" };
  }

  const partnerId = String(ticket.partner_id || "").trim();
  if (!partnerId) return { ok: false, reason: "ticket_partner_empty" };

  const profile = await getProfileFullByTelegramId(env, partnerId);
  if (!profile) return { ok: false, reason: "profile_not_found" };

  const now = new Date();
  const startedAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  const durationCode = getDurationCode(ticket);
  const durationMonths = durationCode === "1m" ? 1 : 0;
  const endedAt = resolveEndedAt(now, durationCode);

  await confirmPaymentTicket(env, ticketId, actorId, adminNote);

  await createPartnerSubscription(env, {
    id: makeId("sub"),
    partnerId,
    paymentTicketId: ticket.id,
    classId: ticket.class_id || profile.class_id || "bronze",
    durationMonths,
    status: "active",
    startAt: startedAt,
    endAt: endedAt,
    activatedAt: startedAt,
    sourceType: "payment_ticket",
    sourceRefId: String(ticket.id),
    notes: adminNote,
    metadataJson: JSON.stringify({
      duration_code: durationCode,
    }),
  });

  const statusRes = await markPaymentConfirmedAndActivate(env, partnerId, actorId, adminNote);

  const subscription = {
    start_at: startedAt,
    end_at: endedAt,
    duration_months: durationMonths,
    duration_code: durationCode,
    class_id: ticket.class_id || profile.class_id || "bronze",
  };

  return {
    ok: true,
    ticket,
    profile,
    subscription,
    status: statusRes.status,
    user_message: buildPartnerPaymentConfirmedMessage(subscription),
    user_reply_markup: buildPartnerPaymentConfirmedKeyboard(),
  };
}
