// repositories/catalogTargetsRepo.js

import { getSetting, upsertSetting } from "./settingsRepo.js";

const CATALOG_TARGETS_KEY = "catalog_targets";

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
          category_code: normalizeCategoryCode(item?.category_code),
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

function buildTargetKey(chatId, topicId, categoryCode) {
  const normalizedChatId = normalizeChatId(chatId);
  const normalizedTopicId = normalizeTopicId(topicId);
  const normalizedCategoryCode = normalizeCategoryCode(categoryCode);
  return `${normalizedChatId}::${normalizedTopicId || "-"}::${normalizedCategoryCode || "-"}`;
}

function buildLegacyTargetKey(chatId, topicId) {
  return buildTargetKey(chatId, topicId, null);
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
  const categoryCode = normalizeCategoryCode(payload?.category_code);

  if (!chatId) {
    return { ok: false, reason: "missing_chat_id" };
  }

  if (!categoryCode) {
    return { ok: false, reason: "missing_category_code" };
  }

  const targets = await getCatalogTargets(env);
  const targetKey = buildTargetKey(chatId, topicId, categoryCode);
  const legacyTargetKey = buildLegacyTargetKey(chatId, topicId);
  const now = nowIso();

  let found = false;

  const nextTargets = targets.map((item) => {
    const itemKey = buildTargetKey(item.chat_id, item.topic_id, item.category_code);

    if (itemKey === targetKey) {
      found = true;
      return {
        ...item,
        chat_title: normalizeString(payload?.chat_title) || item.chat_title || "(Tanpa Nama)",
        category_code: categoryCode,
        is_active: true,
        added_by: normalizeString(payload?.added_by) || item.added_by || "",
        updated_at: now,
      };
    }

    if (itemKey === legacyTargetKey) {
      return {
        ...item,
        is_active: false,
        updated_at: now,
      };
    }

    return item;
  });

  if (!found) {
    nextTargets.push({
      chat_id: chatId,
      chat_title: normalizeString(payload?.chat_title) || "(Tanpa Nama)",
      topic_id: topicId,
      category_code: categoryCode,
      is_active: true,
      added_by: normalizeString(payload?.added_by) || "",
      added_at: now,
      updated_at: now,
    });
  }

  await saveCatalogTargets(env, nextTargets);

  const savedItem =
    nextTargets.find(
      (item) => buildTargetKey(item.chat_id, item.topic_id, item.category_code) === targetKey
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
  const categoryCode = normalizeCategoryCode(payload?.category_code);

  if (!chatId) {
    return { ok: false, reason: "missing_chat_id" };
  }

  if (!categoryCode) {
    return { ok: false, reason: "missing_category_code" };
  }

  const targets = await getCatalogTargets(env);
  const targetKey = buildTargetKey(chatId, topicId, categoryCode);
  const legacyTargetKey = buildLegacyTargetKey(chatId, topicId);
  const now = nowIso();

  let found = false;

  const nextTargets = targets.map((item) => {
    const itemKey = buildTargetKey(item.chat_id, item.topic_id, item.category_code);
    const shouldDeactivate = itemKey === targetKey || itemKey === legacyTargetKey;

    if (!shouldDeactivate) {
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
