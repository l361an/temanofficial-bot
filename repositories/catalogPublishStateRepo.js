// repositories/catalogPublishStateRepo.js

import { getSetting, upsertSetting, deleteSetting } from "./settingsRepo.js";

const CATALOG_PUBLISH_STATES_KEY = "catalog_publish_states";
const CATALOG_PUBLISH_STATE_KEY_PREFIX = "catalog_publish_state::";
const VIEW_TYPE_FEED = "feed";
const VIEW_TYPE_ON_DEMAND = "on_demand";

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeChatId(value) {
  return normalizeString(value);
}

function normalizeTopicId(value) {
  const raw = normalizeString(value);
  return raw || null;
}

function normalizeCategoryCode(value) {
  const raw = normalizeString(value);
  return raw || null;
}

function normalizeCategoryKey(value) {
  return normalizeLower(value) || null;
}

function normalizeKota(value) {
  const raw = normalizeString(value);
  return raw || null;
}

function normalizeKotaKey(value) {
  return normalizeLower(value) || null;
}

function normalizeKecamatan(value) {
  const raw = normalizeString(value);
  return raw || null;
}

function normalizeKecamatanKey(value) {
  return normalizeLower(value) || null;
}

function normalizeViewType(value) {
  const raw = normalizeLower(value);
  return raw === VIEW_TYPE_ON_DEMAND ? VIEW_TYPE_ON_DEMAND : VIEW_TYPE_FEED;
}

function normalizeMessageIds(values) {
  if (!Array.isArray(values)) return [];

  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.floor(value));
}

function normalizeNonNegativeInteger(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.floor(num);
}

function nowIso() {
  return new Date().toISOString();
}

function buildStateKey(chatId, topicId, categoryCode, kota, kecamatan, viewType) {
  const normalizedChatId = normalizeChatId(chatId);
  const normalizedTopicId = normalizeTopicId(topicId);
  const normalizedCategoryKey = normalizeCategoryKey(categoryCode);
  const normalizedKotaKey = normalizeKotaKey(kota);
  const normalizedKecamatanKey = normalizeKecamatanKey(kecamatan);
  const normalizedViewType = normalizeViewType(viewType);

  return [
    normalizedChatId,
    normalizedTopicId || "-",
    normalizedViewType,
    normalizedCategoryKey || "-",
    normalizedKotaKey || "-",
    normalizedKecamatanKey || "-",
  ].join("::");
}

function buildScopedSettingKey(chatId, topicId, categoryCode, kota, kecamatan, viewType) {
  return `${CATALOG_PUBLISH_STATE_KEY_PREFIX}${buildStateKey(
    chatId,
    topicId,
    categoryCode,
    kota,
    kecamatan,
    viewType
  )}`;
}

function buildLegacyScopeOnlyKey(chatId, topicId) {
  return [normalizeChatId(chatId), normalizeTopicId(topicId) || "-", "-", "-"].join("::");
}

function buildLegacyCategoryOnlyKey(chatId, topicId, categoryCode) {
  return [
    normalizeChatId(chatId),
    normalizeTopicId(topicId) || "-",
    normalizeCategoryKey(categoryCode) || "-",
    "-",
  ].join("::");
}

function normalizeStateItem(item) {
  const chatId = normalizeChatId(item?.chat_id);
  if (!chatId) return null;

  return {
    chat_id: chatId,
    topic_id: normalizeTopicId(item?.topic_id),
    category_code: normalizeCategoryCode(item?.category_code),
    kota: normalizeKota(item?.kota),
    kecamatan: normalizeKecamatan(item?.kecamatan),
    view_type: normalizeViewType(item?.view_type),
    message_ids: normalizeMessageIds(item?.message_ids),
    partner_count: normalizeNonNegativeInteger(item?.partner_count, 0),
    page_count: normalizeNonNegativeInteger(item?.page_count, 0),
    rotation_cursor: normalizeNonNegativeInteger(item?.rotation_cursor, 0),
    current_offset: normalizeNonNegativeInteger(item?.current_offset, 0),
    page_size: normalizeNonNegativeInteger(item?.page_size, 0),
    updated_at: normalizeString(item?.updated_at) || nowIso(),
  };
}

function parseLegacyStates(rawValue) {
  const raw = normalizeString(rawValue);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizeStateItem(item)).filter(Boolean);
  } catch (_) {
    return [];
  }
}

function parseScopedState(rawValue) {
  const raw = normalizeString(rawValue);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return null;
    }
    return normalizeStateItem(parsed);
  } catch (_) {
    return null;
  }
}

