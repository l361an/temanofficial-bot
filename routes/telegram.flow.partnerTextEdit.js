// routes/telegram.flow.partnerTextEdit.js

import { sendMessage } from "../services/telegramApi.js";
import { clearSession } from "../utils/session.js";
import {
  updateEditableProfileFields,
} from "../repositories/profilesRepo.js";
import { CALLBACKS, cb } from "./telegram.constants.js";

const PM_PREVIEW_PREFIX = "pm_preview:";

function normalizeText(text) {
  return String(text || "").trim();
}

function normalizeWhatsapp(value) {
  return String(value || "").replace(/\D/g, "");
}

function buildSuccessKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [
        { text: "⬅️ Back", callback_data: cb.pmEditBack(telegramId) },
        { text: "👁️ Preview", callback_data: `${PM_PREVIEW_PREFIX}${telegramId}` },
      ],
      [{ text: "🏠 Officer Home", callback_data: CALLBACKS.OFFICER_HOME }],
    ],
  };
}

function getFieldMeta(field) {
  const key = String(field || "").trim();

  if (key === "nama_lengkap") {
    return { key, label: "Nama Lengkap", max: 150 };
  }
  if (key === "nickname") {
    return { key, label: "Nickname", max: 100 };
  }
  if (key === "no_whatsapp") {
    return { key, label: "No. Whatsapp", max: 40 };
  }
  if (key === "nik") {
    return { key, label: "NIK", max: 32 };
  }
  if (key === "kecamatan") {
    return { key, label: "Kecamatan", max: 120 };
  }
  if (key === "kota") {
    return { key, label: "Kota", max: 120 };
  }
  if (key === "channel_url") {
    return { key, label: "Channel", max: 255 };
  }

  return null;
}

export async function handlePartnerTextEditInput({
  env,
  chatId,
  text,
  session,
  STATE_KEY,
}) {
  if (String(session?.mode || "").trim().toLowerCase() !== "partner_edit_text") {
    return false;
  }

  const rawText = normalizeText(text);

  if (/^(batal|cancel|keluar)$/i.test(rawText)) {
    await clearSession(env, STATE_KEY).catch(() => {});
    await sendMessage(env, chatId, "✅ Edit profile partner dibatalkan.");
    return true;
  }

  const targetTelegramId = String(session?.targetTelegramId || "").trim();
  const meta = getFieldMeta(session?.field);

  if (!targetTelegramId || !meta) {
    await clearSession(env, STATE_KEY).catch(() => {});
    await sendMessage(env, chatId, "⚠️ Session edit partner tidak valid.");
    return true;
  }

  let nextValue = rawText;
  if (rawText === "-") nextValue = "";

  if (meta.key === "no_whatsapp") {
    nextValue = nextValue ? normalizeWhatsapp(nextValue) : "";
  }

  if (meta.key === "nik" && nextValue && !/^\d+$/.test(nextValue)) {
    await sendMessage(
      env,
      chatId,
      "⚠️ NIK harus berupa angka saja.\n\nKirim ulang atau ketik batal."
    );
    return true;
  }

  if (nextValue.length > meta.max) {
    await sendMessage(
      env,
      chatId,
      `⚠️ ${meta.label} terlalu panjang. Maksimal ${meta.max} karakter.\n\nKirim ulang atau ketik batal.`
    );
    return true;
  }

  const patch = { [meta.key]: nextValue };

  const res = await updateEditableProfileFields(env, targetTelegramId, patch);
  if (!res?.ok) {
    await clearSession(env, STATE_KEY).catch(() => {});
    await sendMessage(env, chatId, "⚠️ Gagal update profile partner.");
    return true;
  }

  await clearSession(env, STATE_KEY).catch(() => {});

  await sendMessage(
    env,
    chatId,
    `✅ Data ${meta.label} berhasil diupdate !!!`,
    {
      reply_markup: buildSuccessKeyboard(targetTelegramId),
    }
  );

  return true;
}
