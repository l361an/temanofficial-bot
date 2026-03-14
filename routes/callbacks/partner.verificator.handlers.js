// routes/callbacks/partner.verificator.handlers.js

import {
  sendMessage,
  editMessageReplyMarkup,
} from "../../services/telegramApi.js";

import { getAdminByTelegramId } from "../../repositories/adminsRepo.js";
import { getProfileFullByTelegramId } from "../../repositories/profilesRepo.js";

import {
  buildBackToPartnerDatabaseKeyboard,
  buildPartnerVerificatorPickerKeyboard,
} from "./keyboards.partner.js";

import { escapeHtml } from "./shared.js";
import { CALLBACK_PREFIX } from "../telegram.constants.js";

import {
  loadEligibleVerificators,
  updatePartnerVerificator,
} from "./partner.verificator.js";

import {
  buildBackAndHomeKeyboard,
  renderActionMenu,
  renderSuccessState,
} from "./partner.render.js";

export function buildPartnerVerificatorDomainHandlers() {
  const EXACT = {};
  const PREFIX = [];

  /**
   * PM_VER_START
   */
  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_VER_START),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;

      const telegramId = String(
        data.slice(CALLBACK_PREFIX.PM_VER_START.length) || ""
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

      const verificators = await loadEligibleVerificators(env);

      if (!verificators.length) {
        await sendMessage(env, adminId, "⚠️ Tidak ada verificator aktif di tabel admins.", {
          reply_markup: buildBackAndHomeKeyboard(profile.telegram_id),
        });
        return true;
      }

      if (msgChatId && msgId) {
        await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      }

      await sendMessage(
        env,
        adminId,
        `👤 <b>Ubah Verificator Partner</b>\n\n` +
          `Partner: <b>${escapeHtml(profile.nama_lengkap || "-")}</b>\n` +
          `Telegram ID: <code>${escapeHtml(profile.telegram_id || "-")}</code>\n\n` +
          `Pilih Verificator dibawah :`,
        {
          parse_mode: "HTML",
          reply_markup: buildPartnerVerificatorPickerKeyboard(
            profile.telegram_id,
            verificators
          ),
        }
      );

      return true;
    },
  });

  /**
   * PM_VER_SET
   */
  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_VER_SET),
    run: async (ctx) => {
      const { env, data, adminId, msg, msgChatId, msgId } = ctx;

      const payload = String(
        data.slice(CALLBACK_PREFIX.PM_VER_SET.length)
      );

      const [telegramId, verificatorId] = payload.split(":");

      if (!telegramId || !verificatorId) {
        await sendMessage(env, adminId, "⚠️ Target partner / verificator tidak valid.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const adminRow = await getAdminByTelegramId(env, verificatorId);

      if (!adminRow) {
        await sendMessage(env, adminId, "⚠️ Verificator tidak ditemukan di tabel admins.");
        return true;
      }

      if (!["owner", "admin", "superadmin"].includes(String(adminRow.normRole || "").toLowerCase())) {
        await sendMessage(env, adminId, "⚠️ Role ini tidak bisa jadi verificator.");
        return true;
      }

      const res = await updatePartnerVerificator(env, telegramId, verificatorId);

      if (!res.ok) {
        const msgText =
          res.reason === "not_found"
            ? "⚠️ Data partner tidak ditemukan."
            : "⚠️ Gagal mengubah verificator partner.";

        await sendMessage(env, adminId, msgText, {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });

        return true;
      }

      if (msgChatId && msgId) {
        await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      }

      await renderSuccessState(env, adminId, telegramId, "Verificator", msg);

      return true;
    },
  });

  /**
   * PM_VER_BACK
   */
  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_VER_BACK),
    run: async (ctx) => {
      const { env, data, adminId, msg, role } = ctx;

      const telegramId = String(
        data.slice(CALLBACK_PREFIX.PM_VER_BACK.length) || ""
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
