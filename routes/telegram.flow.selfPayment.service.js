// routes/telegram.flow.selfPayment.service.js

import { getSetting } from "../repositories/settingsRepo.js";
import { getProfileFullByTelegramId } from "../repositories/profilesRepo.js";
import { getSubscriptionInfoByTelegramId } from "../repositories/partnerSubscriptionsRepo.js";
import { getOpenPaymentTicketByPartnerId } from "../repositories/paymentTicketsRepo.js";
import { normalizeClassId } from "./telegram.user.shared.js";

export function resolvePartnerStatusLabel(profile) {
  const raw = String(profile?.status || "").trim().toLowerCase();

  if (raw === "pending_approval") return "Pending";
  if (raw === "approved") return "Approved";
  if (raw === "suspended") return "Suspended";

  return raw ? raw.replaceAll("_", " ") : "-";
}

export function hasPremiumAccess(profile, subInfo) {
  const partnerStatus = String(profile?.status || "").trim().toLowerCase();
  const isManualSuspended = Number(profile?.is_manual_suspended || 0) === 1;

  if (partnerStatus === "suspended" || isManualSuspended) return false;
  if (subInfo?.is_active && subInfo?.row) return true;
  return false;
}

export function resolvePremiumAccessLabel(profile, subInfo) {
  return hasPremiumAccess(profile, subInfo) ? "Aktif" : "Non-aktif";
}

export function resolvePrimaryActionText(profile, subInfo) {
  return hasPremiumAccess(profile, subInfo) ? "🔄 Renew Premium" : "🧾 Upgrade Premium";
}

export function resolveDurationLabel(durationCode) {
  return String(durationCode || "").trim().toLowerCase() === "1d" ? "1 Hari" : "1 Bulan";
}

export function resolveDurationMonths(durationCode) {
  return String(durationCode || "").trim().toLowerCase() === "1d" ? 0 : 1;
}

export async function getLatestPaymentTicket(env, partnerId) {
  const row = await env.DB.prepare(`
    SELECT *
    FROM payment_tickets
    WHERE partner_id = ?
    ORDER BY datetime(created_at) DESC, datetime(updated_at) DESC, id DESC
    LIMIT 1
  `)
    .bind(String(partnerId))
    .first();

  return row ?? null;
}

export async function getPaymentExpiryHours(env) {
  const raw = await getSetting(env, "pp_ticket_expiry_hours");
  const hours = Number(raw || 24);
  return Number.isFinite(hours) && hours > 0 ? hours : 24;
}

export async function getUniqueCodeRange(env) {
  const rawMin = await getSetting(env, "pp_unique_min");
  const rawMax = await getSetting(env, "pp_unique_max");

  const min = Number(rawMin || 500);
  const max = Number(rawMax || 999);

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 500, max: 999 };
  }

  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
  };
}

export async function resolvePriceByClassAndDuration(env, classId, durationCode) {
  const normalizedClassId = normalizeClassId(classId || "bronze");
  const normalizedDurationCode = String(durationCode || "1m").trim().toLowerCase() === "1d" ? "1d" : "1m";

  const keyCandidates = [
    `payment_price_${normalizedClassId}_${normalizedDurationCode}`,
    `payment_${normalizedClassId}_${normalizedDurationCode}`,
    `pp_price_${normalizedClassId}_${normalizedDurationCode}`,
    `${normalizedClassId}_price_${normalizedDurationCode}`,
  ];

  for (const key of keyCandidates) {
    const raw = await getSetting(env, key);
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) {
      return {
        amount: num,
        key,
        classId: normalizedClassId,
        durationCode: normalizedDurationCode,
        durationLabel: resolveDurationLabel(normalizedDurationCode),
        durationMonths: resolveDurationMonths(normalizedDurationCode),
      };
    }
  }

  return {
    amount: 0,
    key: null,
    classId: normalizedClassId,
    durationCode: normalizedDurationCode,
    durationLabel: resolveDurationLabel(normalizedDurationCode),
    durationMonths: resolveDurationMonths(normalizedDurationCode),
  };
}

export async function loadSelfPaymentContext(env, telegramId) {
  const profile = await getProfileFullByTelegramId(env, telegramId);
  const subInfo = profile
    ? await getSubscriptionInfoByTelegramId(env, telegramId).catch(() => ({
        found: false,
        is_active: false,
        row: null,
      }))
    : { found: false, is_active: false, row: null };

  const openTicket = profile
    ? await getOpenPaymentTicketByPartnerId(env, telegramId)
    : null;

  const partnerStatusLabel = resolvePartnerStatusLabel(profile);
  const premiumAccessLabel = resolvePremiumAccessLabel(profile, subInfo);
  const primaryActionText = resolvePrimaryActionText(profile, subInfo);
  const classId = normalizeClassId(profile?.class_id || "bronze");

  return {
    profile,
    subInfo,
    openTicket,
    partnerStatusLabel,
    premiumAccessLabel,
    primaryActionText,
    classId,
    hasPremiumAccess: hasPremiumAccess(profile, subInfo),
  };
}
