// services/subscriptionAdjustmentService.js

import { sendMessage } from "./telegramApi.js";
import { buildTeManMenuKeyboard } from "../routes/telegram.user.shared.js";
import { nowJakartaSql } from "../utils/time.js";
import { getAdminRole } from "../repositories/adminsRepo.js";
import { getProfileFullByTelegramId } from "../repositories/profilesRepo.js";
import {
  listActiveSubscriptionsByTelegramId,
  replaceActiveSubscriptionByTelegramId,
} from "../repositories/partnerSubscriptionsRepo.js";
import {
  addDaysSqlDate,
  collectCoverageWindow,
  parseSqlDateTime,
} from "../repositories/partnerSubscriptions.shared.js";
import { applyDerivedPartnerStatus } from "./partnerStatusService.js";
import { syncPartnerGroupRole } from "./partnerGroupRoleService.js";

/**
 * @typedef {Object} SubscriptionAdjustPayload
 * @property {string|number} actorId
 * @property {string|number} targetPartnerId
 * @property {"add"|"reduce"} action
 * @property {number} days
 * @property {string|null|undefined} [note]
 */

function normalizeAction(action) {
  const raw = String(action || "").trim().toLowerCase();
  if (raw === "add" || raw === "reduce") return raw;
  return "";
}

function normalizePositiveDays(days) {
  const value = Number(days);
  if (!Number.isFinite(value)) return 0;
  if (!Number.isInteger(value)) return 0;
  if (value <= 0) return 0;
  if (value > 3650) return 0;
  return value;
}

function makeId(prefix = "subadj") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildDurationLabel(days) {
  return `${days} Hari`;
}

function resolvePartnerClassId(profile) {
  const raw = String(profile?.class_id || "").trim().toLowerCase();
  if (raw === "bronze" || raw === "gold" || raw === "platinum") {
    return raw;
  }
  return "bronze";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDisplayDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";

  const parsed = parseSqlDateTime(raw);
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return raw;
  }

  const day = pad2(parsed.getDate());
  const month = pad2(parsed.getMonth() + 1);
  const year = pad2(parsed.getFullYear() % 100);

  return `${day}-${month}-${year}`;
}

function buildNotes(action, days, note) {
  const normalizedNote = String(note || "").trim();
  const label = action === "add" ? "Tambah Masa Aktif" : "Kurangi Masa Aktif";

  if (normalizedNote) {
    return `${label} ${days} hari | ${normalizedNote}`;
  }

  return `${label} ${days} hari`;
}

function buildSuccessNotice(result) {
  const actionLabel = result?.action === "add" ? "Tambah" : "Kurangi";
  const daysLabel = `${Number(result?.days || 0)} Hari`;
  const periodStart = formatDisplayDate(result?.subscription?.start_at);
  const periodEnd = formatDisplayDate(result?.subscription?.end_at);

  return [
    `✅ <b>${actionLabel} Masa Aktif berhasil.</b>`,
    `Telegram ID : <code>${String(result?.partner_id || "-")}</code>`,
    `Adjustment : <b>${daysLabel}</b>`,
    `Periode Baru : <b>${periodStart}</b> s/d <b>${periodEnd}</b>`,
  ].join("\n");
}

function buildNotificationStatusNotice(notification) {
  if (!notification || typeof notification !== "object") {
    return "⚠️ Notifikasi partner: <b>tidak diproses</b>.";
  }

  if (notification.ok) {
    return "📩 Notifikasi partner: <b>terkirim</b>.";
  }

  return "⚠️ Notifikasi partner: <b>gagal terkirim</b>. Adjustment tetap tersimpan.";
}

