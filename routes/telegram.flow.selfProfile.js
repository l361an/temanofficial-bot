// routes/telegram.flow.selfProfile.js

import { sendMessage, upsertCallbackMessage } from "../services/telegramApi.js";
import { saveSession } from "../utils/session.js";
import {
  getProfileByTelegramId,
  getProfileFullByTelegramId,
  setCatalogVisibilityByTelegramId,
} from "../repositories/profilesRepo.js";
import { getSubscriptionInfoByTelegramId } from "../repositories/partnerSubscriptionsRepo.js";

import { sendHtml, buildTeManMenuKeyboard } from "./telegram.user.shared.js";
import { CALLBACKS } from "./telegram.constants.js";
import {
  buildSelfMenuKeyboard,
  buildSelfMenuMessage,
  sendSelfMenu,
} from "./telegram.flow.selfProfile.menu.js";
import { sendSelfProfile, hasPremiumAccess } from "./telegram.flow.selfProfile.view.js";
import {
  handleSelfProfileEditCallback,
  handleUserProfileEditFlow,
} from "./telegram.flow.selfProfile.edit.js";

export {
  buildSelfMenuKeyboard,
  buildSelfMenuMessage,
  handleUserProfileEditFlow,
};

async function denyCatalogToggle(env, chatId, profile, sourceMessage = null) {
  let safeProfile = profile;

  if (Number(profile?.is_catalog_visible || 0) === 1) {
    await setCatalogVisibilityByTelegramId(env, profile.telegram_id, 0).catch(() => {});

    safeProfile =
      (await getProfileFullByTelegramId(env, profile.telegram_id).catch(() => null)) || {
        ...profile,
        is_catalog_visible: 0,
      };
  }

  const text = [
    "⚠️ <b>Premium Partner belum aktif.</b>",
    "",
    "Status katalog tetap: <b>OFF</b>",
  ].join("\n");

  const extra = {
    parse_mode: "HTML",
    reply_markup: buildSelfMenuKeyboard(safeProfile, { premiumActive: false }),
    disable_web_page_preview: true,
  };

  if (sourceMessage) {
    await upsertCallbackMessage(env, sourceMessage, text, extra);
    return;
  }

  await sendMessage(env, chatId, text, extra);
}

async function confirmCatalogToggle(env, chatId, profile, sourceMessage = null) {
  const isVisible = Number(profile?.is_catalog_visible || 0) === 1;

  const text = [
    "✅ <b>Visibilitas katalog berhasil diupdate.</b>",
    "",
    `Status katalog sekarang: <b>${isVisible ? "ON" : "OFF"}</b>`,
  ].join("\n");

  const extra = {
    parse_mode: "HTML",
    reply_markup: buildSelfMenuKeyboard(profile, { premiumActive: true }),
    disable_web_page_preview: true,
  };

  if (sourceMessage) {
    await upsertCallbackMessage(env, sourceMessage, text, extra);
    return;
  }

  await sendMessage(env, chatId, text, extra);
}

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
    const p = await getProfileFullByTelegramId(env, telegramId);
    if (!p) {
      await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return null;
    }
    return p;
  };

  if (data === "self:view") {
    const p = await ensureRegistered();
    if (!p) return true;

    await sendSelfProfile(env, chatId, telegramId);
    return true;
  }

  if (data === CALLBACKS.SELF_CATALOG_TOGGLE) {
    const profile = await ensureRegistered();
    if (!profile) return true;

    const subInfo = await getSubscriptionInfoByTelegramId(env, telegramId);

    if (!hasPremiumAccess(profile, subInfo)) {
      await denyCatalogToggle(env, chatId, profile, msg);
      return true;
    }

    const nextVisible = Number(profile?.is_catalog_visible || 0) === 1 ? 0 : 1;

    await setCatalogVisibilityByTelegramId(env, telegramId, nextVisible);

    const freshProfile = await getProfileFullByTelegramId(env, telegramId);

    if (!freshProfile) {
      await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return true;
    }

    await confirmCatalogToggle(env, chatId, freshProfile, msg);
    return true;
  }

  if (data === "self:update" || data.startsWith("self:edit:")) {
    const p = await ensureRegistered();
    if (!p) return true;

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
