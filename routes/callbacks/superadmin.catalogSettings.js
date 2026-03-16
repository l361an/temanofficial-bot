// routes/callbacks/superadmin.catalogSettings.js

import { sendMessage, upsertCallbackMessage } from "../../services/telegramApi.js";
import { getSetting } from "../../repositories/settingsRepo.js";
import { clearSession } from "../../utils/session.js";

import {
  buildCatalogSettingsKeyboard,
  buildCatalogGroupKeyboard,
  buildCatalogTopicKeyboard,
} from "./keyboards.superadmin.js";

import { CALLBACKS } from "../telegram.constants.js";
import { escapeHtml } from "./shared.js";

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

function buildCatalogSettingsText() {
  return [
    "📢 <b>Katalog Group & Topic</b>",
    "",
    "Pilih target katalog yang ingin dilihat.",
  ].join("\n");
}

function buildCatalogGroupText(currentValue) {
  return [
    "🆔 <b>Catalog Group Chat ID</b>",
    "",
    "<b>Current:</b>",
    `<pre>${fmtSetting(currentValue)}</pre>`,
    "",
    "Tahap 1: preview only.",
  ].join("\n");
}

function buildCatalogTopicText(currentValue) {
  return [
    "🧵 <b>Catalog Topic ID</b>",
    "",
    "<b>Current:</b>",
    `<pre>${fmtSetting(currentValue)}</pre>`,
    "",
    "Tahap 1: preview only.",
  ].join("\n");
}

export function buildSuperadminCatalogSettingsHandlers() {
  const EXACT = {};
  const PREFIX = [];

  EXACT[CALLBACKS.SUPERADMIN_CATALOG_SETTINGS_MENU] = async (ctx) => {
    const { env, adminId } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    return renderMenuMessage(ctx, buildCatalogSettingsText(), {
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

  EXACT[CALLBACKS.SUPERADMIN_CATALOG_TOPIC] = async (ctx) => {
    const { env, adminId } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    const current = await getSetting(env, "catalog_topic_id");

    return renderMenuMessage(ctx, buildCatalogTopicText(current), {
      parse_mode: "HTML",
      reply_markup: buildCatalogTopicKeyboard(),
    });
  };

  return { EXACT, PREFIX };
}
