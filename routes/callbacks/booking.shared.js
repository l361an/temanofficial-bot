// routes/callbacks/booking.shared.js

import { sendMessage, upsertCallbackMessage } from "../../services/telegramApi.js";
import { getProfileFullByTelegramId } from "../../repositories/profilesRepo.js";
import { getBookingById } from "../../repositories/bookingsRepo.js";
import { buildBookingPanelText } from "./booking.render.js";
import { buildBookingPanelKeyboard } from "./booking.keyboards.js";

function normalizeString(value) {
  return String(value || "").trim();
}

export function resolveBookingActorSide(booking, actorId) {
  const safeActorId = normalizeString(actorId);
  if (!safeActorId || !booking) return "";
  if (safeActorId === normalizeString(booking.partner_telegram_id)) return "partner";
  if (safeActorId === normalizeString(booking.user_telegram_id)) return "user";
  return "";
}

export async function loadBookingContext(env, bookingId) {
  const booking = await getBookingById(env, bookingId);
  if (!booking) return null;

  const partnerProfile = await getProfileFullByTelegramId(env, booking.partner_telegram_id).catch(() => null);

  return {
    booking,
    partnerProfile,
  };
}

export function buildBookingPanelPayload(context, actorSide, noticeText = "") {
  return {
    text: buildBookingPanelText({
      booking: context.booking,
      actorSide,
      partnerProfile: context.partnerProfile,
      noticeText,
    }),
    reply_markup: buildBookingPanelKeyboard(context.booking, actorSide),
  };
}

export async function sendBookingPanel(env, actorId, bookingId, options = {}) {
  const { sourceMessage = null, noticeText = "" } = options;
  const context = await loadBookingContext(env, bookingId);

  if (!context?.booking) {
    return { ok: false, reason: "booking_not_found" };
  }

  const actorSide = resolveBookingActorSide(context.booking, actorId);
  if (!actorSide) {
    return { ok: false, reason: "booking_actor_not_allowed" };
  }

  const payload = buildBookingPanelPayload(context, actorSide, noticeText);
  const extra = {
    parse_mode: "HTML",
    reply_markup: payload.reply_markup,
    disable_web_page_preview: true,
  };

  if (sourceMessage) {
    const res = await upsertCallbackMessage(env, sourceMessage, payload.text, extra);
    return {
      ...res,
      actor_side: actorSide,
      booking: context.booking,
      partner_profile: context.partnerProfile,
    };
  }

  const res = await sendMessage(env, actorId, payload.text, extra);
  return {
    ...res,
    actor_side: actorSide,
    booking: context.booking,
    partner_profile: context.partnerProfile,
  };
}

export async function notifyBookingCounterparty(env, booking, senderActorId, noticeText = "") {
  const senderId = normalizeString(senderActorId);
  const partnerId = normalizeString(booking?.partner_telegram_id);
  const userId = normalizeString(booking?.user_telegram_id);

  const targetId = senderId === partnerId ? userId : partnerId;
  if (!targetId) {
    return { ok: false, reason: "counterparty_not_found" };
  }

  return sendBookingPanel(env, targetId, booking?.id, { noticeText });
}
