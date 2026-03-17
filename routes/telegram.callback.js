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

function ok() {
  return json({ ok: true });
}

function isPrivateChat(chat) {
  return String(chat?.type || "").trim().toLowerCase() === "private";
}

function isOwner(role) {
  return String(role || "").trim().toLowerCase() === "owner";
}

function logError(tag, meta = {}) {
  console.error(tag, meta);
}

async function answerCallbackSafely(env, callbackQueryId, options = null, meta = {}) {
  if (!callbackQueryId) return { ok: false, reason: "missing_callback_query_id" };

  try {
    await answerCallbackQuery(env, callbackQueryId, options || undefined);
    return { ok: true };
  } catch (err) {
    logError("[callback.answer.failed]", {
      callbackQueryId,
      ...meta,
      options: options || null,
      err: err?.message || String(err || ""),
    });
    return { ok: false, err };
  }
}

function isVerificationAction(data) {
  const value = String(data || "");
  return (
    value.startsWith(CALLBACK_PREFIX.PICK_VER) ||
    value.startsWith(CALLBACK_PREFIX.SET_VER) ||
    value.startsWith(CALLBACK_PREFIX.APPROVE) ||
    value.startsWith(CALLBACK_PREFIX.REJECT)
  );
}

function isOfficerAction(data) {
  const value = String(data || "");
  return (
    value === CALLBACKS.OFFICER_HOME ||
    value.startsWith("pt:") ||
    value.startsWith("pm:") ||
    value.startsWith("mod:")
  );
}

function buildUnknownCallbackText() {
  return "Panel ini sudah tidak aktif atau menu lama. Silakan buka menu terbaru.";
}

export async function handleCallback(update, env) {
  const callback = update?.callback_query || null;
  const data = String(callback?.data || "");
  const adminId = String(callback?.from?.id || "");
  const callbackQueryId = callback?.id || null;
  const msg = callback?.message || null;
  const chat = msg?.chat || null;
  const msgChatId = msg?.chat?.id;
  const msgId = msg?.message_id;

  if (!data || !adminId) return ok();

  const scopeAllowed = await isScopeAllowed(env, chat, msg).catch((err) => {
    logError("[callback.scope_check.failed]", {
      adminId,
      data,
      msgChatId: msgChatId || null,
      msgId: msgId || null,
      err: err?.message || String(err || ""),
    });
    return false;
  });

  if (!scopeAllowed) return ok();
  if (!isPrivateChat(chat)) return ok();

  try {
    const handledSelf = await handleSelfInlineCallback(update, env);
    if (handledSelf) {
      await answerCallbackSafely(env, callbackQueryId, null, {
        adminId,
        data,
        stage: "self_inline_handled",
      });
      return ok();
    }
  } catch (err) {
    logError("[callback.self_inline.failed]", {
      adminId,
      data,
      msgChatId: msgChatId || null,
      msgId: msgId || null,
      err: err?.message || String(err || ""),
    });
  }

  const role = await getAdminRole(env, adminId).catch((err) => {
    logError("[callback.get_admin_role.failed]", {
      adminId,
      data,
      err: err?.message || String(err || ""),
    });
    return null;
  });

  if (isVerificationAction(data) && !isOwner(role)) {
    await answerCallbackSafely(
      env,
      callbackQueryId,
      {
        text: "Hanya owner yang boleh melakukan approval partner.",
        show_alert: true,
      },
      {
        adminId,
        role,
        data,
        stage: "permission_verification",
      }
    );
    return ok();
  }

  if (isOfficerAction(data) && !isAdminRole(role)) {
    await answerCallbackSafely(
      env,
      callbackQueryId,
      {
        text: "Akses ditolak.",
        show_alert: true,
      },
      {
        adminId,
        role,
        data,
        stage: "permission_officer",
      }
    );
    return ok();
  }

  const ctx = {
    env,
    update,
    data,
    adminId,
    role,
    msg,
    msgChatId,
    msgId,
  };

  try {
    const exactHandler = EXACT[data];
    if (exactHandler) {
      await answerCallbackSafely(env, callbackQueryId, null, {
        adminId,
        role,
        data,
        stage: "exact_ack",
      });

      await exactHandler(ctx);
      return ok();
    }

    for (const handler of PREFIX) {
      if (handler.match(data)) {
        await answerCallbackSafely(env, callbackQueryId, null, {
          adminId,
          role,
          data,
          stage: "prefix_ack",
        });

        await handler.run(ctx);
        return ok();
      }
    }

    await answerCallbackSafely(
      env,
      callbackQueryId,
      {
        text: buildUnknownCallbackText(),
        show_alert: false,
      },
      {
        adminId,
        role,
        data,
        stage: "unknown_callback",
        msgChatId: msgChatId || null,
        msgId: msgId || null,
      }
    );

    logError("[callback.unhandled]", {
      adminId,
      role,
      data,
      msgChatId: msgChatId || null,
      msgId: msgId || null,
    });

    return ok();
  } catch (err) {
    logError("[callback.handler.failed]", {
      adminId,
      role,
      data,
      msgChatId: msgChatId || null,
      msgId: msgId || null,
      err: err?.message || String(err || ""),
    });

    await answerCallbackSafely(
      env,
      callbackQueryId,
      {
        text: "Terjadi error saat memproses menu.",
        show_alert: true,
      },
      {
        adminId,
        role,
        data,
        stage: "handler_failed",
      }
    );

    return ok();
  }
}
