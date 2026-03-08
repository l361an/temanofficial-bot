// routes/telegram.flow.selfProfile.view.js

import { sendPhoto, sendLongMessage } from "../services/telegramApi.js";
import {
  getProfileFullByTelegramId,
  listCategoryKodesByProfileId,
} from "../repositories/profilesRepo.js";
import { getSubscriptionInfoByTelegramId } from "../repositories/partnerSubscriptionsRepo.js";

import {
  fmtKV,
  cleanHandle,
  sendHtml,
  buildTeManMenuKeyboard,
  formatDateTime,
} from "./telegram.user.shared.js";

function buildMasaAktifText(subInfo) {
  if (!subInfo?.found || !subInfo?.row) return "-";

  const startAt = formatDateTime(subInfo.row.start_at);
  const endAt = formatDateTime(subInfo.row.end_at);

  if (!subInfo.row.start_at && !subInfo.row.end_at) return "-";
  return `${startAt} s.d ${endAt}`;
}

export async function sendSelfProfile(env, chatId, telegramId) {
  const profile = await getProfileFullByTelegramId(env, telegramId);

  if (!profile) {
    await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  const subInfo = await getSubscriptionInfoByTelegramId(env, telegramId);
  const masaAktifText = buildMasaAktifText(subInfo);

  const categories = profile.id
    ? await listCategoryKodesByProfileId(env, profile.id)
    : [];

  const kategoriText = categories.length ? categories.join(", ") : "-";

  const textSummary =
    "🧾 <b>PROFILE</b>\n" +
    fmtKV("Telegram ID", profile.telegram_id) +
    "\n" +
    fmtKV("Username", cleanHandle(profile.username)) +
    "\n" +
    fmtKV("Nama Lengkap", profile.nama_lengkap) +
    "\n" +
    fmtKV("Nickname", profile.nickname) +
    "\n" +
    fmtKV("NIK", profile.nik) +
    "\n" +
    fmtKV("Kategori", kategoriText) +
    "\n" +
    fmtKV("No. Whatsapp", profile.no_whatsapp) +
    "\n" +
    fmtKV("Kecamatan", profile.kecamatan) +
    "\n" +
    fmtKV("Kota", profile.kota) +
    "\n" +
    fmtKV("Status", profile.status) +
    "\n" +
    fmtKV("Masa Aktif", masaAktifText);

  await sendLongMessage(env, chatId, textSummary, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: buildTeManMenuKeyboard(),
  });

  if (profile.foto_closeup_file_id) {
    await sendPhoto(env, chatId, profile.foto_closeup_file_id, "📸 <b>Foto Closeup</b>", {
      parse_mode: "HTML",
      reply_markup: buildTeManMenuKeyboard(),
    });
  }
}
