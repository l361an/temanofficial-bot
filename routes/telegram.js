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

import { getProfileFullByTelegramId, syncProfileUsernameFromTelegram } from "../repositories/profilesRepo.js";

// HELP pakai HTML biar gak kena error Markdown entities
function buildHelp(role) {
  if (isSuperadminRole(role)) {
    return (
      "📌 <b>Daftar Command (Admin Panel)</b>\n\n" +
      "<b>Admin + Superadmin:</b>\n" +
      "• <code>/list pending|approved|rejected|suspended</code> — List partner per status\n" +
      "• <code>/suspend @username|telegram_id</code> — Suspend partner\n" +
      "• <code>/activate @username|telegram_id</code> — Aktifkan partner (approved)\n" +
      "• <code>/ceksub @username|telegram_id</code> — Cek subscription partner\n\n" +
      "<b>Superadmin only:</b>\n" +
      "• <code>/setlink aturan &lt;url&gt;</code> — Set link (aturan, dll)\n" +
      "• <code>/setwelcome &lt;text&gt;</code> — Ubah welcome text user\n" +
      "• <code>/delpartner @username|telegram_id</code> — Hapus partner\n" +
      "• <code>/listcategory</code> — List kategori\n" +
      "• <code>/addcategory &lt;kode&gt;</code> — Tambah kategori\n" +
      "• <code>/delcategory &lt;kode&gt;</code> — Hapus kategori"
    );
  }

  if (isAdminRole(role)) {
    return (
      "📌 <b>Daftar Command (Admin Panel)</b>\n\n" +
      "<b>Admin + Superadmin:</b>\n" +
      "• <code>/list pending|approved|rejected|suspended</code> — List partner per status\n" +
      "• <code>/suspend @username|telegram_id</code> — Suspend partner\n" +
      "• <code>/activate @username|telegram_id</code> — Aktifkan partner (approved)\n" +
      "• <code>/ceksub @username|telegram_id</code> — Cek subscription partner"
    );
  }

  return (
    "ℹ️ <b>Bantuan</b>\n\n" +
    "• <code>/start</code> — Tampilkan Menu TeMan\n" +
    "• <code>/me</code> — Cek role (debug)"
  );
}

export async function handleTelegramWebhook(request, env) {
  try {
    const update = await request.json();

    // 1) CALLBACK BUTTON
    if (update.callback_query) {
      return handleCallback(update, env);
    }

    // 2) Only process message
    if (!update.message) return json({ ok: true });

    const { chatId, telegramId, username, text } = parseMessage(update.message);
    const STATE_KEY = `state:${telegramId}`;

    console.log("INCOMING:", { telegramId, text });

    // 3) Get role once
    const role = await getAdminRole(env, telegramId);

    // ✅ auto sync username Telegram -> profiles (kalau profile ada)
    await syncProfileUsernameFromTelegram(env, telegramId, username).catch(() => {});

    // 4) COMMANDS FIRST
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

      await sendMessage(env, chatId, "Command tidak dikenali. Ketik /help ya.", { reply_markup: buildTeManMenuKeyboard() });
      return json({ ok: true });
    }

    // 5) NON-COMMAND TEXT (FLOW)
    const session = await loadSession(env, STATE_KEY);

    // 5a) Admin/Superadmin never forced to register
    if (!session && isAdminRole(role)) {
      await sendMessage(env, chatId, "Halo Officer. Ketik /help untuk daftar command.");
      return json({ ok: true });
    }

    // ✅ User (bukan admin) dan sudah ada profile -> langsung menu self
    if (!session && !isAdminRole(role)) {
      const profile = await getProfileFullByTelegramId(env, telegramId);
      if (profile) {
        await sendMessage(env, chatId, buildSelfMenuMessage(profile), {
          parse_mode: "HTML",
          reply_markup: buildSelfMenuKeyboard(),
        });
        return json({ ok: true });
      }

      // ✅ belum mulai registrasi -> arahkan ke Menu TeMan (tanpa /mulai)
      await sendMessage(env, chatId, "Klik <b>Menu TeMan</b> untuk mulai ya.", {
        parse_mode: "HTML",
        reply_markup: buildTeManMenuKeyboard(),
      });
      return json({ ok: true });
    }

    // ✅ mode edit profile ditangani di user file
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

    // 6) Continue registration flow
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
