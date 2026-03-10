// services/subscriptionReminderService.js

import { sendMessage } from "./telegramApi.js";
import { expireDuePaymentTickets } from "../repositories/paymentTicketsRepo.js";
import {
  listSubscriptionsDueForReminder,
  markSubscriptionReminderSent,
  expireDueSubscriptions,
  listReminderDebugRows,
} from "../repositories/partnerSubscriptionsRepo.js";
import { markSubscriptionExpired } from "./partnerStatusService.js";

const REMINDER_KEYS = ["h3d", "h2d", "h1d", "h3h"];

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toSqlDateTime(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error("invalid_datetime");
  }

  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
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

  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function getReminderLabel(reminderKey) {
  if (reminderKey === "h3d") return "3 hari lagi";
  if (reminderKey === "h2d") return "2 hari lagi";
  if (reminderKey === "h1d") return "1 hari lagi";
  if (reminderKey === "h3h") return "3 jam lagi";
  return "-";
}

function buildReminderMessage(row, reminderKey) {
  const reminderLabel = getReminderLabel(reminderKey);
  const endAt = formatDateTime(row?.end_at);

  return [
    "⏰ <b>Reminder Premium TeMan</b>",
    "",
    `Masa aktif Premium kamu akan berakhir <b>${reminderLabel}</b>.`,
    "",
    "<b>Informasi Premium</b>",
    `• Berakhir pada: <b>${endAt}</b>`,
    "",
    "Silakan lakukan perpanjangan melalui menu Payment agar akses Premium tetap aktif tanpa terputus.",
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

function buildMenuKeyboard() {
  return {
    inline_keyboard: [[{ text: "📋 Menu TeMan", callback_data: "teman:menu" }]],
  };
}

function parseNowOverride(nowOverride) {
  if (!nowOverride) return null;
  const d = new Date(String(nowOverride).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) {
    throw new Error("invalid_now_override");
  }
  return d;
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
          reply_markup: buildMenuKeyboard(),
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
        buildReminderMessage(row, reminderKey),
        {
          parse_mode: "HTML",
          reply_markup: buildMenuKeyboard(),
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
      partner_ids: [],
    };
  }

  const expired = await expireDueSubscriptions(env, nowOverride);
  const partnerIds = Array.isArray(expired?.partnerIds) ? expired.partnerIds : [];

  let notified = 0;
  let failed = 0;

  for (const telegramId of partnerIds) {
    try {
      const statusRes = await markSubscriptionExpired(env, telegramId);

      const res = await sendMessage(
        env,
        String(telegramId),
        String(
          statusRes?.user_message ||
            "Keanggotaan Premium kamu sudah berakhir. Silakan lakukan pembayaran di menu Payment untuk mengaktifkan kembali fitur Premium TeMan."
        ),
        {
          reply_markup: buildMenuKeyboard(),
          disable_web_page_preview: true,
        }
      );

      if (res?.ok === false) {
        failed += 1;
        continue;
      }

      notified += 1;
    } catch (err) {
      console.error("EXPIRE SUBSCRIPTION NOTIFY ERROR:", telegramId, err);
      failed += 1;
    }
  }

  return {
    expired_count: partnerIds.length,
    notified,
    failed,
    partner_ids: partnerIds,
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
      reminderRuns.push(await processReminderKey(env, key, {
        limit,
        dryRun: true,
        nowOverride: parsedNowOverride,
      }));
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
        partner_ids: [],
      },
    };
  }

  const expiredTickets = await expireDuePaymentTickets(env);
  const expiredTicketRows = Array.isArray(expiredTickets?.rows) ? expiredTickets.rows : [];
  const expiredTicketNotify = await notifyExpiredPaymentTickets(env, expiredTicketRows);

  const reminderRuns = [];
  for (const key of keys) {
    reminderRuns.push(await processReminderKey(env, key, {
      limit,
      dryRun: false,
      nowOverride: parsedNowOverride,
    }));
  }

  const expiredSubscriptions = await processExpiredSubscriptions(env, {
    dryRun: false,
    nowOverride: parsedNowOverride,
  });

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
