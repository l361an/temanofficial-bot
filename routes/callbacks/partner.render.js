// routes/callbacks/partner.render.js

import {
  sendMessage,
  upsertCallbackMessage,
} from "../../services/telegramApi.js";

import { CALLBACK_PREFIX, CALLBACKS } from "../telegram.constants.js";

import { escapeHtml, fmtClassId } from "./shared.js";

/**
 * Keyboard Back + Home
 */
export function buildBackAndHomeKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [
        {
          text: "⬅️ Back",
          callback_data: `${CALLBACK_PREFIX.PM_EDIT_BACK}${telegramId}`,
        },
      ],
      [
        {
          text: "🏠 Officer Home",
          callback_data: CALLBACKS.OFFICER_HOME,
        },
      ],
    ],
  };
}

/**
 * Render Action Menu
 */
export async function renderActionMenu(env, adminId, telegramId, role, msg) {
  const text =
    `⚙️ <b>Partner Action Menu</b>\n\n` +
    `Telegram ID: <code>${escapeHtml(telegramId)}</code>\n\n` +
    `Pilih aksi yang ingin dilakukan.`;

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "🏷 Class",
          callback_data: `${CALLBACK_PREFIX.PM_CLASS_START}${telegramId}`,
        },
        {
          text: "👤 Verificator",
          callback_data: `${CALLBACK_PREFIX.PM_VER_START}${telegramId}`,
        },
      ],
      [
        {
          text: "📸 Photo",
          callback_data: `${CALLBACK_PREFIX.PM_PHOTO_START}${telegramId}`,
        },
        {
          text: "✏️ Edit",
          callback_data: `${CALLBACK_PREFIX.PM_EDIT_START}${telegramId}:nama`,
        },
      ],
      [
        {
          text: "👁 Preview",
          callback_data: `pm:preview:${telegramId}`,
        },
      ],
      [
        {
          text: "🏠 Officer Home",
          callback_data: CALLBACKS.OFFICER_HOME,
        },
      ],
    ],
  };

  const extra = {
    parse_mode: "HTML",
    reply_markup: keyboard,
  };

  if (msg) {
    await upsertCallbackMessage(env, msg, text, extra).catch(async () => {
      await sendMessage(env, adminId, text, extra);
    });
    return true;
  }

  await sendMessage(env, adminId, text, extra);
  return true;
}

/**
 * Success State
 */
export async function renderSuccessState(env, adminId, telegramId, label, msg) {

  const text =
    `✅ <b>Update ${escapeHtml(label)} Berhasil</b>\n\n` +
    `Perubahan data partner telah disimpan.\n\n` +
    `Telegram ID: <code>${escapeHtml(telegramId)}</code>\n\n` +
    `Silakan lanjutkan aksi berikutnya.`;

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "⬅️ Back",
          callback_data: `${CALLBACK_PREFIX.PM_EDIT_BACK}${telegramId}`,
        },
        {
          text: "👁 Preview",
          callback_data: `pm:preview:${telegramId}`,
        },
      ],
      [
        {
          text: "🏠 Officer Home",
          callback_data: CALLBACKS.OFFICER_HOME,
        },
      ],
    ],
  };

  const extra = {
    parse_mode: "HTML",
    reply_markup: keyboard,
  };

  if (msg) {
    await upsertCallbackMessage(env, msg, text, extra).catch(async () => {
      await sendMessage(env, adminId, text, extra);
    });
    return true;
  }

  await sendMessage(env, adminId, text, extra);
  return true;
}

/**
 * Partner Detail Output
 */
export async function sendPartnerDetailOutput(env, adminId, role, profile) {

  const text =
    `👤 <b>Partner Detail</b>\n\n` +
    `Nama: <b>${escapeHtml(profile.nama_lengkap || "-")}</b>\n` +
    `Telegram ID: <code>${escapeHtml(profile.telegram_id || "-")}</code>\n` +
    `Class: <b>${escapeHtml(fmtClassId(profile.class_id))}</b>\n`;

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "⬅️ Back",
          callback_data: `${CALLBACK_PREFIX.PM_EDIT_BACK}${profile.telegram_id}`,
        },
      ],
      [
        {
          text: "🏠 Officer Home",
          callback_data: CALLBACKS.OFFICER_HOME,
        },
      ],
    ],
  };

  await sendMessage(env, adminId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}
