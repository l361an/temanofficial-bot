// routes/telegram.callback.js

import { answerCallbackQuery } from "../services/telegramApi.js";
import { json } from "../utils/response.js";

import { getAdminRole } from "../repositories/adminsRepo.js";
import { isAdminRole } from "../utils/roles.js";

import { handleSelfInlineCallback } from "./telegram.commands.user.js";
import { createHandlers } from "./callbacks/registry.js";
import { CALLBACKS, CALLBACK_PREFIX } from "./telegram.constants.js";
import { isScopeAllowed } from "./telegram.guard.js";

const { EXACT, PREFIX } = createHandlers();

function isPrivateChat(chat) {
  return String(chat?.type || "").trim().toLowerCase() === "private";
}

function isOwner(role) {
  return role === "owner";
}

export async function handleCallback(update, env) {
  const data = update?.callback_query?.data;
  const adminId = String(update?.callback_query?.from?.id || "");
  const callbackQueryId = update?.callback_query?.id;

  if (!data || !adminId) return json({ ok: true });

  const msg = update?.callback_query?.message;
  const chat = msg?.chat || null;

  const scopeAllowed = await isScopeAllowed(env, chat, msg).catch(() => false);
  if (!scopeAllowed) return json({ ok: true });

  if (!isPrivateChat(chat)) return json({ ok: true });

  try {
    const handled = await handleSelfInlineCallback(update, env);
    if (handled) {
      await answerCallbackQuery(env, callbackQueryId).catch(() => {});
      return json({ ok: true });
    }
  } catch (e) {
    console.error("USER CALLBACK ERROR:", e);
  }

  const msgChatId = msg?.chat?.id;
  const msgId = msg?.message_id;

  const role = await getAdminRole(env, adminId);

  const isVerificationAction =
    data.startsWith(CALLBACK_PREFIX.PICK_VER) ||
    data.startsWith(CALLBACK_PREFIX.SET_VER) ||
    data.startsWith(CALLBACK_PREFIX.APPROVE) ||
    data.startsWith(CALLBACK_PREFIX.REJECT);

  if (isVerificationAction && !isOwner(role)) {
    await answerCallbackQuery(env, callbackQueryId, {
      text: "Hanya owner yang boleh melakukan approval partner.",
      show_alert: true,
    }).catch(() => {});
    return json({ ok: true });
  }

  const isOfficerAction =
    data === CALLBACKS.OFFICER_HOME ||
    data.startsWith("pt:") ||
    data.startsWith("pm:") ||
    data.startsWith("mod:");

  if (isOfficerAction && !isAdminRole(role)) {
    await answerCallbackQuery(env, callbackQueryId, {
      text: "Akses ditolak.",
      show_alert: true,
    }).catch(() => {});
    return json({ ok: true });
  }

  await answerCallbackQuery(env, callbackQueryId).catch(() => {});

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

    return json({ ok: true });
  } catch (e) {
    console.error("CALLBACK ERROR:", e);

    await answerCallbackQuery(env, callbackQueryId, {
      text: "Terjadi error saat memproses menu.",
      show_alert: true,
    }).catch(() => {});
  }

  return json({ ok: true });
}
