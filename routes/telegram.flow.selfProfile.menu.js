// routes/telegram.flow.selfProfile.menu.js

import { sendMessage } from "../services/telegramApi.js";
import { getProfileFullByTelegramId } from "../repositories/profilesRepo.js";
import { sendHtml, buildTeManMenuKeyboard } from "./telegram.user.shared.js";

export function buildSelfMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👤 Lihat Profile", callback_data: "self:view" }],
      [{ text: "📝 Update Profile", callback_data: "self:update" }],
      [{ text: "💎 Premium Partner", callback_data: "self:payment" }],
    ],
  };
}

export function buildSelfMenuMessage(profile) {
  const nick = profile?.nickname
    ? String(profile.nickname)
    : profile?.nama_lengkap
      ? String(profile.nama_lengkap)
      : "Partner";

  const status = profile?.status ? String(profile.status) : "-";
  return `Halo ${nick} !\nStatus Partner kamu saat ini <b>${status}</b>, apa yang bisa aku bantu ?`;
}

export async function sendSelfMenu(env, chatId, telegramId) {
  const profile = await getProfileFullByTelegramId(env, telegramId);

  if (!profile) {
    await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  await sendMessage(env, chatId, buildSelfMenuMessage(profile), {
    parse_mode: "HTML",
    reply_markup: buildSelfMenuKeyboard(),
    disable_web_page_preview: true,
  });
}
