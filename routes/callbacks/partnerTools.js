// routes/callbacks/partnerTools.js
import { sendMessage, editMessageReplyMarkup } from "../../services/telegramApi.js";
import { clearSession } from "../../utils/session.js";
import { buildPartnerToolsKeyboard } from "./keyboards.js";

export function buildPartnerToolsExact() {
  const EXACT = {};

  EXACT["pt:menu"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});

    await sendMessage(env, adminId, "🧰 <b>Partner Tools</b>\nPilih menu:", {
      parse_mode: "HTML",
      reply_markup: buildPartnerToolsKeyboard(),
    });
    return true;
  };

  return { EXACT };
}
