// repositories/partnerClassesRepo.js

import { getSetting, upsertSetting } from "./settingsRepo.js";

const PARTNER_CLASSES_SETTING_KEY = "partner_classes";
const PARTNER_DEFAULT_CLASS_SETTING_KEY = "partner_default_class_id";
const LEGACY_CLASS_IDS = new Set(["bronze", "gold", "platinum"]);

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
      created_at: ts,
      updated_at: ts,
    },
  ];
}

function normalizeClassRow(input, fallbackSortOrder = 999) {
  const id = normalizeClassId(input?.id);
  if (!id) return null;

  const label = normalizeClassLabel(input?.label) || titleCaseWords(id);
  const isActive = Number(input?.is_active) === 0 ? 0 : 1;

  let sortOrder = Number(input?.sort_order);
  if (!Number.isFinite(sortOrder)) sortOrder = fallbackSortOrder;

  const createdAt = String(input?.created_at || "").trim() || nowSql();
  const updatedAt = String(input?.updated_at || "").trim() || nowSql();

  return {
    id,
    label,
    is_active: isActive,
    sort_order: Math.floor(sortOrder),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function sortRows(rows = []) {
  return [...rows].sort((a, b) => {
    const so = Number(a.sort_order || 999) - Number(b.sort_order || 999);
    if (so !== 0) return so;
    return String(a.label || a.id).localeCompare(String(b.label || b.id), "id");
  });
}

function hasOwn(obj, key) {
  return Boolean(obj) && Object.prototype.hasOwnProperty.call(obj, key);
}

async function saveRows(env, rows) {
  const finalRows = sortRows(rows).map((row) => ({
    id: normalizeClassId(row.id),
    label: normalizeClassLabel(row.label) || titleCaseWords(row.id),
    is_active: Number(row.is_active) === 0 ? 0 : 1,
    sort_order: Math.floor(Number(row.sort_order || 999)),
    created_at: String(row.created_at || nowSql()).trim(),
    updated_at: String(row.updated_at || nowSql()).trim(),
  }));

  await upsertSetting(env, PARTNER_CLASSES_SETTING_KEY, JSON.stringify(finalRows));
  return finalRows;
}

async function ensureDefaultClassSetting(env, rows = []) {
  const configured = normalizeClassId(await getSetting(env, PARTNER_DEFAULT_CLASS_SETTING_KEY));
  const activeRows = rows.filter((row) => Number(row.is_active) === 1);

  if (configured && activeRows.some((row) => row.id === configured)) {
    return configured;
  }

  const fallback = activeRows[0]?.id || rows[0]?.id || "general";
  await upsertSetting(env, PARTNER_DEFAULT_CLASS_SETTING_KEY, fallback);
  return fallback;
}

function ensureGeneralRow(rows = []) {
  if (rows.some((row) => row.id === "general")) return rows;

  return sortRows([
    ...rows,
    {
      id: "general",
      label: "General",
      is_active: 1,
      sort_order: 10,
      created_at: nowSql(),
      updated_at: nowSql(),
    },
  ]);
}

async function pruneUnusedLegacyRows(env, rows = []) {
  const defaultClassId = normalizeClassId(await getSetting(env, PARTNER_DEFAULT_CLASS_SETTING_KEY));
  const kept = [];
  let changed = false;

  for (const row of rows) {
    const rowId = normalizeClassId(row.id);
    const isLegacy = LEGACY_CLASS_IDS.has(rowId);
    const isActive = Number(row.is_active) === 1;
    const isDefault = rowId === defaultClassId;

    if (!isLegacy) {
      kept.push(row);
      continue;
    }

    if (isActive || isDefault) {
      kept.push(row);
      continue;
    }

    const usedProfiles = await listProfilesUsingClassId(env, rowId);
    if (usedProfiles.length > 0) {
      kept.push(row);
      continue;
    }

    changed = true;
  }

  const finalRows = ensureGeneralRow(kept);
  if (finalRows.length !== kept.length) changed = true;

  return { rows: finalRows, changed };
}

async function parsePartnerClassRows(env) {
  const raw = await getSetting(env, PARTNER_CLASSES_SETTING_KEY);

  if (!String(raw || "").trim()) {
    const bootstrap = buildBootstrapRows();
    await saveRows(env, bootstrap);
    await upsertSetting(env, PARTNER_DEFAULT_CLASS_SETTING_KEY, "general");
    return { rows: bootstrap, needsRewrite: false };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("partner_classes_not_array");

    const seen = new Set();
    const normalized = [];
    let needsRewrite = false;

    for (let i = 0; i < parsed.length; i += 1) {
      const source = parsed[i];

      if (hasOwn(source, "pricing_ref_id")) {
        needsRewrite = true;
      }

      const row = normalizeClassRow(source, (i + 1) * 10);

      if (!row) {
        needsRewrite = true;
        continue;
      }

      if (seen.has(row.id)) {
        needsRewrite = true;
        continue;
      }

      seen.add(row.id);
      normalized.push(row);

      if (!String(source?.created_at || "").trim() || !String(source?.updated_at || "").trim()) {
        needsRewrite = true;
      }
    }

    if (!normalized.length) {
      const bootstrap = buildBootstrapRows();
      await saveRows(env, bootstrap);
      await upsertSetting(env, PARTNER_DEFAULT_CLASS_SETTING_KEY, "general");
      return { rows: bootstrap, needsRewrite: false };
    }

    return {
      rows: ensureGeneralRow(sortRows(normalized)),
      needsRewrite,
    };
  } catch {
    const bootstrap = buildBootstrapRows();
    await saveRows(env, bootstrap);
    await upsertSetting(env, PARTNER_DEFAULT_CLASS_SETTING_KEY, "general");
    return { rows: bootstrap, needsRewrite: false };
  }
}

async function loadRows(env, options = {}) {
  const { pruneLegacy = true } = options;
  const parsed = await parsePartnerClassRows(env);

  let finalRows = parsed.rows;
  let changed = Boolean(parsed.needsRewrite);

  if (pruneLegacy) {
    const pruned = await pruneUnusedLegacyRows(env, finalRows);
    finalRows = pruned.rows;
    changed = changed || pruned.changed;
  }

  if (changed) {
    await saveRows(env, finalRows);
  }

  await ensureDefaultClassSetting(env, finalRows);
  return finalRows;
}

function ensureValidClassId(classId) {
  const cid = normalizeClassId(classId);
  return /^[a-z][a-z0-9_]{1,31}$/.test(cid) ? cid : "";
}

export async function cleanupUnusedLegacyPartnerClasses(env) {
  return loadRows(env, { pruneLegacy: true });
}

export async function listPartnerClasses(env) {
  return loadRows(env, { pruneLegacy: true });
}

export async function listActivePartnerClasses(env) {
  const rows = await loadRows(env, { pruneLegacy: true });
  return rows.filter((row) => Number(row.is_active) === 1);
}

export async function getPartnerClassById(env, classId) {
  const cid = normalizeClassId(classId);
  if (!cid) return null;

  const rows = await loadRows(env, { pruneLegacy: false });
  return rows.find((row) => row.id === cid) || null;
}

export async function getPartnerClassLabel(env, classId) {
  const row = await getPartnerClassById(env, classId);
  if (!row) return titleCaseWords(classId);
  return row.label;
}

export async function getDefaultPartnerClassId(env) {
  const rows = await loadRows(env, { pruneLegacy: false });
  return ensureDefaultClassSetting(env, rows);
}

export async function isSelectablePartnerClassId(env, classId) {
  const row = await getPartnerClassById(env, classId);
  return Boolean(row && Number(row.is_active) === 1);
}

export async function resolvePartnerPricingClassId(env, classId) {
  const cid = normalizeClassId(classId);
  if (cid) return cid;
  return getDefaultPartnerClassId(env).catch(() => "general");
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

  const rows = await loadRows(env, { pruneLegacy: true });
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

  const rows = await loadRows(env, { pruneLegacy: false });
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

  const rows = await loadRows(env, { pruneLegacy: false });
  const index = rows.findIndex((row) => row.id === cid);
  if (index < 0) return { ok: false, reason: "not_found" };

  rows[index] = {
    ...rows[index],
    is_active: 0,
    updated_at: nowSql(),
  };

  await saveRows(env, rows);
  await ensureDefaultClassSetting(env, rows);

  return { ok: true, row: rows[index] };
}

export async function deletePartnerClass(env, classId) {
  const cid = normalizeClassId(classId);
  if (!cid) return { ok: false, reason: "empty_class_id" };

  const defaultClassId = await getDefaultPartnerClassId(env).catch(() => "general");
  if (cid === defaultClassId) return { ok: false, reason: "cannot_delete_default" };

  const profiles = await listProfilesUsingClassId(env, cid);
  if (profiles.length) {
    return { ok: false, reason: "class_in_use", profiles };
  }

  const rows = await loadRows(env, { pruneLegacy: false });
  const nextRows = rows.filter((row) => row.id !== cid);
  if (nextRows.length === rows.length) return { ok: false, reason: "not_found" };

  await saveRows(env, nextRows);
  await ensureDefaultClassSetting(env, nextRows);

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
