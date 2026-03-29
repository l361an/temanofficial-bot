// routes/callbacks/partnerDatabase.session.js

import { saveSession } from "../../utils/session.js";
import { SESSION_MODES } from "../telegram.constants.js";

function hasOwn(obj, key) {
  return Boolean(obj) && Object.prototype.hasOwnProperty.call(obj, key);
}

function pickPatchedValue(patchData, currentData, key, fallback = null) {
  if (hasOwn(patchData, key)) return patchData[key];
  if (hasOwn(currentData, key)) return currentData[key];
  return fallback;
}

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
  const patchData = patch?.data || {};
  const currentData = currentSession?.data || {};

  const sourceChatId =
    hasOwn(patchData, "source_chat_id")
      ? patchData.source_chat_id
      : hasOwn(currentData, "source_chat_id")
      ? currentData.source_chat_id
      : fallbackMessage?.chat?.id ?? adminId;

  const sourceMessageId =
    hasOwn(patchData, "source_message_id")
      ? patchData.source_message_id
      : hasOwn(currentData, "source_message_id")
      ? currentData.source_message_id
      : fallbackMessage?.message_id ?? null;

  const baseData = {
    source_chat_id: sourceChatId,
    source_message_id: sourceMessageId,

    selected_partner_id: pickPatchedValue(patchData, currentData, "selected_partner_id", null),
    selected_input: pickPatchedValue(patchData, currentData, "selected_input", null),

    details_anchor_chat_id: pickPatchedValue(
      patchData,
      currentData,
      "details_anchor_chat_id",
      null
    ),
    details_anchor_message_id: pickPatchedValue(
      patchData,
      currentData,
      "details_anchor_message_id",
      null
    ),

    subscription_adjust_action: pickPatchedValue(
      patchData,
      currentData,
      "subscription_adjust_action",
      null
    ),
  };

  await saveSession(env, `state:${adminId}`, {
    mode: SESSION_MODES.PARTNER_VIEW,
    step: patch?.step ?? currentSession?.step ?? "await_target",
    data: baseData,
  });
}
