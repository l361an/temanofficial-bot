// routes/telegram.command.reminderTest.js

import { sendMessage } from "../services/telegramApi.js";
import { isSuperadminRole } from "../utils/roles.js";
import { runSubscriptionReminderCycle } from "../services/subscriptionReminderService.js";

const VALID_TARGETS = new Set(["all", "h3d", "h2d", "h1d", "h3h"]);

function buildHelpText() {
  return [
    "🧪 <b>Reminder Test Command</b>",
    "",
    "Format:",
    "<code>/tesreminder</code>",
    "<code>/tesreminder preview all</code>",
    "<code>/tesreminder preview h3d 10</code>",
    "<code>/tesreminder run all</code>",
    "<code>/tesreminder run h1d 20</code>",
    "",
    "Keterangan:",
    "• default tanpa argumen = <b>preview all</b>",
    "• target: all | h3d | h2d | h1d | h3h",
    "• argumen terakhir opsional = limit",
  ].join("\n");
}

function parseCommand(text) {
  const raw = String(text || "").trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  const command = (parts.shift() || "").toLowerCase();

  if (command !== "/tesreminder") {
    return null;
  }

  let action = "preview";
  let target = "all";
  let limit = 20;

  if (parts[0] && /^(preview|run)$/i.test(parts[0])) {
    action = parts.shift().toLowerCase();
  }

  if (parts[0]) {
    target = String(parts.shift() || "all").toLowerCase();
  }

  if (parts[0]) {
    const parsed = Number(parts.shift());
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, 200);
    }
  }

  return { action, target, limit };
}

function buildPreviewResultText(result) {
  const lines = [
    "🧪 <b>Preview Reminder</b>",
    "",
    `Target: <b>${String(result?.target || "-").toUpperCase()}</b>`,
    "",
  ];

  for (const row of result?.reminders || []) {
    lines.push(
      `• ${String(row.key || "").toUpperCase()}: <b>${Number(row.candidates || 0)}</b> kandidat`
    );

    for (const sample of row.samples || []) {
      lines.push(
        `  - ${sample.partner_id} | ${sample.end_at}`
      );
    }
  }

  return lines.join("\n");
}

function buildRunResultText(result) {
  const lines = [
    "✅ <b>Reminder Runner Executed</b>",
    "",
    `Target: <b>${String(result?.target || "-").toUpperCase()}</b>`,
    "",
    "<b>Expired Ticket</b>",
    `• Total expired: <b>${Number(result?.expired_tickets?.count || 0)}</b>`,
    `• Notified: <b>${Number(result?.expired_tickets?.notified || 0)}</b>`,
    `• Failed: <b>${Number(result?.expired_tickets?.failed || 0)}</b>`,
    "",
    "<b>Reminder</b>",
  ];

  for (const row of result?.reminders || []) {
    lines.push(
      `• ${String(row.key || "").toUpperCase()}: kandidat <b>${Number(row.candidates || 0)}</b>, sent <b>${Number(row.sent || 0)}</b>, failed <b>${Number(row.failed || 0)}</b>`
    );
  }

  lines.push("");
  lines.push("<b>Expired Subscription</b>");
  lines.push(`• Expired: <b>${Number(result?.expired_subscriptions?.expired_count || 0)}</b>`);
  lines.push(`• Notified: <b>${Number(result?.expired_subscriptions?.notified || 0)}</b>`);
  lines.push(`• Failed: <b>${Number(result?.expired_subscriptions?.failed || 0)}</b>`);

  return lines.join("\n");
}

export async function handleReminderTestCommand({ env, chatId, text, role }) {
  const parsed = parseCommand(text);
  if (!parsed) return false;

  if (!isSuperadminRole(role)) {
    await sendMessage(env, chatId, "⛔ Command ini hanya untuk Superadmin.");
    return true;
  }

  if (!VALID_TARGETS.has(parsed.target)) {
    await sendMessage(env, chatId, buildHelpText(), {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return true;
  }

  const dryRun = parsed.action !== "run";
  const result = await runSubscriptionReminderCycle(env, {
    target: parsed.target,
    limit: parsed.limit,
    dryRun,
  });

  if (!result?.ok) {
    await sendMessage(env, chatId, "⚠️ Reminder runner gagal dijalankan.");
    return true;
  }

  const textOut = dryRun ? buildPreviewResultText(result) : buildRunResultText(result);

  await sendMessage(env, chatId, textOut, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });

  return true;
}
