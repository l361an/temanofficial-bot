// routes/telegram.flow.partnerTextEdit.js

import { sendMessage } from "../services/telegramApi.js";
import { clearSession } from "../utils/session.js";
import {
  getProfileFullByTelegramId,
  updateEditableProfileFields,
} from "../repositories/profilesRepo.js";
import { sendPartnerDetailOutput } from "./callbacks/partnerClass.js";

function normalizeText(text) {
  return String(text || "").trim();
}

function getFieldMeta(field) {
  const key = String(field || "").trim();
  if (key === "nickname") {
    return { key, label: "Nickname", max: 100 };
  }
  if (key === "no_whatsapp") {
    return { key, label: "No. Whatsapp", max: 40 };
  }
  if (key === "kecamatan") {
    return { key, label: "Kecamatan", max: 120 };
  }
  if (key === "kota") {
    return { key, label: "Kota", max: 120 };
  }
  return null;
}

export async function handlePartnerTextEditInput({
  env,
  chatId,
  text,
  session,
  STATE_KEY,
  role,
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

  const profile = await getProfileFullByTelegramId(env, targetTelegramId);
  if (!profile) {
    await sendMessage(env, chatId, `✅ ${meta.label} berhasil diupdate.`);
    return true;
  }

  await sendMessage(env, chatId, `✅ ${meta.label} berhasil diupdate.`);
  await sendPartnerDetailOutput(env, chatId, role, profile);
  return true;
}
