// routes/callbacks/partner.preview.handlers.js

import {
  sendMessage,
  editMessageReplyMarkup,
} from "../../services/telegramApi.js";

import { getProfileFullByTelegramId } from "../../repositories/profilesRepo.js";

import {
  buildBackToPartnerDatabaseKeyboard,
} from "./keyboards.partner.js";

import { CALLBACK_PREFIX } from "../telegram.constants.js";

import {
  renderActionMenu,
  sendPartnerDetailOutput,
  PM_PREVIEW_PREFIX,
} from "./partner.render.js";

export function buildPartnerPreviewDomainHandlers() {
  const EXACT = {};
  const PREFIX = [];

  /**
   * PREVIEW PARTNER
   */
  PREFIX.push({
    match: (d) => d.startsWith(PM_PREVIEW_PREFIX),
    run: async (ctx) => {
      const { env, data, adminId, role, msgChatId, msgId } = ctx;

      const telegramId = String(
        data.slice(PM_PREVIEW_PREFIX.length) || ""
      ).trim();

      if (!telegramId) {
        await sendMessage(env, adminId, "⚠️ Target partner tidak valid.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId);

      if (!profile) {
        await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      if (msgChatId && msgId) {
        await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      }

      await sendPartnerDetailOutput(env, adminId, role, profile);

      return true;
    },
  });

  /**
   * BACK TO EDIT MENU
   */
  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_EDIT_BACK),
    run: async (ctx) => {
      const { env, data, adminId, msg, role } = ctx;

      const telegramId = String(
        data.slice(CALLBACK_PREFIX.PM_EDIT_BACK.length) || ""
      ).trim();

      if (!telegramId) {
        await sendMessage(env, adminId, "⚠️ Target partner tidak valid.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      await renderActionMenu(env, adminId, telegramId, role, msg);

      return true;
    },
  });

  return { EXACT, PREFIX };
}
