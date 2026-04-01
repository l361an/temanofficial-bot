// repositories/catalogPublishStateRepo.js

import { getSetting, upsertSetting } from "./settingsRepo.js";

const CATALOG_PUBLISH_STATES_KEY = "catalog_publish_states";
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

function parseStates(rawValue) {
  const raw = normalizeString(rawValue);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => {
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
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function serializeStates(states) {
  return JSON.stringify(Array.isArray(states) ? states : []);
}

export async function getCatalogPublishStates(env) {
  const raw = await getSetting(env, CATALOG_PUBLISH_STATES_KEY).catch(() => null);
  return parseStates(raw);
}

export async function saveCatalogPublishStates(env, states) {
  await upsertSetting(env, CATALOG_PUBLISH_STATES_KEY, serializeStates(states));
}

export async function getCatalogPublishState(env, target = {}) {
  const chatId = normalizeChatId(target?.chat_id);
  const topicId = normalizeTopicId(target?.topic_id);
  const categoryCode = normalizeCategoryCode(target?.category_code);
  const kota = normalizeKota(target?.kota);
  const kecamatan = normalizeKecamatan(target?.kecamatan);
  const viewType = normalizeViewType(target?.view_type);

  if (!chatId) return null;

  const states = await getCatalogPublishStates(env);
  const exactKey = buildStateKey(chatId, topicId, categoryCode, kota, kecamatan, viewType);

  const exact =
    states.find(
      (item) =>
        buildStateKey(
          item.chat_id,
          item.topic_id,
          item.category_code,
          item.kota,
          item.kecamatan,
          item.view_type
        ) === exactKey
    ) || null;

  if (exact) return exact;

  if (viewType !== VIEW_TYPE_FEED || !categoryCode) {
    return null;
  }

  const legacyCategoryOnly =
    states.find(
      (item) =>
        buildStateKey(
          item.chat_id,
          item.topic_id,
          item.category_code,
          item.kota,
          item.kecamatan,
          item.view_type
        ) === buildLegacyCategoryOnlyKey(chatId, topicId, categoryCode)
    ) || null;

  if (legacyCategoryOnly) return legacyCategoryOnly;

  return (
    states.find(
      (item) =>
        buildStateKey(
          item.chat_id,
          item.topic_id,
          item.category_code,
          item.kota,
          item.kecamatan,
          item.view_type
        ) === buildLegacyScopeOnlyKey(chatId, topicId)
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

  const states = await getCatalogPublishStates(env);
  const stateKey = buildStateKey(chatId, topicId, categoryCode, kota, kecamatan, viewType);
  const legacyCategoryOnlyKey =
    viewType === VIEW_TYPE_FEED ? buildLegacyCategoryOnlyKey(chatId, topicId, categoryCode) : null;
  const legacyScopeOnlyKey =
    viewType === VIEW_TYPE_FEED ? buildLegacyScopeOnlyKey(chatId, topicId) : null;

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

  let found = false;

  const nextStates = states.filter((item) => {
    const itemKey = buildStateKey(
      item.chat_id,
      item.topic_id,
      item.category_code,
      item.kota,
      item.kecamatan,
      item.view_type
    );

    const shouldReplace =
      itemKey === stateKey ||
      (legacyCategoryOnlyKey && itemKey === legacyCategoryOnlyKey) ||
      (legacyScopeOnlyKey && itemKey === legacyScopeOnlyKey);

    if (shouldReplace) {
      found = true;
      return false;
    }

    return true;
  });

  nextStates.push(nextItem);

  await saveCatalogPublishStates(env, nextStates);

  return {
    ok: true,
    created: !found,
    item: nextItem,
    items: nextStates,
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

  const states = await getCatalogPublishStates(env);
  const stateKey = buildStateKey(chatId, topicId, categoryCode, kota, kecamatan, viewType);
  const legacyCategoryOnlyKey =
    viewType === VIEW_TYPE_FEED && categoryCode
      ? buildLegacyCategoryOnlyKey(chatId, topicId, categoryCode)
      : null;
  const legacyScopeOnlyKey =
    viewType === VIEW_TYPE_FEED && categoryCode ? buildLegacyScopeOnlyKey(chatId, topicId) : null;

  const removedItems = states.filter((item) => {
    const itemKey = buildStateKey(
      item.chat_id,
      item.topic_id,
      item.category_code,
      item.kota,
      item.kecamatan,
      item.view_type
    );

    return (
      itemKey === stateKey ||
      (legacyCategoryOnlyKey && itemKey === legacyCategoryOnlyKey) ||
      (legacyScopeOnlyKey && itemKey === legacyScopeOnlyKey)
    );
  });

  const nextStates = states.filter((item) => {
    const itemKey = buildStateKey(
      item.chat_id,
      item.topic_id,
      item.category_code,
      item.kota,
      item.kecamatan,
      item.view_type
    );

    return (
      itemKey !== stateKey &&
      (!legacyCategoryOnlyKey || itemKey !== legacyCategoryOnlyKey) &&
      (!legacyScopeOnlyKey || itemKey !== legacyScopeOnlyKey)
    );
  });

  await saveCatalogPublishStates(env, nextStates);

  return {
    ok: true,
    removed: removedItems[0] || null,
    removed_items: removedItems,
    items: nextStates,
  };
}
