// repositories/catalogTargetsRepo.js

import { getSetting, upsertSetting } from "./settingsRepo.js";

const CATALOG_TARGETS_KEY = "catalog_targets";

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

function nowIso() {
  return new Date().toISOString();
}

function parseTargets(rawValue) {
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
          chat_title: normalizeString(item?.chat_title) || "(Tanpa Nama)",
          topic_id: normalizeTopicId(item?.topic_id),
          is_active: Boolean(item?.is_active),
          added_by: normalizeString(item?.added_by) || "",
          added_at: normalizeString(item?.added_at) || nowIso(),
          updated_at: normalizeString(item?.updated_at) || nowIso(),
        };
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function serializeTargets(targets) {
  return JSON.stringify(Array.isArray(targets) ? targets : []);
}

function buildTargetKey(chatId, topicId) {
  const normalizedChatId = normalizeChatId(chatId);
  const normalizedTopicId = normalizeTopicId(topicId);
  return `${normalizedChatId}::${normalizedTopicId || "-"}`;
}

export async function getCatalogTargets(env) {
  const raw = await getSetting(env, CATALOG_TARGETS_KEY).catch(() => null);
  return parseTargets(raw);
}

export async function saveCatalogTargets(env, targets) {
  await upsertSetting(env, CATALOG_TARGETS_KEY, serializeTargets(targets));
}

export async function addOrUpdateCatalogTarget(env, payload = {}) {
  const chatId = normalizeChatId(payload?.chat_id);
  const topicId = normalizeTopicId(payload?.topic_id);

  if (!chatId) {
    return { ok: false, reason: "missing_chat_id" };
  }

  const targets = await getCatalogTargets(env);
  const targetKey = buildTargetKey(chatId, topicId);
  const now = nowIso();

  const nextItem = {
    chat_id: chatId,
    chat_title: normalizeString(payload?.chat_title) || "(Tanpa Nama)",
    topic_id: topicId,
    is_active: true,
    added_by: normalizeString(payload?.added_by) || "",
    added_at: now,
    updated_at: now,
  };

  let found = false;

  const nextTargets = targets.map((item) => {
    if (buildTargetKey(item.chat_id, item.topic_id) !== targetKey) {
      return item;
    }

    found = true;
    return {
      ...item,
      chat_title: nextItem.chat_title,
      is_active: true,
      updated_at: now,
      added_by: nextItem.added_by || item.added_by || "",
    };
  });

  if (!found) {
    nextTargets.push(nextItem);
  }

  await saveCatalogTargets(env, nextTargets);

  const savedItem =
    nextTargets.find(
      (item) => buildTargetKey(item.chat_id, item.topic_id) === targetKey
    ) || null;

  return {
    ok: true,
    created: !found,
    item: savedItem,
    items: nextTargets,
  };
}

export async function deactivateCatalogTarget(env, payload = {}) {
  const chatId = normalizeChatId(payload?.chat_id);
  const topicId = normalizeTopicId(payload?.topic_id);

  if (!chatId) {
    return { ok: false, reason: "missing_chat_id" };
  }

  const targets = await getCatalogTargets(env);
  const targetKey = buildTargetKey(chatId, topicId);
  const now = nowIso();

  let found = false;

  const nextTargets = targets.map((item) => {
    if (buildTargetKey(item.chat_id, item.topic_id) !== targetKey) {
      return item;
    }

    found = true;
    return {
      ...item,
      is_active: false,
      updated_at: now,
    };
  });

  if (!found) {
    return { ok: false, reason: "not_found", items: targets };
  }

  await saveCatalogTargets(env, nextTargets);

  return {
    ok: true,
    items: nextTargets,
  };
}
