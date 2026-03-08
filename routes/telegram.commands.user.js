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
  const fallback = "👋 Selamat datang Partner Mandiri\n\nKlik <b>Menu TeMan</b> di bawah ya.";
  return sanitizeWelcome(fromSetting || fallback);
}

export { buildTeManMenuKeyboard };

export async function handleUserCommand({ env, chatId, telegramId, role, text }) {
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

  if (data === "teman:menu" || data === "self:view" || data === "self:update" || data.startsWith("self:edit:")) {
    return handleSelfProfileInlineCallback(update, env);
  }

  if (data === "self:payment" || data.startsWith("self:payment:")) {
    return handleSelfPaymentInlineCallback(update, env);
  }

  return false;
}

export async function handleUserEditFlow(args) {
  return handleUserProfileEditFlow(args);
}
