// routes/telegram.js

import { json } from "../utils/response.js";
import { parseMessage } from "../utils/parseTelegram.js";
import { loadSession, clearSession } from "../utils/session.js";
import { sendMessage } from "../services/telegramApi.js";
import {
  getAdminRole,
  getAdminByTelegramId,
  createAdmin,
  listAdmins,
} from "../repositories/adminsRepo.js";
import {
  parseAdminInviteStartParam,
  validateAdminInviteToken,
  consumeAdminInviteToken,
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
import { handleSuperadminCatalogSettingsInput } from "./telegram.flow.superadminCatalogSettings.js";
import { handlePaymentProofUpload } from "./telegram.flow.paymentProof.js";
import { handlePartnerModerationInput } from "./telegram.flow.partnerModeration.js";
import { handlePartnerTextEditInput } from "./telegram.flow.partnerTextEdit.js";
import { handlePartnerViewSearchInput } from "./callbacks/partnerDatabase.js";
import { buildOfficerHomeKeyboard } from "./callbacks/keyboards.officer.js";
import { buildOfficerHomeText } from "./telegram.messages.js";
import { SESSION_MODES, CALLBACKS, CALLBACK_PREFIX } from "./telegram.constants.js";
import { isScopeAllowed } from "./telegram.guard.js";

import {
  getProfileFullByTelegramId,
  syncProfileUsernameFromTelegram,
  updateCloseupPhoto,
} from "../repositories/profilesRepo.js";

const PM_PREVIEW_PREFIX = "pm_preview:";

function ok() {
  return json({ ok: true });
}

function logError(tag, meta = {}) {
  console.error(tag, meta);
}

async function clearSessionSafely(env, stateKey, meta = {}) {
  try {
    await clearSession(env, stateKey);
    return { ok: true };
  } catch (err) {
    logError("[session.clear.failed]", {
      stateKey,
      ...meta,
      err: err?.message || String(err || ""),
    });
    return { ok: false, err };
  }
}

function isPrivateChat(chat) {
  return String(chat?.type || "").trim().toLowerCase() === "private";
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

function formatAdminLabel(row) {
  if (!row) return "-";

  const username = String(row.username || "").trim().replace(/^@/, "");
  if (username) return `@${username}`;

  const nama = String(row.nama || "").trim();
  if (nama) return nama;

  const telegramId = String(row.telegram_id || "").trim();
  if (telegramId) return telegramId;

  return "-";
}

function buildAdminInviteActivationNotifyText({
  createdRow,
  activatedByTelegramId,
  activatedUsername,
  inviteRow,
  inviterRow,
}) {
  const role = String(createdRow?.normRole || createdRow?.role || inviteRow?.role || "admin");
  const username = String(activatedUsername || createdRow?.username || "").trim().replace(/^@/, "");
  const nama = String(createdRow?.nama || "").trim() || "-";
  const telegramId = String(createdRow?.telegram_id || activatedByTelegramId || "").trim() || "-";
  const creatorLabel = inviterRow ? formatAdminLabel(inviterRow) : String(inviteRow?.created_by || "-");
  const usedAt = String(inviteRow?.used_at || new Date().toISOString()).trim();
  const token = String(inviteRow?.token || "-").trim();

  return [
    "🚨 <b>Admin Baru Aktif dari Invite</b>",
    "",
    `Nama         : <b>${escapeHtml(nama)}</b>`,
    `Username     : ${username ? `<code>@${escapeHtml(username)}</code>` : "-"}`,
    `Telegram ID  : <code>${escapeHtml(telegramId)}</code>`,
    `Role         : <b>${escapeHtml(role)}</b>`,
    `Invited By   : <b>${escapeHtml(creatorLabel)}</b>`,
    `Used At      : <code>${escapeHtml(usedAt)}</code>`,
    `Token        : <code>${escapeHtml(token)}</code>`,
  ].join("\n");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function notifyInviteActivationWatchers(env, payload = {}) {
  try {
    const rows = await listAdmins(env, { activeOnly: true }).catch((err) => {
      logError("[invite.watchers.list_admins.failed]", {
        err: err?.message || String(err || ""),
      });
      return [];
    });

    const watchers = (rows || []).filter(
      (row) => row?.normRole === "owner" || row?.normRole === "superadmin"
    );

    if (!watchers.length) return;

    const creatorId = String(payload?.inviteRow?.created_by || "").trim();
    const inviterRow = creatorId
      ? await getAdminByTelegramId(env, creatorId).catch((err) => {
          logError("[invite.watchers.get_creator.failed]", {
            creatorId,
            err: err?.message || String(err || ""),
          });
          return null;
        })
      : null;

    const text = buildAdminInviteActivationNotifyText({
      createdRow: payload.createdRow,
      activatedByTelegramId: payload.activatedByTelegramId,
      activatedUsername: payload.activatedUsername,
      inviteRow: payload.inviteRow,
      inviterRow,
    });

    const sentTo = new Set();

    for (const watcher of watchers) {
      const watcherId = String(watcher?.telegram_id || "").trim();
      if (!watcherId || sentTo.has(watcherId)) continue;

      await sendMessage(env, watcherId, text, {
        parse_mode: "HTML",
      }).catch((err) => {
        logError("[invite.watchers.notify_failed]", {
          watcherId,
          err: err?.message || String(err || ""),
        });
      });

      sentTo.add(watcherId);
    }

    if (creatorId && !sentTo.has(creatorId)) {
      await sendMessage(env, creatorId, text, {
        parse_mode: "HTML",
      }).catch((err) => {
        logError("[invite.creator.notify_failed]", {
          creatorId,
          err: err?.message || String(err || ""),
        });
      });
    }
  } catch (err) {
    logError("[invite.activation.notify_failed]", {
      err: err?.message || String(err || ""),
    });
  }
}

async function handleAdminInviteStart({
  env,
  chat,
  msg,
  chatId,
  telegramId,
  username,
  rawText,
}) {
  if (!isPrivateChat(chat)) {
    return false;
  }

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

  const consumed = await consumeAdminInviteToken(env, token, telegramId);
  if (!consumed?.ok || !consumed?.row) {
    await sendMessage(env, chatId, buildInviteErrorText(consumed?.reason || "invalid"));
    return true;
  }

  const nama = buildAdminNamaFromMessage(msg, telegramId, username);

  const created = await createAdmin(env, {
    telegram_id: telegramId,
    username: username || null,
    nama,
    kota: null,
    role: consumed.row.role || validation.row.role || "admin",
    status: "active",
  });

  if (!created?.ok) {
    logError("[invite.activation.create_admin.failed]", {
      telegramId,
      token,
      role: consumed.row.role || validation.row.role || "admin",
      reason: created?.reason || "unknown",
    });

    await sendMessage(
      env,
      chatId,
      "⚠️ Token invite sudah terpakai, tetapi aktivasi admin gagal diproses. Tolong hubungi superadmin."
    );
    return true;
  }

  await notifyInviteActivationWatchers(env, {
    createdRow: created?.row || null,
    activatedByTelegramId: telegramId,
    activatedUsername: username,
    inviteRow: consumed?.row || validation?.row || null,
  });

  const nextRole = await getAdminRole(env, telegramId);

  await sendMessage(
    env,
    chatId,
    [
      "✅ Aktivasi admin berhasil.",
      "",
      `Role: ${consumed.row.role || validation.row.role || "admin"}`,
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
    await clearSessionSafely(env, STATE_KEY, {
      mode: SESSION_MODES.PARTNER_EDIT_CLOSEUP,
      targetTelegramId,
      action: "cancel",
    });

    await sendMessage(env, chatId, "✅ Edit foto closeup partner dibatalkan.", {
      reply_markup: targetTelegramId
        ? buildPartnerCloseupResultKeyboard(targetTelegramId)
        : buildOfficerHomeKeyboard("admin"),
    });
    return true;
  }

  if (!targetTelegramId) {
    await clearSessionSafely(env, STATE_KEY, {
      mode: SESSION_MODES.PARTNER_EDIT_CLOSEUP,
      action: "invalid_target",
    });

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
    await clearSessionSafely(env, STATE_KEY, {
      mode: SESSION_MODES.PARTNER_EDIT_CLOSEUP,
      targetTelegramId,
      action: "update_failed",
    });

    await sendMessage(env, chatId, "⚠️ Gagal update foto closeup partner.", {
      reply_markup: buildPartnerCloseupResultKeyboard(targetTelegramId),
    });
    return true;
  }

  await clearSessionSafely(env, STATE_KEY, {
    mode: SESSION_MODES.PARTNER_EDIT_CLOSEUP,
    targetTelegramId,
    action: "success",
  });

  await sendMessage(env, chatId, "✅ Foto closeup partner berhasil diupdate !!!", {
    reply_markup: buildPartnerCloseupResultKeyboard(targetTelegramId),
  });
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
