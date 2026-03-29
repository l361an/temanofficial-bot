// routes/telegram.js

import { json } from "../utils/response.js";
import { parseMessage } from "../utils/parseTelegram.js";
import { loadSession } from "../utils/session.js";
import { sendMessage } from "../services/telegramApi.js";
import { getAdminRole } from "../repositories/adminsRepo.js";
import { isAdminRole } from "../utils/roles.js";
import { handleCallback } from "./telegram.callback.js";
import { handleAdminCommand } from "./telegram.commands.admin.js";
import { handleUserCommand, handleUserEditFlow } from "./telegram.commands.user.js";
import { buildSelfMenuMessage, buildSelfMenuKeyboard } from "./telegram.flow.selfProfile.menu.js";
import { buildTeManMenuKeyboard } from "./telegram.user.shared.js";
import { handleRegistrationFlow } from "./telegram.flow.js";
import { handleSuperadminFinanceInput } from "./telegram.flow.superadminFinance.js";
import { handleSuperadminAdminManagerInput } from "./telegram.flow.superadminAdminManager.js";
import { handleSuperadminCategoryInput } from "./telegram.flow.superadminCategory.js";
import { handleSuperadminCatalogSettingsInput } from "./telegram.flow.superadminCatalogSettings.js";
import { handlePaymentProofUpload } from "./telegram.flow.paymentProof.js";
import { handlePartnerModerationInput } from "./telegram.flow.partnerModeration.js";
import { handlePartnerTextEditInput } from "./telegram.flow.partnerTextEdit.js";
import { handlePartnerViewSearchInput } from "./callbacks/partnerDatabase.js";
import { buildOfficerHomeKeyboard } from "./callbacks/keyboards.officer.js";
import { buildTemankuHubText } from "./telegram.messages.js";
import { OBSOLETE_ADMIN_COMMANDS, SESSION_MODES } from "./telegram.constants.js";
import { isScopeAllowed } from "./telegram.guard.js";
import { handlePartnerCloseupEditInput } from "./telegram.flow.partnerCloseupEdit.js";
import { handleAdminInviteStart } from "./telegram.flow.adminInviteActivation.js";
import {
  addOrUpdateCatalogTarget,
  deactivateCatalogTarget,
  getCatalogTargets,
} from "../repositories/catalogTargetsRepo.js";
import { listCategories } from "../repositories/categoriesRepo.js";
import {
  publishCatalogToTarget,
  cleanupPublishedCatalogForTarget,
  publishOnDemandCatalog,
} from "../services/catalogPublisher.js";

import {
  getProfileFullByTelegramId,
  syncProfileUsernameFromTelegram,
} from "../repositories/profilesRepo.js";

function ok() {
  return json({ ok: true });
}

function logError(tag, meta = {}) {
  console.error(tag, meta);
}

function isPrivateChat(chat) {
  return String(chat?.type || "").trim().toLowerCase() === "private";
}

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeCommandToken(value) {
  const raw = normalizeString(value);
  if (!raw.startsWith("/")) return "";
  return raw.split(/\s+/)[0].split("@")[0].toLowerCase();
}

function splitCommandParts(value) {
  return normalizeString(value).split(/\s+/).filter(Boolean);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildCatalogReplyExtra(chat, msg, extra = {}) {
  const threadId = msg?.message_thread_id;
  if (isPrivateChat(chat) || threadId === undefined || threadId === null) {
    return { ...extra };
  }

  return {
    ...extra,
    message_thread_id: threadId,
  };
}

function buildCatalogTargetLine(item, index) {
  const chatTitle = normalizeString(item?.chat_title) || "(Tanpa Nama)";
  const chatId = normalizeString(item?.chat_id) || "-";
  const topicId = normalizeString(item?.topic_id);
  const categoryCode = normalizeString(item?.category_code) || "-";
  const status = item?.is_active ? "AKTIF" : "NONAKTIF";

  return [
    `${index + 1}. <b>${escapeHtml(chatTitle)}</b>`,
    `   Kategori : <code>${escapeHtml(categoryCode)}</code>`,
    `   Chat ID  : <code>${escapeHtml(chatId)}</code>`,
    `   Topic ID : ${topicId ? `<code>${escapeHtml(topicId)}</code>` : "-"}`,
    `   Status   : <b>${status}</b>`,
  ].join("\n");
}

function buildCatalogTargetsListText(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return "📭 Belum ada target feed katalog.";
  }

  return [
    "📚 <b>Daftar Target Feed Katalog</b>",
    "",
    ...items.map((item, index) => buildCatalogTargetLine(item, index)),
  ].join("\n\n");
}

