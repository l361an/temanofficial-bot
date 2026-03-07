// routes/telegram.callback.js
import { answerCallbackQuery } from "../services/telegramApi.js";
import { json } from "../utils/response.js";

import { getAdminRole } from "../repositories/adminsRepo.js";
import { isAdminRole, isSuperadminRole } from "../utils/roles.js";

import { handleSelfInlineCallback } from "./telegram.commands.user.js";
import { createHandlers } from "./callbacks/registry.js";
import { CALLBACKS, CALLBACK_PREFIX } from "./telegram.constants.js";

const { EXACT, PREFIX } = createHandlers();

export async function handleCallback(update, env) {
  const data = update?.callback_query?.data;
  const adminId = String(update?.callback_query?.from?.id || "");
  const callbackQueryId = update?.callback_query?.id;

  if (!data || !adminId) return json({ ok: true });

  await answerCallbackQuery(env, callbackQueryId).catch(() => {});

  try {
    const handled = await handleSelfInlineCallback(update, env);
    if (handled) return json({ ok: true });
  } catch (e) {
    console.error("USER CALLBACK ERROR:", e);
  }

  const msg = update?.callback_query?.message;
  const msgChatId = msg?.chat?.id;
  const msgId = msg?.message_id;

  const role = await getAdminRole(env, adminId);

  const isOfficerAction =
    data === CALLBACKS.OFFICER_HOME ||
    data.startsWith("pt:") ||
    data.startsWith("pm:") ||
    data.startsWith("mod:") ||
    data.startsWith(CALLBACK_PREFIX.PICK_VER) ||
    data.startsWith(CALLBACK_PREFIX.SET_VER) ||
    data.startsWith(CALLBACK_PREFIX.BACK_VER) ||
    data.startsWith(CALLBACK_PREFIX.APPROVE) ||
    data.startsWith(CALLBACK_PREFIX.REJECT);

  const isSAAction =
    data.startsWith("sa:") ||
    data.startsWith(CALLBACK_PREFIX.PM_CLASS_START) ||
    data.startsWith(CALLBACK_PREFIX.PM_CLASS_SET) ||
    data.startsWith(CALLBACK_PREFIX.PM_CLASS_BACK) ||
    data.startsWith(CALLBACK_PREFIX.PM_VER_START) ||
    data.startsWith(CALLBACK_PREFIX.PM_VER_SET) ||
    data.startsWith(CALLBACK_PREFIX.PM_VER_BACK) ||
    data.startsWith(CALLBACK_PREFIX.PM_PHOTO_START) ||
    data.startsWith(CALLBACK_PREFIX.SETWELCOME_CONFIRM) ||
    data.startsWith(CALLBACK_PREFIX.SETWELCOME_CANCEL) ||
    data.startsWith(CALLBACK_PREFIX.SETLINK_CONFIRM) ||
    data.startsWith(CALLBACK_PREFIX.SETLINK_CANCEL);

  if (isOfficerAction && !isAdminRole(role)) return json({ ok: true });
  if (isSAAction && !isSuperadminRole(role)) return json({ ok: true });

  if (data === CALLBACKS.PARTNER_MOD_DELETE && !isSuperadminRole(role)) return json({ ok: true });

  const ctx = { env, update, data, adminId, role, msg, msgChatId, msgId };

  try {
    const fn = EXACT[data];
    if (fn) {
      await fn(ctx);
      return json({ ok: true });
    }

    for (const h of PREFIX) {
      if (h.match(data)) {
        await h.run(ctx);
        return json({ ok: true });
      }
    }
  } catch (e) {
    console.error("CALLBACK ERROR:", e);
  }

  return json({ ok: true });
}
