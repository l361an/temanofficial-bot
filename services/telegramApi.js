// services/cronMaintenanceService.js

import {
  sendMessage,
  demoteChatMember,
  muteChatMember,
} from "../services/telegramApi.js";
import { buildTeManMenuKeyboard, formatDateTime } from "../routes/telegram.user.shared.js";
import { expireDuePaymentTickets } from "../repositories/paymentTicketsRepo.js";
import {
  expireDueSubscriptions,
  listSubscriptionsDueForReminder,
  markSubscriptionReminderSent,
} from "../repositories/partnerSubscriptionsRepo.js";
import { markSubscriptionExpired } from "./partnerStatusService.js";

function readPartnerGroupIds(env) {
  return String(env.PARTNER_GROUP_IDS || "")
    .split(",")
    .map((v) => String(v || "").trim())
    .filter(Boolean);
}

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

async function dismissPartnerAdminAndMute(env, partnerId) {
  const groupIds = readPartnerGroupIds(env);
  const actions = [];

  for (const groupId of groupIds) {
    const result = {
      chat_id: groupId,
      demote_ok: false,
      mute_ok: false,
    };

    try {
      const demoteRes = await demoteChatMember(env, groupId, partnerId);
      result.demote_ok = Boolean(demoteRes?.ok);
      result.demote_response = demoteRes;
    } catch (error) {
      result.demote_error = error?.message || String(error);
    }

    try {
      const muteRes = await muteChatMember(env, groupId, partnerId, 0);
      result.mute_ok = Boolean(muteRes?.ok);
      result.mute_response = muteRes;
    } catch (error) {
      result.mute_error = error?.message || String(error);
    }

    actions.push(result);
  }

  return actions;
}

async function runExpirePaymentTickets(env) {
  const expired = await expireDuePaymentTickets(env).catch((error) => {
    console.error("[cron] expireDuePaymentTickets error:", error);
    return { ok: false, rows: [] };
  });

  return {
    ok: Boolean(expired?.ok),
    count: Array.isArray(expired?.rows) ? expired.rows.length : 0,
    rows: Array.isArray(expired?.rows) ? expired.rows : [],
  };
}

async function runExpireSubscriptions(env) {
  const expired = await expireDueSubscriptions(env).catch((error) => {
    console.error("[cron] expireDueSubscriptions error:", error);
    return { ok: false, partnerIds: [] };
  });

  const partnerIds = Array.isArray(expired?.partnerIds) ? expired.partnerIds : [];
  let statusUpdatedCount = 0;
  const moderationActions = [];

  for (const partnerId of partnerIds) {
    try {
      await markSubscriptionExpired(env, partnerId, null);
      statusUpdatedCount += 1;

      const groupActions = await dismissPartnerAdminAndMute(env, partnerId).catch((error) => {
        console.error("[cron] dismissPartnerAdminAndMute error:", {
          partnerId,
          error: error?.message || String(error),
        });
        return [];
      });

      moderationActions.push({
        partner_id: String(partnerId),
        groups: groupActions,
      });

      await sendMessage(
        env,
        partnerId,
        [
          "⛔ <b>Masa aktif Premium TeMan kamu sudah berakhir.</b>",
          "",
          "Status admin partner kamu di grup telah dinonaktifkan dan akun kamu telah di-mute otomatis.",
          "",
          "Silakan lakukan <b>Pembayaran / Renewal</b> di <b>Menu Premium Partner</b> agar <b>Akses Premium</b> aktif kembali dan kamu tetap dapat menggunakan <b>Fitur Premium TeMan</b>.",
        ].join("\n"),
        {
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: buildTeManMenuKeyboard(),
        }
      ).catch(() => {});
    } catch (error) {
      console.error("[cron] markSubscriptionExpired error:", {
        partnerId,
        error: error?.message || String(error),
      });
    }
  }

  return {
    ok: Boolean(expired?.ok),
    count: partnerIds.length,
    statusUpdatedCount,
    partnerIds,
    moderationActions,
  };
}

async function runReminderBatch(env, reminderKey) {
  const rows = await listSubscriptionsDueForReminder(env, reminderKey, {
    limit: 200,
  }).catch((error) => {
    console.error("[cron] listSubscriptionsDueForReminder error:", {
      reminderKey,
      error: error?.message || String(error),
    });
    return [];
  });

  let sentCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    const partnerId = String(row?.partner_id || "").trim();
    const subscriptionId = row?.id;

    if (!partnerId || !subscriptionId) {
      failedCount += 1;
      continue;
    }

    try {
      await sendMessage(env, partnerId, buildReminderMessage(reminderKey, row), {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: buildTeManMenuKeyboard(),
      });

      await markSubscriptionReminderSent(env, subscriptionId, reminderKey);
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      console.error("[cron] reminder send error:", {
        reminderKey,
        partnerId,
        subscriptionId,
        error: error?.message || String(error),
      });
    }
  }

  return {
    ok: true,
    reminderKey,
    candidateCount: rows.length,
    sentCount,
    failedCount,
  };
}

async function runSubscriptionReminders(env) {
  const reminderKeys = ["h3d", "h2d", "h1d", "h3h"];
  const batches = [];

  for (const reminderKey of reminderKeys) {
    const result = await runReminderBatch(env, reminderKey);
    batches.push(result);
  }

  return {
    ok: true,
    batches,
    totalCandidates: batches.reduce((sum, item) => sum + Number(item?.candidateCount || 0), 0),
    totalSent: batches.reduce((sum, item) => sum + Number(item?.sentCount || 0), 0),
    totalFailed: batches.reduce((sum, item) => sum + Number(item?.failedCount || 0), 0),
  };
}

export async function runMaintenanceCron(env) {
  const startedAt = new Date().toISOString();

  const expiredPayments = await runExpirePaymentTickets(env);
  const expiredSubscriptions = await runExpireSubscriptions(env);
  const reminders = await runSubscriptionReminders(env);

  const summary = {
    ok: true,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    expired_payments: expiredPayments,
    expired_subscriptions: expiredSubscriptions,
    reminders,
  };

  console.log("[cron] maintenance summary:", JSON.stringify(summary, null, 2));
  return summary;
}