function buildCatalogCommandUsageText() {
  return [
    "📚 <b>Command Feed Katalog</b>",
    "",
    "• <code>/katalog {kategori} on</code>",
    "• <code>/katalog {kategori} off</code>",
    "• <code>/katalog list</code>",
  ].join("\n");
}

function buildCatalogTargetSummaryLines(targetPayload) {
  return [
    `Kategori : ${normalizeString(targetPayload.category_code) || "-"}`,
    `Group : ${normalizeString(targetPayload.chat_title) || "-"}`,
    `Chat ID : ${normalizeString(targetPayload.chat_id) || "-"}`,
    `Topic ID : ${normalizeString(targetPayload.topic_id) || "-"}`,
  ];
}

function parseCatalogLocationArgument(rawValue) {
  const raw = normalizeString(rawValue);
  if (!raw) {
    return { kota: "", kecamatan: "" };
  }

  const separatorIndex = raw.indexOf("-");
  if (separatorIndex < 0) {
    return {
      kota: raw,
      kecamatan: "",
    };
  }

  const kecamatan = normalizeString(raw.slice(0, separatorIndex));
  const kota = normalizeString(raw.slice(separatorIndex + 1));

  if (kecamatan && kota) {
    return { kota, kecamatan };
  }

  return {
    kota: raw,
    kecamatan: "",
  };
}

async function findCategoryCodeFromCommand(env, text) {
  const commandToken = normalizeCommandToken(text);
  if (!commandToken || !commandToken.startsWith("/")) {
    return null;
  }

  const requestedCode = commandToken.slice(1);
  if (!requestedCode) {
    return null;
  }

  const categories = await listCategories(env).catch(() => []);

  const found = (Array.isArray(categories) ? categories : []).find(
    (item) => normalizeLower(item?.kode) === normalizeLower(requestedCode)
  );

  if (!found?.kode) {
    return null;
  }

  return normalizeLower(found.kode);
}

async function resolveCategoryCode(env, rawCategoryCode) {
  const clean = normalizeLower(rawCategoryCode);
  if (!clean) return "";

  const categories = await listCategories(env).catch(() => []);
  const found = (Array.isArray(categories) ? categories : []).find(
    (item) => normalizeLower(item?.kode) === clean
  );

  return found?.kode ? normalizeLower(found.kode) : "";
}

function matchTargetScope(item, chat, msg) {
  const chatId = normalizeString(chat?.id);
  const topicId = normalizeString(msg?.message_thread_id);

  return (
    normalizeString(item?.chat_id) === chatId &&
    normalizeString(item?.topic_id) === topicId
  );
}

async function deactivateOtherCatalogTargetsInScope(env, chat, msg, keepCategoryCode) {
  const items = await getCatalogTargets(env).catch(() => []);
  const sameScopeTargets = (Array.isArray(items) ? items : []).filter(
    (item) =>
      item?.is_active &&
      matchTargetScope(item, chat, msg) &&
      normalizeLower(item?.category_code) !== normalizeLower(keepCategoryCode)
  );

  for (const item of sameScopeTargets) {
    await deactivateCatalogTarget(env, {
      chat_id: item.chat_id,
      topic_id: item.topic_id,
      category_code: item.category_code,
    }).catch(() => null);

    await cleanupPublishedCatalogForTarget(env, {
      chat_id: item.chat_id,
      topic_id: item.topic_id,
      category_code: item.category_code,
    }).catch(() => null);
  }

  return sameScopeTargets.length;
}

