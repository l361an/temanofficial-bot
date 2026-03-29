// services/subscriptionReminderService.js

import { sendMessage } from "./telegramApi.js";
import { buildTeManMenuKeyboard, formatDateTime } from "../routes/telegram.user.shared.js";
import { expireDuePaymentTickets } from "../repositories/paymentTicketsRepo.js";
import {
  listSubscriptionsDueForReminder,
  markSubscriptionReminderSent,
  expireDueSubscriptions,
  listReminderDebugRows,
  listActiveSubscriptionsByTelegramId,
} from "../repositories/partnerSubscriptionsRepo.js";
import {
  parseSqlDateTime,
  resolveNowSql,
  toSqlDateTime,
} from "../repositories/partnerSubscriptions.shared.js";
import { markSubscriptionExpired } from "./partnerStatusService.js";
import { syncPartnerGroupRole } from "./partnerGroupRoleService.js";

const REMINDER_KEYS = ["h3d", "h2d", "h1d", "h3h"];

function buildReminderMessage(reminderKey, row) {
  const endAtText = formatDateTime(row?.end_at);

  if (String(reminderKey || "").trim().toLowerCase() === "h3h") {
    return [
      "⏰ <b>Masa aktif Premium TeMan kamu akan berakhir dalam 3 jam lagi pada:</b>",
      `<b>${endAtText}</b>`,
      "",
      "Silakan lakukan <b>Pembayaran / Renewal</b> di <b>Menu Premium Partner</b> agar <b>Akses Premium</b> tetap aktif dan tetap dapat menggunakan <b>Fitur Premium TeMan</b>.",
    ].join("\n");
  }

  return [
    "⏰ <b>Masa aktif Premium TeMan kamu akan berakhir pada:</b>",
    `<b>${endAtText}</b>`,
    "",
    "Silakan lakukan <b>Pembayaran / Renewal</b> di <b>Menu Premium Partner</b> agar <b>Akses Premium</b> tetap aktif dan tetap dapat menggunakan <b>Fitur Premium TeMan</b>.",
  ].join("\n");
}

function buildExpiredTicketMessage(ticket) {
  return [
    "⚠️ <b>Tiket Pembayaran Kedaluwarsa</b>",
    "",
    `Kode Tiket: <code>${String(ticket?.ticket_code || "-")}</code>`,
    "",
    "Tiket pembayaran kamu sudah kedaluwarsa.",
    "Silakan buat tiket baru dari menu Payment.",
    "",
    "Kalau transfer sudah terlanjur dilakukan, hubungi Superadmin untuk manual check.",
  ].join("\n");
}

function buildExpiredSubscriptionMessage() {
  return [
    "⛔ <b>Masa aktif Premium TeMan kamu sudah berakhir.</b>",
    "",
    "Status admin partner kamu di grup telah dinonaktifkan dan akun kamu telah di-mute otomatis.",
    "",
    "Silakan lakukan <b>Pembayaran / Renewal</b> di <b>Menu Premium Partner</b> agar <b>Akses Premium</b> aktif kembali dan kamu tetap dapat menggunakan <b>Fitur Premium TeMan</b>.",
  ].join("\n");
}

function parseNowOverride(nowOverride) {
  if (!nowOverride) return null;
  const d = new Date(String(nowOverride).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) {
    throw new Error("invalid_now_override");
  }
  return d;
}

function hasWindowCoverage(row, nowDate) {
  const startAt = parseSqlDateTime(row?.start_at);
  const endAt = parseSqlDateTime(row?.end_at);

  if (!endAt) return false;
  if (startAt && startAt.getTime() > nowDate.getTime()) return false;

  return endAt.getTime() > nowDate.getTime();
}

async function hasActiveCoverageAt(env, telegramId, nowOverride = null) {
  const rows = await listActiveSubscriptionsByTelegramId(env, telegramId).catch(() => []);
  if (!Array.isArray(rows) || !rows.length) return false;

  const nowDate = parseSqlDateTime(resolveNowSql(nowOverride)) || new Date();
  return rows.some((row) => hasWindowCoverage(row, nowDate));
}

