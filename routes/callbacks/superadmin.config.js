// routes/callbacks/superadmin.config.js

import { sendMessage, upsertCallbackMessage } from "../../services/telegramApi.js";
import { getSetting, upsertSetting } from "../../repositories/settingsRepo.js";
import { saveSession, clearSession } from "../../utils/session.js";

import {
  buildSuperadminToolsKeyboard,
  buildConfigKeyboard,
  buildConfigWelcomeKeyboard,
  buildConfigAturanKeyboard,
} from "./keyboards.superadmin.js";

import { deleteSetting, escapeHtml } from "./shared.js";
import { CALLBACKS, CALLBACK_PREFIX, SESSION_MODES } from "../telegram.constants.js";

function logError(tag, meta = {}) {
  console.error(tag, meta);
}

function getStateKey(adminId) {
  return `state:${adminId}`;
}

async function clearSessionSafely(env, adminId, meta = {}) {
  const stateKey = getStateKey(adminId);

  try {
    await clearSession(env, stateKey);
    return { ok: true };
  } catch (err) {
    logError("[sa.config.clear_session.failed]", {
      adminId,
      stateKey,
      ...meta,
      err: err?.message || String(err || ""),
    });
    return { ok: false, err };
  }
}

async function saveConfigSession(env, adminId, sessionPatch, meta = {}) {
  const stateKey = getStateKey(adminId);

  const session = {
    mode: SESSION_MODES.SA_CONFIG,
    flow_id: "sa_config",
    flow_version: 1,
    source_chat_id: sessionPatch?.source_chat_id ?? null,
    source_message_id: sessionPatch?.source_message_id ?? null,
    ...sessionPatch,
  };

  try {
    return await saveSession(env, stateKey, session);
  } catch (err) {
    logError("[sa.config.save_session.failed]", {
      adminId,
      stateKey,
      sessionPatch,
      ...meta,
      err: err?.message || String(err || ""),
    });
    throw err;
  }
}

async function renderMenuMessage(ctx, text, extra) {
  const { env, adminId, msg, data } = ctx;

  if (msg) {
    const res = await upsertCallbackMessage(env, msg, text, extra);

    if (!res?.ok) {
      logError("[sa.config.render_menu.failed]", {
        adminId,
        data: data || null,
        description: res?.description || null,
        mode: res?.mode || null,
        messageId: msg?.message_id || null,
      });

      await sendMessage(env, adminId, text, extra);
      return true;
    }

    if (res?.mode === "sent") {
      logError("[sa.config.render_menu.stale_panel_fallback]", {
        adminId,
        data: data || null,
        oldMessageId: res?.old_message_id || null,
        newMessageId: res?.message_id || null,
        oldPanelInvalidated: !!res?.old_panel_invalidated,
      });
    }

    return true;
  }

  await sendMessage(env, adminId, text, extra);
  return true;
}

function buildSystemSettingsText() {
  return [
    "⚙️ <b>System Settings</b>",
    "",
    "Pilih menu pengaturan sistem di bawah.",
  ].join("\n");
}

function buildConfigText() {
  return [
    "⚙️ <b>System Settings</b>",
    "",
    "Pilih data konfigurasi yang ingin diupdate.",
  ].join("\n");
}

function buildWelcomeText(current) {
  return [
    "👋 <b>Welcome Message</b>",
    "",
    "<b>Current:</b>",
    `<pre>${escapeHtml(current || "-")}</pre>`,
  ].join("\n");
}

function buildAturanText(current) {
  return [
    "🔗 <b>Link Aturan</b>",
    "",
    "<b>Current:</b>",
    `<pre>${escapeHtml(current || "-")}</pre>`,
  ].join("\n");
}

