// routes/telegram.flow.partnerModeration.js

import { clearSession } from "../utils/session.js";
import { sendMessage } from "../services/telegramApi.js";
import { getProfileFullByTelegramId, deleteProfileByTelegramId } from "../repositories/profilesRepo.js";
import { getSetting } from "../repositories/settingsRepo.js";
import { buildTeManMenuKeyboard } from "./telegram.commands.user.js";
import { buildBackToPartnerModerationKeyboard } from "./callbacks/keyboards.js";
import { fmtClassId, resolveTelegramId } from "../utils/partnerHelpers.js";
import { manualSuspendPartner, manualRestorePartner } from "../services/partnerStatusService.js";

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
  if (!profile) {
    await sendMessage(env, chatId, "⚠️ Data partner tidak ditemukan.", {
      reply_markup: buildBackToPartnerModerationKeyboard(),
    });
    return true;
  }

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
    const res = await manualSuspendPartner(env, targetId, chatId, null);
    await clearSession(env, STATE_KEY);

    await sendMessage(env, targetId, `⛔ ${res.user_message}`, {
      reply_markup: buildTeManMenuKeyboard(),
    }).catch(() => {});

    await sendMessage(
      env,
      chatId,
      `✅ Partner ${label} berhasil di-suspend.\nStatus akhir: ${res.status}\nClass ID: ${classId}`,
      {
        reply_markup: buildBackToPartnerModerationKeyboard(),
      }
    );
    return true;
  }

  if (action === "activate") {
    const res = await manualRestorePartner(env, targetId, chatId, null);
    await clearSession(env, STATE_KEY);

    const link = (await getSetting(env, "link_aturan")) ?? "-";
    const userText =
      res.reason_code === "payment_confirmed"
        ? `${res.user_message}\n\nIkuti seluruh arahan Admin dan\nBaca ATURAN MAIN TeMan:\n${link}`
        : res.user_message;

    await sendMessage(env, targetId, userText, {
      disable_web_page_preview: true,
      reply_markup: buildTeManMenuKeyboard(),
    }).catch(() => {});

    await sendMessage(
      env,
      chatId,
      `✅ Partner ${label} berhasil di-restore.\nStatus akhir: ${res.status}\nClass ID: ${classId}`,
      {
        reply_markup: buildBackToPartnerModerationKeyboard(),
      }
    );
    return true;
  }

  return false;
}
