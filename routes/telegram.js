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
import { handlePartnerTextEditInput } from "./telegram.flow.partnerTextEdit.js";
import { handlePaymentProofUpload } from "./telegram.flow.paymentProof.js";
import { handlePartnerModerationInput } from "./telegram.flow.partnerModeration.js";

import {
  getProfileFullByTelegramId,
  syncProfileUsernameFromTelegram,
} from "../repositories/profilesRepo.js";

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

export async function handleTelegramWebhook(request, env) {
  try {
    const update = await request.json();

    if (update.callback_query) {
      return handleCallback(update, env);
    }

    if (!update.message) return json({ ok: true });

    const message = update.message;
    const chat = message?.chat || null;

    const { chatId, telegramId, username, text } = parseMessage(message);

    if (!chatId || !telegramId) return json({ ok: true });

    const STATE_KEY = `state:${telegramId}`;
    const role = await getAdminRole(env, telegramId);

    await syncProfileUsernameFromTelegram(env, telegramId, username).catch(() => {});

    const privateChat = isPrivateChat(chat);
    const rawText = String(text || "").trim();
    const isSlashCommand = rawText.startsWith("/");

    // HARD GUARD:
    // - non-admin: private chat only
    // - admin: di luar private chat hanya slash command yang boleh diproses
    if (!privateChat) {
      if (!isAdminRole(role)) {
        return json({ ok: true });
      }

      if (!isSlashCommand) {
        return json({ ok: true });
      }
    }

    if (isSlashCommand) {
      const cmdToken = rawText.split(/\s+/)[0];
      const baseCmd = cmdToken.split("@")[0];

      if (baseCmd === "/help") {
        await sendMessage(env, chatId, buildHelp(role), { parse_mode: "HTML" });
        return json({ ok: true });
      }

      if (isAdminRole(role)) {
        const handled = await handleAdminCommand({
          env,
          chatId,
          text: rawText,
          telegramId,
          role,
        });

        if (handled) return json({ ok: true });
      }

      const handledUser = await handleUserCommand({
        env,
        chat,
        chatId,
        telegramId,
        role,
        text: rawText,
        STATE_KEY,
      });

      if (handledUser) return json({ ok: true });

      if (!isAdminRole(role)) {
        return json({ ok: true });
      }

      await sendMessage(env, chatId, "Command tidak dikenali.", {
        reply_markup: buildTeManMenuKeyboard(),
      });

      return json({ ok: true });
    }

    const session = await loadSession(env, STATE_KEY);

    // semua flow berbasis session untuk officer/admin wajib private chat
    if (!privateChat) {
      if (
        session?.mode === "sa_admin_manager" ||
        session?.mode === "partner_edit_text" ||
        session?.mode === "sa_finance" ||
        session?.mode === "partner_moderation" ||
        session?.mode === "edit_profile" ||
        session?.step
      ) {
        return json({ ok: true });
      }
    }

    if (session?.mode === "sa_admin_manager" && isSuperadminRole(role)) {
      const handledAdminManager = await handleSuperadminAdminManagerInput({
        env,
        chatId,
        telegramId,
        username,
        text,
        session,
        STATE_KEY,
      });

      if (handledAdminManager) return json({ ok: true });
    }

    if (session?.mode === "partner_edit_text" && isSuperadminRole(role)) {
      const handledPartnerTextEdit = await handlePartnerTextEditInput({
        env,
        chatId,
        telegramId,
        username,
        text,
        session,
        STATE_KEY,
        role,
      });

      if (handledPartnerTextEdit) return json({ ok: true });
    }

    if (session?.mode === "sa_finance" && isAdminRole(role)) {
      const handledFinance = await handleSuperadminFinanceInput({
        env,
        chatId,
        telegramId,
        username,
        text,
        session,
        STATE_KEY,
        update,
      });

      if (handledFinance) return json({ ok: true });
    }

    if (session?.mode === "partner_moderation" && isAdminRole(role)) {
      const handledModeration = await handlePartnerModerationInput({
        env,
        chatId,
        text,
        session,
        STATE_KEY,
        role,
      });

      if (handledModeration) return json({ ok: true });
    }

    if (session?.mode === "edit_profile") {
      const handledEdit = await handleUserEditFlow({
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

      if (handledEdit) return json({ ok: true });
      return json({ ok: true });
    }

    // registrasi user diproses lebih dulu agar upload foto registrasi
    // tidak tertangkap sebagai bukti payment
    if (!isAdminRole(role) && privateChat) {
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

      if (handledRegistration) return json({ ok: true });
    }

    // proof upload diproses setelah flow edit/registrasi
    if (!isAdminRole(role) && privateChat) {
      const handledProofUpload = await handlePaymentProofUpload({
        env,
        chat,
        chatId,
        telegramId,
        update,
      });

      if (handledProofUpload) return json({ ok: true });
    }

    if (!session && isAdminRole(role)) {
      if (!privateChat) return json({ ok: true });

      await sendMessage(env, chatId, "Halo Officer.\nKetik /help untuk daftar command.");
      return json({ ok: true });
    }

    if (!session && !isAdminRole(role)) {
      if (!privateChat) return json({ ok: true });

      const profile = await getProfileFullByTelegramId(env, telegramId);

      if (profile) {
        await sendMessage(env, chatId, buildSelfMenuMessage(profile), {
          parse_mode: "HTML",
          reply_markup: buildSelfMenuKeyboard(),
        });

        return json({ ok: true });
      }

      await sendMessage(env, chatId, "Klik Menu TeMan untuk mulai.", {
        reply_markup: buildTeManMenuKeyboard(),
      });

      return json({ ok: true });
    }

    return json({ ok: true });
  } catch (err) {
    console.error("ERROR TELEGRAM WEBHOOK:", err);
    return json({ ok: true });
  }
}
