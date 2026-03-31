// routes/callbacks/booking.js

import { upsertCallbackMessage } from "../../services/telegramApi.js";
import { acceptCurrentExactProposal, cancelBooking } from "../../repositories/bookingsRepo.js";
import { createBookingEvent } from "../../repositories/bookingEventsRepo.js";
import { CALLBACK_PREFIX } from "../telegram.constants.js";
import { buildBookingExactInputPromptText, buildBookingWindowInputPromptText } from "./booking.render.js";
import { buildBookingInputKeyboard } from "./booking.keyboards.js";
import { persistBookingSession } from "./booking.session.js";
import {
  loadBookingContext,
  notifyBookingCounterparty,
  resolveBookingActorSide,
  sendBookingPanel,
} from "./booking.shared.js";

function normalizeString(value) {
  return String(value || "").trim();
}

function parseBookingId(data, prefix) {
  const raw = String(data || "");
  if (!raw.startsWith(prefix)) return "";
  return normalizeString(raw.slice(prefix.length));
}

async function renderPromptMessage(ctx, bookingId, kind) {
  const { env, adminId, msg } = ctx;
  const context = await loadBookingContext(env, bookingId);
  if (!context?.booking) {
    return sendBookingPanel(env, adminId, bookingId, {
      sourceMessage: msg,
      noticeText: "⚠️ Booking tidak ditemukan.",
    });
  }

  const actorSide = resolveBookingActorSide(context.booking, adminId);
  if (!actorSide) {
    return sendBookingPanel(env, adminId, bookingId, {
      sourceMessage: msg,
      noticeText: "⚠️ Kamu tidak punya akses ke booking ini.",
    });
  }

  await persistBookingSession(env, adminId, null, {
    step: kind === "exact" ? "await_exact_time_input" : "await_window_input",
    data: {
      booking_id: bookingId,
      actor_side: actorSide,
      source_chat_id: msg?.chat?.id ?? adminId,
      source_message_id: msg?.message_id ?? null,
    },
  }, msg);

  const promptText =
    kind === "exact"
      ? buildBookingExactInputPromptText({ booking: context.booking, actorSide })
      : buildBookingWindowInputPromptText({ booking: context.booking, actorSide });

  return upsertCallbackMessage(env, msg, promptText, {
    parse_mode: "HTML",
    reply_markup: buildBookingInputKeyboard(bookingId),
    disable_web_page_preview: true,
  });
}

async function handleBookingSummary(ctx) {
  const bookingId = parseBookingId(ctx?.data, CALLBACK_PREFIX.BK_SUMMARY);
  return sendBookingPanel(ctx.env, ctx.adminId, bookingId, { sourceMessage: ctx.msg });
}

async function handleBookingPromptExact(ctx) {
  const bookingId = parseBookingId(ctx?.data, CALLBACK_PREFIX.BK_PROMPT_EXACT);
  return renderPromptMessage(ctx, bookingId, "exact");
}

async function handleBookingPromptWindow(ctx) {
  const bookingId = parseBookingId(ctx?.data, CALLBACK_PREFIX.BK_PROMPT_WINDOW);
  return renderPromptMessage(ctx, bookingId, "window");
}

