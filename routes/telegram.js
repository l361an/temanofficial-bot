// routes/telegram.js

import { json } from "../utils/response.js";
import { parseMessage } from "../utils/parseTelegram.js";
import { loadSession } from "../utils/session.js";
import { sendMessage } from "../services/telegramApi.js";
import { getAdminRole } from "../repositories/adminsRepo.js";
import { isAdminRole, isSuperadminRole } from "../utils/roles.js";
import { handleCallback } from "./telegram.callback.js";
import { handleAdminCommand } from "./telegram.commands.admin.js";
import {
  handleUserCommand,
  buildSelfMenuMessage,
  buildSelfMenuKeyboard,
  buildTeManMenuKeyboard,
  handleUserEditFlow,
} from "./telegram.commands.user.js";
import { handleRegistrationFlow } from "./telegram.flow.js";
import {
  getProfileFullByTelegramId,
  syncProfileUsernameFromTelegram,
} from "../repositories/profilesRepo.js";

function buildHelp(role) {
  if (isSuperadminRole(role)) {
    return (
      "📘 Daftar Command (Admin Panel)\n\n" +
      "Admin + Superadmin:\n" +
      "• `/list pending|approved|rejected|suspended` — List partner per status\n" +
      "• `/suspend @username|telegram_id` — Suspend partner\n" +
      "• `/activate @username|telegram_id` — Aktifkan partner (approved)\n" +
      "• `/ceksub @username|telegram_id` — Cek subscription partner\n\n" +
      "Superadmin only:\n" +
      "• `/setlink aturan <url>` — Set link (aturan, dll)\n" +
      "• `/setwelcome <text>` — Ubah welcome text user\n" +
      "• `/delpartner @username|telegram_id` — Hapus partner\n" +
      "• `/listcategory` — List kategori\n" +
      "• `/addcategory <kode>` — Tambah kategori\n" +
      "• `/delcategory <kode>` — Hapus kategori"
    );
  }

  if (isAdminRole(role)) {
    return (
      "📘 Daftar Command (Admin Panel)\n\n" +
      "Admin + Superadmin:\n" +
      "• `/list pending|approved|rejected|suspended` — List partner per status\n" +
      "• `/suspend @username|telegram_id` — Suspend partner\n" +
      "• `/activate @username|telegram_id` — Aktifkan partner (approved)\n" +
      "• `/ceksub @username|telegram_id` — Cek subscription partner"
    );
  }

  return (
    "ℹ️ Bantuan\n\n" +
    "• `/start` — Tampilkan Menu TeMan\n" +
    "• `/me` — Cek role (debug)"
  );
}

function logTelegramUpdate(update) {
  try {
    console.log("TELEGRAM_UPDATE_JSON_START");
    console.log(JSON.stringify(update, null, 2));
    console.log("TELEGRAM_UPDATE_JSON_END");

    const message = update?.message || update?.edited_message || null;
    const callback = update?.callback_query || null;
    const chat = message?.chat || callback?.message?.chat || null;
    const from = message?.from || callback?.from || null;

    console.log("TELEGRAM_UPDATE_META", {
      update_id: update?.update_id ?? null,
      chat_id: chat?.id ?? null,
      chat_type: chat?.type ?? null,
      chat_title: chat?.title ?? null,
      from_id: from?.id ?? null,
      from_username: from?.username ?? null,
    });
  } catch (error) {
    console.error("TELEGRAM_UPDATE_LOG_ERROR:", error);
  }
}

export async function handleTelegramWebhook(request, env) {
  try {
    const update = await request.json();

    logTelegramUpdate(update);

    if (update.callback_query) {
      return handleCallback(update, env);
    }

    if (!update.message) return json({ ok: true });

    const { chatId, telegramId, username, text } = parseMessage(update.message);
    const STATE_KEY = `state:${telegramId}`;

    console.log("INCOMING:", { telegramId, chatId, username, text });

    const role = await getAdminRole(env, telegramId);

    await syncProfileUsernameFromTelegram(env, telegramId, username).catch(() => {});

    if (text && text.startsWith("/")) {
      const raw = String(text || "").trim();
      const cmdToken = raw.split(/\s+/)[0];
      const baseCmd = cmdToken.split("@")[0];

      if (baseCmd === "/help" || baseCmd === "/cmd") {
        await sendMessage(env, chatId, buildHelp(role), { parse_mode: "HTML" });
        return json({ ok: true });
      }

      if (isAdminRole(role)) {
        const handled = await handleAdminCommand({
          env,
          chatId,
          text: raw,
          telegramId,
          role,
        });
        if (handled) return json({ ok: true });
      }

      const handledUser = await handleUserCommand({
        env,
        chatId,
        telegramId,
        role,
        text: raw,
        STATE_KEY,
      });
      if (handledUser) return json({ ok: true });

      await sendMessage(env, chatId, "Command tidak dikenali.\nKetik /help ya.", {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return json({ ok: true });
    }

    const session = await loadSession(env, STATE_KEY);

    if (!session && isAdminRole(role)) {
      await sendMessage(env, chatId, "Halo Officer.\nKetik /help untuk daftar command.");
      return json({ ok: true });
    }

    if (!session && !isAdminRole(role)) {
      const profile = await getProfileFullByTelegramId(env, telegramId);

      if (profile) {
        await sendMessage(env, chatId, buildSelfMenuMessage(profile), {
          parse_mode: "HTML",
          reply_markup: buildSelfMenuKeyboard(),
        });
        return json({ ok: true });
      }

      await sendMessage(env, chatId, "Klik Menu TeMan untuk mulai ya.", {
        parse_mode: "HTML",
        reply_markup: buildTeManMenuKeyboard(),
      });
      return json({ ok: true });
    }

    if (session?.mode === "edit_profile") {
      await handleUserEditFlow({
        env,
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

    await handleRegistrationFlow({
      update,
      env,
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
