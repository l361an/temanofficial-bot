// routes/callbacks/partner.handlers.js

import {
  sendMessage,
  editMessageReplyMarkup,
  upsertCallbackMessage,
} from "../../services/telegramApi.js";
import { saveSession, loadSession, clearSession } from "../../utils/session.js";
import { getAdminByTelegramId } from "../../repositories/adminsRepo.js";
import {
  getProfileFullByTelegramId,
  setProfileCategoriesByProfileId,
  updateProfileClassByTelegramId,
} from "../../repositories/profilesRepo.js";

import {
  buildBackToPartnerDatabaseKeyboard,
  buildPartnerClassPickerKeyboard,
  buildPartnerVerificatorPickerKeyboard,
} from "./keyboards.partner.js";
import { escapeHtml, fmtClassId } from "./shared.js";
import { CALLBACK_PREFIX, SESSION_MODES } from "../telegram.constants.js";

import { getPartnerEditFieldMeta } from "./partner.class.js";
import {
  loadCategoryOptions,
  buildCategoryPickerKeyboard,
  PM_CATEGORY_TOGGLE_PREFIX,
  PM_CATEGORY_SAVE_PREFIX,
  PM_CATEGORY_BACK_PREFIX,
} from "./partner.category.js";
import {
  loadEligibleVerificators,
  updatePartnerVerificator,
} from "./partner.verificator.js";
import {
  buildBackAndHomeKeyboard,
  renderActionMenu,
  renderSuccessState,
  sendPartnerDetailOutput,
  PM_PREVIEW_PREFIX,
} from "./partner.render.js";
import { encodeSelectedCategoryIds } from "./partner.utils.js";

export function buildPartnerClassHandlers() {
  const EXACT = {};
  const PREFIX = [];

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_CLASS_START),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;
      const telegramId = String(data.slice(CALLBACK_PREFIX.PM_CLASS_START.length) || "").trim();

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

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_CLASS_SET),
    run: async (ctx) => {
      const { env, data, adminId, msg, msgChatId, msgId } = ctx;
      const payload = String(data.slice(CALLBACK_PREFIX.PM_CLASS_SET.length));
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

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_CLASS_BACK),
    run: async (ctx) => {
      const { env, data, adminId, msg, role } = ctx;
      const telegramId = String(data.slice(CALLBACK_PREFIX.PM_CLASS_BACK.length) || "").trim();

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

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_VER_START),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;
      const telegramId = String(data.slice(CALLBACK_PREFIX.PM_VER_START.length) || "").trim();

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
          reply_markup: buildPartnerVerificatorPickerKeyboard(profile.telegram_id, verificators),
        }
      );

      return true;
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_VER_SET),
    run: async (ctx) => {
      const { env, data, adminId, msg, msgChatId, msgId } = ctx;
      const payload = String(data.slice(CALLBACK_PREFIX.PM_VER_SET.length));
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

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_VER_BACK),
    run: async (ctx) => {
      const { env, data, adminId, msg, role } = ctx;
      const telegramId = String(data.slice(CALLBACK_PREFIX.PM_VER_BACK.length) || "").trim();

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

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_PHOTO_START),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;
      const telegramId = String(data.slice(CALLBACK_PREFIX.PM_PHOTO_START.length) || "").trim();

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

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_EDIT_START),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;
      const payload = String(data.slice(CALLBACK_PREFIX.PM_EDIT_START.length) || "");
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

      if (field === "category") {
        const categories = await loadCategoryOptions(env);

        if (!categories.length) {
          await sendMessage(env, adminId, "⚠️ Belum ada category yang tersedia.", {
            reply_markup: buildBackAndHomeKeyboard(profile.telegram_id),
          });
          return true;
        }

        const selectedIds = profile?.id
          ? await env.DB.prepare(
              `
              SELECT category_id
              FROM profile_categories
              WHERE profile_id = ?
              ORDER BY category_id ASC
            `
            )
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
            reply_markup: buildCategoryPickerKeyboard(profile.telegram_id, categories, selectedIds),
          }
        );

        return true;
      }

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

  PREFIX.push({
    match: (d) => d.startsWith(PM_CATEGORY_TOGGLE_PREFIX),
    run: async (ctx) => {
      const { env, data, adminId, msg } = ctx;
      const payload = String(data.slice(PM_CATEGORY_TOGGLE_PREFIX.length) || "");
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
        reply_markup: buildCategoryPickerKeyboard(profile.telegram_id, categories, nextIds),
      }).catch(async () => {
        await sendMessage(env, adminId, text, {
          parse_mode: "HTML",
          reply_markup: buildCategoryPickerKeyboard(profile.telegram_id, categories, nextIds),
        });
      });

      return true;
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith(PM_CATEGORY_SAVE_PREFIX),
    run: async (ctx) => {
      const { env, data, adminId, msg } = ctx;
      const telegramId = String(data.slice(PM_CATEGORY_SAVE_PREFIX.length) || "").trim();

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

  PREFIX.push({
    match: (d) => d.startsWith(PM_CATEGORY_BACK_PREFIX),
    run: async (ctx) => {
      const { env, data, adminId, msg, role } = ctx;
      const telegramId = String(data.slice(PM_CATEGORY_BACK_PREFIX.length) || "").trim();

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

  PREFIX.push({
    match: (d) => d.startsWith(PM_PREVIEW_PREFIX),
    run: async (ctx) => {
      const { env, data, adminId, role, msgChatId, msgId } = ctx;
      const telegramId = String(data.slice(PM_PREVIEW_PREFIX.length) || "").trim();

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

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_EDIT_BACK),
    run: async (ctx) => {
      const { env, data, adminId, msg, role } = ctx;
      const telegramId = String(data.slice(CALLBACK_PREFIX.PM_EDIT_BACK.length) || "").trim();

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
