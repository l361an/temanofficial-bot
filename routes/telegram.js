// routes/telegram.js

import { json } from "../utils/response.js";
import { parseMessage } from "../utils/parseTelegram.js";
import { loadSession, clearSession } from "../utils/session.js";
import { sendMessage } from "../services/telegramApi.js";
import {
  getAdminRole,
  getAdminByTelegramId,
  createAdmin,
} from "../repositories/adminsRepo.js";
import {
  parseAdminInviteStartParam,
  validateAdminInviteToken,
  markAdminInviteTokenUsed,
} from "../repositories/adminInviteTokensRepo.js";
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
import { handlePaymentProofUpload } from "./telegram.flow.paymentProof.js";
import { handlePartnerModerationInput } from "./telegram.flow.partnerModeration.js";
import { handlePartnerTextEditInput } from "./telegram.flow.partnerTextEdit.js";
import { handlePartnerViewSearchInput } from "./callbacks/partnerDatabase.js";
import { buildOfficerHomeKeyboard } from "./callbacks/keyboards.officer.js";
import { buildOfficerHomeText } from "./telegram.messages.js";
import { SESSION_MODES, CALLBACKS, CALLBACK_PREFIX } from "./telegram.constants.js";

import {
  getProfileFullByTelegramId,
  syncProfileUsernameFromTelegram,
  updateCloseupPhoto,
} from "../repositories/profilesRepo.js";

const PM_PREVIEW_PREFIX = "pm_preview:";

function isPrivateChat(chat) {
  return String(chat?.type || "").trim().toLowerCase() === "private";
}

function isOfficerChat(chat, role) {
  return isAdminRole(role) && isPrivateChat(chat);
}

function isPartnerChat(chat, role) {
  return !isAdminRole(role) && isPrivateChat(chat);
}

function shouldIgnoreNonPrivateInteractiveChat(chat) {
  return !isPrivateChat(chat);
}

function getLargestPhotoFromMessage(msg) {
  const photos = Array.isArray(msg?.photo) ? msg.photo : [];
  if (!photos.length) return null;
  return photos[photos.length - 1] || null;
}

function buildPartnerCloseupResultKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [
        {
          text: "⬅️ Back",
          callback_data: `${CALLBACK_PREFIX.PM_EDIT_BACK}${telegramId}`,
        },
        {
          text: "👁 Preview",
          callback_data: `${PM_PREVIEW_PREFIX}${telegramId}`,
        },
      ],
      [
        {
          text: "🏠 Officer Home",
          callback_data: CALLBACKS.OFFICER_HOME,
        },
      ],
    ],
  };
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

function buildInviteErrorText(reason) {
  if (reason === "not_found") return "⚠️ Invite admin tidak ditemukan.";
  if (reason === "expired") return "⚠️ Invite admin sudah expired.";
  if (reason === "used") return "⚠️ Invite admin ini sudah digunakan.";
  if (reason === "revoked") return "⚠️ Invite admin ini sudah dicabut.";
  if (reason === "not_active") return "⚠️ Invite admin tidak aktif.";
  if (reason === "owner_conflict") return "⛔ Akun owner tidak boleh dioverride lewat invite admin.";
  return "⚠️ Invite admin tidak valid.";
}

