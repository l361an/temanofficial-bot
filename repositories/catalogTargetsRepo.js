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
          kota: normalizeKota(item?.kota),
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

function buildTargetKey(chatId, topicId, categoryCode, kota) {
  const normalizedChatId = normalizeChatId(chatId);
  const normalizedTopicId = normalizeTopicId(topicId);
  const normalizedCategoryKey = normalizeCategoryKey(categoryCode);
  const normalizedKotaKey = normalizeKotaKey(kota);

  return [
    normalizedChatId,
    normalizedTopicId || "-",
    normalizedCategoryKey || "-",
    normalizedKotaKey || "-",
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
  const kota = normalizeKota(payload?.kota);

  if (!chatId) {
    return { ok: false, reason: "missing_chat_id" };
  }

  if (!categoryCode) {
    return { ok: false, reason: "missing_category_code" };
  }

  const targets = await getCatalogTargets(env);
  const targetKey = buildTargetKey(chatId, topicId, categoryCode, kota);
  const legacyCategoryOnlyKey = buildLegacyCategoryOnlyKey(chatId, topicId, categoryCode);
  const legacyScopeOnlyKey = buildLegacyScopeOnlyKey(chatId, topicId);
  const now = nowIso();

  let found = false;

  const nextTargets = targets.map((item) => {
    const itemKey = buildTargetKey(item.chat_id, item.topic_id, item.category_code, item.kota);

    if (itemKey === targetKey) {
      found = true;
      return {
        ...item,
        chat_title: normalizeString(payload?.chat_title) || item.chat_title || "(Tanpa Nama)",
        category_code: categoryCode,
        kota,
        is_active: true,
        added_by: normalizeString(payload?.added_by) || item.added_by || "",
        updated_at: now,
      };
    }

    if (itemKey === legacyCategoryOnlyKey || itemKey === legacyScopeOnlyKey) {
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
      kota,
      is_active: true,
      added_by: normalizeString(payload?.added_by) || "",
      added_at: now,
      updated_at: now,
    });
  }

  await saveCatalogTargets(env, nextTargets);

  const savedItem =
    nextTargets.find(
      (item) => buildTargetKey(item.chat_id, item.topic_id, item.category_code, item.kota) === targetKey
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
  const kota = normalizeKota(payload?.kota);

  if (!chatId) {
    return { ok: false, reason: "missing_chat_id" };
  }

  if (!categoryCode) {
    return { ok: false, reason: "missing_category_code" };
  }

  const targets = await getCatalogTargets(env);
  const targetKey = buildTargetKey(chatId, topicId, categoryCode, kota);
  const legacyCategoryOnlyKey = buildLegacyCategoryOnlyKey(chatId, topicId, categoryCode);
  const legacyScopeOnlyKey = buildLegacyScopeOnlyKey(chatId, topicId);
  const now = nowIso();

  let found = false;

  const nextTargets = targets.map((item) => {
    const itemKey = buildTargetKey(item.chat_id, item.topic_id, item.category_code, item.kota);
    const shouldDeactivate =
      itemKey === targetKey ||
      itemKey === legacyCategoryOnlyKey ||
      itemKey === legacyScopeOnlyKey;

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
