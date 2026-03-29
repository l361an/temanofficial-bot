// repositories/catalogPublishStateRepo.js

import { getSetting, upsertSetting } from "./settingsRepo.js";

const CATALOG_PUBLISH_STATES_KEY = "catalog_publish_states";

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
  const raw = normalizeLower(value);
  return raw || null;
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

function buildStateKey(chatId, topicId, categoryCode) {
  const normalizedChatId = normalizeChatId(chatId);
  const normalizedTopicId = normalizeTopicId(topicId);
  const normalizedCategoryCode = normalizeCategoryCode(categoryCode);
  return `${normalizedChatId}::${normalizedTopicId || "-"}::${normalizedCategoryCode || "-"}`;
}

function buildLegacyStateKey(chatId, topicId) {
  return buildStateKey(chatId, topicId, null);
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
          message_ids: normalizeMessageIds(item?.message_ids),
          partner_count: normalizeNonNegativeInteger(item?.partner_count, 0),
          page_count: normalizeNonNegativeInteger(item?.page_count, 0),
          rotation_cursor: normalizeNonNegativeInteger(item?.rotation_cursor, 0),
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

  if (!chatId) return null;

  const states = await getCatalogPublishStates(env);
  const exactKey = buildStateKey(chatId, topicId, categoryCode);

  const exact =
    states.find(
      (item) =>
        buildStateKey(item.chat_id, item.topic_id, item.category_code) === exactKey
    ) || null;

  if (exact) return exact;

  if (!categoryCode) return null;

  return (
    states.find(
      (item) =>
        buildStateKey(item.chat_id, item.topic_id, item.category_code) ===
        buildLegacyStateKey(chatId, topicId)
    ) || null
  );
}

export async function upsertCatalogPublishState(env, payload = {}) {
  const chatId = normalizeChatId(payload?.chat_id);
  const topicId = normalizeTopicId(payload?.topic_id);
  const categoryCode = normalizeCategoryCode(payload?.category_code);

  if (!chatId) {
    return { ok: false, reason: "missing_chat_id" };
  }

  if (!categoryCode) {
    return { ok: false, reason: "missing_category_code" };
  }

  const states = await getCatalogPublishStates(env);
  const stateKey = buildStateKey(chatId, topicId, categoryCode);
  const legacyStateKey = buildLegacyStateKey(chatId, topicId);

  const nextItem = {
    chat_id: chatId,
    topic_id: topicId,
    category_code: categoryCode,
    message_ids: normalizeMessageIds(payload?.message_ids),
    partner_count: normalizeNonNegativeInteger(payload?.partner_count, 0),
    page_count: normalizeNonNegativeInteger(payload?.page_count, 0),
    rotation_cursor: normalizeNonNegativeInteger(payload?.rotation_cursor, 0),
    updated_at: nowIso(),
  };

  let found = false;

  const nextStates = states.filter((item) => {
    const itemKey = buildStateKey(item.chat_id, item.topic_id, item.category_code);
    const shouldReplace = itemKey === stateKey || itemKey === legacyStateKey;

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

  if (!chatId) {
    return { ok: false, reason: "missing_chat_id" };
  }

  const states = await getCatalogPublishStates(env);
  const stateKey = buildStateKey(chatId, topicId, categoryCode);
  const legacyStateKey = categoryCode ? buildLegacyStateKey(chatId, topicId) : null;

  const removedItems = states.filter((item) => {
    const itemKey = buildStateKey(item.chat_id, item.topic_id, item.category_code);
    return itemKey === stateKey || (legacyStateKey && itemKey === legacyStateKey);
  });

  const nextStates = states.filter((item) => {
    const itemKey = buildStateKey(item.chat_id, item.topic_id, item.category_code);
    return itemKey !== stateKey && (!legacyStateKey || itemKey !== legacyStateKey);
  });

  await saveCatalogPublishStates(env, nextStates);

  return {
    ok: true,
    removed: removedItems[0] || null,
    removed_items: removedItems,
    items: nextStates,
  };
}
