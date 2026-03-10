// routes/callbacks/partnerDatabase.session.js

import { saveSession } from "../../utils/session.js";
import { SESSION_MODES } from "../telegram.constants.js";

/**
 * Resolve anchor message for UI editing
 * Ensures bot always edits the same message instead of sending new ones
 */
export function readSourceMessage(session, fallbackMessage = null, adminId = null) {
  const sourceChatId =
    session?.data?.source_chat_id ??
    fallbackMessage?.chat?.id ??
    adminId ??
    null;

  const sourceMessageId =
    session?.data?.source_message_id ??
    fallbackMessage?.message_id ??
    null;

  if (!sourceChatId || !sourceMessageId) return null;

  return {
    chat: { id: sourceChatId },
    message_id: sourceMessageId,
    text: "Partner Database",
  };
}

/**
 * Resolve target telegram id from callback or stored session
 */
export function resolveTargetTelegramId(rawTelegramId, session) {
  const direct = String(rawTelegramId || "").trim();
  if (direct) return direct;

  const selected = String(session?.data?.selected_partner_id || "").trim();
  if (selected) return selected;

  return "";
}

/**
 * Persist UI session state
 * Guarantees anchor message is always stored
 */
export async function persistPartnerViewSession(
  env,
  adminId,
  currentSession,
  patch = {},
  fallbackMessage = null
) {
  const sourceChatId =
    patch?.data?.source_chat_id ??
    currentSession?.data?.source_chat_id ??
    fallbackMessage?.chat?.id ??
    adminId;

  const sourceMessageId =
    patch?.data?.source_message_id ??
    currentSession?.data?.source_message_id ??
    fallbackMessage?.message_id ??
    null;

  const baseData = {
    source_chat_id: sourceChatId,
    source_message_id: sourceMessageId,

    selected_partner_id:
      patch?.data?.selected_partner_id ??
      currentSession?.data?.selected_partner_id ??
      null,

    selected_input:
      patch?.data?.selected_input ??
      currentSession?.data?.selected_input ??
      null,

    details_anchor_chat_id:
      patch?.data?.details_anchor_chat_id ??
      currentSession?.data?.details_anchor_chat_id ??
      null,

    details_anchor_message_id:
      patch?.data?.details_anchor_message_id ??
      currentSession?.data?.details_anchor_message_id ??
      null,
  };

  await saveSession(env, `state:${adminId}`, {
    mode: SESSION_MODES.PARTNER_VIEW,
    step: patch?.step ?? currentSession?.step ?? "await_target",
    data: baseData,
  });
}
