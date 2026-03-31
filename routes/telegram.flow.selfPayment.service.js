// routes/telegram.flow.selfPayment.service.js

import { getSetting } from "../repositories/settingsRepo.js";
import { getProfileFullByTelegramId } from "../repositories/profilesRepo.js";
import { getSubscriptionInfoByTelegramId } from "../repositories/partnerSubscriptionsRepo.js";
import { getOpenPaymentTicketByPartnerId } from "../repositories/paymentTicketsRepo.js";
import { normalizeClassId } from "./telegram.user.shared.js";
import {
  getDefaultPartnerClassId,
  resolvePartnerPricingClassId,
} from "../repositories/partnerClassesRepo.js";

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
  if (subInfo?.found) {
    return "🔄 Renew Premium";
  }

  return "💳 Aktivasi Premium";
}

export function resolveDurationMeta(durationCode) {
  const raw = String(durationCode || "").trim().toLowerCase();

  if (raw === "1d") {
    return {
      durationCode: "1d",
      durationLabel: "1 Hari",
      durationDays: 1,
      durationMonths: 0,
    };
  }

  if (raw === "3d") {
    return {
      durationCode: "3d",
      durationLabel: "3 Hari",
      durationDays: 3,
      durationMonths: 0,
    };
  }

  if (raw === "7d") {
    return {
      durationCode: "7d",
      durationLabel: "7 Hari",
      durationDays: 7,
      durationMonths: 0,
    };
  }

  return {
    durationCode: "1m",
    durationLabel: "1 Bulan",
    durationDays: 30,
    durationMonths: 1,
  };
}

export function resolveDurationLabel(durationCode) {
  return resolveDurationMeta(durationCode).durationLabel;
}

export function resolveDurationMonths(durationCode) {
  return resolveDurationMeta(durationCode).durationMonths;
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

function buildPriceKeyCandidates(classId, durationCode) {
  const cid = normalizeClassId(classId);
  const dcode = String(durationCode || "").trim().toLowerCase();

  return [
    `payment_price_${cid}_${dcode}`,
    `payment_${cid}_${dcode}`,
    `pp_price_${cid}_${dcode}`,
    `${cid}_price_${dcode}`,
  ];
}

export async function resolvePriceByClassAndDuration(env, classId, durationCode) {
  const defaultClassId = await getDefaultPartnerClassId(env).catch(() => "general");
  const normalizedClassId = normalizeClassId(classId || defaultClassId || "general");
  const duration = resolveDurationMeta(durationCode);

  const pricingFallbackClassId = await resolvePartnerPricingClassId(env, normalizedClassId).catch(() =>
    normalizedClassId === "general" ? "bronze" : normalizedClassId
  );

  const keyCandidates = [
    ...buildPriceKeyCandidates(normalizedClassId, duration.durationCode),
    ...buildPriceKeyCandidates(pricingFallbackClassId, duration.durationCode),
  ].filter((value, index, array) => array.indexOf(value) === index);

  for (const key of keyCandidates) {
    const raw = await getSetting(env, key);
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) {
      return {
        amount: num,
        key,
        classId: normalizedClassId,
        pricingClassId: pricingFallbackClassId,
        durationCode: duration.durationCode,
        durationLabel: duration.durationLabel,
        durationDays: duration.durationDays,
        durationMonths: duration.durationMonths,
      };
    }
  }

  return {
    amount: 0,
    key: null,
    classId: normalizedClassId,
    pricingClassId: pricingFallbackClassId,
    durationCode: duration.durationCode,
    durationLabel: duration.durationLabel,
    durationDays: duration.durationDays,
    durationMonths: duration.durationMonths,
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
  const defaultClassId = await getDefaultPartnerClassId(env).catch(() => "general");
  const classId = normalizeClassId(profile?.class_id || defaultClassId || "general");

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