async function handleBookingAcceptExact(ctx) {
  const bookingId = parseBookingId(ctx?.data, CALLBACK_PREFIX.BK_ACCEPT_EXACT);
  const context = await loadBookingContext(ctx.env, bookingId);

  if (!context?.booking) {
    return sendBookingPanel(ctx.env, ctx.adminId, bookingId, {
      sourceMessage: ctx.msg,
      noticeText: "⚠️ Booking tidak ditemukan.",
    });
  }

  const actorSide = resolveBookingActorSide(context.booking, ctx.adminId);
  const lastProposalKind = normalizeString(context.booking.last_proposal_kind).toLowerCase();
  const lastProposedBy = normalizeString(context.booking.last_proposed_by).toLowerCase();

  if (!actorSide || lastProposalKind !== "exact" || !context.booking.last_proposed_exact_at) {
    return sendBookingPanel(ctx.env, ctx.adminId, bookingId, {
      sourceMessage: ctx.msg,
      noticeText: "⚠️ Belum ada jam pas yang bisa disetujui.",
    });
  }

  if (lastProposedBy === actorSide) {
    return sendBookingPanel(ctx.env, ctx.adminId, bookingId, {
      sourceMessage: ctx.msg,
      noticeText: "⚠️ Kamu tidak bisa menyetujui usulanmu sendiri.",
    });
  }

  const before = context.booking;
  const updated = await acceptCurrentExactProposal(ctx.env, bookingId);

  await createBookingEvent(ctx.env, {
    bookingId,
    actorTelegramId: ctx.adminId,
    actorType: actorSide,
    eventType: "exact_time_accepted",
    fromStatus: before.status,
    toStatus: updated?.status || "agreed",
    payload: {
      agreed_exact_at: updated?.agreed_exact_at || before.last_proposed_exact_at || null,
    },
  });

  await persistBookingSession(ctx.env, ctx.adminId, null, {
    step: "panel",
    data: {
      booking_id: bookingId,
      actor_side: actorSide,
      source_chat_id: ctx.msg?.chat?.id ?? ctx.adminId,
      source_message_id: ctx.msg?.message_id ?? null,
    },
  }, ctx.msg);

  await sendBookingPanel(ctx.env, ctx.adminId, bookingId, {
    sourceMessage: ctx.msg,
    noticeText: "✅ Jam pas sudah disepakati.",
  });

  await notifyBookingCounterparty(
    ctx.env,
    updated || before,
    ctx.adminId,
    "✅ Pihak lawan menyetujui jam pas ini."
  ).catch(() => null);

  return true;
}

async function handleBookingCancel(ctx) {
  const bookingId = parseBookingId(ctx?.data, CALLBACK_PREFIX.BK_CANCEL);
  const context = await loadBookingContext(ctx.env, bookingId);

  if (!context?.booking) {
    return sendBookingPanel(ctx.env, ctx.adminId, bookingId, {
      sourceMessage: ctx.msg,
      noticeText: "⚠️ Booking tidak ditemukan.",
    });
  }

  const actorSide = resolveBookingActorSide(context.booking, ctx.adminId);
  if (!actorSide) {
    return sendBookingPanel(ctx.env, ctx.adminId, bookingId, {
      sourceMessage: ctx.msg,
      noticeText: "⚠️ Kamu tidak punya akses ke booking ini.",
    });
  }

  const before = context.booking;
  const updated = await cancelBooking(ctx.env, bookingId);

  await createBookingEvent(ctx.env, {
    bookingId,
    actorTelegramId: ctx.adminId,
    actorType: actorSide,
    eventType: "booking_cancelled",
    fromStatus: before.status,
    toStatus: updated?.status || "cancelled",
  });

  await sendBookingPanel(ctx.env, ctx.adminId, bookingId, {
    sourceMessage: ctx.msg,
    noticeText: "❌ Booking dibatalkan.",
  });

  await notifyBookingCounterparty(
    ctx.env,
    updated || before,
    ctx.adminId,
    "❌ Booking ini dibatalkan oleh pihak lawan."
  ).catch(() => null);

  return true;
}

export function buildBookingHandlers() {
  return {
    EXACT: {},
    PREFIX: [
      {
        match: (data) => String(data || "").startsWith(CALLBACK_PREFIX.BK_SUMMARY),
        run: handleBookingSummary,
      },
      {
        match: (data) => String(data || "").startsWith(CALLBACK_PREFIX.BK_PROMPT_EXACT),
        run: handleBookingPromptExact,
      },
      {
        match: (data) => String(data || "").startsWith(CALLBACK_PREFIX.BK_PROMPT_WINDOW),
        run: handleBookingPromptWindow,
      },
      {
        match: (data) => String(data || "").startsWith(CALLBACK_PREFIX.BK_ACCEPT_EXACT),
        run: handleBookingAcceptExact,
      },
      {
        match: (data) => String(data || "").startsWith(CALLBACK_PREFIX.BK_CANCEL),
        run: handleBookingCancel,
      },
    ],
  };
}