async function handleTemankuCommand({ env, chat, msg, chatId, telegramId, role }) {
  const isPrivate = isPrivateChat(chat);
  const text = buildTemankuHubText(role);

  if (isAdminRole(role) && isPrivate) {
    await sendMessage(env, chatId, text, {
      parse_mode: "HTML",
      reply_markup: buildOfficerHomeKeyboard(role),
      disable_web_page_preview: true,
    });
    return true;
  }

  if (isPrivate) {
    const profile = await getProfileFullByTelegramId(env, telegramId).catch(() => null);

    if (profile) {
      await sendMessage(env, chatId, `${text}\n\n${buildSelfMenuMessage(profile)}`, {
        parse_mode: "HTML",
        reply_markup: buildSelfMenuKeyboard(),
        disable_web_page_preview: true,
      });
      return true;
    }

    await sendMessage(env, chatId, text, {
      parse_mode: "HTML",
      reply_markup: buildTeManMenuKeyboard(),
      disable_web_page_preview: true,
    });
    return true;
  }

  await sendMessage(env, chatId, text, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...buildCatalogReplyExtra(chat, msg),
  });
  return true;
}

async function handleDisabledLegacyCommand({ env, chat, msg, chatId }) {
  await sendMessage(env, chatId, "Command text lama sudah dimatikan. Pakai /temanku.", {
    ...buildCatalogReplyExtra(chat, msg),
  });
  return true;
}

