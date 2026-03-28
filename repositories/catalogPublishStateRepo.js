// repositories/catalogPublishStateRepo.js

import { getSetting, upsertSetting } from "./settingsRepo.js";

const CATALOG_PUBLISH_STATES_KEY = "catalog_publish_states";

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeChatId(value) {
  return normalizeString(value);
}

function normalizeTopicId(value) {
  const raw = normalizeString(value);
  return raw || null;
}

function normalizeMessageIds(values) {
  if (!Array.isArray(values)) return [];

  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.floor(value));
}

function nowIso() {
  return new Date().toISOString();
}

function buildStateKey(chatId, topicId) {
  const normalizedChatId = normalizeChatId(chatId);
  const normalizedTopicId = normalizeTopicId(topicId);
  return `${normalizedChatId}::${normalizedTopicId || "-"}`;
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
          message_ids: normalizeMessageIds(item?.message_ids),
          partner_count: Number(item?.partner_count || 0),
          page_count: Number(item?.page_count || 0),
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

  if (!chatId) return null;

  const states = await getCatalogPublishStates(env);
  const stateKey = buildStateKey(chatId, topicId);

  return (
    states.find((item) => buildStateKey(item.chat_id, item.topic_id) === stateKey) || null
  );
}

export async function upsertCatalogPublishState(env, payload = {}) {
  const chatId = normalizeChatId(payload?.chat_id);
  const topicId = normalizeTopicId(payload?.topic_id);

  if (!chatId) {
    return { ok: false, reason: "missing_chat_id" };
  }

  const states = await getCatalogPublishStates(env);
  const stateKey = buildStateKey(chatId, topicId);
  const nextItem = {
    chat_id: chatId,
    topic_id: topicId,
    message_ids: normalizeMessageIds(payload?.message_ids),
    partner_count: Number(payload?.partner_count || 0),
    page_count: Number(payload?.page_count || 0),
    updated_at: nowIso(),
  };

  let found = false;

  const nextStates = states.map((item) => {
    if (buildStateKey(item.chat_id, item.topic_id) !== stateKey) {
      return item;
    }

    found = true;
    return {
      ...item,
      ...nextItem,
    };
  });

  if (!found) {
    nextStates.push(nextItem);
  }

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

  if (!chatId) {
    return { ok: false, reason: "missing_chat_id" };
  }

  const states = await getCatalogPublishStates(env);
  const stateKey = buildStateKey(chatId, topicId);

  const removedItem =
    states.find((item) => buildStateKey(item.chat_id, item.topic_id) === stateKey) || null;

  const nextStates = states.filter(
    (item) => buildStateKey(item.chat_id, item.topic_id) !== stateKey
  );

  await saveCatalogPublishStates(env, nextStates);

  return {
    ok: true,
    removed: removedItem,
    items: nextStates,
  };
}
