// services/subscriptionReminderService.js

import { sendMessage } from "./telegramApi.js";
import { expireDuePaymentTickets } from "../repositories/paymentTicketsRepo.js";
import {
  listSubscriptionsDueForReminder,
  markSubscriptionReminderSent,
  expireDueSubscriptions,
} from "../repositories/partnerSubscriptionsRepo.js";
import { markSubscriptionExpired } from "./partnerStatusService.js";

const REMINDER_KEYS = ["h3d", "h2d", "h1d", "h3h"];

function pad2(value) {
  return String(value).padStart(2, "0");
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

async function processReminderKey(env, reminderKey, { limit = 200, dryRun = false } = {}) {
  const candidates = await listSubscriptionsDueForReminder(env, reminderKey, { limit });

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
      })),
    };
  }

  let sent = 0;
  let failed = 0;

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

      await markSubscriptionReminderSent(env, row.id, reminderKey);
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

async function processExpiredSubscriptions(env, { dryRun = false } = {}) {
  if (dryRun) {
    return {
      expired_count: 0,
      notified: 0,
      failed: 0,
      partner_ids: [],
    };
  }

  const expired = await expireDueSubscriptions(env);
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

  if (dryRun) {
    const reminderRuns = [];
    for (const key of keys) {
      reminderRuns.push(await processReminderKey(env, key, { limit, dryRun: true }));
    }

    return {
      ok: true,
      dry_run: true,
      target: normalizedTarget,
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
    reminderRuns.push(await processReminderKey(env, key, { limit, dryRun: false }));
  }

  const expiredSubscriptions = await processExpiredSubscriptions(env, { dryRun: false });

  return {
    ok: true,
    dry_run: false,
    target: normalizedTarget,
    reminders: reminderRuns,
    expired_tickets: {
      count: expiredTicketRows.length,
      notified: expiredTicketNotify.sent,
      failed: expiredTicketNotify.failed,
    },
    expired_subscriptions: expiredSubscriptions,
  };
}