async function notifyExpiredPaymentTickets(env, expiredRows) {
  const rows = Array.isArray(expiredRows) ? expiredRows : [];
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const res = await sendMessage(
        env,
        String(row.partner_id),
        buildExpiredTicketMessage(row),
        {
          parse_mode: "HTML",
          reply_markup: buildTeManMenuKeyboard(),
          disable_web_page_preview: true,
        }
      );

      if (res?.ok === false) {
        failed += 1;
        continue;
      }

      sent += 1;
    } catch (err) {
      console.error("NOTIFY EXPIRED TICKET ERROR:", row?.ticket_code, err);
      failed += 1;
    }
  }

  return { sent, failed };
}

async function processReminderKey(
  env,
  reminderKey,
  { limit = 200, dryRun = false, nowOverride = null } = {}
) {
  const candidates = await listSubscriptionsDueForReminder(env, reminderKey, {
    limit,
    nowOverride,
  }).catch((error) => {
    console.error("LIST REMINDER CANDIDATES ERROR:", reminderKey, error);
    return [];
  });

  if (dryRun) {
    return {
      key: reminderKey,
      candidates: candidates.length,
      sent: 0,
      failed: 0,
      samples: candidates.slice(0, 10).map((row) => ({
        id: String(row.id || ""),
        partner_id: String(row.partner_id || ""),
        end_at: String(row.end_at || ""),
        duration_code: String(row.duration_code || ""),
        source_type: String(row.source_type || ""),
        source_ref_id: String(row.source_ref_id || ""),
      })),
    };
  }

  let sent = 0;
  let failed = 0;
  const sentAt = nowOverride ? toSqlDateTime(nowOverride) : null;

  for (const row of candidates) {
    try {
      const res = await sendMessage(
        env,
        String(row.partner_id),
        buildReminderMessage(reminderKey, row),
        {
          parse_mode: "HTML",
          reply_markup: buildTeManMenuKeyboard(),
          disable_web_page_preview: true,
        }
      );

      if (res?.ok === false) {
        failed += 1;
        continue;
      }

      await markSubscriptionReminderSent(env, row.id, reminderKey, sentAt);
      sent += 1;
    } catch (err) {
      console.error("SEND REMINDER ERROR:", reminderKey, row?.id, err);
      failed += 1;
    }
  }

  return {
    key: reminderKey,
    candidates: candidates.length,
    sent,
    failed,
    samples: [],
  };
}

async function processExpiredSubscriptions(env, { dryRun = false, nowOverride = null } = {}) {
  if (dryRun) {
    return {
      expired_count: 0,
      notified: 0,
      failed: 0,
      skipped_has_active_coverage: 0,
      partner_ids: [],
      notified_partner_ids: [],
      skipped_partner_ids: [],
      group_role_sync_results: [],
    };
  }

  const expired = await expireDueSubscriptions(env, nowOverride).catch((error) => {
    console.error("EXPIRE SUBSCRIPTIONS ERROR:", error);
    return { ok: false, partnerIds: [] };
  });

  const partnerIds = Array.isArray(expired?.partnerIds) ? expired.partnerIds : [];

  let notified = 0;
  let failed = 0;
  let skippedHasActiveCoverage = 0;
  const notifiedPartnerIds = [];
  const skippedPartnerIds = [];
  const groupRoleSyncResults = [];

  for (const telegramId of partnerIds) {
    try {
      const stillHasCoverage = await hasActiveCoverageAt(env, telegramId, nowOverride);

      if (stillHasCoverage) {
        skippedHasActiveCoverage += 1;
        skippedPartnerIds.push(String(telegramId));
        groupRoleSyncResults.push({
          partner_id: String(telegramId),
          result: {
            ok: true,
            skipped: true,
            reason: "active_coverage_still_exists",
          },
        });
        continue;
      }

      await markSubscriptionExpired(env, telegramId, null);

      const groupRoleSync = await syncPartnerGroupRole(env, telegramId).catch((error) => ({
        ok: false,
        reason: error?.message || String(error),
      }));

      groupRoleSyncResults.push({
        partner_id: String(telegramId),
        result: groupRoleSync,
      });

      const res = await sendMessage(
        env,
        String(telegramId),
        buildExpiredSubscriptionMessage(),
        {
          parse_mode: "HTML",
          reply_markup: buildTeManMenuKeyboard(),
          disable_web_page_preview: true,
        }
      );

      if (res?.ok === false) {
        failed += 1;
        continue;
      }

      notified += 1;
      notifiedPartnerIds.push(String(telegramId));
    } catch (err) {
      console.error("EXPIRE SUBSCRIPTION NOTIFY ERROR:", telegramId, err);
      failed += 1;
    }
  }

  return {
    expired_count: partnerIds.length,
    notified,
    failed,
    skipped_has_active_coverage: skippedHasActiveCoverage,
    partner_ids: partnerIds,
    notified_partner_ids: notifiedPartnerIds,
    skipped_partner_ids: skippedPartnerIds,
    group_role_sync_results: groupRoleSyncResults,
  };
}