function buildPartnerNotificationText(result) {
  const actionLabel = result?.action === "add" ? "ditambahkan" : "dikurangi";
  const actionTitle = result?.action === "add" ? "Tambah Masa Aktif" : "Kurangi Masa Aktif";
  const partnerName = String(result?.profile?.nickname || result?.profile?.nama_lengkap || "Partner").trim();
  const daysLabel = `${Number(result?.days || 0)} Hari`;
  const periodStart = formatDisplayDate(result?.subscription?.start_at);
  const periodEnd = formatDisplayDate(result?.subscription?.end_at);
  const note = String(result?.subscription?.metadata_note || result?.note || "").trim();

  const lines = [
    `🔔 <b>${escapeHtml(actionTitle)}</b>`,
    `Halo TeMan <b>${escapeHtml(partnerName)}</b>,`,
    "",
    `Masa aktif kamu baru saja <b>${escapeHtml(actionLabel)}</b> oleh TeMan Founder.`,
    `Adjustment : <b>${escapeHtml(daysLabel)}</b>`,
    `Periode Aktif : <b>${escapeHtml(periodStart)}</b> s/d <b>${escapeHtml(periodEnd)}</b>`,
  ];

  if (note) {
    lines.push(`Catatan : ${escapeHtml(note)}`);
  }

  lines.push("", "Jika ada kesalahan, silahkan hubungi TeMan Founder.");

  return lines.join("\n");
}

function readStatusFromResult(value) {
  if (!value || typeof value !== "object") return null;
  if (!("ok" in value) || value.ok !== true) return null;
  if (!("status" in value)) return null;

  const raw = value.status;
  return raw == null ? null : String(raw);
}

async function notifyPartnerSubscriptionAdjusted(env, result) {
  const partnerId = String(result?.partner_id || "").trim();
  if (!partnerId) {
    return { ok: false, reason: "missing_partner_id" };
  }

  const text = buildPartnerNotificationText(result);

  try {
    const response = await sendMessage(env, partnerId, text, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: buildTeManMenuKeyboard(),
    });

    if (!response?.ok) {
      return {
        ok: false,
        reason: "telegram_send_failed",
        response: response || null,
      };
    }

    return {
      ok: true,
      response,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error?.message || String(error || "telegram_send_failed"),
    };
  }
}

/**
 * @param {any} env
 * @param {SubscriptionAdjustPayload} payload
 */
