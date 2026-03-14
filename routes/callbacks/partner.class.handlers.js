// routes/callbacks/partner.class.handlers.js

import {
  sendMessage,
  editMessageReplyMarkup,
} from "../../services/telegramApi.js";

import {
  getProfileFullByTelegramId,
  updateProfileClassByTelegramId,
} from "../../repositories/profilesRepo.js";

import {
  buildBackToPartnerDatabaseKeyboard,
  buildPartnerClassPickerKeyboard,
} from "./keyboards.partner.js";

import { escapeHtml, fmtClassId } from "./shared.js";
import { CALLBACK_PREFIX } from "../telegram.constants.js";

import {
  renderActionMenu,
  renderSuccessState,
} from "./partner.render.js";

export function buildPartnerClassDomainHandlers() {
  const EXACT = {};
  const PREFIX = [];

  /**
   * PM_CLASS_START
   */
  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_CLASS_START),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;

      const telegramId = String(
        data.slice(CALLBACK_PREFIX.PM_CLASS_START.length) || ""
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

      await sendMessage(
        env,
        adminId,
        `🏷️ <b>Ubah Class Partner</b>\n\n` +
          `Partner: <b>${escapeHtml(profile.nama_lengkap || "-")}</b>\n` +
          `Telegram ID: <code>${escapeHtml(profile.telegram_id || "-")}</code>\n` +
          `Class saat ini: <b>${escapeHtml(fmtClassId(profile.class_id))}</b>\n\n` +
          `Pilih class baru dibawah :`,
        {
          parse_mode: "HTML",
          reply_markup: buildPartnerClassPickerKeyboard(profile.telegram_id),
        }
      );

      return true;
    },
  });

  /**
   * PM_CLASS_SET
   */
  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_CLASS_SET),
    run: async (ctx) => {
      const { env, data, adminId, msg, msgChatId, msgId } = ctx;

      const payload = String(
        data.slice(CALLBACK_PREFIX.PM_CLASS_SET.length)
      );

      const [telegramId, classId] = payload.split(":");

      if (!telegramId) {
        await sendMessage(env, adminId, "⚠️ Target partner tidak valid.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const res = await updateProfileClassByTelegramId(env, telegramId, classId);

      if (!res.ok) {
        const msgText =
          res.reason === "invalid_class_id"
            ? "⚠️ Class ID tidak valid. Pilih Bronze, Gold, atau Platinum."
            : res.reason === "not_found"
            ? "⚠️ Data partner tidak ditemukan."
            : "⚠️ Gagal mengubah class partner.";

        await sendMessage(env, adminId, msgText, {
          reply_markup:
            res.reason === "invalid_class_id"
              ? buildPartnerClassPickerKeyboard(telegramId)
              : buildBackToPartnerDatabaseKeyboard(),
        });

        return true;
      }

      if (msgChatId && msgId) {
        await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      }

      await renderSuccessState(env, adminId, telegramId, "Class", msg);

      return true;
    },
  });

  /**
   * PM_CLASS_BACK
   */
  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_CLASS_BACK),
    run: async (ctx) => {
      const { env, data, adminId, msg, role } = ctx;

      const telegramId = String(
        data.slice(CALLBACK_PREFIX.PM_CLASS_BACK.length) || ""
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
