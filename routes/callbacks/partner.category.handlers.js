// routes/callbacks/partner.category.handlers.js

import {
  sendMessage,
  upsertCallbackMessage,
} from "../../services/telegramApi.js";

import { saveSession, loadSession, clearSession } from "../../utils/session.js";

import {
  getProfileFullByTelegramId,
  setProfileCategoriesByProfileId,
} from "../../repositories/profilesRepo.js";

import {
  buildBackToPartnerDatabaseKeyboard,
} from "./keyboards.partner.js";

import { escapeHtml } from "./shared.js";

import {
  loadCategoryOptions,
  buildCategoryPickerKeyboard,
  PM_CATEGORY_TOGGLE_PREFIX,
  PM_CATEGORY_SAVE_PREFIX,
  PM_CATEGORY_BACK_PREFIX,
} from "./partner.category.js";

import { encodeSelectedCategoryIds } from "./partner.utils.js";

import {
  renderActionMenu,
  renderSuccessState,
} from "./partner.render.js";

export function buildPartnerCategoryDomainHandlers() {
  const EXACT = {};
  const PREFIX = [];

  /**
   * TOGGLE CATEGORY
   */
  PREFIX.push({
    match: (d) => d.startsWith(PM_CATEGORY_TOGGLE_PREFIX),
    run: async (ctx) => {
      const { env, data, adminId, msg } = ctx;

      const payload = String(
        data.slice(PM_CATEGORY_TOGGLE_PREFIX.length) || ""
      );

      const [telegramId, categoryId] = payload.split(":");

      if (!telegramId || !categoryId) {
        await sendMessage(env, adminId, "⚠️ Category target tidak valid.");
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId);

      if (!profile) {
        await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const session = await loadSession(env, `state:${adminId}`).catch(() => null);

      const currentIds = encodeSelectedCategoryIds(session?.categoryIds || []);
      const nextSet = new Set(currentIds);

      if (nextSet.has(String(categoryId))) {
        nextSet.delete(String(categoryId));
      } else {
        nextSet.add(String(categoryId));
      }

      const nextIds = Array.from(nextSet).sort();

      await saveSession(env, `state:${adminId}`, {
        mode: "partner_edit_category",
        targetTelegramId: profile.telegram_id,
        categoryIds: nextIds,
      });

      const categories = await loadCategoryOptions(env);

      const text =
        `🗂️ <b>Edit Category</b>\n\n` +
        `Partner: <b>${escapeHtml(profile.nama_lengkap || "-")}</b>\n` +
        `Telegram ID: <code>${escapeHtml(profile.telegram_id || "-")}</code>\n\n` +
        `Pilih Category dibawah :`;

      await upsertCallbackMessage(env, msg, text, {
        parse_mode: "HTML",
        reply_markup: buildCategoryPickerKeyboard(
          profile.telegram_id,
          categories,
          nextIds
        ),
      }).catch(async () => {
        await sendMessage(env, adminId, text, {
          parse_mode: "HTML",
          reply_markup: buildCategoryPickerKeyboard(
            profile.telegram_id,
            categories,
            nextIds
          ),
        });
      });

      return true;
    },
  });

  /**
   * SAVE CATEGORY
   */
  PREFIX.push({
    match: (d) => d.startsWith(PM_CATEGORY_SAVE_PREFIX),
    run: async (ctx) => {
      const { env, data, adminId, msg } = ctx;

      const telegramId = String(
        data.slice(PM_CATEGORY_SAVE_PREFIX.length) || ""
      ).trim();

      if (!telegramId) {
        await sendMessage(env, adminId, "⚠️ Target partner tidak valid.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId);

      if (!profile?.id) {
        await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const session = await loadSession(env, `state:${adminId}`).catch(() => null);
      const selectedIds = encodeSelectedCategoryIds(session?.categoryIds || []);

      await setProfileCategoriesByProfileId(env, profile.id, selectedIds);

      await clearSession(env, `state:${adminId}`).catch(() => {});

      await renderSuccessState(env, adminId, telegramId, "Category", msg);

      return true;
    },
  });

  /**
   * BACK
   */
  PREFIX.push({
    match: (d) => d.startsWith(PM_CATEGORY_BACK_PREFIX),
    run: async (ctx) => {
      const { env, data, adminId, msg, role } = ctx;

      const telegramId = String(
        data.slice(PM_CATEGORY_BACK_PREFIX.length) || ""
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
