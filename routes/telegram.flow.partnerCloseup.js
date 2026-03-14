// routes/telegram.flow.partnerCloseup.js

import { clearSession } from "../utils/session.js";
import { sendMessage } from "../services/telegramApi.js";
import {
  getProfileFullByTelegramId,
  updateCloseupPhoto,
} from "../repositories/profilesRepo.js";
import {
  buildBackToPartnerDatabaseKeyboard,
} from "./callbacks/keyboards.partner.js";
import {
  CALLBACKS,
  CALLBACK_PREFIX,
} from "./telegram.constants.js";

const PM_PREVIEW_PREFIX = "pm_preview:";

function buildPartnerPhotoSuccessKeyboard(telegramId) {
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

export async function handlePartnerCloseupInput({
  env,
  chatId,
  text,
  session,
  STATE_KEY,
  role,
  update,
}) {
  const raw = String(text || "").trim();
  const telegramId = String(session?.targetTelegramId || "").trim();

  if (!telegramId) {
    await clearSession(env, STATE_KEY).catch(() => {});
    await sendMessage(env, chatId, "⚠️ Target partner tidak valid.", {
      reply_markup: buildBackToPartnerDatabaseKeyboard(),
    });
    return true;
  }

  if (/^(batal|cancel|keluar)$/i.test(raw)) {
    await clearSession(env, STATE_KEY).catch(() => {});
    await sendMessage(env, chatId, "✅ Oke, ubah foto closeup dibatalkan.", {
      reply_markup: buildPartnerPhotoSuccessKeyboard(telegramId),
    });
    return true;
  }

  const photos = update?.message?.photo || [];
  const best = photos.length ? photos[photos.length - 1] : null;
  const fileId = best?.file_id ? String(best.file_id) : "";

  if (!fileId) {
    await sendMessage(
      env,
      chatId,
      "⚠️ Kirim <b>foto closeup baru</b> ya, bukan teks.\n\nKetik <b>batal</b> untuk keluar.",
      {
        parse_mode: "HTML",
        reply_markup: buildPartnerPhotoSuccessKeyboard(telegramId),
      }
    );
    return true;
  }

  const res = await updateCloseupPhoto(env, telegramId, fileId);
  if (!res?.ok) {
    await clearSession(env, STATE_KEY).catch(() => {});
    await sendMessage(env, chatId, "⚠️ Gagal mengubah foto closeup partner.", {
      reply_markup: buildBackToPartnerDatabaseKeyboard(),
    });
    return true;
  }

  await clearSession(env, STATE_KEY).catch(() => {});

  const profile = await getProfileFullByTelegramId(env, telegramId).catch(() => null);

  await sendMessage(
    env,
    chatId,
    "✅ Foto closeup partner berhasil diupdate !!!",
    {
      reply_markup: buildPartnerPhotoSuccessKeyboard(
        profile?.telegram_id || telegramId
      ),
    }
  );

  return true;
}
