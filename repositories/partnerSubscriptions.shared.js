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
  const raw = String(reminderKey || "").trim().toLowerCase();
  if (raw === "h3d" || raw === "h2d" || raw === "h1d" || raw === "h3h") {
    return raw;
  }
  throw new Error("invalid_reminder_key");
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

export function parseSqlDateTime(value) {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;

  return d;
}

export function addDaysSqlDate(baseDate, daysToAdd) {
  const d = parseSqlDateTime(baseDate);
  if (!d) {
    throw new Error("invalid_base_date");
  }

  d.setDate(d.getDate() + Number(daysToAdd || 0));
  return toSqlDateTime(d);
}

export function addMonthsSqlDate(baseDate, monthsToAdd) {
  const d = parseSqlDateTime(baseDate);
  if (!d) {
    throw new Error("invalid_base_date");
  }

  const originalDate = d.getDate();
  d.setMonth(d.getMonth() + Number(monthsToAdd || 0));

  if (d.getDate() !== originalDate) {
    d.setDate(0);
  }

  return toSqlDateTime(d);
}

export function readJsonObject(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function readDurationCode(row) {
  const metadata = readJsonObject(row?.metadata_json);
  const metaCode = String(metadata?.duration_code || "").trim().toLowerCase();
  if (metaCode === "1d" || metaCode === "3d" || metaCode === "7d" || metaCode === "1m") {
    return metaCode;
  }

  const pricingSnapshot = readJsonObject(row?.pricing_snapshot_json);
  const snapshotCode = String(pricingSnapshot?.duration_code || "").trim().toLowerCase();
  if (
    snapshotCode === "1d" ||
    snapshotCode === "3d" ||
    snapshotCode === "7d" ||
    snapshotCode === "1m"
  ) {
    return snapshotCode;
  }

  const months = Number(row?.duration_months || 0);
  if (months === 1) return "1m";

  return "";
}

export function collectCoverageWindow(activeSubscriptions, fallbackNowSql) {
  const rows = Array.isArray(activeSubscriptions) ? activeSubscriptions : [];
  if (!rows.length) {
    return {
      hasActiveCoverage: false,
      earliestStartAt: fallbackNowSql,
      latestEndAt: fallbackNowSql,
      mergedFromIds: [],
    };
  }

  let earliestStart = null;
  let latestEnd = null;

  for (const row of rows) {
    const startAt = parseSqlDateTime(row?.start_at);
    const endAt = parseSqlDateTime(row?.end_at);

    if (startAt && (!earliestStart || startAt.getTime() < earliestStart.getTime())) {
      earliestStart = startAt;
    }

    if (endAt && (!latestEnd || endAt.getTime() > latestEnd.getTime())) {
      latestEnd = endAt;
    }
  }

  return {
    hasActiveCoverage: Boolean(earliestStart && latestEnd),
    earliestStartAt: earliestStart ? toSqlDateTime(earliestStart) : fallbackNowSql,
    latestEndAt: latestEnd ? toSqlDateTime(latestEnd) : fallbackNowSql,
    mergedFromIds: rows.map((row) => String(row?.id || "")).filter(Boolean),
  };
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

  return {
    targetSeconds: 3 * 60 * 60,
    lookBehindSeconds: 15 * 60,
    lookAheadSeconds: 60 * 60,
  };
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

export function isDateInsideReminderWindow(targetValue, reminderKey, nowValue) {
  const targetDate = parseSqlDateTime(targetValue);
  const nowDate = parseSqlDateTime(nowValue);
  if (!targetDate || !nowDate) return false;

  const { lowerSeconds, upperSeconds } = buildReminderWindow(reminderKey, nowValue).debug;
  const lowerDate = new Date(nowDate.getTime() + lowerSeconds * 1000);
  const upperDate = new Date(nowDate.getTime() + upperSeconds * 1000);

  return targetDate.getTime() >= lowerDate.getTime() && targetDate.getTime() < upperDate.getTime();
}
