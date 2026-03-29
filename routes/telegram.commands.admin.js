// routes/telegram.commands.admin.js

import { sendMessage } from "../services/telegramApi.js";
import { isAdminRole } from "../utils/roles.js";
import { buildOfficerHomeKeyboard } from "./callbacks/keyboards.officer.js";
import { buildHelpText, buildOfficerHomeText, buildTemankuHubText } from "./telegram.messages.js";

function isPrivateChat(chat) {
  if (!chat) return true;
  return String(chat?.type || "").trim().toLowerCase() === "private";
}

function normalizeCommand(value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/")) return "";
  return (raw.split(/\s+/)[0] || "").split("@")[0].toLowerCase();
}

export async function handleAdminCommand({ env, chat, chatId, text, role }) {
  if (!isAdminRole(role)) return false;

  const command = normalizeCommand(text);
  if (!command) return false;

  if (!isPrivateChat(chat)) {
    return true;
  }

  if (command === "/start" || command === "/temanku") {
    await sendMessage(env, chatId, buildOfficerHomeText(), {
      parse_mode: "HTML",
      reply_markup: buildOfficerHomeKeyboard(role),
    });
    return true;
  }

  if (command === "/help" || command === "/cmd") {
    await sendMessage(env, chatId, buildTemankuHubText(role), {
      parse_mode: "HTML",
    });
    return true;
  }

  if (command === "/menu") {
    await sendMessage(env, chatId, buildHelpText(role), {
      parse_mode: "HTML",
    });
    return true;
  }

  return false;
}
