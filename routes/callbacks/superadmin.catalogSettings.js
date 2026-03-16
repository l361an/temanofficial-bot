// routes/callbacks/superadmin.catalogSettings.js

import { sendMessage, upsertCallbackMessage } from "../../services/telegramApi.js";
import { getSetting, upsertSetting } from "../../repositories/settingsRepo.js";
import { saveSession, clearSession } from "../../utils/session.js";

import {
  buildCatalogSettingsKeyboard,
  buildCatalogGroupKeyboard,
  buildCatalogTopicKeyboard,
} from "./keyboards.superadmin.js";

import { CALLBACKS, CALLBACK_PREFIX, SESSION_MODES, cb } from "../telegram.constants.js";
import { deleteSetting, escapeHtml } from "./shared.js";

async function renderMenuMessage(ctx, text, extra) {
  const { env, adminId, msg } = ctx;

  if (msg) {
    await upsertCallbackMessage(env, msg, text, extra).catch(async () => {
      await sendMessage(env, adminId, text, extra);
    });
    return true;
  }

  await sendMessage(env, adminId, text, extra);
  return true;
}

function fmtSetting(value) {
  const raw = String(value ?? "").trim();
  return raw ? escapeHtml(raw) : "-";
}

function buildCatalogSettingsText(groupValue, topicValue) {
  return [
    "📢 <b>Katalog Group & Topic</b>",
    "",
    `<b>Group Chat ID:</b> <code>${fmtSetting(groupValue)}</code>`,
    `<b>Topic ID:</b> <code>${fmtSetting(topicValue)}</code>`,
    "",
    "Pilih data target katalog yang ingin diatur.",
  ].join("\n");
}

function buildCatalogGroupText(currentValue) {
  return [
    "🆔 <b>Catalog Group Chat ID</b>",
    "",
    "<b>Current:</b>",
    `<pre>${fmtSetting(currentValue)}</pre>`,
    "",
    "Gunakan ini untuk menentukan grup tujuan publish katalog.",
  ].join("\n");
}

function buildCatalogTopicText(currentValue) {
  return [
    "🧵 <b>Catalog Topic ID</b>",
    "",
    "<b>Current:</b>",
    `<pre>${fmtSetting(currentValue)}</pre>`,
    "",
    "Gunakan ini untuk menentukan topic tujuan publish katalog.",
  ].join("\n");
}

export function buildSuperadminCatalogSettingsHandlers() {
  const EXACT = {};
  const PREFIX = [];

  EXACT[CALLBACKS.SUPERADMIN_CATALOG_SETTINGS_MENU] = async (ctx) => {
    const { env, adminId } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    const groupValue = await getSetting(env, "catalog_group_chat_id");
    const topicValue = await getSetting(env, "catalog_topic_id");

    return renderMenuMessage(ctx, buildCatalogSettingsText(groupValue, topicValue), {
      parse_mode: "HTML",
      reply_markup: buildCatalogSettingsKeyboard(),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_CATALOG_GROUP] = async (ctx) => {
    const { env, adminId } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    const current = await getSetting(env, "catalog_group_chat_id");

    return renderMenuMessage(ctx, buildCatalogGroupText(current), {
      parse_mode: "HTML",
      reply_markup: buildCatalogGroupKeyboard(),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_CATALOG_GROUP_EDIT] = async (ctx) => {
    const { env, adminId } = ctx;

    await saveSession(env, `state:${adminId}`, {
      mode: SESSION_MODES.SA_CATALOG_SETTINGS,
      area: "group",
      step: "await_text",
    });

    await sendMessage(
      env,
      adminId,
      [
        "✏️ <b>Edit Catalog Group Chat ID</b>",
        "",
        "Kirim Group Chat ID baru.",
        "Contoh: <code>-1001234567890</code>",
        "",
        "Ketik <b>batal</b> untuk keluar.",
      ].join("\n"),
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_CATALOG_GROUP }]],
        },
      }
    );

    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_CATALOG_TOPIC] = async (ctx) => {
    const { env, adminId } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    const current = await getSetting(env, "catalog_topic_id");

    return renderMenuMessage(ctx, buildCatalogTopicText(current), {
      parse_mode: "HTML",
      reply_markup: buildCatalogTopicKeyboard(),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_CATALOG_TOPIC_EDIT] = async (ctx) => {
    const { env, adminId } = ctx;

    await saveSession(env, `state:${adminId}`, {
      mode: SESSION_MODES.SA_CATALOG_SETTINGS,
      area: "topic",
      step: "await_text",
    });

    await sendMessage(
      env,
      adminId,
      [
        "✏️ <b>Edit Catalog Topic ID</b>",
        "",
        "Kirim Topic ID baru.",
        "Contoh: <code>123</code>",
        "",
        "Ketik <b>batal</b> untuk keluar.",
      ].join("\n"),
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_CATALOG_TOPIC }]],
        },
      }
    );

    return true;
  };

  PREFIX.push({
    match: (d) =>
      d.startsWith(CALLBACK_PREFIX.SETCATALOGGROUP_CONFIRM) ||
      d.startsWith(CALLBACK_PREFIX.SETCATALOGGROUP_CANCEL) ||
      d.startsWith(CALLBACK_PREFIX.SETCATALOGTOPIC_CONFIRM) ||
      d.startsWith(CALLBACK_PREFIX.SETCATALOGTOPIC_CANCEL),

    run: async (ctx) => {
      const { env, data, adminId } = ctx;
      const [action] = data.split(":");

      if (action === "setcataloggroup_confirm" || action === "setcataloggroup_cancel") {
        const draftKey = `draft_catalog_group_chat_id:${adminId}`;
        const draftText = await getSetting(env, draftKey);

        if (!draftText) {
          await sendMessage(env, adminId, "⚠️ Draft Catalog Group Chat ID tidak ditemukan / sudah dibatalkan.");
          return true;
        }

        if (action === "setcataloggroup_cancel") {
          await deleteSetting(env, draftKey);
          await sendMessage(env, adminId, "❌ Draft Catalog Group Chat ID dibatalkan.", {
            reply_markup: buildCatalogGroupKeyboard(),
          });
          return true;
        }

        await upsertSetting(env, "catalog_group_chat_id", draftText);
        await deleteSetting(env, draftKey);

        await sendMessage(env, adminId, "✅ Catalog Group Chat ID berhasil disimpan.", {
          reply_markup: buildCatalogGroupKeyboard(),
        });
        return true;
      }

      if (action === "setcatalogtopic_confirm" || action === "setcatalogtopic_cancel") {
        const draftKey = `draft_catalog_topic_id:${adminId}`;
        const draftText = await getSetting(env, draftKey);

        if (!draftText) {
          await sendMessage(env, adminId, "⚠️ Draft Catalog Topic ID tidak ditemukan / sudah dibatalkan.");
          return true;
        }

        if (action === "setcatalogtopic_cancel") {
          await deleteSetting(env, draftKey);
          await sendMessage(env, adminId, "❌ Draft Catalog Topic ID dibatalkan.", {
            reply_markup: buildCatalogTopicKeyboard(),
          });
          return true;
        }

        await upsertSetting(env, "catalog_topic_id", draftText);
        await deleteSetting(env, draftKey);

        await sendMessage(env, adminId, "✅ Catalog Topic ID berhasil disimpan.", {
          reply_markup: buildCatalogTopicKeyboard(),
        });
        return true;
      }

      return false;
    },
  });

  return { EXACT, PREFIX };
}
