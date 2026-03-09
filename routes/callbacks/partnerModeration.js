// routes/callbacks/partnerModeration.js
import { sendMessage, upsertCallbackMessage } from "../../services/telegramApi.js";
import { saveSession, clearSession } from "../../utils/session.js";
import { isSuperadminRole } from "../../utils/roles.js";
import {
  buildPartnerModerationKeyboard,
  buildBackToPartnerModerationKeyboard,
} from "./keyboards.js";
import { CALLBACKS, SESSION_MODES } from "../telegram.constants.js";

function buildModerationPrompt(action) {
  const nice =
    action === "restore"
      ? "RESTORE"
      : action === "suspend"
        ? "SUSPEND"
        : "DELETE";

  return (
    "🛠️ <b>Partner Moderation</b>\n" +
    `Aksi: <b>${nice}</b>\n\n` +
    "Kirim <b>@username</b> atau <b>telegram_id</b> target.\n\n" +
    "Ketik <b>batal</b> untuk keluar."
  );
}

export function buildPartnerModerationHandlers() {
  const EXACT = {};
  const PREFIX = [];

  EXACT[CALLBACKS.PARTNER_MODERATION_MENU] = async (ctx) => {
    const { env, adminId, msg, role } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    const text = "🛠️ <b>Partner Moderation</b>\nPilih aksi di bawah:";
    const extra = {
      parse_mode: "HTML",
      reply_markup: buildPartnerModerationKeyboard(role),
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

  PREFIX.push({
    match: (d) =>
      [
        CALLBACKS.PARTNER_MOD_RESTORE,
        CALLBACKS.PARTNER_MOD_SUSPEND,
        CALLBACKS.PARTNER_MOD_DELETE,
      ].includes(d),
    run: async (ctx) => {
      const { env, data, adminId, msg, role, msgChatId, msgId } = ctx;

      let action = "";
      if (data === CALLBACKS.PARTNER_MOD_RESTORE) action = "restore";
      if (data === CALLBACKS.PARTNER_MOD_SUSPEND) action = "suspend";
      if (data === CALLBACKS.PARTNER_MOD_DELETE) action = "delete";

      if (action === "delete" && !isSuperadminRole(role)) {
        const deniedText = "⛔ Akses ditolak. Delete Partner hanya untuk Superadmin.";
        const deniedExtra = {
          reply_markup: buildPartnerModerationKeyboard(role),
        };

        if (msg) {
          await upsertCallbackMessage(env, msg, deniedText, deniedExtra).catch(async () => {
            await sendMessage(env, adminId, deniedText, deniedExtra);
          });
          return true;
        }

        await sendMessage(env, adminId, deniedText, deniedExtra);
        return true;
      }

      const sourceChatId = msg?.chat?.id ?? msgChatId ?? adminId ?? null;
      const sourceMessageId = msg?.message_id ?? msgId ?? null;

      await saveSession(env, `state:${adminId}`, {
        mode: SESSION_MODES.PARTNER_MODERATION,
        action,
        step: "await_target",
        data: {
          source_chat_id: sourceChatId,
          source_message_id: sourceMessageId,
        },
      });

      const text = buildModerationPrompt(action);
      const extra = {
        parse_mode: "HTML",
        reply_markup: buildBackToPartnerModerationKeyboard(),
      };

      if (msg) {
        await upsertCallbackMessage(env, msg, text, extra).catch(async () => {
          await sendMessage(env, adminId, text, extra);
        });
        return true;
      }

      await sendMessage(env, adminId, text, extra);
      return true;
    },
  });

  return { EXACT, PREFIX };
}
