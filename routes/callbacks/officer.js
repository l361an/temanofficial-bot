// routes/callbacks/officer.js
import { sendMessage, editMessageReplyMarkup } from "../../services/telegramApi.js";
import { isAdminRole } from "../../utils/roles.js";
import { buildOfficerHomeKeyboard } from "./keyboards.js";

export function buildOfficerExact() {
  const EXACT = {};

  EXACT["officer:home"] = async (ctx) => {
    const { env, role, adminId, msgChatId, msgId } = ctx;
    if (!isAdminRole(role)) return true;

    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    const text = "Hallo Officer TeMan...\nSilahkan tekan tombol dibawah atau ketik /help untuk bantuan.";
    await sendMessage(env, adminId, text, { reply_markup: buildOfficerHomeKeyboard(role) });
    return true;
  };

  return { EXACT };
}
