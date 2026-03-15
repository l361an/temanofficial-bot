// routes/telegram.commands.admin.js
import { sendMessage } from "../services/telegramApi.js";
import { isAdminRole } from "../utils/roles.js";
import { buildOfficerHomeKeyboard } from "./callbacks/keyboards.officer.js";
import { buildHelpText, buildOfficerHomeText } from "./telegram.messages.js";

function isPrivateChat(chat) {
  // Kompatibel dengan caller lama yang belum mengirim `chat`
  if (!chat) return true;
  return String(chat?.type || "").trim().toLowerCase() === "private";
}

export async function handleAdminCommand({ env, chat, chatId, text, role }) {
  if (!isAdminRole(role)) return false;

  // Semua admin command diarahkan ke private chat.
  // Untuk sementara, jika dipanggil dari non-private maka diam / consume.
  if (!isPrivateChat(chat)) {
    return true;
  }

  const rawText = String(text || "").trim();
  if (!rawText.startsWith("/")) return false;

  const command = (rawText.split(/\s+/)[0] || "").split("@")[0];

  if (command === "/start") {
    await sendMessage(env, chatId, buildOfficerHomeText(), {
      parse_mode: "HTML",
      reply_markup: buildOfficerHomeKeyboard(role),
    });
    return true;
  }

  if (command === "/help" || command === "/cmd") {
    await sendMessage(env, chatId, buildHelpText(role), {
      parse_mode: "HTML",
    });
    return true;
  }

  return false;
}