export async function runSubscriptionReminderCycle(
  env,
  {
    target = "all",
    limit = 200,
    dryRun = false,
    nowOverride = null,
  } = {}
) {
  const normalizedTarget = String(target || "all").trim().toLowerCase();
  const keys =
    normalizedTarget === "all"
      ? REMINDER_KEYS
      : REMINDER_KEYS.includes(normalizedTarget)
      ? [normalizedTarget]
      : [];

  if (!keys.length) {
    return {
      ok: false,
      reason: "invalid_target",
    };
  }

  const parsedNowOverride = parseNowOverride(nowOverride);

  if (dryRun) {
    const reminderRuns = [];
    for (const key of keys) {
      reminderRuns.push(
        await processReminderKey(env, key, {
          limit,
          dryRun: true,
          nowOverride: parsedNowOverride,
        })
      );
    }

    return {
      ok: true,
      dry_run: true,
      target: normalizedTarget,
      now_override: parsedNowOverride ? toSqlDateTime(parsedNowOverride) : null,
      reminders: reminderRuns,
      expired_tickets: {
        count: 0,
        notified: 0,
        failed: 0,
      },
      expired_subscriptions: {
        expired_count: 0,
        notified: 0,
        failed: 0,
        skipped_has_active_coverage: 0,
        partner_ids: [],
        notified_partner_ids: [],
        skipped_partner_ids: [],
        group_role_sync_results: [],
      },
    };
  }

  const expiredTickets = await expireDuePaymentTickets(env).catch((error) => {
    console.error("EXPIRE PAYMENT TICKETS ERROR:", error);
    return { ok: false, rows: [] };
  });
  const expiredTicketRows = Array.isArray(expiredTickets?.rows) ? expiredTickets.rows : [];
  const expiredTicketNotify = await notifyExpiredPaymentTickets(env, expiredTicketRows);

  const expiredSubscriptions = await processExpiredSubscriptions(env, {
    dryRun: false,
    nowOverride: parsedNowOverride,
  });

  const reminderRuns = [];
  for (const key of keys) {
    reminderRuns.push(
      await processReminderKey(env, key, {
        limit,
        dryRun: false,
        nowOverride: parsedNowOverride,
      })
    );
  }

  return {
    ok: true,
    dry_run: false,
    target: normalizedTarget,
    now_override: parsedNowOverride ? toSqlDateTime(parsedNowOverride) : null,
    reminders: reminderRuns,
    expired_tickets: {
      count: expiredTicketRows.length,
      notified: expiredTicketNotify.sent,
      failed: expiredTicketNotify.failed,
    },
    expired_subscriptions: expiredSubscriptions,
  };
}

export async function previewReminderDebugRows(
  env,
  {
    limit = 20,
    nowOverride = null,
  } = {}
) {
  const parsedNowOverride = parseNowOverride(nowOverride);

  const rows = await listReminderDebugRows(env, {
    limit,
    nowOverride: parsedNowOverride,
  });

  return {
    ok: true,
    now_override: parsedNowOverride ? toSqlDateTime(parsedNowOverride) : null,
    rows: rows.map((row) => ({
      id: String(row.id || ""),
      partner_id: String(row.partner_id || ""),
      duration_code: String(row.duration_code || ""),
      source_type: String(row.source_type || ""),
      source_ref_id: String(row.source_ref_id || ""),
      end_at: String(row.end_at || ""),
      debug_now: String(row.debug_now || ""),
      h3d: Boolean(row?.reminder_matrix?.h3d),
      h2d: Boolean(row?.reminder_matrix?.h2d),
      h1d: Boolean(row?.reminder_matrix?.h1d),
      h3h: Boolean(row?.reminder_matrix?.h3h),
      reminder_h3d_sent_at: row?.reminder_h3d_sent_at || null,
      reminder_h2d_sent_at: row?.reminder_h2d_sent_at || null,
      reminder_h1d_sent_at: row?.reminder_h1d_sent_at || null,
      reminder_h3h_sent_at: row?.reminder_h3h_sent_at || null,
    })),
  };
}
