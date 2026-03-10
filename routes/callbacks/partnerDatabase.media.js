// routes/callbacks/partnerDatabase.media.js
import { sendMessage, sendPhoto } from "../../services/telegramApi.js";

function collectPartnerPhotos(profile) {
  return [
    { fileId: profile?.foto_closeup_file_id, label: "📸 Foto Closeup" },
    { fileId: profile?.foto_fullbody_file_id, label: "📸 Foto Fullbody" },
    { fileId: profile?.foto_ktp_file_id, label: "🪪 Foto KTP" },
  ].filter((item) => item.fileId);
}

export async function sendPartnerDetailsMediaAnchor(
  env,
  adminId,
  profile,
  detailsText,
  replyMarkup
) {
  const photos = collectPartnerPhotos(profile);

  if (!photos.length) {
    const res = await sendMessage(env, adminId, detailsText, {
      parse_mode: "HTML",
      reply_markup: replyMarkup,
      disable_web_page_preview: true,
    });
    return {
      anchor_chat_id: adminId,
      anchor_message_id: res?.result?.message_id ?? null,
      used_photo_anchor: false,
    };
  }

  for (let i = 0; i < photos.length; i += 1) {
    const item = photos[i];
    const isLast = i === photos.length - 1;

    const res = await sendPhoto(
      env,
      adminId,
      item.fileId,
      isLast ? detailsText : item.label,
      isLast
        ? {
            parse_mode: "HTML",
            reply_markup: replyMarkup,
          }
        : {
            parse_mode: "HTML",
          }
    ).catch(() => null);

    if (isLast) {
      return {
        anchor_chat_id: adminId,
        anchor_message_id: res?.result?.message_id ?? null,
        used_photo_anchor: true,
      };
    }
  }

  const fallback = await sendMessage(env, adminId, detailsText, {
    parse_mode: "HTML",
    reply_markup: replyMarkup,
    disable_web_page_preview: true,
  });

  return {
    anchor_chat_id: adminId,
    anchor_message_id: fallback?.result?.message_id ?? null,
    used_photo_anchor: false,
  };
}
