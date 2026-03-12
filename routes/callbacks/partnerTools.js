// routes/callbacks/partnerTools.js
import { sendMessage, upsertCallbackMessage } from "../../services/telegramApi.js";
import { clearSession } from "../../utils/session.js";
import { buildPartnerToolsKeyboard } from "./keyboards.partner.js";
import { CALLBACKS } from "../telegram.constants.js";

export function buildPartnerToolsExact() {
  const EXACT = {};

  EXACT[CALLBACKS.PARTNER_TOOLS_MENU] = async (ctx) => {
    const { env, adminId, msg } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    const text = "🧰 <b>Partner Tools</b>\nPilih menu:";
    const extra = {
      parse_mode: "HTML",
      reply_markup: buildPartnerToolsKeyboard(),
    };

    if (msg) {
      await upsertCallbackMessage(env, msg, text, extra).catch(async () => {
        await sendMessage(env, adminId, text, extra);
      });
      return true;
    }

    await sendMessage(env, adminId, text, extra);
    return true;
  };

  return { EXACT };
}
