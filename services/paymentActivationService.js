// services/paymentActivationService.js

import { getProfileFullByTelegramId } from "../repositories/profilesRepo.js";
import { getPaymentTicketById, confirmPaymentTicket } from "../repositories/paymentTicketsRepo.js";
import { createPartnerSubscription } from "../repositories/partnerSubscriptionsRepo.js";
import { markPaymentConfirmedAndActivate } from "./partnerStatusService.js";

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

function buildPartnerPaymentConfirmedMessage(subscription) {
  return [
    "Info :",
    "Pembayaran kamu sudah dikonfirmasi.",
    "",
    "Fitur PREMIUM TeMan",
    "Status : Active",
    `Masa Aktif: ${formatDateTime(subscription?.start_at)} s.d ${formatDateTime(subscription?.end_at)}`,
    "",
    "<i>Perpanjang masa aktif sebelum kadaluarsa untuk tetap menikmati Fitur PREMIUM TeMan.</i>",
    "",
    "Terimakasih.",
  ].join("\n");
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
  const endedAt = addMonthsSqlDate(now, Number(ticket.duration_months || 1));

  await confirmPaymentTicket(env, ticketId, actorId, adminNote);

  await createPartnerSubscription(env, {
    id: makeId("sub"),
    partnerId,
    paymentTicketId: ticket.id,
    classId: ticket.class_id || profile.class_id || "bronze",
    durationMonths: Number(ticket.duration_months || 1),
    status: "active",
    startAt: startedAt,
    endAt: endedAt,
    activatedAt: startedAt,
    sourceType: "payment_ticket",
    sourceRefId: String(ticket.id),
    notes: adminNote,
    metadataJson: null,
  });

  const statusRes = await markPaymentConfirmedAndActivate(env, partnerId, actorId, adminNote);

  const subscription = {
    start_at: startedAt,
    end_at: endedAt,
    duration_months: Number(ticket.duration_months || 1),
    class_id: ticket.class_id || profile.class_id || "bronze",
  };

  return {
    ok: true,
    ticket,
    profile,
    subscription,
    status: statusRes.status,
    user_message: buildPartnerPaymentConfirmedMessage(subscription),
  };
}