function buildAdminNamaFromMessage(msg, telegramId, username) {
  const firstName = String(msg?.from?.first_name || "").trim();
  const lastName = String(msg?.from?.last_name || "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;

  const uname = String(username || "").trim().replace(/^@/, "");
  if (uname) return uname;

  return String(telegramId || "").trim();
}

async function handleAdminInviteStart({
  env,
  msg,
  chatId,
  telegramId,
  username,
  rawText,
}) {
  const parts = String(rawText || "").trim().split(/\s+/);
  const startParam = String(parts[1] || "").trim();
  const token = parseAdminInviteStartParam(startParam);

  if (!token) return false;

  const validation = await validateAdminInviteToken(env, token);
  if (!validation?.ok || !validation?.row) {
    await sendMessage(env, chatId, buildInviteErrorText(validation?.reason || "invalid"));
    return true;
  }

  const existingAdmin = await getAdminByTelegramId(env, telegramId);
  if (existingAdmin?.normRole === "owner") {
    await sendMessage(env, chatId, buildInviteErrorText("owner_conflict"));
    return true;
  }

  const nama = buildAdminNamaFromMessage(msg, telegramId, username);

  const created = await createAdmin(env, {
    telegram_id: telegramId,
    username: username || null,
    nama,
    kota: null,
    role: validation.row.role || "admin",
    status: "active",
  });

  if (!created?.ok) {
    await sendMessage(env, chatId, "⚠️ Gagal aktivasi admin dari invite.");
    return true;
  }

  const used = await markAdminInviteTokenUsed(env, token, telegramId);
  if (!used?.ok) {
    await sendMessage(env, chatId, "⚠️ Admin tersimpan, tapi status token invite gagal diupdate.");
    return true;
  }

  const nextRole = await getAdminRole(env, telegramId);

  await sendMessage(
    env,
    chatId,
    [
      "✅ Aktivasi admin berhasil.",
      "",
      `Role: ${validation.row.role || "admin"}`,
      "Selamat datang di Officer Home.",
    ].join("\n"),
    {
      reply_markup: buildOfficerHomeKeyboard(nextRole),
    }
  );

  await sendMessage(env, chatId, buildOfficerHomeText(), {
    parse_mode: "HTML",
    reply_markup: buildOfficerHomeKeyboard(nextRole),
  });

  return true;
}

async function handlePartnerCloseupEditInput({
  env,
  chatId,
  text,
  msg,
  session,
  STATE_KEY,
}) {
  if (String(session?.mode || "").trim().toLowerCase() !== SESSION_MODES.PARTNER_EDIT_CLOSEUP) {
    return false;
  }

  const rawText = String(text || "").trim();
  const targetTelegramId = String(session?.targetTelegramId || "").trim();

  if (/^(batal|cancel|keluar)$/i.test(rawText)) {
    await clearSession(env, STATE_KEY).catch(() => {});
    await sendMessage(env, chatId, "✅ Edit foto closeup partner dibatalkan.", {
      reply_markup: targetTelegramId
        ? buildPartnerCloseupResultKeyboard(targetTelegramId)
        : buildOfficerHomeKeyboard("admin"),
    });
    return true;
  }

  if (!targetTelegramId) {
    await clearSession(env, STATE_KEY).catch(() => {});
    await sendMessage(env, chatId, "⚠️ Session edit foto partner tidak valid.");
    return true;
  }

  const largestPhoto = getLargestPhotoFromMessage(msg);
  if (!largestPhoto?.file_id) {
    if (rawText) {
      await sendMessage(
        env,
        chatId,
        "⚠️ Silakan kirim foto closeup baru dalam format foto Telegram.\n\nKetik batal untuk keluar.",
        {
          reply_markup: buildPartnerCloseupResultKeyboard(targetTelegramId),
        }
      );
      return true;
    }

    return false;
  }

  const res = await updateCloseupPhoto(env, targetTelegramId, largestPhoto.file_id);
  if (!res?.ok) {
    await clearSession(env, STATE_KEY).catch(() => {});
    await sendMessage(env, chatId, "⚠️ Gagal update foto closeup partner.", {
      reply_markup: buildPartnerCloseupResultKeyboard(targetTelegramId),
    });
    return true;
  }

  await clearSession(env, STATE_KEY).catch(() => {});
  await sendMessage(env, chatId, "✅ Foto closeup partner berhasil diupdate !!!", {
    reply_markup: buildPartnerCloseupResultKeyboard(targetTelegramId),
  });
  return true;
}

export async function handleTelegramWebhook(request, env) {
  try {
    const update = await request.json();

    if (update.callback_query) {
      return handleCallback(update, env);
    }

    if (!update.message) return json({ ok: true });

    const msg = update.message;
    const chat = msg?.chat || null;
    const { chatId, telegramId, username, text } = parseMessage(msg);

    if (!chatId || !telegramId) {
      return json({ ok: true });
    }

    const STATE_KEY = `state:${telegramId}`;
    const role = await getAdminRole(env, telegramId);
    const officerChat = isOfficerChat(chat, role);
    const partnerChat = isPartnerChat(chat, role);

    await syncProfileUsernameFromTelegram(env, telegramId, username).catch(() => {});

    if (text && text.startsWith("/")) {
      const raw = String(text || "").trim();
      const cmdToken = raw.split(/\s+/)[0];
      const baseCmd = cmdToken.split("@")[0];

      if (baseCmd === "/help") {
        if (isAdminRole(role) && !officerChat) {
          return json({ ok: true });
        }

        if (!isAdminRole(role) && !partnerChat) {
          return json({ ok: true });
        }

        await sendMessage(env, chatId, buildHelp(role), { parse_mode: "HTML" });
        return json({ ok: true });
      }

      if (baseCmd === "/start") {
        const handledInviteStart = await handleAdminInviteStart({
          env,
          msg,
          chatId,
          telegramId,
          username,
          rawText: raw,
        });

        if (handledInviteStart) return json({ ok: true });
      }

      if (isAdminRole(role)) {
        if (!officerChat) {
          return json({ ok: true });
        }

        const handled = await handleAdminCommand({
          env,
          chatId,
          text: raw,
          role,
        });

        if (handled) return json({ ok: true });
      }

      if (!isAdminRole(role)) {
        if (!partnerChat) {
          return json({ ok: true });
        }

        const handledUser = await handleUserCommand({
          env,
          chat,
          chatId,
          telegramId,
          role,
          text: raw,
        });

        if (handledUser) return json({ ok: true });

        await sendMessage(env, chatId, "Command tidak dikenali.", {
          reply_markup: buildTeManMenuKeyboard(),
        });

        return json({ ok: true });
      }

      return json({ ok: true });
    }

    const session = await loadSession(env, STATE_KEY);

    if (session?.mode === SESSION_MODES.SA_FINANCE && isAdminRole(role)) {
      if (!officerChat) return json({ ok: true });

      const handledFinance = await handleSuperadminFinanceInput({
        env,
        chatId,
        telegramId,
        text,
        session,
        STATE_KEY,
        update,
      });

      if (handledFinance) return json({ ok: true });
    }

    if (session?.mode === SESSION_MODES.SA_CATEGORY && isAdminRole(role)) {
      if (!officerChat) return json({ ok: true });

      const handledCategory = await handleSuperadminCategoryInput({
        env,
        chatId,
        text,
        session,
        STATE_KEY,
      });

      if (handledCategory) return json({ ok: true });
    }

    if (session?.mode === SESSION_MODES.SA_ADMIN_MANAGER && isAdminRole(role)) {
      if (!officerChat) return json({ ok: true });

      const handledAdminManager = await handleSuperadminAdminManagerInput({
        env,
        chatId,
        text,
        session,
        STATE_KEY,
      });

      if (handledAdminManager) return json({ ok: true });
    }

    if (session?.mode === SESSION_MODES.PARTNER_VIEW && isAdminRole(role)) {
      if (!officerChat) return json({ ok: true });

      const handledPartnerView = await handlePartnerViewSearchInput({
        env,
        chatId,
        adminId: telegramId,
        text,
        role,
        session,
        STATE_KEY,
        msg,
      });

      if (handledPartnerView) return json({ ok: true });
    }

    if (session?.mode === SESSION_MODES.PARTNER_MODERATION && isAdminRole(role)) {
      if (!officerChat) return json({ ok: true });

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

    if (session?.mode === SESSION_MODES.PARTNER_EDIT_CLOSEUP && isAdminRole(role)) {
      if (!officerChat) return json({ ok: true });

      const handledPartnerEditCloseup = await handlePartnerCloseupEditInput({
        env,
        chatId,
        text,
        msg,
        session,
        STATE_KEY,
      });

      if (handledPartnerEditCloseup) return json({ ok: true });
    }

    if (session?.mode === SESSION_MODES.PARTNER_EDIT_TEXT && isAdminRole(role)) {
      if (!officerChat) return json({ ok: true });

      const handledPartnerEditText = await handlePartnerTextEditInput({
        env,
        chatId,
        text,
        session,
        STATE_KEY,
      });

      if (handledPartnerEditText) return json({ ok: true });
    }

    if (!isAdminRole(role)) {
      if (partnerChat) {
        const handledProofUpload = await handlePaymentProofUpload({
          env,
          chat,
          chatId,
          telegramId,
          update,
        });

        if (handledProofUpload) return json({ ok: true });
      } else if (shouldIgnoreNonPrivateInteractiveChat(chat)) {
        return json({ ok: true });
      }
    }

    if (!session && isAdminRole(role)) {
      if (!officerChat) {
        return json({ ok: true });
      }

      await sendMessage(env, chatId, "Halo Officer.\nKetik /help untuk daftar command.");
      return json({ ok: true });
    }

    if (!session && !isAdminRole(role)) {
      if (!partnerChat) {
        return json({ ok: true });
      }

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

    if (session?.mode === SESSION_MODES.EDIT_PROFILE) {
      if (!partnerChat) {
        return json({ ok: true });
      }

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

      return json({ ok: true });
    }

    if (!partnerChat) {
      return json({ ok: true });
    }

    await handleRegistrationFlow({
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

    return json({ ok: true });
  } catch (err) {
    console.error("ERROR TELEGRAM WEBHOOK:", err);
    return json({ ok: true });
  }
}
