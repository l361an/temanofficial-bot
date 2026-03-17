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

function normalizeCommandToken(value) {
  const raw = normalizeString(value);
  if (!raw.startsWith("/")) return "";
  return raw.split(/\s+/)[0].split("@")[0].toLowerCase();
}

function isOwnerRole(role) {
  return normalizeString(role).toLowerCase() === "owner";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildHelp(role) {
  if (isSuperadminRole(role)) {
    return (
      "📘 Daftar Command (Admin Panel)\n\n" +
      "Admin + Superadmin:\n" +
      "• `/list pending|approved|rejected|suspended`\n" +
      "• `/suspend @username|telegram_id`\n" +
      "• `/activate @username|telegram_id`\n" +
      "• `/ceksub @username|telegram_id`\n\n" +
      "Superadmin only:\n" +
      "• `/setlink aturan <url>`\n" +
      "• `/setwelcome <text>`\n" +
      "• `/delpartner @username|telegram_id`"
    );
  }

  if (isAdminRole(role)) {
    return (
      "📘 Daftar Command (Admin Panel)\n\n" +
      "• `/list pending|approved|rejected|suspended`\n" +
      "• `/suspend @username|telegram_id`\n" +
      "• `/activate @username|telegram_id`\n" +
      "• `/ceksub @username|telegram_id`"
    );
  }

  return (
    "ℹ️ Bantuan\n\n" +
    "• `/start` — Menu TeMan\n" +
    "• `/me` — Cek role"
  );
}

function buildCatalogTargetLine(item, index) {
  const chatTitle = normalizeString(item?.chat_title) || "(Tanpa Nama)";
  const chatId = normalizeString(item?.chat_id) || "-";
  const topicId = normalizeString(item?.topic_id);
  const status = item?.is_active ? "AKTIF" : "NONAKTIF";

  return [
    `${index + 1}. <b>${escapeHtml(chatTitle)}</b>`,
    `   Chat ID : <code>${escapeHtml(chatId)}</code>`,
    `   Topic   : ${topicId ? `<code>${escapeHtml(topicId)}</code>` : "-"}`,
    `   Status  : <b>${status}</b>`,
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
  const ownerOnlyCommands = new Set([
    "/aktifkankatalog",
    "/nonaktifkankatalog",
    "/listkataloggroup",
  ]);

  if (!ownerOnlyCommands.has(cmd)) {
    return false;
  }

  if (!isOwnerRole(role)) {
    return true;
  }

  if (cmd === "/listkataloggroup") {
    if (!isPrivateChat(chat)) {
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
    added_by: telegramId,
  };

  if (cmd === "/aktifkankatalog") {
    const result = await addOrUpdateCatalogTarget(env, targetPayload).catch((err) => {
      logError("[catalog.targets.activate.failed]", {
        telegramId,
        chatId,
        threadId: msg?.message_thread_id ?? null,
        err: err?.message || String(err || ""),
      });
      return { ok: false };
    });

    if (!result?.ok) {
      await sendMessage(env, chatId, "⚠️ Gagal mengaktifkan target katalog ini.");
      return true;
    }

    await sendMessage(
      env,
      chatId,
      [
        result.created
          ? "✅ Grup ini berhasil ditambahkan sebagai target katalog."
          : "✅ Target katalog ini berhasil diaktifkan kembali.",
        "",
        `Group : ${targetPayload.chat_title}`,
        `Chat ID : ${normalizeString(targetPayload.chat_id)}`,
        `Topic ID : ${
          normalizeString(targetPayload.topic_id)
            ? normalizeString(targetPayload.topic_id)
            : "-"
        }`,
      ].join("\n")
    );
    return true;
  }

  if (cmd === "/nonaktifkankatalog") {
    const result = await deactivateCatalogTarget(env, targetPayload).catch((err) => {
      logError("[catalog.targets.deactivate.failed]", {
        telegramId,
        chatId,
        threadId: msg?.message_thread_id ?? null,
        err: err?.message || String(err || ""),
      });
      return { ok: false };
    });

    if (!result?.ok) {
      await sendMessage(
        env,
        chatId,
        "⚠️ Target katalog ini belum ditemukan atau gagal dinonaktifkan."
      );
      return true;
    }

    await sendMessage(
      env,
      chatId,
      [
        "✅ Target katalog ini berhasil dinonaktifkan.",
        "",
        `Group : ${targetPayload.chat_title}`,
        `Chat ID : ${normalizeString(targetPayload.chat_id)}`,
        `Topic ID : ${
          normalizeString(targetPayload.topic_id)
            ? normalizeString(targetPayload.topic_id)
            : "-"
        }`,
      ].join("\n")
    );
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
