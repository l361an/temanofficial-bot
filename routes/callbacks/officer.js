// routes/callbacks/officer.js
import { sendMessage, upsertCallbackMessage } from "../../services/telegramApi.js";
import { isAdminRole } from "../../utils/roles.js";
import { buildOfficerHomeKeyboard } from "./keyboards.js";
import { CALLBACKS } from "../telegram.constants.js";
import { buildOfficerHomeText } from "../telegram.messages.js";

export function buildOfficerExact() {
  const EXACT = {};

  EXACT[CALLBACKS.OFFICER_HOME] = async (ctx) => {
    const { env, role, adminId, msg } = ctx;
    if (!isAdminRole(role)) return true;

    const text = buildOfficerHomeText();
    const extra = {
      parse_mode: "HTML",
      reply_markup: buildOfficerHomeKeyboard(role),
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
