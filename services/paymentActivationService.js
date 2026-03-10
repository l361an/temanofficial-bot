// services/paymentActivationService.js

import { getProfileFullByTelegramId } from "../repositories/profilesRepo.js";
import { getPaymentTicketById, confirmPaymentTicket } from "../repositories/paymentTicketsRepo.js";
import {
  listActiveSubscriptionsByTelegramId,
  replaceActiveSubscriptionByTelegramId,
} from "../repositories/partnerSubscriptionsRepo.js";
import { markPaymentConfirmed } from "./partnerStatusService.js";
import { syncPartnerGroupRole } from "./partnerGroupRoleService.js";

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

  return toSqlDateTime(d);
}

function addDaysSqlDate(baseDate, daysToAdd) {
  const d = new Date(baseDate);
  if (Number.isNaN(d.getTime())) {
    throw new Error("invalid_base_date");
  }

  d.setDate(d.getDate() + Number(daysToAdd || 0));
  return toSqlDateTime(d);
}

function makeId(prefix = "sub") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toSqlDateTime(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error("invalid_datetime");
  }

  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function parseDateSafe(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
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

  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()} ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}

function getDurationCode(ticket) {
  const metadata = String(ticket?.metadata_json || "").trim();
  if (metadata) {
    try {
      const parsed = JSON.parse(metadata);
      const raw = String(parsed?.duration_code || "")
        .trim()
        .toLowerCase();
      if (raw === "1d" || raw === "3d" || raw === "7d" || raw === "1m") return raw;
    } catch {}
  }

  const pricingSnapshot = String(ticket?.pricing_snapshot_json || "").trim();
  if (pricingSnapshot) {
    try {
      const parsed = JSON.parse(pricingSnapshot);
      const raw = String(parsed?.duration_code || "")
        .trim()
        .toLowerCase();
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
    `• Durasi Transaksi: <b>${durationLabel}</b>`,
    `• Periode Aktif: <b>${formatDateTime(subscription?.start_at)}</b> s.d <b>${formatDateTime(
      subscription?.end_at
    )}</b>`,
    "",
    "Silakan lakukan perpanjangan sebelum masa aktif berakhir agar layanan <b>PREMIUM TeMan</b> tetap dapat digunakan tanpa terputus.",
    "",
    "Terima kasih telah menggunakan <b>TeMan Official</b>.",
  ].join("\n");
}

function buildPartnerPaymentConfirmedKeyboard() {
  return {
    inline_keyboard: [[{ text: "📋 Menu TeMan", callback_data: "teman:menu" }]],
  };
}

function resolveCoverageWindow(activeSubscriptions, fallbackNowSql) {
  const rows = Array.isArray(activeSubscriptions) ? activeSubscriptions : [];
  if (!rows.length) {
    return {
      hasActiveCoverage: false,
      startAt: fallbackNowSql,
      anchorEndAt: fallbackNowSql,
      mergedFromIds: [],
    };
  }

  let earliestStart = null;
  let latestEnd = null;

  for (const row of rows) {
    const startAt = parseDateSafe(row?.start_at);
    const endAt = parseDateSafe(row?.end_at);

    if (startAt && (!earliestStart || startAt.getTime() < earliestStart.getTime())) {
      earliestStart = startAt;
    }

    if (endAt && (!latestEnd || endAt.getTime() > latestEnd.getTime())) {
      latestEnd = endAt;
    }
  }

  return {
    hasActiveCoverage: Boolean(earliestStart && latestEnd),
    startAt: earliestStart ? toSqlDateTime(earliestStart) : fallbackNowSql,
    anchorEndAt: latestEnd ? toSqlDateTime(latestEnd) : fallbackNowSql,
    mergedFromIds: rows.map((row) => String(row?.id || "")).filter(Boolean),
  };
}

function resolvePartnerClassId(profile) {
  const raw = String(profile?.class_id || "")
    .trim()
    .toLowerCase();
  if (raw === "bronze" || raw === "gold" || raw === "platinum") {
    return raw;
  }
  return "bronze";
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

  const nowSql = toSqlDateTime(new Date());
  const durationCode = getDurationCode(ticket);
  const durationMonths = durationCode === "1m" ? 1 : 0;

  const classId = resolvePartnerClassId(profile);

  const activeSubscriptions = await listActiveSubscriptionsByTelegramId(env, partnerId).catch(() => []);
  const coverage = resolveCoverageWindow(activeSubscriptions, nowSql);

  const startedAt = coverage.hasActiveCoverage ? coverage.startAt : nowSql;
  const endedAt = resolveEndedAt(coverage.anchorEndAt, durationCode);

  await confirmPaymentTicket(env, ticketId, actorId, adminNote);

  const createdSubscription = await replaceActiveSubscriptionByTelegramId(
    env,
    partnerId,
    {
      id: makeId("sub"),
      partnerId,
      paymentTicketId: ticket.id,
      classId,
      durationMonths,
      status: "active",
      startAt: startedAt,
      endAt: endedAt,
      activatedAt: nowSql,
      sourceType: "payment_ticket",
      sourceRefId: String(ticket.id),
      notes: adminNote,
      metadataJson: JSON.stringify({
        duration_code: durationCode,
        activation_mode: coverage.hasActiveCoverage ? "renewal_extension" : "fresh_activation",
        merged_from_subscription_ids: coverage.mergedFromIds,
        previous_coverage_end_at: coverage.hasActiveCoverage ? coverage.anchorEndAt : null,
        class_source: "profile",
        ticket_class_id: ticket?.class_id ? String(ticket.class_id).toLowerCase() : null,
        applied_class_id: classId,
      }),
    },
    {
      cancelledBy: actorId,
      cancelReason: coverage.hasActiveCoverage
        ? "replaced_by_renewal_extension"
        : "replaced_by_fresh_payment_activation",
    }
  );

  const statusRes = await markPaymentConfirmed(env, partnerId, actorId, adminNote);
  const groupRoleSync = await syncPartnerGroupRole(env, partnerId).catch((error) => ({
    ok: false,
    reason: error?.message || String(error),
  }));

  const subscription = createdSubscription || {
    start_at: startedAt,
    end_at: endedAt,
    duration_months: durationMonths,
    duration_code: durationCode,
    class_id: classId,
  };

  return {
    ok: true,
    ticket,
    profile,
    subscription: {
      ...subscription,
      duration_months: durationMonths,
      duration_code: durationCode,
      class_id: classId,
    },
    status: statusRes.status,
    group_role_sync: groupRoleSync,
    user_message: buildPartnerPaymentConfirmedMessage({
      ...subscription,
      duration_code: durationCode,
    }),
    user_reply_markup: buildPartnerPaymentConfirmedKeyboard(),
  };
}
