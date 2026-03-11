// repositories/partnerSubscriptions.shared.js

import { nowJakartaSql } from "../utils/time.js";

export function normalizeReminderColumn(reminderKey) {
  const raw = String(reminderKey || "").trim().toLowerCase();
  if (raw === "h3d") return "reminder_h3d_sent_at";
  if (raw === "h2d") return "reminder_h2d_sent_at";
  if (raw === "h1d") return "reminder_h1d_sent_at";
  if (raw === "h3h") return "reminder_h3h_sent_at";
  throw new Error("invalid_reminder_key");
}

export function normalizeReminderKey(reminderKey) {
  return String(reminderKey || "").trim().toLowerCase();
}

export function toSqlDateTime(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error("invalid_datetime");
  }

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

export function resolveNowSql(nowOverride = null) {
  if (nowOverride) {
    return toSqlDateTime(nowOverride);
  }
  return nowJakartaSql();
}

export function readDurationCode(row) {
  const metadata = String(row?.metadata_json || "").trim();
  if (metadata) {
    try {
      const parsed = JSON.parse(metadata);
      const raw = String(parsed?.duration_code || "").trim().toLowerCase();
      if (raw === "1d" || raw === "3d" || raw === "7d" || raw === "1m") return raw;
    } catch {}
  }

  const months = Number(row?.duration_months || 0);
  if (months === 1) return "1m";
  return "1d";
}

export function canReminderApplyToDuration(durationCode, reminderKey) {
  const d = String(durationCode || "").trim().toLowerCase();
  const k = normalizeReminderKey(reminderKey);

  if (d === "1d") {
    return k === "h3h";
  }

  if (d === "3d") {
    return k === "h2d" || k === "h1d" || k === "h3h";
  }

  if (d === "7d" || d === "1m") {
    return k === "h3d" || k === "h2d" || k === "h1d" || k === "h3h";
  }

  return false;
}

export function getReminderWindowConfig(reminderKey) {
  const k = normalizeReminderKey(reminderKey);

  if (k === "h3d") {
    return {
      targetSeconds: 3 * 24 * 60 * 60,
      lookBehindSeconds: 30 * 60,
      lookAheadSeconds: 2 * 60 * 60,
    };
  }

  if (k === "h2d") {
    return {
      targetSeconds: 2 * 24 * 60 * 60,
      lookBehindSeconds: 30 * 60,
      lookAheadSeconds: 2 * 60 * 60,
    };
  }

  if (k === "h1d") {
    return {
      targetSeconds: 1 * 24 * 60 * 60,
      lookBehindSeconds: 30 * 60,
      lookAheadSeconds: 2 * 60 * 60,
    };
  }

  if (k === "h3h") {
    return {
      targetSeconds: 3 * 60 * 60,
      lookBehindSeconds: 15 * 60,
      lookAheadSeconds: 60 * 60,
    };
  }

  throw new Error("invalid_reminder_key");
}

export function buildReminderWindow(reminderKey, nowSql) {
  const { targetSeconds, lookBehindSeconds, lookAheadSeconds } =
    getReminderWindowConfig(reminderKey);

  const lowerSeconds = Math.max(0, targetSeconds - lookAheadSeconds);
  const upperSeconds = targetSeconds + lookBehindSeconds;

  return {
    lowerExpr: `datetime(?, '+${lowerSeconds} seconds')`,
    upperExpr: `datetime(?, '+${upperSeconds} seconds')`,
    bindValues: [nowSql, nowSql],
    debug: {
      targetSeconds,
      lookBehindSeconds,
      lookAheadSeconds,
      lowerSeconds,
      upperSeconds,
    },
  };
}