async function handleCatalogFeedCommand({
  env,
  chat,
  msg,
  chatId,
  telegramId,
  role,
  text,
}) {
  const cmd = normalizeCommandToken(text);
  if (cmd !== "/katalog") {
    return false;
  }

  const replyExtra = buildCatalogReplyExtra(chat, msg);

  if (!isAdminRole(role)) {
    await sendMessage(env, chatId, "⚠️ Command feed katalog khusus admin/officer.", replyExtra);
    return true;
  }

  const parts = splitCommandParts(text);
  const secondToken = normalizeLower(parts[1]);

  if (!secondToken) {
    await sendMessage(env, chatId, buildCatalogCommandUsageText(), {
      ...replyExtra,
      parse_mode: "HTML",
    });
    return true;
  }

  if (secondToken === "list") {
    const allItems = await getCatalogTargets(env).catch((err) => {
      logError("[catalog.targets.list.failed]", {
        telegramId,
        err: err?.message || String(err || ""),
      });
      return [];
    });

    const filteredItems = isPrivateChat(chat)
      ? allItems
      : (Array.isArray(allItems) ? allItems : []).filter((item) => matchTargetScope(item, chat, msg));

    await sendMessage(env, chatId, buildCatalogTargetsListText(filteredItems), {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...replyExtra,
    });
    return true;
  }

  const categoryCode = await resolveCategoryCode(env, secondToken);
  const action = normalizeLower(parts[2]);
  const allowedActions = new Set(["on", "off"]);

  if (!categoryCode || !action || !allowedActions.has(action)) {
    await sendMessage(env, chatId, buildCatalogCommandUsageText(), {
      ...replyExtra,
      parse_mode: "HTML",
    });
    return true;
  }

  if (isPrivateChat(chat)) {
    await sendMessage(
      env,
      chatId,
      "⚠️ /katalog on/off harus dijalankan langsung di grup atau topic target.",
      replyExtra
    );
    return true;
  }

  const targetPayload = {
    chat_id: chat?.id,
    chat_title: chat?.title || chat?.username || "Group Tanpa Nama",
    topic_id: msg?.message_thread_id ?? null,
    category_code: categoryCode,
    added_by: telegramId,
  };

  if (action === "on") {
    const replacedCount = await deactivateOtherCatalogTargetsInScope(
      env,
      chat,
      msg,
      categoryCode
    ).catch(() => 0);

    const result = await addOrUpdateCatalogTarget(env, targetPayload).catch((err) => {
      logError("[catalog.targets.activate.failed]", {
        telegramId,
        chatId,
        threadId: msg?.message_thread_id ?? null,
        categoryCode,
        err: err?.message || String(err || ""),
      });
      return { ok: false, reason: "exception" };
    });

    if (!result?.ok) {
      await sendMessage(env, chatId, "⚠️ Gagal mengaktifkan feed katalog.", replyExtra);
      return true;
    }

    const noticeLines = [
      "✅ Feed katalog aktif.",
      "",
      ...buildCatalogTargetSummaryLines(targetPayload),
    ];

    if (replacedCount > 0) {
      noticeLines.push("", `Kategori lama di scope ini dimatikan: ${replacedCount}`);
    }

    await sendMessage(env, chatId, noticeLines.join("\n"), replyExtra);

    const publishResult = await publishCatalogToTarget(env, targetPayload, {
      pageSize: 3,
    }).catch((err) => {
      logError("[catalog.publish.on.failed]", {
        telegramId,
        chatId,
        threadId: msg?.message_thread_id ?? null,
        categoryCode,
        err: err?.message || String(err || ""),
      });
      return { ok: false, reason: "exception" };
    });

    if (!publishResult?.ok) {
      await sendMessage(env, chatId, "⚠️ Feed aktif, tapi publish awal gagal.", replyExtra);
    }

    return true;
  }

  const result = await deactivateCatalogTarget(env, targetPayload).catch((err) => {
    logError("[catalog.targets.deactivate.failed]", {
      telegramId,
      chatId,
      threadId: msg?.message_thread_id ?? null,
      categoryCode,
      err: err?.message || String(err || ""),
    });
    return { ok: false, reason: "exception" };
  });

  if (!result?.ok) {
    await sendMessage(env, chatId, "⚠️ Feed katalog tidak ditemukan di scope ini.", replyExtra);
    return true;
  }

  const cleanupResult = await cleanupPublishedCatalogForTarget(env, targetPayload).catch((err) => {
    logError("[catalog.cleanup.off.failed]", {
      telegramId,
      chatId,
      threadId: msg?.message_thread_id ?? null,
      categoryCode,
      err: err?.message || String(err || ""),
    });
    return { ok: false, removed_count: 0, failed_message_ids: [] };
  });

  const removedCount = Number(cleanupResult?.removed_count || 0);

  await sendMessage(
    env,
    chatId,
    [
      "✅ Feed katalog nonaktif.",
      "",
      ...buildCatalogTargetSummaryLines(targetPayload),
      "",
      `Pesan katalog dibersihkan: ${removedCount}`,
    ].join("\n"),
    replyExtra
  );
  return true;
}

async function handleDynamicCatalogCommand({ env, chat, msg, chatId, text }) {
  const categoryCode = await findCategoryCodeFromCommand(env, text);
  if (!categoryCode) {
    return false;
  }

  const raw = normalizeString(text);
  const firstSpaceIndex = raw.indexOf(" ");
  const locationArg = firstSpaceIndex >= 0 ? raw.slice(firstSpaceIndex + 1) : "";
  const { kota, kecamatan } = parseCatalogLocationArgument(locationArg);

  const result = await publishOnDemandCatalog(
    env,
    {
      chat_id: chatId,
      topic_id: msg?.message_thread_id ?? null,
      category_code: categoryCode,
      kota,
      kecamatan,
    },
    {
      pageSize: 3,
    }
  ).catch((err) => {
    logError("[catalog.on_demand.failed]", {
      chatId,
      threadId: msg?.message_thread_id ?? null,
      categoryCode,
      kota,
      kecamatan,
      err: err?.message || String(err || ""),
    });
    return { ok: false, reason: "exception" };
  });

  if (!result?.ok) {
    await sendMessage(env, chatId, "⚠️ Gagal memuat katalog.", buildCatalogReplyExtra(chat, msg));
    return true;
  }

  return true;
}

