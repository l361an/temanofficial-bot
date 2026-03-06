// routes/telegram.callback.js
import { answerCallbackQuery } from "../services/telegramApi.js";
import { json } from "../utils/response.js";

import { getAdminRole } from "../repositories/adminsRepo.js";
import { isAdminRole, isSuperadminRole } from "../utils/roles.js";

// user callback handler (teman:* + self:*)
import { handleSelfInlineCallback } from "./telegram.commands.user.js";

import { createHandlers } from "./callbacks/registry.js";

const { EXACT, PREFIX } = createHandlers();

export async function handleCallback(update, env) {
  const data = update?.callback_query?.data;
  const adminId = String(update?.callback_query?.from?.id || "");
  const callbackQueryId = update?.callback_query?.id;

  if (!data || !adminId) return json({ ok: true });

  // ack callback (biar UI Telegram nggak loading lama)
  await answerCallbackQuery(env, callbackQueryId).catch(() => {});

  // 1) handle user callbacks first (teman:* dan self:*)
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

  // 2) role gating (tetap sama konsepnya)
  const isOfficerAction =
    data === "officer:home" ||
    data.startsWith("pt:") ||
    data.startsWith("pm:") ||
    data.startsWith("mod:") ||
    data.startsWith("pickver:") ||
    data.startsWith("setver:") ||
    data.startsWith("backver:") ||
    data.startsWith("approve:") ||
    data.startsWith("reject:");

  const isSAAction =
    data.startsWith("sa:") ||
    data.startsWith("setwelcome_confirm:") ||
    data.startsWith("setwelcome_cancel:") ||
    data.startsWith("setlink_confirm:") ||
    data.startsWith("setlink_cancel:");

  if (isOfficerAction && !isAdminRole(role)) return json({ ok: true });
  if (isSAAction && !isSuperadminRole(role)) return json({ ok: true });

  // extra hard gate: mod:delete only superadmin
  if (data === "mod:delete" && !isSuperadminRole(role)) return json({ ok: true });

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
