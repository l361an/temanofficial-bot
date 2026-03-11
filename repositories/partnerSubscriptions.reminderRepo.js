// repositories/partnerSubscriptions.reminderRepo.js

import { nowJakartaSql } from "../utils/time.js";
import {
  normalizeReminderColumn,
  normalizeReminderKey,
  resolveNowSql,
  readDurationCode,
  canReminderApplyToDuration,
  buildReminderWindow,
} from "./partnerSubscriptions.shared.js";

export async function listSubscriptionsDueForReminder(
  env,
  reminderKey,
  {
    limit = 200,
    nowOverride = null,
  } = {}
) {
  const safeReminderKey = normalizeReminderKey(reminderKey);
  const reminderColumn = normalizeReminderColumn(safeReminderKey);
  const nowSql = resolveNowSql(nowOverride);
  const { lowerExpr, upperExpr, bindValues } = buildReminderWindow(safeReminderKey, nowSql);
  const safeLimit =
    Number.isFinite(Number(limit)) && Number(limit) > 0
      ? Math.min(Number(limit), 1000)
      : 200;

  const sql = `
    SELECT *
    FROM partner_subscriptions
    WHERE status = 'active'
      AND start_at IS NOT NULL
      AND end_at IS NOT NULL
      AND datetime(start_at) <= datetime(?)
      AND datetime(end_at) > datetime(?)
      AND datetime(end_at) >= ${lowerExpr}
      AND datetime(end_at) < ${upperExpr}
      AND ${reminderColumn} IS NULL
    ORDER BY datetime(end_at) ASC, datetime(created_at) ASC
    LIMIT ${safeLimit}
  `;

  const bindParams = [nowSql, nowSql, ...bindValues];
  const { results } = await env.DB.prepare(sql).bind(...bindParams).all();
  const rows = Array.isArray(results) ? results : [];

  return rows
    .filter((row) => {
      const durationCode = readDurationCode(row);
      return canReminderApplyToDuration(durationCode, safeReminderKey);
    })
    .map((row) => ({
      ...row,
      duration_code: readDurationCode(row),
    }));
}

export async function markSubscriptionReminderSent(
  env,
  subscriptionId,
  reminderKey,
  sentAt = null
) {
  const reminderColumn = normalizeReminderColumn(reminderKey);
  const safeSentAt = sentAt == null ? nowJakartaSql() : String(sentAt);

  const sql = `
    UPDATE partner_subscriptions
    SET ${reminderColumn} = COALESCE(${reminderColumn}, ?),
        updated_at = datetime('now')
    WHERE id = ?
  `;

  await env.DB.prepare(sql)
    .bind(safeSentAt, String(subscriptionId))
    .run();

  return { ok: true };
}

export async function resetSubscriptionReminderMarker(env, subscriptionId, reminderKey) {
  const reminderColumn = normalizeReminderColumn(reminderKey);

  const sql = `
    UPDATE partner_subscriptions
    SET ${reminderColumn} = NULL,
        updated_at = datetime('now')
    WHERE id = ?
  `;

  await env.DB.prepare(sql)
    .bind(String(subscriptionId))
    .run();

  return { ok: true };
}

export async function listReminderDebugRows(
  env,
  {
    limit = 20,
    nowOverride = null,
  } = {}
) {
  const safeLimit =
    Number.isFinite(Number(limit)) && Number(limit) > 0
      ? Math.min(Number(limit), 100)
      : 20;

  const nowSql = resolveNowSql(nowOverride);

  const { results } = await env.DB.prepare(
    `
    SELECT *
    FROM partner_subscriptions
    WHERE status = 'active'
      AND start_at IS NOT NULL
      AND end_at IS NOT NULL
      AND datetime(start_at) <= datetime(?)
      AND datetime(end_at) > datetime(?)
    ORDER BY datetime(end_at) ASC, datetime(created_at) ASC
    LIMIT ?
  `
  )
    .bind(nowSql, nowSql, safeLimit)
    .all();

  const rows = Array.isArray(results) ? results : [];

  return rows.map((row) => {
    const durationCode = readDurationCode(row);

    const h3dWindow = buildReminderWindow("h3d", nowSql);
    const h2dWindow = buildReminderWindow("h2d", nowSql);
    const h1dWindow = buildReminderWindow("h1d", nowSql);
    const h3hWindow = buildReminderWindow("h3h", nowSql);

    return {
      ...row,
      duration_code: durationCode,
      debug_now: nowSql,
      reminder_matrix: {
        h3d: canReminderApplyToDuration(durationCode, "h3d"),
        h2d: canReminderApplyToDuration(durationCode, "h2d"),
        h1d: canReminderApplyToDuration(durationCode, "h1d"),
        h3h: canReminderApplyToDuration(durationCode, "h3h"),
      },
      reminder_windows: {
        h3d: h3dWindow.debug,
        h2d: h2dWindow.debug,
        h1d: h1dWindow.debug,
        h3h: h3hWindow.debug,
      },
    };
  });
}