async function handleTelegramCommand({
  env,
  msg,
  chat,
  chatId,
  telegramId,
  username,
  text,
  role,
}) {
  if (!(text && text.startsWith("/"))) return false;

  const raw = String(text || "").trim();
  const cmdToken = raw.split(/\s+/)[0];
  const baseCmd = cmdToken.split("@")[0].toLowerCase();

  if (baseCmd === "/start") {
    const handledInviteStart = await handleAdminInviteStart({
      env,
      chat,
      msg,
      chatId,
      telegramId,
      username,
      rawText: raw,
    });

    if (handledInviteStart) return true;
  }

  if (baseCmd === "/temanku") {
    return handleTemankuCommand({ env, chat, msg, chatId, telegramId, role });
  }

  if (OBSOLETE_ADMIN_COMMANDS.has(baseCmd)) {
    return handleDisabledLegacyCommand({ env, chat, msg, chatId });
  }

  if (isAdminRole(role)) {
    const handledAdmin = await handleAdminCommand({
      env,
      chat,
      chatId,
      text: raw,
      role,
    });

    if (handledAdmin) return true;
  }

  if (!isPrivateChat(chat)) {
    return true;
  }

  const handledUser = await handleUserCommand({
    env,
    chat,
    chatId,
    telegramId,
    role,
    text: raw,
  });

  if (handledUser) return true;

  await sendMessage(env, chatId, "Command tidak dikenali.", {
    reply_markup: buildTeManMenuKeyboard(),
  });

  return true;
}

async function handleAdminSessionInput({
  env,
  chat,
  chatId,
  telegramId,
  text,
  msg,
  update,
  role,
  session,
  STATE_KEY,
}) {
  if (!isAdminRole(role) || !session) return false;
  if (!isPrivateChat(chat)) return false;

  if (session?.mode === SESSION_MODES.SA_FINANCE) {
    return Boolean(
      await handleSuperadminFinanceInput({
        env,
        chatId,
        telegramId,
        text,
        session,
        STATE_KEY,
        update,
      })
    );
  }

  if (session?.mode === SESSION_MODES.SA_CATEGORY) {
    return Boolean(
      await handleSuperadminCategoryInput({
        env,
        chatId,
        text,
        session,
        STATE_KEY,
      })
    );
  }

  if (session?.mode === SESSION_MODES.SA_ADMIN_MANAGER) {
    return Boolean(
      await handleSuperadminAdminManagerInput({
        env,
        chatId,
        telegramId,
        role,
        text,
        session,
        STATE_KEY,
      })
    );
  }

  if (session?.mode === SESSION_MODES.SA_CATALOG_SETTINGS) {
    return Boolean(
      await handleSuperadminCatalogSettingsInput({
        env,
        chatId,
        telegramId,
        text,
        session,
        STATE_KEY,
      })
    );
  }

  if (session?.mode === SESSION_MODES.PARTNER_VIEW) {
    return Boolean(
      await handlePartnerViewSearchInput({
        env,
        chatId,
        adminId: telegramId,
        text,
        role,
        session,
        STATE_KEY,
        msg,
      })
    );
  }

  if (session?.mode === SESSION_MODES.PARTNER_MODERATION) {
    return Boolean(
      await handlePartnerModerationInput({
        env,
        chatId,
        text,
        session,
        STATE_KEY,
        role,
      })
    );
  }

  if (session?.mode === SESSION_MODES.PARTNER_EDIT_CLOSEUP) {
    return Boolean(
      await handlePartnerCloseupEditInput({
        env,
        chatId,
        text,
        msg,
        session,
        STATE_KEY,
      })
    );
  }

  if (session?.mode === SESSION_MODES.PARTNER_EDIT_TEXT) {
    return Boolean(
      await handlePartnerTextEditInput({
        env,
        chatId,
        text,
        role,
        session,
        STATE_KEY,
      })
    );
  }

  return false;
}

async function handleAdminIdleMessage({ env, chat, chatId, role }) {
  if (!isPrivateChat(chat)) {
    return true;
  }

  await sendMessage(env, chatId, buildTemankuHubText(role), {
    parse_mode: "HTML",
    reply_markup: buildOfficerHomeKeyboard(role),
    disable_web_page_preview: true,
  });
  return true;
}

