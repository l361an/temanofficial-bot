// routes/telegram.commands.user.js

import { sendMessage } from "../services/telegramApi.js";
import { getSetting } from "../repositories/settingsRepo.js";
import { isAdminRole } from "../utils/roles.js";

import {
  buildTeManMenuKeyboard,
  sendHtml,
} from "./telegram.user.shared.js";

import {
  handleSelfProfileInlineCallback,
  handleUserProfileEditFlow,
} from "./telegram.flow.selfProfile.js";

import {
  handleSelfPaymentInlineCallback,
} from "./telegram.flow.selfPayment.js";

/**
 * HARD RULE:
 * Semua flow user / partner hanya boleh berjalan di PRIVATE CHAT.
 * Jika dipanggil dari group / supergroup / channel / topic → langsung ignore.
 */
function isPrivateChat(chat) {
  if (!chat) return false;
  return chat.type === "private";
}

function sanitizeWelcome(text) {
  const raw = String(text || "").trim();
  if (!raw) return raw;

  const lines = raw
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => !/\/mulai/i.test(l))
    .filter((l) => !/\/cmd/i.test(l));

  const joined = lines
    .join("\n")
    .replace(/langsung aja ketik\s+\*?\/?mulai\*?.*$/gim, "")
    .replace(/langsung aja ketik\s+\*?\/?cmd\*?.*$/gim, "")
    .trim();

  return joined || raw;
}

async function buildTeManWelcome(env) {
  const fromSetting = await getSetting(env, "welcome_partner");
  const fallback =
    "👋 Selamat datang Partner Mandiri\n\nKlik <b>Menu TeMan</b> di bawah ya.";

  return sanitizeWelcome(fromSetting || fallback);
}

export { buildTeManMenuKeyboard };

export async function handleUserCommand({
  env,
  chat,
  chatId,
  telegramId,
  role,
  text,
}) {
  /**
   * PRIVATE CHAT ONLY
   */
  if (!isPrivateChat(chat)) {
    return false;
  }

  if (text === "/help") {
    await sendHtml(
      env,
      chatId,
      "ℹ️ Untuk pertanyaan dan permasalahan penggunaan bot, silakan hubungi Admin.",
      { reply_markup: buildTeManMenuKeyboard() }
    );
    return true;
  }

  if (text === "/start") {
    if (isAdminRole(role)) {
      await sendMessage(env, chatId, "Halo Officer, ketik /help jika butuh bantuan.");
      return true;
    }

    const welcome = await buildTeManWelcome(env);

    await sendMessage(env, chatId, welcome, {
      parse_mode: "HTML",
      reply_markup: buildTeManMenuKeyboard(),
      disable_web_page_preview: true,
    });

    return true;
  }

  return false;
}

export async function handleSelfInlineCallback(update, env) {
  const data = update?.callback_query?.data || "";
  const chat = update?.callback_query?.message?.chat;

  /**
   * PRIVATE CHAT ONLY
   */
  if (!isPrivateChat(chat)) {
    return false;
  }

  if (
    data === "teman:menu" ||
    data === "self:view" ||
    data === "self:update" ||
    data.startsWith("self:edit:")
  ) {
    return handleSelfProfileInlineCallback(update, env);
  }

  if (data === "self:payment" || data.startsWith("self:payment:")) {
    return handleSelfPaymentInlineCallback(update, env);
  }

  return false;
}

export async function handleUserEditFlow(args) {
  const chat = args?.chat;

  /**
   * PRIVATE CHAT ONLY
   */
  if (!isPrivateChat(chat)) {
    return false;
  }

  return handleUserProfileEditFlow(args);
}
