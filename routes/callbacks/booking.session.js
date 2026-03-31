// routes/callbacks/booking.session.js

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

export function readBookingSourceMessage(session, fallbackMessage = null, actorId = null) {
  const sourceChatId =
    session?.data?.source_chat_id ??
    fallbackMessage?.chat?.id ??
    actorId ??
    null;

  const sourceMessageId =
    session?.data?.source_message_id ??
    fallbackMessage?.message_id ??
    null;

  if (!sourceChatId || !sourceMessageId) return null;

  return {
    chat: { id: sourceChatId },
    message_id: sourceMessageId,
    text: "Safety Booking",
  };
}

export async function persistBookingSession(
  env,
  actorId,
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
        : fallbackMessage?.chat?.id ?? actorId;

  const sourceMessageId =
    hasOwn(patchData, "source_message_id")
      ? patchData.source_message_id
      : hasOwn(currentData, "source_message_id")
        ? currentData.source_message_id
        : fallbackMessage?.message_id ?? null;

  const baseData = {
    source_chat_id: sourceChatId,
    source_message_id: sourceMessageId,
    booking_id: pickPatchedValue(patchData, currentData, "booking_id", null),
    actor_side: pickPatchedValue(patchData, currentData, "actor_side", "user"),
  };

  await saveSession(env, `state:${actorId}`, {
    mode: SESSION_MODES.BOOKING,
    step: patch?.step ?? currentSession?.step ?? "panel",
    data: baseData,
  });
}