export function buildSuperadminConfigHandlers() {
  const EXACT = {};
  const PREFIX = [];

  EXACT[CALLBACKS.SUPERADMIN_TOOLS_MENU] = async (ctx) => {
    const { env, adminId } = ctx;

    await clearSessionSafely(env, adminId, {
      action: "open_tools_menu",
    });

    return renderMenuMessage(ctx, buildSystemSettingsText(), {
      parse_mode: "HTML",
      reply_markup: buildSuperadminToolsKeyboard(),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_SETTINGS_MENU] = async (ctx) => {
    const { env, adminId } = ctx;

    await clearSessionSafely(env, adminId, {
      action: "open_settings_menu",
    });

    return renderMenuMessage(ctx, buildSystemSettingsText(), {
      parse_mode: "HTML",
      reply_markup: buildSuperadminToolsKeyboard(),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_CONFIG_MENU] = async (ctx) => {
    const { env, adminId } = ctx;

    await clearSessionSafely(env, adminId, {
      action: "open_config_menu",
    });

    return renderMenuMessage(ctx, buildConfigText(), {
      parse_mode: "HTML",
      reply_markup: buildConfigKeyboard(),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_CONFIG_WELCOME] = async (ctx) => {
    const { env, adminId } = ctx;

    await clearSessionSafely(env, adminId, {
      action: "open_welcome_menu",
    });

    const current = (await getSetting(env, "welcome_partner")) || "-";

    return renderMenuMessage(ctx, buildWelcomeText(current), {
      parse_mode: "HTML",
      reply_markup: buildConfigWelcomeKeyboard(),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_CONFIG_WELCOME_EDIT] = async (ctx) => {
    const { env, adminId, msg, data } = ctx;

    await saveConfigSession(
      env,
      adminId,
      {
        area: "welcome",
        step: "await_text",
        source_callback_data: data || null,
        source_chat_id: msg?.chat?.id || null,
        source_message_id: msg?.message_id || null,
      },
      {
        action: "start_welcome_edit",
      }
    );

    await sendMessage(
      env,
      adminId,
      "✏️ <b>Edit Welcome Message</b>\n\nKetik Welcome Message baru.\n\nKetik <b>batal</b> untuk keluar.",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_CONFIG_WELCOME }]],
        },
      }
    );

    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_CONFIG_ATURAN] = async (ctx) => {
    const { env, adminId } = ctx;

    await clearSessionSafely(env, adminId, {
      action: "open_aturan_menu",
    });

    const current = (await getSetting(env, "link_aturan")) || "-";

    return renderMenuMessage(ctx, buildAturanText(current), {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: buildConfigAturanKeyboard(),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_CONFIG_ATURAN_EDIT] = async (ctx) => {
    const { env, adminId, msg, data } = ctx;

    await saveConfigSession(
      env,
      adminId,
      {
        area: "aturan",
        step: "await_text",
        source_callback_data: data || null,
        source_chat_id: msg?.chat?.id || null,
        source_message_id: msg?.message_id || null,
      },
      {
        action: "start_aturan_edit",
      }
    );

    await sendMessage(
      env,
      adminId,
      "✏️ <b>Edit Link Aturan</b>\n\nKetik Link Aturan baru.\n\nKetik <b>batal</b> untuk keluar.",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_CONFIG_ATURAN }]],
        },
      }
    );

    return true;
  };

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
          return renderMenuMessage(ctx, "⚠️ Draft welcome tidak ditemukan / sudah dibatalkan.", {
            reply_markup: buildSuperadminToolsKeyboard(),
          });
        }

        if (action === "setwelcome_cancel") {
          try {
            await deleteSetting(env, draftKey);
          } catch (err) {
            logError("[sa.config.delete_draft_welcome.failed]", {
              adminId,
              draftKey,
              action,
              err: err?.message || String(err || ""),
            });
            throw err;
          }

          return renderMenuMessage(ctx, "❌ Draft welcome dibatalkan.", {
            reply_markup: buildSuperadminToolsKeyboard(),
          });
        }

        await upsertSetting(env, "welcome_partner", draftText);

        try {
          await deleteSetting(env, draftKey);
        } catch (err) {
          logError("[sa.config.delete_draft_welcome.failed]", {
            adminId,
            draftKey,
            action,
            err: err?.message || String(err || ""),
          });
          throw err;
        }

        return renderMenuMessage(
          ctx,
          "✅ Welcome message berhasil diupdate.\n\n*Welcome baru:*\n" + draftText,
          {
            parse_mode: "Markdown",
            disable_web_page_preview: true,
            reply_markup: buildSuperadminToolsKeyboard(),
          }
        );
      }

      if (action === "setlink_confirm" || action === "setlink_cancel") {
        const draftKey = `draft_link_aturan:${adminId}`;
        const draftUrl = await getSetting(env, draftKey);

        if (!draftUrl) {
          return renderMenuMessage(ctx, "⚠️ Draft link aturan tidak ditemukan / sudah dibatalkan.", {
            reply_markup: buildSuperadminToolsKeyboard(),
          });
        }

        if (action === "setlink_cancel") {
          try {
            await deleteSetting(env, draftKey);
          } catch (err) {
            logError("[sa.config.delete_draft_link.failed]", {
              adminId,
              draftKey,
              action,
              err: err?.message || String(err || ""),
            });
            throw err;
          }

          return renderMenuMessage(ctx, "❌ Draft link aturan dibatalkan.", {
            reply_markup: buildSuperadminToolsKeyboard(),
          });
        }

        await upsertSetting(env, "link_aturan", draftUrl);

        try {
          await deleteSetting(env, draftKey);
        } catch (err) {
          logError("[sa.config.delete_draft_link.failed]", {
            adminId,
            draftKey,
            action,
            err: err?.message || String(err || ""),
          });
          throw err;
        }

        return renderMenuMessage(ctx, `✅ Link aturan berhasil diupdate:\n${draftUrl}`, {
          disable_web_page_preview: true,
          reply_markup: buildSuperadminToolsKeyboard(),
        });
      }

      return true;
    },
  });

  return { EXACT, PREFIX };
}
