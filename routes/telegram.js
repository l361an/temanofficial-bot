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
    const role = await getAdminRole(env, telegramId);

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
