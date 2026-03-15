// services/paymentReviewHelpers.js

import { getAdminByTelegramId, listAdmins } from "../repositories/adminsRepo.js";
import { getProfileFullByTelegramId } from "../repositories/profilesRepo.js";

export function hasValue(value) {
  if (value === null || value === undefined) return false;
  return String(value).trim() !== "";
}

export function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

export function formatUsername(value) {
  const raw = String(value || "").trim().replace(/^@/, "");
  return raw ? `@${raw}` : "-";
}

export function formatNickname(value) {
  const raw = String(value || "").trim();
  return raw || "-";
}

export function formatClassLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "bronze") return "Bronze";
  if (raw === "gold") return "Gold";
  if (raw === "platinum") return "Platinum";
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "-";
}

export function formatProviderLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "manual") return "Transfer / QRIS Manual";
  return raw || "-";
}

export function formatStatusLabel(value) {
  const raw = normalizeStatus(value);
  if (raw === "waiting_payment") return "Menunggu Pembayaran";
  if (raw === "waiting_confirmation") return "Menunggu Konfirmasi Admin";
  if (raw === "confirmed") return "Pembayaran Terkonfirmasi";
  if (raw === "rejected") return "Pembayaran Ditolak";
  if (raw === "expired") return "Tiket Kedaluwarsa";
  if (raw === "cancelled") return "Tiket Dibatalkan";
  return raw || "-";
}

export function formatDurationLabel(value) {
  const raw = String(value || "").trim().toLowerCase();

  if (raw === "1d") return "1 Hari";
  if (raw === "3d") return "3 Hari";
  if (raw === "7d") return "7 Hari";

  const monthMatch = raw.match(/^(\d+)m$/);
  if (monthMatch) {
    const n = Number(monthMatch[1] || 0);
    if (n > 1) return `${n} Bulan`;
    if (n === 1) return "1 Bulan";
  }

  if (raw === "monthly") return "1 Bulan";
  return "1 Bulan";
}

export function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "Rp 0";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

export function formatDateTime(value) {
  if (!hasValue(value)) return "-";

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

export function safeJsonParse(value) {
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

export function resolveDurationCode(ticket) {
  const pricing = safeJsonParse(ticket?.pricing_snapshot_json);
  const metadata = safeJsonParse(ticket?.metadata_json);

  const pricingCode = String(pricing?.duration_code || "").trim().toLowerCase();
  if (pricingCode) return pricingCode;

  const metadataCode = String(metadata?.duration_code || "").trim().toLowerCase();
  if (metadataCode) return metadataCode;

  const subscriptionDurationCode = String(ticket?.duration_code || "").trim().toLowerCase();
  if (subscriptionDurationCode) return subscriptionDurationCode;

  const durationMonths = Number(ticket?.duration_months || 0);
  if (durationMonths > 0) return `${durationMonths}m`;

  return "";
}

export function resolveDurationLabelFromTicket(ticket) {
  const durationCode = resolveDurationCode(ticket);
  if (durationCode) return formatDurationLabel(durationCode);

  const durationMonths = Number(ticket?.duration_months || 0);
  if (durationMonths > 1) return `${durationMonths} Bulan`;
  if (durationMonths === 1) return "1 Bulan";
  return "-";
}

export async function getReviewerLabel(env, adminId) {
  const admin = await getAdminByTelegramId(env, adminId).catch(() => null);
  if (!admin) return String(adminId || "-");

  const username = String(admin.username || "").trim().replace(/^@/, "");
  if (username) return `@${username}`;
  if (admin.nama) return String(admin.nama);
  return String(admin.telegram_id || adminId || "-");
}

export async function listActivePaymentReviewerIds(env) {
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

export async function buildPartnerIdentity(env, partnerId) {
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

export async function enrichWaitingRowsWithProfile(env, rows = []) {
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
