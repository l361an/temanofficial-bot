// routes/callbacks/officer.js
import { sendMessage, editMessageReplyMarkup } from "../../services/telegramApi.js";
import { isAdminRole } from "../../utils/roles.js";
import { buildOfficerHomeKeyboard } from "./keyboards.js";
import { CALLBACKS } from "../telegram.constants.js";
import { buildOfficerHomeText } from "../telegram.messages.js";

export function buildOfficerExact() {
  const EXACT = {};

  EXACT[CALLBACKS.OFFICER_HOME] = async (ctx) => {
    const { env, role, adminId, msgChatId, msgId } = ctx;
    if (!isAdminRole(role)) return true;

    if (msgChatId && msgId) {
      await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    }

    await sendMessage(env, adminId, buildOfficerHomeText(), {
      reply_markup: buildOfficerHomeKeyboard(role),
    });
    return true;
  };

  return { EXACT };
}
