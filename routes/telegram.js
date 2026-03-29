// routes/telegram.js

import { json } from "../utils/response.js";
import { parseMessage } from "../utils/parseTelegram.js";
import { loadSession } from "../utils/session.js";
import { sendMessage } from "../services/telegramApi.js";
import { getAdminRole } from "../repositories/adminsRepo.js";
import { isAdminRole, isSuperadminRole } from "../utils/roles.js";
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
import { buildOfficerHomeText } from "./telegram.messages.js";
import { SESSION_MODES } from "./telegram.constants.js";
import { isScopeAllowed } from "./telegram.guard.js";
import { handlePartnerCloseupEditInput } from "./telegram.flow.partnerCloseupEdit.js";
import { handleAdminInviteStart } from "./telegram.flow.adminInviteActivation.js";
import {
  addOrUpdateCatalogTarget,
  deactivateCatalogTarget,
  getCatalogTargets,
} from "../repositories/catalogTargetsRepo.js";
import {
  publishCatalogToTarget,
  cleanupPublishedCatalogForTarget,
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

function isOwnerRole(role) {
  return normalizeLower(role) === "owner";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function titleCase(value) {
  const raw = normalizeString(value).toLowerCase();
  if (!raw) return "-";

  return raw
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildHelp(role) {
  if (isOwnerRole(role)) {
    return (
      "📘 <b>Daftar Command (Owner Panel)</b>\n\n" +
      "Admin + Superadmin + Owner:\n" +
      "• <code>/list pending|approved|rejected|suspended</code>\n" +
      "• <code>/suspend @username|telegram_id</code>\n" +
      "• <code>/activate @username|telegram_id</code>\n" +
      "• <code>/ceksub @username|telegram_id</code>\n\n" +
      "Superadmin only:\n" +
      "• <code>/setlink aturan &lt;url&gt;</code>\n" +
      "• <code>/setwelcome &lt;text&gt;</code>\n" +
      "• <code>/delpartner @username|telegram_id</code>\n\n" +
      "Owner only:\n" +
      "• <code>/katalog list</code>\n" +
      "• <code>/katalog temantera on</code>\n" +
      "• <code>/katalog temantera off</code>\n" +
      "• <code>/katalog temantera refresh</code>"
    );
  }

  if (isSuperadminRole(role)) {
    return (
      "📘 <b>Daftar Command (Admin Panel)</b>\n\n" +
      "Admin + Superadmin:\n" +
      "• <code>/list pending|approved|rejected|suspended</code>\n" +
      "• <code>/suspend @username|telegram_id</code>\n" +
      "• <code>/activate @username|telegram_id</code>\n" +
      "• <code>/ceksub @username|telegram_id</code>\n\n" +
      "Superadmin only:\n" +
      "• <code>/setlink aturan &lt;url&gt;</code>\n" +
      "• <code>/setwelcome &lt;text&gt;</code>\n" +
      "• <code>/delpartner @username|telegram_id</code>"
    );
  }

  if (isAdminRole(role)) {
    return (
      "📘 <b>Daftar Command (Admin Panel)</b>\n\n" +
      "• <code>/list pending|approved|rejected|suspended</code>\n" +
      "• <code>/suspend @username|telegram_id</code>\n" +
      "• <code>/activate @username|telegram_id</code>\n" +
      "• <code>/ceksub @username|telegram_id</code>"
    );
  }

  return (
    "ℹ️ <b>Bantuan</b>\n\n" +
    "• <code>/start</code> — Menu TeMan\n" +
    "• <code>/me</code> — Cek role"
  );
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
    `   Topic    : ${topicId ? `<code>${escapeHtml(topicId)}</code>` : "-"}`,
    `   Status   : <b>${status}</b>`,
  ].join("\n");
}

function buildCatalogTargetsListText(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return "📭 Belum ada target katalog yang tersimpan.";
  }

  return [
    "📚 <b>Daftar Target Katalog</b>",
    "",
    ...items.map((item, index) => buildCatalogTargetLine(item, index)),
  ].join("\n\n");
}

function buildCatalogCommandUsageText() {
  return [
    "📚 <b>Command Katalog</b>",
    "",
    "• <code>/katalog list</code> — lihat daftar target katalog",
    "• <code>/katalog temantera on</code> — aktifkan katalog kategori ini di topic sekarang",
    "• <code>/katalog temantera off</code> — nonaktifkan katalog kategori ini di topic sekarang",
    "• <code>/katalog temantera refresh</code> — refresh katalog kategori ini di topic sekarang",
  ].join("\n");
}

function buildCatalogTargetSummaryLines(targetPayload) {
  return [
    `Kategori : ${normalizeString(targetPayload.category_code) || "-"}`,
    `Group : ${targetPayload.chat_title}`,
    `Chat ID : ${normalizeString(targetPayload.chat_id)}`,
    `Topic ID : ${
      normalizeString(targetPayload.topic_id)
        ? normalizeString(targetPayload.topic_id)
        : "-"
    }`,
  ];
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

async function handleOwnerCatalogBootstrapCommand({
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

  if (!isOwnerRole(role)) {
    await sendMessage(env, chatId, "⚠️ Command katalog khusus owner.", replyExtra);
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
    if (!isPrivateChat(chat)) {
      await sendMessage(
        env,
        chatId,
        "⚠️ <code>/katalog list</code> hanya bisa dijalankan dari private chat.",
        {
          ...replyExtra,
          parse_mode: "HTML",
        }
      );
      return true;
    }

    const items = await getCatalogTargets(env).catch((err) => {
      logError("[catalog.targets.list.failed]", {
        telegramId,
        err: err?.message || String(err || ""),
      });
      return [];
    });

    await sendMessage(env, chatId, buildCatalogTargetsListText(items), {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return true;
  }

  const categoryCode = secondToken;
  const action = normalizeLower(parts[2]);
  const allowedActions = new Set(["on", "off", "refresh"]);

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
      "⚠️ Command ini harus dijalankan langsung di grup / topic target katalog."
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
      await sendMessage(
        env,
        chatId,
        "⚠️ Gagal mengaktifkan target katalog kategori ini.",
        replyExtra
      );
      return true;
    }

    const isCreated = Boolean("created" in result ? result.created : false);

    await sendMessage(
      env,
      chatId,
      [
        isCreated
          ? "✅ Target katalog kategori ini berhasil ditambahkan. Sedang memunculkan katalog..."
          : "✅ Target katalog kategori ini berhasil diaktifkan. Sedang memunculkan katalog...",
        "",
        ...buildCatalogTargetSummaryLines(targetPayload),
      ].join("\n"),
      replyExtra
    );

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
      await sendMessage(
        env,
        chatId,
        "⚠️ Target berhasil aktif, tapi katalog gagal dipublish.",
        replyExtra
      );
    }

    return true;
  }

  if (action === "off") {
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
      await sendMessage(
        env,
        chatId,
        "⚠️ Target katalog kategori ini belum ditemukan atau gagal dinonaktifkan.",
        replyExtra
      );
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
        "✅ Target katalog kategori ini berhasil dinonaktifkan.",
        "",
        ...buildCatalogTargetSummaryLines(targetPayload),
        "",
        `Pesan katalog yang dibersihkan: ${removedCount}`,
      ].join("\n"),
      replyExtra
    );
    return true;
  }

  if (action === "refresh") {
    const publishResult = await publishCatalogToTarget(env, targetPayload, {
      pageSize: 3,
    }).catch((err) => {
      logError("[catalog.publish.refresh.failed]", {
        telegramId,
        chatId,
        threadId: msg?.message_thread_id ?? null,
        categoryCode,
        err: err?.message || String(err || ""),
      });
      return { ok: false, reason: "exception" };
    });

    if (!publishResult?.ok) {
      await sendMessage(
        env,
        chatId,
        "⚠️ Gagal refresh katalog kategori ini di target sekarang.",
        replyExtra
      );
    }

    return true;
  }

  return false;
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
  const baseCmd = cmdToken.split("@")[0];

  if (baseCmd === "/help") {
    if (!isPrivateChat(chat)) {
      return true;
    }

    await sendMessage(env, chatId, buildHelp(role), { parse_mode: "HTML" });
    return true;
  }

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
        session,
        STATE_KEY,
      })
    );
  }

  return false;
}

async function handleAdminIdleMessage({ env, chat, chatId }) {
  if (!isPrivateChat(chat)) {
    return true;
  }

  await sendMessage(env, chatId, "Halo Officer.\nKetik /help untuk daftar command.");
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

    const handledOwnerCatalogBootstrap = await handleOwnerCatalogBootstrapCommand({
      env,
      chat,
      msg,
      chatId,
      telegramId,
      role,
      text,
    });

    if (handledOwnerCatalogBootstrap) {
      return ok();
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

    await syncProfileUsernameFromTelegram(env, telegramId, username).catch((err) => {
      logError("[profile.sync_username.failed]", {
        telegramId,
        username: username || null,
        err: err?.message || String(err || ""),
      });
    });

    const handledCommand = await handleTelegramCommand({
      env,
      msg,
      chat,
      chatId,
      telegramId,
      username,
      text,
      role,
    });

    if (handledCommand) return ok();

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
      await handleAdminIdleMessage({ env, chat, chatId });
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
