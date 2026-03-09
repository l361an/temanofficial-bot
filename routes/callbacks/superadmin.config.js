// routes/callbacks/superadmin.config.js

import { sendMessage, editMessageReplyMarkup } from "../../services/telegramApi.js";
import { getSetting, upsertSetting } from "../../repositories/settingsRepo.js";
import { saveSession, clearSession } from "../../utils/session.js";

import {
  buildSuperadminToolsKeyboard,
  buildSettingsKeyboard,
  buildConfigKeyboard,
  buildConfigWelcomeKeyboard,
  buildConfigAturanKeyboard,
} from "./keyboards.js";

import { deleteSetting, escapeHtml } from "./shared.js";
import { CALLBACKS, CALLBACK_PREFIX, SESSION_MODES } from "../telegram.constants.js";

export function buildSuperadminConfigHandlers() {
  const EXACT = {};
  const PREFIX = [];

  // =========================
  // SUPERADMIN TOOLS
  // =========================

  EXACT[CALLBACKS.SUPERADMIN_TOOLS_MENU] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    if (msgChatId && msgId) {
      await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    }

    await sendMessage(env, adminId, "⚙️ <b>Superadmin Tools</b>\nPilih menu:", {
      parse_mode: "HTML",
      reply_markup: buildSuperadminToolsKeyboard(),
    });

    return true;
  };

  // =========================
  // SETTINGS MENU
  // =========================

  EXACT[CALLBACKS.SUPERADMIN_SETTINGS_MENU] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    if (msgChatId && msgId) {
      await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    }

    await sendMessage(env, adminId, "⚙️ <b>Settings</b>\nPilih menu:", {
      parse_mode: "HTML",
      reply_markup: buildSettingsKeyboard(),
    });

    return true;
  };

  // =========================
  // CONFIG MENU
  // =========================

  EXACT[CALLBACKS.SUPERADMIN_CONFIG_MENU] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    if (msgChatId && msgId) {
      await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    }

    await sendMessage(env, adminId, "🧩 <b>Config</b>\nPilih yang mau diupdate:", {
      parse_mode: "HTML",
      reply_markup: buildConfigKeyboard(),
    });

    return true;
  };

  // =========================
  // WELCOME CONFIG
  // =========================

  EXACT[CALLBACKS.SUPERADMIN_CONFIG_WELCOME] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    if (msgChatId && msgId) {
      await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    }

    const current = (await getSetting(env, "welcome_partner")) || "-";

    await sendMessage(
      env,
      adminId,
      "👋 <b>Welcome Message</b>\n\n<b>Current:</b>\n<pre>" +
        escapeHtml(current) +
        "</pre>",
      {
        parse_mode: "HTML",
        reply_markup: buildConfigWelcomeKeyboard(),
      }
    );

    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_CONFIG_WELCOME_EDIT] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;

    await saveSession(env, `state:${adminId}`, {
      mode: SESSION_MODES.SA_CONFIG,
      area: "welcome",
      step: "await_text",
    });

    if (msgChatId && msgId) {
      await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    }

    await sendMessage(
      env,
      adminId,
      "✏️ <b>Edit Welcome Message</b>\n\nKirim teks welcome baru.\n\nKetik <b>batal</b> untuk keluar.",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_CONFIG_WELCOME }],
          ],
        },
      }
    );

    return true;
  };

  // =========================
  // LINK ATURAN CONFIG
  // =========================

  EXACT[CALLBACKS.SUPERADMIN_CONFIG_ATURAN] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    if (msgChatId && msgId) {
      await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    }

    const current = (await getSetting(env, "link_aturan")) || "-";

    await sendMessage(
      env,
      adminId,
      "🔗 <b>Link Aturan</b>\n\n<b>Current:</b>\n<pre>" +
        escapeHtml(current) +
        "</pre>",
      {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: buildConfigAturanKeyboard(),
      }
    );

    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_CONFIG_ATURAN_EDIT] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;

    await saveSession(env, `state:${adminId}`, {
      mode: SESSION_MODES.SA_CONFIG,
      area: "aturan",
      step: "await_text",
    });

    if (msgChatId && msgId) {
      await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    }

    await sendMessage(
      env,
      adminId,
      "✏️ <b>Edit Link Aturan</b>\n\nKirim URL aturan baru.\n\nKetik <b>batal</b> untuk keluar.",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_CONFIG_ATURAN }],
          ],
        },
      }
    );

    return true;
  };

  // =========================
  // CONFIRM PREFIX HANDLERS
  // =========================

  PREFIX.push({
    match: (d) =>
      d.startsWith(CALLBACK_PREFIX.SETWELCOME_CONFIRM) ||
      d.startsWith(CALLBACK_PREFIX.SETWELCOME_CANCEL) ||
      d.startsWith(CALLBACK_PREFIX.SETLINK_CONFIRM) ||
      d.startsWith(CALLBACK_PREFIX.SETLINK_CANCEL),

    run: async (ctx) => {
      const { env, data, adminId } = ctx;

      const [action] = data.split(":");

      if (action === "setwelcome_confirm" || action === "setwelcome_cancel") {
        const draftKey = `draft_welcome:${adminId}`;
        const draftText = await getSetting(env, draftKey);

        if (!draftText) {
          await sendMessage(env, adminId, "⚠️ Draft welcome tidak ditemukan.");
          return true;
        }

        if (action === "setwelcome_cancel") {
          await deleteSetting(env, draftKey);
          await sendMessage(env, adminId, "❌ Draft welcome dibatalkan.");
          return true;
        }

        await upsertSetting(env, "welcome_partner", draftText);
        await deleteSetting(env, draftKey);

        await sendMessage(env, adminId, "✅ Welcome message berhasil diupdate.");

        return true;
      }

      if (action === "setlink_confirm" || action === "setlink_cancel") {
        const draftKey = `draft_link_aturan:${adminId}`;
        const draftUrl = await getSetting(env, draftKey);

        if (!draftUrl) {
          await sendMessage(env, adminId, "⚠️ Draft link aturan tidak ditemukan.");
          return true;
        }

        if (action === "setlink_cancel") {
          await deleteSetting(env, draftKey);
          await sendMessage(env, adminId, "❌ Draft link aturan dibatalkan.");
          return true;
        }

        await upsertSetting(env, "link_aturan", draftUrl);
        await deleteSetting(env, draftKey);

        await sendMessage(env, adminId, "✅ Link aturan berhasil diupdate.");

        return true;
      }

      return true;
    },
  });

  return { EXACT, PREFIX };
}
