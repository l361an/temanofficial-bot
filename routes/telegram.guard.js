// routes/telegram.guard.js

import { getSetting } from "../repositories/settingsRepo.js";
import { getCatalogTargets } from "../repositories/catalogTargetsRepo.js";

const SCOPE_MODE_PRIVATE_ONLY = "private_only";
const SCOPE_MODE_SELECTED = "selected_scopes";

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function isPrivateChat(chat) {
  return normalizeLower(chat?.type) === "private";
}

function toChatIdString(chat) {
  const raw = chat?.id;
  if (raw === undefined || raw === null) return "";
  return String(raw).trim();
}

function toThreadIdString(message) {
  const raw = message?.message_thread_id;
  if (raw === undefined || raw === null) return "";
  return String(raw).trim();
}

function buildTopicKey(chatId, threadId) {
  const a = normalizeString(chatId);
  const b = normalizeString(threadId);
  if (!a || !b) return "";
  return `${a}:${b}`;
}

function parseListSetting(rawValue) {
  const raw = normalizeString(rawValue);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => normalizeString(item))
        .filter(Boolean);
    }
  } catch (_) {
    // ignore JSON parse error and continue with text parsing
  }

  return raw
    .split(/[\n,]/g)
    .map((item) => normalizeString(item))
    .filter(Boolean);
}

function normalizeUsername(value) {
  return normalizeString(value).replace(/^@+/, "").toLowerCase();
}

function getConfiguredBotUsername(env) {
  const candidates = [
    env?.TELEGRAM_BOT_USERNAME,
    env?.BOT_USERNAME,
    env?.TELEGRAM_USERNAME,
  ];

  for (const item of candidates) {
    const normalized = normalizeUsername(item);
    if (normalized) return normalized;
  }

  return "";
}

async function loadScopeConfig(env) {
  const [
    featureScopeModeRaw,
    allowedGroupChatIdsRaw,
    allowedGroupTopicKeysRaw,
    allowedBotUsernamesRaw,
  ] = await Promise.all([
    getSetting(env, "feature_scope_mode").catch(() => null),
    getSetting(env, "allowed_group_chat_ids").catch(() => null),
    getSetting(env, "allowed_group_topic_keys").catch(() => null),
    getSetting(env, "allowed_bot_usernames").catch(() => null),
  ]);

  const featureScopeMode =
    normalizeLower(featureScopeModeRaw) || SCOPE_MODE_PRIVATE_ONLY;

  const allowedGroupChatIds = parseListSetting(allowedGroupChatIdsRaw);
  const allowedGroupTopicKeys = parseListSetting(allowedGroupTopicKeysRaw);
  const allowedBotUsernames = parseListSetting(allowedBotUsernamesRaw).map(
    normalizeUsername
  );

  return {
    featureScopeMode,
    allowedGroupChatIds,
    allowedGroupTopicKeys,
    allowedBotUsernames,
  };
}

async function loadCatalogScopeConfig(env) {
  const targets = await getCatalogTargets(env).catch(() => []);

  const activeGroupChatIds = new Set();
  const activeGroupTopicKeys = new Set();

  for (const item of Array.isArray(targets) ? targets : []) {
    if (!item?.is_active) continue;

    const chatId = normalizeString(item?.chat_id);
    const topicId = normalizeString(item?.topic_id);

    if (!chatId) continue;

    if (topicId) {
      activeGroupTopicKeys.add(buildTopicKey(chatId, topicId));
      continue;
    }

    activeGroupChatIds.add(chatId);
  }

  return {
    activeGroupChatIds,
    activeGroupTopicKeys,
  };
}

function isBotUsernameAllowed(config, env) {
  const allowed = Array.isArray(config?.allowedBotUsernames)
    ? config.allowedBotUsernames
    : [];

  if (!allowed.length) return true;

  const currentBotUsername = getConfiguredBotUsername(env);
  if (!currentBotUsername) return true;

  return allowed.includes(currentBotUsername);
}

function isSelectedScopeAllowed(config, chat, message) {
  const chatId = toChatIdString(chat);
  const threadId = toThreadIdString(message);
  const topicKey = buildTopicKey(chatId, threadId);

  const allowedChatIds = Array.isArray(config?.allowedGroupChatIds)
    ? config.allowedGroupChatIds
    : [];

  const allowedTopicKeys = Array.isArray(config?.allowedGroupTopicKeys)
    ? config.allowedGroupTopicKeys
    : [];

  if (chatId && allowedChatIds.includes(chatId)) {
    return true;
  }

  if (topicKey && allowedTopicKeys.includes(topicKey)) {
    return true;
  }

  return false;
}

function isCatalogScopeAllowed(catalogScope, chat, message) {
  const chatId = toChatIdString(chat);
  const threadId = toThreadIdString(message);
  const topicKey = buildTopicKey(chatId, threadId);

  if (
    chatId &&
    catalogScope?.activeGroupChatIds instanceof Set &&
    catalogScope.activeGroupChatIds.has(chatId)
  ) {
    return true;
  }

  if (
    topicKey &&
    catalogScope?.activeGroupTopicKeys instanceof Set &&
    catalogScope.activeGroupTopicKeys.has(topicKey)
  ) {
    return true;
  }

  return false;
}

async function resolveScopeAllowance(env, chat, message) {
  if (isPrivateChat(chat)) {
    return { allowed: true, matchedBy: "private_chat" };
  }

  const [config, catalogScope] = await Promise.all([
    loadScopeConfig(env),
    loadCatalogScopeConfig(env),
  ]);

  if (!isBotUsernameAllowed(config, env)) {
    return { allowed: false, matchedBy: "bot_username_blocked" };
  }

  if (isCatalogScopeAllowed(catalogScope, chat, message)) {
    return { allowed: true, matchedBy: "catalog_target" };
  }

  if (config.featureScopeMode === SCOPE_MODE_PRIVATE_ONLY) {
    return { allowed: false, matchedBy: "private_only_mode" };
  }

  if (config.featureScopeMode !== SCOPE_MODE_SELECTED) {
    return { allowed: false, matchedBy: "unsupported_scope_mode" };
  }

  if (isSelectedScopeAllowed(config, chat, message)) {
    return { allowed: true, matchedBy: "scope_setting" };
  }

  return { allowed: false, matchedBy: "not_in_scope" };
}

export async function isScopeAllowed(env, chat, message) {
  const result = await resolveScopeAllowance(env, chat, message);
  return result.allowed;
}

export async function getScopeGuardContext(env, chat, message) {
  const result = await resolveScopeAllowance(env, chat, message);
  const chatId = toChatIdString(chat);
  const threadId = toThreadIdString(message);

  return {
    allowed: result.allowed,
    matchedBy: result.matchedBy,
    isPrivate: isPrivateChat(chat),
    chatId,
    threadId,
    topicKey: buildTopicKey(chatId, threadId),
  };
}
