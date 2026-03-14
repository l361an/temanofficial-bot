// routes/callbacks/partner.photo.handlers.js

import {
  sendMessage,
  editMessageReplyMarkup,
} from "../../services/telegramApi.js";

import { saveSession } from "../../utils/session.js";

import { getProfileFullByTelegramId } from "../../repositories/profilesRepo.js";

import {
  buildBackToPartnerDatabaseKeyboard,
} from "./keyboards.partner.js";

import { escapeHtml } from "./shared.js";
import { CALLBACK_PREFIX, SESSION_MODES } from "../telegram.constants.js";

import {
  buildBackAndHomeKeyboard,
} from "./partner.render.js";

export function buildPartnerPhotoDomainHandlers() {
  const EXACT = {};
  const PREFIX = [];

  /**
   * PM_PHOTO_START
   */
  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_PHOTO_START),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;

      const telegramId = String(
        data.slice(CALLBACK_PREFIX.PM_PHOTO_START.length) || ""
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

      await saveSession(env, `state:${adminId}`, {
        mode: SESSION_MODES.PARTNER_EDIT_CLOSEUP,
        targetTelegramId: profile.telegram_id,
      });

      if (msgChatId && msgId) {
        await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      }

      await sendMessage(
        env,
        adminId,
        `📸 <b>Ubah Foto CloseUp</b>\n\n` +
          `Partner: <b>${escapeHtml(profile.nama_lengkap || "-")}</b>\n` +
          `Telegram ID: <code>${escapeHtml(profile.telegram_id || "-")}</code>\n\n` +
          `Silakan kirim <b>foto closeup baru</b> sekarang.\n\n` +
          `Ketik <b>batal</b> untuk keluar.`,
        {
          parse_mode: "HTML",
          reply_markup: buildBackAndHomeKeyboard(profile.telegram_id),
        }
      );

      return true;
    },
  });

  return { EXACT, PREFIX };
}
