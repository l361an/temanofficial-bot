// routes/telegram.flow.superadminCatalogSettings.js

import { sendMessage } from "../services/telegramApi.js";
import { getSetting, upsertSetting } from "../repositories/settingsRepo.js";
import { clearSession } from "../utils/session.js";
import { CALLBACKS, cb } from "./telegram.constants.js";

function isValidGroupChatId(value) {
  return /^-100\d{5,}$/.test(String(value || "").trim());
}

function isValidTopicId(value) {
  return /^\d+$/.test(String(value || "").trim());
}

function buildGroupPreviewText(currentValue, draftValue) {
  const current = String(currentValue || "-");
  const draft = String(draftValue || "-");

  return [
    "🧾 *Preview Catalog Group Chat ID*",
    "",
    "*Current:*",
    current,
    "",
    "*New (draft):*",
    draft,
    "",
    "Klik tombol di bawah untuk *Confirm* atau *Cancel*.",
  ].join("\n");
}

function buildTopicPreviewText(currentValue, draftValue) {
  const current = String(currentValue || "-");
  const draft = String(draftValue || "-");

  return [
    "🧾 *Preview Catalog Topic ID*",
    "",
    "*Current:*",
    current,
    "",
    "*New (draft):*",
    draft,
    "",
    "Klik tombol di bawah untuk *Confirm* atau *Cancel*.",
  ].join("\n");
}

async function cancelCatalogSession(env, chatId, stateKey) {
  await clearSession(env, stateKey).catch(() => {});
  await sendMessage(env, chatId, "✅ Oke, input Katalog Settings dibatalkan.\nBalik ke menu:", {
    reply_markup: {
      inline_keyboard: [[{ text: "📢 Katalog Group & Topic", callback_data: CALLBACKS.SUPERADMIN_CATALOG_SETTINGS_MENU }]],
    },
  });
  return true;
}

export async function handleSuperadminCatalogSettingsInput({
  env,
  chatId,
  telegramId,
  text,
  session,
  STATE_KEY,
}) {
  if (String(session?.mode || "").trim().toLowerCase() !== "sa_catalog_settings") {
    return false;
  }

  const raw = String(text || "").trim();

  if (/^(batal|cancel|keluar)$/i.test(raw)) {
    return cancelCatalogSession(env, chatId, STATE_KEY);
  }

  const area = String(session?.area || "").trim().toLowerCase();
  const adminId = String(telegramId || "");

  if (area === "group" && session?.step === "await_text") {
    if (!isValidGroupChatId(raw)) {
      await sendMessage(
        env,
        chatId,
        [
          "⚠️ Group Chat ID tidak valid.",
          "Format yang diterima biasanya seperti:",
          "<code>-1001234567890</code>",
          "",
          "Kirim ulang Group Chat ID, atau ketik <b>batal</b> untuk keluar.",
        ].join("\n"),
        { parse_mode: "HTML" }
      );
      return true;
    }

    const current = (await getSetting(env, "catalog_group_chat_id")) || "-";
    await upsertSetting(env, `draft_catalog_group_chat_id:${adminId}`, raw);
    await clearSession(env, STATE_KEY).catch(() => {});

    await sendMessage(env, chatId, buildGroupPreviewText(current, raw), {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Confirm", callback_data: cb.setCatalogGroupConfirm(adminId) },
            { text: "❌ Cancel", callback_data: cb.setCatalogGroupCancel(adminId) },
          ],
          [{ text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_CATALOG_GROUP }],
        ],
      },
    });
    return true;
  }

  if (area === "topic" && session?.step === "await_text") {
    if (!isValidTopicId(raw)) {
      await sendMessage(
        env,
        chatId,
        [
          "⚠️ Topic ID tidak valid.",
          "Format yang diterima angka saja.",
          "Contoh: <code>123</code>",
          "",
          "Kirim ulang Topic ID, atau ketik <b>batal</b> untuk keluar.",
        ].join("\n"),
        { parse_mode: "HTML" }
      );
      return true;
    }

    const current = (await getSetting(env, "catalog_topic_id")) || "-";
    await upsertSetting(env, `draft_catalog_topic_id:${adminId}`, raw);
    await clearSession(env, STATE_KEY).catch(() => {});

    await sendMessage(env, chatId, buildTopicPreviewText(current, raw), {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Confirm", callback_data: cb.setCatalogTopicConfirm(adminId) },
            { text: "❌ Cancel", callback_data: cb.setCatalogTopicCancel(adminId) },
          ],
          [{ text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_CATALOG_TOPIC }],
        ],
      },
    });
    return true;
  }

  await clearSession(env, STATE_KEY).catch(() => {});
  await sendMessage(env, chatId, "⚠️ Session Catalog Settings tidak valid. Balik ke menu ya.", {
    reply_markup: {
      inline_keyboard: [[{ text: "📢 Katalog Group & Topic", callback_data: CALLBACKS.SUPERADMIN_CATALOG_SETTINGS_MENU }]],
    },
  });
  return true;
}
