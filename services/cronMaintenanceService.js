// services/cronMaintenanceService.js

import { runSubscriptionReminderCycle } from "./subscriptionReminderService.js";

function sumReminderField(reminders, fieldName) {
  return (Array.isArray(reminders) ? reminders : []).reduce(
    (sum, item) => sum + Number(item?.[fieldName] || 0),
    0
  );
}

export async function runMaintenanceCron(env) {
  const startedAt = new Date().toISOString();

  const cycle = await runSubscriptionReminderCycle(env, {
    target: "all",
    limit: 200,
    dryRun: false,
  });

  const reminders = Array.isArray(cycle?.reminders) ? cycle.reminders : [];

  const summary = {
    ok: Boolean(cycle?.ok),
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    expired_payments: cycle?.expired_tickets || {
      count: 0,
      notified: 0,
      failed: 0,
    },
    expired_subscriptions: cycle?.expired_subscriptions || {
      expired_count: 0,
      notified: 0,
      failed: 0,
      skipped_has_active_coverage: 0,
      partner_ids: [],
      notified_partner_ids: [],
      skipped_partner_ids: [],
      group_role_sync_results: [],
    },
    reminders: {
      ok: true,
      batches: reminders,
      totalCandidates: sumReminderField(reminders, "candidates"),
      totalSent: sumReminderField(reminders, "sent"),
      totalFailed: sumReminderField(reminders, "failed"),
    },
    raw_cycle: cycle || null,
  };

  console.log("[cron] maintenance summary:", JSON.stringify(summary, null, 2));
  return summary;
}
