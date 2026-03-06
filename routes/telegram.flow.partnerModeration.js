// routes/telegram.flow.partnerModeration.js

import { clearSession } from "../utils/session.js";
import { sendMessage } from "../services/telegramApi.js";
import { getProfileFullByTelegramId, setProfileStatus, deleteProfileByTelegramId } from "../repositories/profilesRepo.js";
import { getSetting } from "../repositories/settingsRepo.js";
import { buildTeManMenuKeyboard } from "./telegram.commands.user.js";
import { buildBackToPartnerModerationKeyboard } from "./callbacks/keyboards.js";
import { fmtClassId, resolveTelegramId } from "../utils/partnerHelpers.js";

export async function handlePartnerModerationInput({ env, chatId, text, session, STATE_KEY }) {
  const action = String(session?.action || "").toLowerCase();
  const raw = String(text || "").trim();

  if (/^(batal|cancel|keluar)$/i.test(raw)) {
    await clearSession(env, STATE_KEY);
    await sendMessage(env, chatId, "✅ Oke, sesi Partner Moderation dibatalkan.", {
      reply_markup: buildBackToPartnerModerationKeyboard(),
    });
    return true;
  }

  const targetId = await resolveTelegramId(env, raw);
  if (!targetId) {
    await sendMessage(
      env,
      chatId,
      "⚠️ Target tidak valid / tidak ditemukan.\nKirim <b>@username</b> atau <b>telegram_id</b> ya.\n\nKetik <b>batal</b> untuk keluar.",
      { parse_mode: "HTML", reply_markup: buildBackToPartnerModerationKeyboard() }
    );
    return true;
  }

  const profile = await getProfileFullByTelegramId(env, targetId);
  const classId = fmtClassId(profile?.class_id);
  const label = raw.startsWith("@") ? raw : targetId;

  if (!["activate", "suspend", "delete"].includes(action)) {
    await clearSession(env, STATE_KEY);
    await sendMessage(env, chatId, "⚠️ Aksi moderation tidak valid. Balik ke menu ya.", {
      reply_markup: buildBackToPartnerModerationKeyboard(),
    });
    return true;
  }

  if (action === "delete") {
    await deleteProfileByTelegramId(env, targetId);
    await clearSession(env, STATE_KEY);
    await sendMessage(env, chatId, `❌ Partner ${label} berhasil dihapus.\nClass ID: ${classId}`, {
      reply_markup: buildBackToPartnerModerationKeyboard(),
    });
    return true;
  }

  if (action === "suspend") {
    await setProfileStatus(env, targetId, "suspended");
    await clearSession(env, STATE_KEY);

    await sendMessage(
      env,
      targetId,
      "⛔ Akun kamu telah di *SUSPENDED*.\n\nSemua *FITUR PROMOSI* dihentikan!\n\nSilakan hubungi admin.",
      { parse_mode: "Markdown", reply_markup: buildTeManMenuKeyboard() }
    ).catch(() => {});

    await sendMessage(env, chatId, `✅ Partner ${label} berhasil di-suspend (suspended).\nClass ID: ${classId}`, {
      reply_markup: buildBackToPartnerModerationKeyboard(),
    });
    return true;
  }

  if (action === "activate") {
    await setProfileStatus(env, targetId, "active");
    await clearSession(env, STATE_KEY);

    const link = (await getSetting(env, "link_aturan")) ?? "-";
    await sendMessage(
      env,
      targetId,
      `✅ Akun kamu telah *AKTIF*.\n\nSemua *FITUR PROMOSI* siap digunakan.\n\nIkuti seluruh arahan Admin dan\nBaca *ATURAN MAIN* TeMan:\n${link}`,
      { parse_mode: "Markdown", disable_web_page_preview: true, reply_markup: buildTeManMenuKeyboard() }
    ).catch(() => {});

    await sendMessage(env, chatId, `✅ Partner ${label} berhasil di-activate (active).\nClass ID: ${classId}`, {
      reply_markup: buildBackToPartnerModerationKeyboard(),
    });
    return true;
  }

  return false;
}
