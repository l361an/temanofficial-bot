// routes/telegram.flow.partnerCloseup.js

import { clearSession } from "../utils/session.js";
import { sendMessage } from "../services/telegramApi.js";
import { getProfileFullByTelegramId, updateCloseupPhoto } from "../repositories/profilesRepo.js";
import { buildBackToPartnerDatabaseViewKeyboard, buildPartnerDetailActionsKeyboard } from "./callbacks/keyboards.partner.js";
import { sendPartnerDetailOutput } from "./callbacks/partnerClass.js";

export async function handlePartnerCloseupInput({ env, chatId, text, session, STATE_KEY, role, update }) {
  const raw = String(text || "").trim();
  const telegramId = String(session?.targetTelegramId || "").trim();

  if (!telegramId) {
    await clearSession(env, STATE_KEY);
    await sendMessage(env, chatId, "⚠️ Target partner tidak valid.", {
      reply_markup: buildBackToPartnerDatabaseViewKeyboard(),
    });
    return true;
  }

  if (/^(batal|cancel|keluar)$/i.test(raw)) {
    await clearSession(env, STATE_KEY);

    const profile = await getProfileFullByTelegramId(env, telegramId);
    if (!profile) {
      await sendMessage(env, chatId, "✅ Oke, ubah foto closeup dibatalkan.", {
        reply_markup: buildBackToPartnerDatabaseViewKeyboard(),
      });
      return true;
    }

    await sendMessage(env, chatId, "✅ Oke, ubah foto closeup dibatalkan.", {
      reply_markup: buildPartnerDetailActionsKeyboard(profile.telegram_id, role),
    });
    return true;
  }

  const photos = update?.message?.photo || [];
  const best = photos.length ? photos[photos.length - 1] : null;
  const fileId = best?.file_id ? String(best.file_id) : "";

  if (!fileId) {
    const profile = await getProfileFullByTelegramId(env, telegramId);
    await sendMessage(
      env,
      chatId,
      "⚠️ Kirim <b>foto closeup baru</b> ya, bukan teks.\n\nKetik <b>batal</b> untuk keluar.",
      {
        parse_mode: "HTML",
        reply_markup: profile
          ? buildPartnerDetailActionsKeyboard(profile.telegram_id, role)
          : buildBackToPartnerDatabaseViewKeyboard(),
      }
    );
    return true;
  }

  const res = await updateCloseupPhoto(env, telegramId, fileId);
  if (!res.ok) {
    await clearSession(env, STATE_KEY);
    await sendMessage(env, chatId, "⚠️ Gagal mengubah foto closeup partner.", {
      reply_markup: buildBackToPartnerDatabaseViewKeyboard(),
    });
    return true;
  }

  await clearSession(env, STATE_KEY);

  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile) {
    await sendMessage(env, chatId, "✅ Foto closeup partner berhasil diubah.", {
      reply_markup: buildBackToPartnerDatabaseViewKeyboard(),
    });
    return true;
  }

  await sendMessage(env, chatId, "✅ Foto closeup partner berhasil diubah.");
  await sendPartnerDetailOutput(env, chatId, role, profile);
  return true;
}
