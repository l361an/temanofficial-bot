// routes/telegram.command.reminderTest.js

import { sendMessage } from "../services/telegramApi.js";
import { isSuperadminRole } from "../utils/roles.js";
import {
  runSubscriptionReminderCycle,
  previewReminderDebugRows,
} from "../services/subscriptionReminderService.js";

const VALID_TARGETS = new Set(["all", "h3d", "h2d", "h1d", "h3h"]);

function buildHelpText() {
  return [
    "🧪 <b>Reminder Test Command</b>",
    "",
    "Format:",
    "<code>/tesreminder</code>",
    "<code>/tesreminder preview all</code>",
    "<code>/tesreminder preview h3d 10</code>",
    "<code>/tesreminder preview h2d 10 at 2026-03-11 05:25:00</code>",
    "<code>/tesreminder run all</code>",
    "<code>/tesreminder run h1d 20</code>",
    "<code>/tesreminder run h3h 10 at 2026-03-13 02:25:00</code>",
    "<code>/tesreminder debug</code>",
    "<code>/tesreminder debug 20</code>",
    "<code>/tesreminder debug 20 at 2026-03-11 05:25:00</code>",
    "",
    "Keterangan:",
    "• default tanpa argumen = <b>preview all</b>",
    "• target: all | h3d | h2d | h1d | h3h",
    "• argumen terakhir opsional = limit",
    "• pakai <code>at YYYY-MM-DD HH:mm:ss</code> untuk simulasi waktu test",
  ].join("\n");
}

function extractAtClause(raw) {
  const text = String(raw || "").trim();
  const idx = text.toLowerCase().lastIndexOf(" at ");
  if (idx < 0) {
    return {
      baseText: text,
      nowOverride: null,
    };
  }

  const baseText = text.slice(0, idx).trim();
  const nowOverride = text.slice(idx + 4).trim();

  return {
    baseText,
    nowOverride: nowOverride || null,
  };
}

function parseCommand(text) {
  const { baseText, nowOverride } = extractAtClause(text);
  const parts = baseText.split(/\s+/).filter(Boolean);
  const command = (parts.shift() || "").toLowerCase();

  if (command !== "/tesreminder") {
    return null;
  }

  if ((parts[0] || "").toLowerCase() === "debug") {
    let limit = 20;
    if (parts[1]) {
      const parsed = Number(parts[1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = Math.min(parsed, 50);
      }
    }

    return {
      mode: "debug",
      limit,
      nowOverride,
    };
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

  return {
    mode: "runner",
    action,
    target,
    limit,
    nowOverride,
  };
}

function buildPreviewResultText(result) {
  const lines = [
    "🧪 <b>Preview Reminder</b>",
    "",
    `Target: <b>${String(result?.target || "-").toUpperCase()}</b>`,
    `Now Override: <b>${String(result?.now_override || "-")}</b>`,
    "",
  ];

  for (const row of result?.reminders || []) {
    lines.push(
      `• ${String(row.key || "").toUpperCase()}: <b>${Number(row.candidates || 0)}</b> kandidat`
    );

    for (const sample of row.samples || []) {
      lines.push(
        `  - ${sample.partner_id} | ${sample.duration_code} | ${sample.end_at}`
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
    `Now Override: <b>${String(result?.now_override || "-")}</b>`,
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

function buildDebugText(result) {
  const lines = [
    "🔎 <b>Reminder Debug Rows</b>",
    "",
    `Now Override: <b>${String(result?.now_override || "-")}</b>`,
    "",
  ];

  const rows = Array.isArray(result?.rows) ? result.rows : [];
  if (!rows.length) {
    lines.push("Tidak ada subscription aktif yang ditemukan.");
    return lines.join("\n");
  }

  for (const row of rows) {
    lines.push(`• Partner: <code>${row.partner_id}</code> | Durasi: <b>${row.duration_code}</b>`);
    lines.push(`  Debug Now: ${row.debug_now}`);
    lines.push(`  End At: ${row.end_at}`);
    lines.push(`  Matrix: h3d=${row.h3d ? "Y" : "N"}, h2d=${row.h2d ? "Y" : "N"}, h1d=${row.h1d ? "Y" : "N"}, h3h=${row.h3h ? "Y" : "N"}`);
    lines.push(`  Sent: h3d=${row.reminder_h3d_sent_at || "-"}, h2d=${row.reminder_h2d_sent_at || "-"}, h1d=${row.reminder_h1d_sent_at || "-"}, h3h=${row.reminder_h3h_sent_at || "-"}`);
    lines.push("");
  }

  return lines.join("\n").trim();
}

export async function handleReminderTestCommand({ env, chatId, text, role }) {
  const parsed = parseCommand(text);
  if (!parsed) return false;

  if (!isSuperadminRole(role)) {
    await sendMessage(env, chatId, "⛔ Command ini hanya untuk Superadmin.");
    return true;
  }

  if (parsed.mode === "debug") {
    try {
      const debugRes = await previewReminderDebugRows(env, {
        limit: parsed.limit,
        nowOverride: parsed.nowOverride,
      });

      await sendMessage(env, chatId, buildDebugText(debugRes), {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
    } catch (err) {
      await sendMessage(env, chatId, "⚠️ Format waktu override tidak valid. Pakai: YYYY-MM-DD HH:mm:ss");
    }

    return true;
  }

  if (!VALID_TARGETS.has(parsed.target)) {
    await sendMessage(env, chatId, buildHelpText(), {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return true;
  }

  try {
    const dryRun = parsed.action !== "run";
    const result = await runSubscriptionReminderCycle(env, {
      target: parsed.target,
      limit: parsed.limit,
      dryRun,
      nowOverride: parsed.nowOverride,
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
  } catch (err) {
    await sendMessage(env, chatId, "⚠️ Format waktu override tidak valid. Pakai: YYYY-MM-DD HH:mm:ss");
  }

  return true;
}