export async function adjustPartnerSubscriptionByDays(env, payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};

  const actorId = safePayload.actorId;
  const targetPartnerId = safePayload.targetPartnerId;
  const action = safePayload.action;
  const days = safePayload.days;
  const note = safePayload.note ?? null;

  const actorRole = await getAdminRole(env, actorId).catch(() => "user");
  if (actorRole !== "owner") {
    return { ok: false, reason: "forbidden_owner_only" };
  }

  const safeAction = normalizeAction(action);
  if (!safeAction) {
    return { ok: false, reason: "invalid_action" };
  }

  const safeDays = normalizePositiveDays(days);
  if (!safeDays) {
    return { ok: false, reason: "invalid_days" };
  }

  const partnerId = String(targetPartnerId || "").trim();
  if (!partnerId) {
    return { ok: false, reason: "partner_not_found" };
  }

  const profile = await getProfileFullByTelegramId(env, partnerId).catch(() => null);
  if (!profile) {
    return { ok: false, reason: "partner_not_found" };
  }

  const nowSql = nowJakartaSql();
  const activeSubscriptions = await listActiveSubscriptionsByTelegramId(env, partnerId).catch(() => []);
  const coverage = collectCoverageWindow(activeSubscriptions, nowSql);
  const nowDate = parseSqlDateTime(nowSql);

  const hasLiveCoverageNow = Array.isArray(activeSubscriptions)
    ? activeSubscriptions.some((row) => {
        const startAt = parseSqlDateTime(row?.start_at);
        const endAt = parseSqlDateTime(row?.end_at);

        if (!endAt || !nowDate) return false;
        if (startAt && startAt.getTime() > nowDate.getTime()) return false;

        return endAt.getTime() > nowDate.getTime();
      })
    : false;

  const latestCoverageEndDate = parseSqlDateTime(coverage.latestEndAt);

  let startAt = nowSql;
  let endAt = nowSql;
  let sourceType = "owner_grant_add";
  let replaceReason = "replaced_by_owner_grant_add";
  let adjustmentMode = "owner_add_fresh";
  let maxReducibleDays = 0;

  if (safeAction === "add") {
    const baseEndAt = hasLiveCoverageNow ? coverage.latestEndAt : nowSql;
    endAt = addDaysSqlDate(baseEndAt, safeDays);
    sourceType = "owner_grant_add";
    replaceReason = hasLiveCoverageNow
      ? "replaced_by_owner_grant_add_accumulation"
      : "replaced_by_owner_grant_add_fresh";
    adjustmentMode = hasLiveCoverageNow ? "owner_add_accumulation" : "owner_add_fresh";
  } else {
    if (!hasLiveCoverageNow || !latestCoverageEndDate || !nowDate) {
      return { ok: false, reason: "no_active_coverage_to_reduce" };
    }

    const remainingMs = latestCoverageEndDate.getTime() - nowDate.getTime();
    maxReducibleDays = Math.max(0, Math.ceil(remainingMs / 86400000) - 1);

    endAt = addDaysSqlDate(coverage.latestEndAt, -safeDays);

    const candidateEndDate = parseSqlDateTime(endAt);
    if (!candidateEndDate || candidateEndDate.getTime() <= nowDate.getTime()) {
      return {
        ok: false,
        reason: "reduction_would_end_now_or_past",
        max_reducible_days: maxReducibleDays,
        current_end_at: coverage.latestEndAt,
      };
    }

    sourceType = "owner_grant_reduce";
    replaceReason = "replaced_by_owner_grant_reduce";
    adjustmentMode = "owner_reduce_active";
  }

  const classId = resolvePartnerClassId(profile);
  const notes = buildNotes(safeAction, safeDays, note);
  const metadataNote = String(note || "").trim() || null;
  const metadataJson = JSON.stringify({
    duration_days: safeDays,
    duration_label: buildDurationLabel(safeDays),
    adjustment_action: safeAction,
    adjustment_mode: adjustmentMode,
    actor_id: String(actorId || "").trim() || null,
    actor_role: actorRole,
    partner_id: partnerId,
    merged_from_subscription_ids: coverage.mergedFromIds,
    previous_coverage_start_at: hasLiveCoverageNow ? coverage.earliestStartAt : null,
    previous_coverage_end_at: hasLiveCoverageNow ? coverage.latestEndAt : null,
    resulting_start_at: startAt,
    resulting_end_at: endAt,
    note: metadataNote,
  });

  const createdSubscription = await replaceActiveSubscriptionByTelegramId(
    env,
    partnerId,
    {
      id: makeId("sub"),
      partnerId,
      paymentTicketId: null,
      classId,
      durationMonths: 0,
      status: "active",
      startAt,
      endAt,
      activatedAt: nowSql,
      sourceType,
      sourceRefId: String(actorId || "").trim() || null,
      notes,
      metadataJson,
    },
    {
      cancelledBy: actorId,
      cancelReason: replaceReason,
    }
  );

  const statusRes = await applyDerivedPartnerStatus(env, partnerId, {
    actorId,
    adminNote: notes,
  }).catch((error) => ({
    ok: false,
    reason: error?.message || String(error),
  }));

  const groupRoleSync = await syncPartnerGroupRole(env, partnerId).catch((error) => ({
    ok: false,
    reason: error?.message || String(error),
  }));

  const subscription = createdSubscription || {
    start_at: startAt,
    end_at: endAt,
    class_id: classId,
    source_type: sourceType,
    notes,
  };

  const result = {
    ok: true,
    action: safeAction,
    days: safeDays,
    note: metadataNote,
    partner_id: partnerId,
    profile,
    subscription: {
      ...subscription,
      metadata_note: metadataNote,
    },
    status: readStatusFromResult(statusRes),
    group_role_sync: groupRoleSync,
  };

  const partner_notification = await notifyPartnerSubscriptionAdjusted(env, result);

  return {
    ...result,
    partner_notification,
    notice_html: [
      buildSuccessNotice(result),
      "",
      buildNotificationStatusNotice(partner_notification),
    ].join("\n"),
  };
}