function serializeStates(states) {
  return JSON.stringify(Array.isArray(states) ? states : []);
}

function serializeState(item) {
  return JSON.stringify(item || {});
}

function getStateIdentity(item) {
  return buildStateKey(
    item?.chat_id,
    item?.topic_id,
    item?.category_code,
    item?.kota,
    item?.kecamatan,
    item?.view_type
  );
}

function getMatchingKeys(target = {}) {
  const chatId = normalizeChatId(target?.chat_id);
  const topicId = normalizeTopicId(target?.topic_id);
  const categoryCode = normalizeCategoryCode(target?.category_code);
  const kota = normalizeKota(target?.kota);
  const kecamatan = normalizeKecamatan(target?.kecamatan);
  const viewType = normalizeViewType(target?.view_type);

  const keys = new Set();

  if (!chatId) {
    return keys;
  }

  keys.add(buildStateKey(chatId, topicId, categoryCode, kota, kecamatan, viewType));

  if (viewType === VIEW_TYPE_FEED && categoryCode) {
    keys.add(buildLegacyCategoryOnlyKey(chatId, topicId, categoryCode));
    keys.add(buildLegacyScopeOnlyKey(chatId, topicId));
  }

  return keys;
}

async function listScopedStateRows(env) {
  const { results } = await env.DB.prepare(
    `
    SELECT key, value
    FROM settings
    WHERE key LIKE ?
  `
  )
    .bind(`${CATALOG_PUBLISH_STATE_KEY_PREFIX}%`)
    .all();

  const rows = Array.isArray(results) ? results : [];

  return rows
    .map((row) => {
      const item = parseScopedState(row?.value);
      if (!item) return null;
      return {
        key: normalizeString(row?.key),
        item,
      };
    })
    .filter(Boolean);
}

async function getLegacyStates(env) {
  const raw = await getSetting(env, CATALOG_PUBLISH_STATES_KEY).catch(() => null);
  return parseLegacyStates(raw);
}

async function saveLegacyStates(env, states) {
  const safeStates = Array.isArray(states) ? states : [];

  if (!safeStates.length) {
    await deleteSetting(env, CATALOG_PUBLISH_STATES_KEY).catch(() => null);
    return;
  }

  await upsertSetting(env, CATALOG_PUBLISH_STATES_KEY, serializeStates(safeStates));
}

async function cleanupLegacyStatesForTarget(env, target = {}) {
  const legacyStates = await getLegacyStates(env);
  if (!legacyStates.length) {
    return { removed_items: [], items: [] };
  }

  const matchingKeys = getMatchingKeys(target);
  const removedItems = legacyStates.filter((item) => matchingKeys.has(getStateIdentity(item)));
  const nextStates = legacyStates.filter((item) => !matchingKeys.has(getStateIdentity(item)));

  if (removedItems.length) {
    await saveLegacyStates(env, nextStates);
  }

  return {
    removed_items: removedItems,
    items: nextStates,
  };
}

