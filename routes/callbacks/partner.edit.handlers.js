// routes/callbacks/partner.edit.handlers.js

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

import { getPartnerEditFieldMeta } from "./partner.class.js";

import {
  loadCategoryOptions,
  buildCategoryPickerKeyboard,
} from "./partner.category.js";

import {
  buildBackAndHomeKeyboard,
} from "./partner.render.js";

import { encodeSelectedCategoryIds } from "./partner.utils.js";

export function buildPartnerEditDomainHandlers() {
  const EXACT = {};
  const PREFIX = [];

  /**
   * PM_EDIT_START
   */
  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_EDIT_START),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;

      const payload = String(
        data.slice(CALLBACK_PREFIX.PM_EDIT_START.length) || ""
      );

      const [telegramId, field] = payload.split(":");

      if (!telegramId || !field) {
        await sendMessage(env, adminId, "⚠️ Target partner / field tidak valid.", {
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

      /**
       * CATEGORY EDIT MODE
       */
      if (field === "category") {
        const categories = await loadCategoryOptions(env);

        if (!categories.length) {
          await sendMessage(env, adminId, "⚠️ Belum ada category yang tersedia.", {
            reply_markup: buildBackAndHomeKeyboard(profile.telegram_id),
          });
          return true;
        }

        const selectedIds = profile?.id
          ? await env.DB.prepare(`
              SELECT category_id
              FROM profile_categories
              WHERE profile_id = ?
              ORDER BY category_id ASC
            `)
              .bind(String(profile.id))
              .all()
              .then((res) => (res?.results || []).map((r) => String(r.category_id)))
              .catch(() => [])
          : [];

        await saveSession(env, `state:${adminId}`, {
          mode: "partner_edit_category",
          targetTelegramId: profile.telegram_id,
          categoryIds: encodeSelectedCategoryIds(selectedIds),
        });

        if (msgChatId && msgId) {
          await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
        }

        await sendMessage(
          env,
          adminId,
          `🗂️ <b>Edit Category</b>\n\n` +
            `Partner: <b>${escapeHtml(profile.nama_lengkap || "-")}</b>\n` +
            `Telegram ID: <code>${escapeHtml(profile.telegram_id || "-")}</code>\n\n` +
            `Pilih Category dibawah :`,
          {
            parse_mode: "HTML",
            reply_markup: buildCategoryPickerKeyboard(
              profile.telegram_id,
              categories,
              selectedIds
            ),
          }
        );

        return true;
      }

      /**
       * TEXT FIELD EDIT
       */
      const meta = getPartnerEditFieldMeta(field);

      if (!meta) {
        await sendMessage(env, adminId, "⚠️ Field partner tidak didukung.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      await saveSession(env, `state:${adminId}`, {
        mode: SESSION_MODES.PARTNER_EDIT_TEXT,
        targetTelegramId: profile.telegram_id,
        field: meta.key,
      });

      if (msgChatId && msgId) {
        await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      }

      const currentValue = profile?.[meta.currentKey] ?? "-";

      await sendMessage(
        env,
        adminId,
        `📝 <b>Edit ${escapeHtml(meta.label)}</b>\n\n` +
          `Partner: <b>${escapeHtml(profile.nama_lengkap || "-")}</b>\n` +
          `Telegram ID: <code>${escapeHtml(profile.telegram_id || "-")}</code>\n` +
          `Current: <b>${escapeHtml(currentValue || "-")}</b>\n\n` +
          `${escapeHtml(meta.prompt)}.\n` +
          `Ketik <b>-</b> untuk kosongkan field.\n\n` +
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
