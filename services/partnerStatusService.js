// services/partnerStatusService.js

import {
  getProfileFullByTelegramId,
  setProfileStatusAuditFields,
  markManualSuspendProfile,
  clearManualSuspendProfile,
} from "../repositories/profilesRepo.js";
import { getActiveSubscriptionByTelegramId } from "../repositories/partnerSubscriptionsRepo.js";

export const STATUS_REASON = {
  REGISTRATION_APPROVED: "registration_approved",
  PAYMENT_CONFIRMED: "payment_confirmed",
  SUBSCRIPTION_EXPIRED: "subscription_expired",
  MANUAL_SUSPEND: "manual_suspend",
  MANUAL_RESTORE: "manual_restore",
};

export const USER_REASON_TEXT = {
  [STATUS_REASON.REGISTRATION_APPROVED]:
    "Registrasi kamu sudah disetujui.\nUntuk menggunakan fitur Premium TeMan, silakan lakukan pembayaran di menu Payment.",

  [STATUS_REASON.PAYMENT_CONFIRMED]:
    "Pembayaran kamu sudah dikonfirmasi.\nFitur Premium TeMan sekarang sudah aktif. Selamat menggunakan layanan kami!",

  [STATUS_REASON.SUBSCRIPTION_EXPIRED]:
    "Keanggotaan Premium kamu sudah berakhir. Silakan lakukan pembayaran di menu Payment untuk mengaktifkan kembali fitur Premium TeMan.",

  [STATUS_REASON.MANUAL_SUSPEND]:
    "Status Premium kamu saat ini dinonaktifkan oleh admin. Silakan hubungi admin TeMan untuk informasi lebih lanjut.",

  [STATUS_REASON.MANUAL_RESTORE]:
    "Akun kamu sudah dipulihkan.",
};

export async function derivePartnerStatus(env, telegramId) {
  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile) return { ok: false, reason: "profile_not_found" };

  const currentStatus = String(profile.status || "").trim().toLowerCase();

  if (currentStatus === "pending_approval") {
    return {
      ok: true,
      status: "pending_approval",
      reason_code: profile.status_reason || null,
      profile,
      activeSubscription: null,
    };
  }

  if (Number(profile.is_manual_suspended || 0) === 1) {
    return {
      ok: true,
      status: "suspended",
      reason_code: STATUS_REASON.MANUAL_SUSPEND,
      profile,
      activeSubscription: null,
    };
  }

  const activeSubscription = await getActiveSubscriptionByTelegramId(env, telegramId).catch(() => null);
  if (activeSubscription) {
    return {
      ok: true,
      status: "approved",
      reason_code: STATUS_REASON.PAYMENT_CONFIRMED,
      profile,
      activeSubscription,
    };
  }

  if (currentStatus === "suspended") {
    return {
      ok: true,
      status: "approved",
      reason_code: STATUS_REASON.MANUAL_RESTORE,
      profile,
      activeSubscription: null,
    };
  }

  return {
    ok: true,
    status: "approved",
    reason_code: STATUS_REASON.REGISTRATION_APPROVED,
    profile,
    activeSubscription: null,
  };
}

export async function applyDerivedPartnerStatus(
  env,
  telegramId,
  {
    actorId = null,
    fallbackReasonCode = null,
    adminNote = null,
  } = {}
) {
  const derived = await derivePartnerStatus(env, telegramId);
  if (!derived.ok) return derived;

  const reasonCode = derived.reason_code || fallbackReasonCode || null;

  await setProfileStatusAuditFields(env, telegramId, {
    status: derived.status,
    statusReason: reasonCode,
    statusChangedBy: actorId,
    adminNote,
  });

  return {
    ok: true,
    status: derived.status,
    reason_code: reasonCode,
    profile: derived.profile,
    activeSubscription: derived.activeSubscription,
  };
}

export async function markRegistrationApproved(env, telegramId, actorId) {
  await setProfileStatusAuditFields(env, telegramId, {
    status: "approved",
    statusReason: STATUS_REASON.REGISTRATION_APPROVED,
    statusChangedBy: actorId,
    adminNote: null,
  });

  return {
    ok: true,
    status: "approved",
    reason_code: STATUS_REASON.REGISTRATION_APPROVED,
    user_message: USER_REASON_TEXT[STATUS_REASON.REGISTRATION_APPROVED],
  };
}

export async function markPaymentConfirmedAndActivate(env, telegramId, actorId, adminNote = null) {
  await clearManualSuspendProfile(env, telegramId);

  await setProfileStatusAuditFields(env, telegramId, {
    status: "approved",
    statusReason: STATUS_REASON.PAYMENT_CONFIRMED,
    statusChangedBy: actorId,
    adminNote,
  });

  return {
    ok: true,
    status: "approved",
    reason_code: STATUS_REASON.PAYMENT_CONFIRMED,
    user_message: USER_REASON_TEXT[STATUS_REASON.PAYMENT_CONFIRMED],
  };
}

export async function markSubscriptionExpired(env, telegramId, actorId = null) {
  await setProfileStatusAuditFields(env, telegramId, {
    status: "suspended",
    statusReason: STATUS_REASON.SUBSCRIPTION_EXPIRED,
    statusChangedBy: actorId,
    adminNote: null,
  });

  return {
    ok: true,
    status: "suspended",
    reason_code: STATUS_REASON.SUBSCRIPTION_EXPIRED,
    user_message: USER_REASON_TEXT[STATUS_REASON.SUBSCRIPTION_EXPIRED],
  };
}

export async function manualSuspendPartner(env, telegramId, actorId, adminNote = null) {
  await markManualSuspendProfile(env, telegramId, {
    adminId: actorId,
    statusReason: STATUS_REASON.MANUAL_SUSPEND,
    adminNote,
  });

  return {
    ok: true,
    status: "suspended",
    reason_code: STATUS_REASON.MANUAL_SUSPEND,
    user_message: USER_REASON_TEXT[STATUS_REASON.MANUAL_SUSPEND],
  };
}

export async function manualRestorePartner(env, telegramId, actorId, adminNote = null) {
  await clearManualSuspendProfile(env, telegramId);

  const applied = await applyDerivedPartnerStatus(env, telegramId, {
    actorId,
    fallbackReasonCode: STATUS_REASON.MANUAL_RESTORE,
    adminNote,
  });

  if (!applied.ok) return applied;

  const hasPremiumAccess = Boolean(applied.activeSubscription);
  const userMessage = hasPremiumAccess
    ? "Akun kamu sudah dipulihkan.\nAkses Premium kamu juga kembali aktif."
    : "Akun kamu sudah dipulihkan.\nUntuk menggunakan fitur Premium, silakan lakukan pembayaran di menu Payment.";

  return {
    ok: true,
    status: applied.status,
    reason_code: applied.reason_code,
    user_message: userMessage,
  };
}

export function getUserReasonText(reasonCode) {
  return USER_REASON_TEXT[String(reasonCode || "")] || null;
}
