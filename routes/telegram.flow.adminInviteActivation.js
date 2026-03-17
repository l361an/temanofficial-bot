// routes/telegram.flow.adminInviteActivation.js

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
import { buildOfficerHomeKeyboard } from "./callbacks/keyboards.officer.js";
import { buildOfficerHomeText } from "./telegram.messages.js";

function logError(tag, meta = {}) {
  console.error(tag, meta);
}

function isPrivateChat(chat) {
  return String(chat?.type || "").trim().toLowerCase() === "private";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildInviteErrorText(reason) {
  if (reason === "not_found") return "⚠️ Invite admin tidak ditemukan.";
  if (reason === "expired") return "⚠️ Invite admin sudah expired.";
  if (reason === "used") return "⚠️ Invite admin ini sudah digunakan.";
  if (reason === "revoked") return "⚠️ Invite admin ini sudah dicabut.";
  if (reason === "not_active") return "⚠️ Invite admin tidak aktif.";
  if (reason === "owner_conflict") {
    return "⛔ Akun owner tidak boleh dioverride lewat invite admin.";
  }
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
  const role = String(
    createdRow?.normRole || createdRow?.role || inviteRow?.role || "admin"
  );
  const username = String(activatedUsername || createdRow?.username || "")
    .trim()
    .replace(/^@/, "");
  const nama = String(createdRow?.nama || "").trim() || "-";
  const telegramId =
    String(createdRow?.telegram_id || activatedByTelegramId || "").trim() || "-";
  const creatorLabel = inviterRow
    ? formatAdminLabel(inviterRow)
    : String(inviteRow?.created_by || "-");
  const usedAt = String(inviteRow?.used_at || new Date().toISOString()).trim();
  const token = String(inviteRow?.token || "-").trim();

  return [
    "🚨 <b>Admin Baru Aktif dari Invite</b>",
    "",
    `Nama         : <b>${escapeHtml(nama)}</b>`,
    `Username     : ${
      username ? `<code>@${escapeHtml(username)}</code>` : "-"
    }`,
    `Telegram ID  : <code>${escapeHtml(telegramId)}</code>`,
    `Role         : <b>${escapeHtml(role)}</b>`,
    `Invited By   : <b>${escapeHtml(creatorLabel)}</b>`,
    `Used At      : <code>${escapeHtml(usedAt)}</code>`,
    `Token        : <code>${escapeHtml(token)}</code>`,
  ].join("\n");
}

function buildWatcherKeyboard() {
  return buildOfficerHomeKeyboard("superadmin");
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

    const replyMarkup = buildWatcherKeyboard();
    const sentTo = new Set();

    for (const watcher of watchers) {
      const watcherId = String(watcher?.telegram_id || "").trim();
      if (!watcherId || sentTo.has(watcherId)) continue;

      await sendMessage(env, watcherId, text, {
        parse_mode: "HTML",
        reply_markup: replyMarkup,
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
        reply_markup: replyMarkup,
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

export async function handleAdminInviteStart({
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
