// routes/telegram.flow.partnerCloseupEdit.js

import { clearSession } from "../utils/session.js";
import { sendMessage } from "../services/telegramApi.js";
import { updateCloseupPhoto } from "../repositories/profilesRepo.js";
import { buildOfficerHomeKeyboard } from "./callbacks/keyboards.officer.js";
import { SESSION_MODES, CALLBACKS, CALLBACK_PREFIX } from "./telegram.constants.js";

const PM_PREVIEW_PREFIX = "pm_preview:";

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

export async function handlePartnerCloseupEditInput({
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
