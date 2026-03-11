// routes/telegram.flow.selfProfile.js

import { sendMessage } from "../services/telegramApi.js";
import { saveSession } from "../utils/session.js";
import {
  getProfileByTelegramId,
  getProfileFullByTelegramId,
} from "../repositories/profilesRepo.js";

import { sendHtml, buildTeManMenuKeyboard } from "./telegram.user.shared.js";
import {
  buildSelfMenuKeyboard,
  buildSelfMenuMessage,
  sendSelfMenu,
} from "./telegram.flow.selfProfile.menu.js";
import { sendSelfProfile } from "./telegram.flow.selfProfile.view.js";
import {
  handleSelfProfileEditCallback,
  handleUserProfileEditFlow,
} from "./telegram.flow.selfProfile.edit.js";

export {
  buildSelfMenuKeyboard,
  buildSelfMenuMessage,
  handleUserProfileEditFlow,
  sendSelfMenu,
  sendSelfProfile,
};

export async function handleSelfProfileInlineCallback(update, env) {
  const data = update?.callback_query?.data || "";
  const msg = update?.callback_query?.message;
  const chatId = msg?.chat?.id;
  const telegramId = String(update?.callback_query?.from?.id || "");
  const STATE_KEY = `state:${telegramId}`;

  if (!chatId || !telegramId) return true;

  if (data === "teman:menu") {
    const existing = await getProfileByTelegramId(env, telegramId).catch(() => null);

    if (existing?.telegram_id) {
      await sendSelfMenu(env, chatId, telegramId, { sourceMessage: msg });
      return true;
    }

    await saveSession(env, STATE_KEY, { step: "input_nama", data: {} });
    await sendMessage(env, chatId, "Masukkan Nama Lengkap:");
    return true;
  }

  const ensureRegistered = async () => {
    const profile = await getProfileFullByTelegramId(env, telegramId).catch(() => null);

    if (!profile) {
      await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return null;
    }

    return profile;
  };

  if (data === "self:view") {
    const profile = await ensureRegistered();
    if (!profile) return true;

    await sendSelfProfile(env, chatId, telegramId);
    return true;
  }

  if (data === "self:update" || data.startsWith("self:edit:")) {
    const profile = await ensureRegistered();
    if (!profile) return true;

    return handleSelfProfileEditCallback({
      env,
      chatId,
      telegramId,
      STATE_KEY,
      data,
      sourceMessage: msg,
    });
  }

  return false;
}
