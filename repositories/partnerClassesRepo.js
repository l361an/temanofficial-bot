// repositories/partnerClassesRepo.js

import { getSetting, upsertSetting } from "./settingsRepo.js";

const PARTNER_CLASSES_SETTING_KEY = "partner_classes";
const PARTNER_DEFAULT_CLASS_SETTING_KEY = "partner_default_class_id";

function normalizeClassId(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeClassLabel(value) {
  return String(value || "").trim();
}

function titleCaseWords(value) {
  return String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function nowSql() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function buildBootstrapRows() {
  const ts = nowSql();

  return [
    {
      id: "general",
      label: "General",
      is_active: 1,
      sort_order: 10,
      pricing_ref_id: "general",
      created_at: ts,
      updated_at: ts,
    },
    {
      id: "bronze",
      label: "Bronze",
      is_active: 0,
      sort_order: 20,
      pricing_ref_id: "bronze",
      created_at: ts,
      updated_at: ts,
    },
    {
      id: "gold",
      label: "Gold",
      is_active: 0,
      sort_order: 30,
      pricing_ref_id: "gold",
      created_at: ts,
      updated_at: ts,
    },
    {
      id: "platinum",
      label: "Platinum",
      is_active: 0,
      sort_order: 40,
      pricing_ref_id: "platinum",
      created_at: ts,
      updated_at: ts,
    },
  ];
}

function normalizeClassRow(input, fallbackSortOrder = 999) {
  const id = normalizeClassId(input?.id);
  if (!id) return null;

  const label = normalizeClassLabel(input?.label) || titleCaseWords(id);
  const pricingRefId = normalizeClassId(input?.pricing_ref_id || id) || id;
  const isActive = Number(input?.is_active) === 0 ? 0 : 1;

  let sortOrder = Number(input?.sort_order);
  if (!Number.isFinite(sortOrder)) sortOrder = fallbackSortOrder;

  return {
    id,
    label,
    is_active: isActive,
    sort_order: Math.floor(sortOrder),
    pricing_ref_id: pricingRefId,
    created_at: String(input?.created_at || nowSql()).trim(),
    updated_at: String(input?.updated_at || nowSql()).trim(),
  };
}

function sortRows(rows = []) {
  return [...rows].sort((a, b) => {
    const so = Number(a.sort_order || 999) - Number(b.sort_order || 999);
    if (so !== 0) return so;
    return String(a.label || a.id).localeCompare(String(b.label || b.id), "id");
  });
}

async function saveRows(env, rows) {
  const finalRows = sortRows(rows);
  await upsertSetting(env, PARTNER_CLASSES_SETTING_KEY, JSON.stringify(finalRows));
  return finalRows;
}

async function loadRows(env) {
  const raw = await getSetting(env, PARTNER_CLASSES_SETTING_KEY);

  if (!String(raw || "").trim()) {
    const bootstrap = buildBootstrapRows();
    await saveRows(env, bootstrap);
    await upsertSetting(env, PARTNER_DEFAULT_CLASS_SETTING_KEY, "general");
    return bootstrap;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("partner_classes_not_array");

    const seen = new Set();
    const normalized = [];

    for (let i = 0; i < parsed.length; i += 1) {
      const row = normalizeClassRow(parsed[i], (i + 1) * 10);
      if (!row) continue;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      normalized.push(row);
    }

    if (!normalized.length) {
      const bootstrap = buildBootstrapRows();
      await saveRows(env, bootstrap);
      await upsertSetting(env, PARTNER_DEFAULT_CLASS_SETTING_KEY, "general");
      return bootstrap;
    }

    return sortRows(normalized);
  } catch {
    const bootstrap = buildBootstrapRows();
    await saveRows(env, bootstrap);
    await upsertSetting(env, PARTNER_DEFAULT_CLASS_SETTING_KEY, "general");
    return bootstrap;
  }
}

function ensureValidClassId(classId) {
  const cid = normalizeClassId(classId);
  return /^[a-z][a-z0-9_]{1,31}$/.test(cid) ? cid : "";
}

export async function listPartnerClasses(env) {
  return loadRows(env);
}

export async function listActivePartnerClasses(env) {
  const rows = await loadRows(env);
  return rows.filter((row) => Number(row.is_active) === 1);
}

export async function getPartnerClassById(env, classId) {
  const cid = normalizeClassId(classId);
  if (!cid) return null;

  const rows = await loadRows(env);
  return rows.find((row) => row.id === cid) || null;
}

export async function getPartnerClassLabel(env, classId) {
  const row = await getPartnerClassById(env, classId);
  if (!row) return titleCaseWords(classId);
  return row.label;
}

export async function getDefaultPartnerClassId(env) {
  const configured = normalizeClassId(await getSetting(env, PARTNER_DEFAULT_CLASS_SETTING_KEY));
  const activeRows = await listActivePartnerClasses(env);

  if (configured && activeRows.some((row) => row.id === configured)) {
    return configured;
  }

  if (activeRows.length) return activeRows[0].id;

  const allRows = await loadRows(env);
  return allRows[0]?.id || "general";
}

export async function isSelectablePartnerClassId(env, classId) {
  const row = await getPartnerClassById(env, classId);
  return Boolean(row && Number(row.is_active) === 1);
}

export async function resolvePartnerPricingClassId(env, classId) {
  const row = await getPartnerClassById(env, classId);
  if (!row) return normalizeClassId(classId) || "";
  return normalizeClassId(row.pricing_ref_id || row.id) || row.id;
}

export async function setDefaultPartnerClassId(env, classId) {
  const cid = normalizeClassId(classId);
  if (!cid) return { ok: false, reason: "empty_class_id" };

  const selectable = await isSelectablePartnerClassId(env, cid);
  if (!selectable) return { ok: false, reason: "inactive_or_unknown_class_id" };

  await upsertSetting(env, PARTNER_DEFAULT_CLASS_SETTING_KEY, cid);
  return { ok: true, class_id: cid };
}

export async function addPartnerClass(env, payload = {}) {
  const classId = ensureValidClassId(payload?.id);
  if (!classId) return { ok: false, reason: "invalid_class_id" };

  const label = normalizeClassLabel(payload?.label);
  if (!label) return { ok: false, reason: "empty_label" };

  const rows = await loadRows(env);
  if (rows.some((row) => row.id === classId)) {
    return { ok: false, reason: "class_id_exists" };
  }

  const ts = nowSql();
  const maxSort = rows.reduce((acc, row) => Math.max(acc, Number(row.sort_order || 0)), 0);

  const newRow = {
    id: classId,
    label,
    is_active: 1,
    sort_order: maxSort + 10,
    pricing_ref_id: normalizeClassId(payload?.pricing_ref_id || classId) || classId,
    created_at: ts,
    updated_at: ts,
  };

  await saveRows(env, [...rows, newRow]);
  return { ok: true, row: newRow };
}

export async function renamePartnerClassLabel(env, classId, nextLabel) {
  const cid = normalizeClassId(classId);
  const label = normalizeClassLabel(nextLabel);

  if (!cid) return { ok: false, reason: "empty_class_id" };
  if (!label) return { ok: false, reason: "empty_label" };

  const rows = await loadRows(env);
  const index = rows.findIndex((row) => row.id === cid);
  if (index < 0) return { ok: false, reason: "not_found" };

  rows[index] = {
    ...rows[index],
    label,
    updated_at: nowSql(),
  };

  await saveRows(env, rows);
  return { ok: true, row: rows[index] };
}

export async function deactivatePartnerClass(env, classId) {
  const cid = normalizeClassId(classId);
  if (!cid) return { ok: false, reason: "empty_class_id" };

  const defaultClassId = await getDefaultPartnerClassId(env).catch(() => "general");
  if (cid === defaultClassId) return { ok: false, reason: "cannot_deactivate_default" };

  const rows = await loadRows(env);
  const index = rows.findIndex((row) => row.id === cid);
  if (index < 0) return { ok: false, reason: "not_found" };

  rows[index] = {
    ...rows[index],
    is_active: 0,
    updated_at: nowSql(),
  };

  await saveRows(env, rows);
  return { ok: true, row: rows[index] };
}

export async function deletePartnerClass(env, classId) {
  const cid = normalizeClassId(classId);
  if (!cid) return { ok: false, reason: "empty_class_id" };

  const defaultClassId = await getDefaultPartnerClassId(env).catch(() => "general");
  if (cid === defaultClassId) return { ok: false, reason: "cannot_delete_default" };

  const rows = await loadRows(env);
  const nextRows = rows.filter((row) => row.id !== cid);
  if (nextRows.length === rows.length) return { ok: false, reason: "not_found" };

  await saveRows(env, nextRows);
  return { ok: true };
}

export async function listProfilesUsingClassId(env, classId) {
  const cid = normalizeClassId(classId);
  if (!cid) return [];

  const { results } = await env.DB.prepare(
    `
    SELECT telegram_id, nama_lengkap, username, nickname, class_id
    FROM profiles
    WHERE lower(trim(coalesce(class_id, ''))) = ?
    ORDER BY nama_lengkap COLLATE NOCASE ASC, telegram_id ASC
  `
  )
    .bind(cid)
    .all();

  return results || [];
}