async function handleNonAdminIdleMessage({
  env,
  chat,
  chatId,
  telegramId,
}) {
  if (!isPrivateChat(chat)) {
    return true;
  }

  const profile = await getProfileFullByTelegramId(env, telegramId);

  if (profile) {
    await sendMessage(env, chatId, buildSelfMenuMessage(profile), {
      parse_mode: "HTML",
      reply_markup: buildSelfMenuKeyboard(),
    });
    return true;
  }

  await sendMessage(env, chatId, "Klik Menu TeMan untuk mulai.", {
    reply_markup: buildTeManMenuKeyboard(),
  });

  return true;
}

export async function handleTelegramWebhook(request, env) {
  try {
    const update = await request.json();

    if (update.callback_query) {
      return handleCallback(update, env);
    }

    if (!update.message) return ok();

    const msg = update.message;
    const chat = msg?.chat || null;
    const { chatId, telegramId, username, text } = parseMessage(msg);

    if (!chatId || !telegramId) {
      return ok();
    }

    const role = await getAdminRole(env, telegramId);

    await syncProfileUsernameFromTelegram(env, telegramId, username).catch((err) => {
      logError("[profile.sync_username.failed]", {
        telegramId,
        username: username || null,
        err: err?.message || String(err || ""),
      });
    });

    if (text && text.startsWith("/")) {
      const handledCatalogFeed = await handleCatalogFeedCommand({
        env,
        chat,
        msg,
        chatId,
        telegramId,
        role,
        text,
      });

      if (handledCatalogFeed) {
        return ok();
      }

      const handledDynamicCatalog = await handleDynamicCatalogCommand({
        env,
        chat,
        msg,
        chatId,
        text,
      });

      if (handledDynamicCatalog) {
        return ok();
      }

      const handledTemanku = await handleTelegramCommand({
        env,
        msg,
        chat,
        chatId,
        telegramId,
        username,
        text,
        role,
      });

      if (handledTemanku) {
        return ok();
      }
    }

    const scopeAllowed = await isScopeAllowed(env, chat, msg).catch((err) => {
      logError("[telegram.scope_check.failed]", {
        chatId,
        telegramId,
        err: err?.message || String(err || ""),
      });
      return false;
    });

    if (!scopeAllowed) {
      return ok();
    }

    const STATE_KEY = `state:${telegramId}`;

    const session = await loadSession(env, STATE_KEY);

    const handledAdminSession = await handleAdminSessionInput({
      env,
      chat,
      chatId,
      telegramId,
      text,
      msg,
      update,
      role,
      session,
      STATE_KEY,
    });

    if (handledAdminSession) return ok();

    if (session?.mode === SESSION_MODES.EDIT_PROFILE) {
      await handleUserEditFlow({
        env,
        chat,
        chatId,
        telegramId,
        username,
        text,
        session,
        STATE_KEY,
        update,
      });

      return ok();
    }

    const handledRegistration = await handleRegistrationFlow({
      update,
      env,
      chat,
      chatId,
      telegramId,
      username,
      text,
      session,
      STATE_KEY,
    });

    if (handledRegistration) return ok();

    if (!isAdminRole(role)) {
      const handledProofUpload = await handlePaymentProofUpload({
        env,
        chat,
        chatId,
        telegramId,
        update,
      });

      if (handledProofUpload) return ok();
    }

    if (!session && isAdminRole(role)) {
      await handleAdminIdleMessage({ env, chat, chatId, role });
      return ok();
    }

    if (!session && !isAdminRole(role)) {
      await handleNonAdminIdleMessage({
        env,
        chat,
        chatId,
        telegramId,
      });
      return ok();
    }

    return ok();
  } catch (err) {
    logError("[telegram.webhook.failed]", {
      err: err?.message || String(err || ""),
    });
    return ok();
  }
}

const telegramRoutes = {
  handleTelegramWebhook,
};

export default telegramRoutes;