export async function getCatalogPublishStates(env) {
  const [scopedRows, legacyStates] = await Promise.all([
    listScopedStateRows(env),
    getLegacyStates(env),
  ]);

  const map = new Map();

  for (const row of scopedRows) {
    const key = getStateIdentity(row.item);
    if (!map.has(key)) {
      map.set(key, row.item);
    }
  }

  for (const item of legacyStates) {
    const key = getStateIdentity(item);
    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}

export async function saveCatalogPublishStates(env, states) {
  await saveLegacyStates(env, states);
}

export async function getCatalogPublishState(env, target = {}) {
  const chatId = normalizeChatId(target?.chat_id);
  const topicId = normalizeTopicId(target?.topic_id);
  const categoryCode = normalizeCategoryCode(target?.category_code);
  const kota = normalizeKota(target?.kota);
  const kecamatan = normalizeKecamatan(target?.kecamatan);
  const viewType = normalizeViewType(target?.view_type);

  if (!chatId) return null;

  const scopedKey = buildScopedSettingKey(chatId, topicId, categoryCode, kota, kecamatan, viewType);
  const scopedRaw = await getSetting(env, scopedKey).catch(() => null);
  const scopedItem = parseScopedState(scopedRaw);
  if (scopedItem) {
    return scopedItem;
  }

  const legacyStates = await getLegacyStates(env);
  const exactKey = buildStateKey(chatId, topicId, categoryCode, kota, kecamatan, viewType);

  const exact =
    legacyStates.find((item) => getStateIdentity(item) === exactKey) || null;

  if (exact) return exact;

  if (viewType !== VIEW_TYPE_FEED || !categoryCode) {
    return null;
  }

  const legacyCategoryOnly =
    legacyStates.find(
      (item) => getStateIdentity(item) === buildLegacyCategoryOnlyKey(chatId, topicId, categoryCode)
    ) || null;

  if (legacyCategoryOnly) return legacyCategoryOnly;

  return (
    legacyStates.find(
      (item) => getStateIdentity(item) === buildLegacyScopeOnlyKey(chatId, topicId)
    ) || null
  );
}

export async function findCatalogPublishStateByMessageId(env, target = {}) {
  const chatId = normalizeChatId(target?.chat_id);
  const messageId = Number(target?.message_id);

  if (!chatId || !Number.isFinite(messageId) || messageId <= 0) {
    return null;
  }

  const states = await getCatalogPublishStates(env);

  return (
    states.find((item) => {
      if (normalizeChatId(item?.chat_id) !== chatId) return false;
      return normalizeMessageIds(item?.message_ids).includes(Math.floor(messageId));
    }) || null
  );
}

export async function upsertCatalogPublishState(env, payload = {}) {
  const chatId = normalizeChatId(payload?.chat_id);
  const topicId = normalizeTopicId(payload?.topic_id);
  const categoryCode = normalizeCategoryCode(payload?.category_code);
  const kota = normalizeKota(payload?.kota);
  const kecamatan = normalizeKecamatan(payload?.kecamatan);
  const viewType = normalizeViewType(payload?.view_type);

  if (!chatId) {
    return { ok: false, reason: "missing_chat_id" };
  }

  if (!categoryCode) {
    return { ok: false, reason: "missing_category_code" };
  }

  const existing = await getCatalogPublishState(env, {
    chat_id: chatId,
    topic_id: topicId,
    category_code: categoryCode,
    kota,
    kecamatan,
    view_type: viewType,
  });

  const nextItem = {
    chat_id: chatId,
    topic_id: topicId,
    category_code: categoryCode,
    kota,
    kecamatan,
    view_type: viewType,
    message_ids: normalizeMessageIds(payload?.message_ids),
    partner_count: normalizeNonNegativeInteger(payload?.partner_count, 0),
    page_count: normalizeNonNegativeInteger(payload?.page_count, 0),
    rotation_cursor: normalizeNonNegativeInteger(payload?.rotation_cursor, 0),
    current_offset: normalizeNonNegativeInteger(payload?.current_offset, 0),
    page_size: normalizeNonNegativeInteger(payload?.page_size, 0),
    updated_at: nowIso(),
  };

  const scopedKey = buildScopedSettingKey(
    chatId,
    topicId,
    categoryCode,
    kota,
    kecamatan,
    viewType
  );

  await upsertSetting(env, scopedKey, serializeState(nextItem));
  await cleanupLegacyStatesForTarget(env, nextItem);

  return {
    ok: true,
    created: !existing,
    item: nextItem,
    items: await getCatalogPublishStates(env),
  };
}

export async function removeCatalogPublishState(env, target = {}) {
  const chatId = normalizeChatId(target?.chat_id);
  const topicId = normalizeTopicId(target?.topic_id);
  const categoryCode = normalizeCategoryCode(target?.category_code);
  const kota = normalizeKota(target?.kota);
  const kecamatan = normalizeKecamatan(target?.kecamatan);
  const viewType = normalizeViewType(target?.view_type);

  if (!chatId) {
    return { ok: false, reason: "missing_chat_id" };
  }

  const removedItems = [];
  const scopedKey = buildScopedSettingKey(
    chatId,
    topicId,
    categoryCode,
    kota,
    kecamatan,
    viewType
  );

  const scopedRaw = await getSetting(env, scopedKey).catch(() => null);
  const scopedItem = parseScopedState(scopedRaw);

  if (scopedItem) {
    removedItems.push(scopedItem);
    await deleteSetting(env, scopedKey).catch(() => null);
  }

  const legacyCleanup = await cleanupLegacyStatesForTarget(env, target);
  if (Array.isArray(legacyCleanup.removed_items) && legacyCleanup.removed_items.length) {
    removedItems.push(...legacyCleanup.removed_items);
  }

  return {
    ok: true,
    removed: removedItems[0] || null,
    removed_items: removedItems,
    items: await getCatalogPublishStates(env),
  };
}
