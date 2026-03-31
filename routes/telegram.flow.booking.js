// routes/telegram.flow.booking.js

import { sendMessage } from "../services/telegramApi.js";
import {
  proposeBookingExactTime,
  proposeBookingWindowTime,
} from "../repositories/bookingsRepo.js";
import { createBookingEvent } from "../repositories/bookingEventsRepo.js";
import { buildBookingInputKeyboard } from "./callbacks/booking.keyboards.js";
import { persistBookingSession } from "./callbacks/booking.session.js";
import { notifyBookingCounterparty, sendBookingPanel } from "./callbacks/booking.shared.js";

function normalizeString(value) {
  return String(value || "").trim();
}

function makeId() {
  return crypto.randomUUID();
}

function isCancelText(text) {
  const raw = normalizeString(text).toLowerCase();
  return raw === "batal" || raw === "/batal" || raw === "cancel" || raw === "/cancel";
}

function isValidSqlDateTime(value) {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalizeString(value));
}

function parseExactInput(text) {
  const raw = normalizeString(text);
  if (!isValidSqlDateTime(raw)) return null;
  return raw;
}

function parseWindowInput(text) {
  const raw = normalizeString(text);
  const m = raw.match(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/
  );

  if (!m) return null;

  const [, datePart, startHm, endHm] = m;
  return {
    windowStartAt: `${datePart} ${startHm}`,
    windowEndAt: `${datePart} ${endHm}`,
  };
}

export async function handleBookingSessionInput({
  env,
  chatId,
  telegramId,
  text,
  msg,
  session,
  STATE_KEY,
}) {
  if (!session || session.mode !== "booking") return false;

  const bookingId = normalizeString(session?.data?.booking_id);
  const actorSide = normalizeString(session?.data?.actor_side || "user").toLowerCase();
  const step = normalizeString(session?.step || "panel").toLowerCase();

  if (!bookingId) {
    return false;
  }

  if (step === "await_exact_time_input") {
    if (isCancelText(text)) {
      await persistBookingSession(
        env,
        telegramId,
        session,
        {
          step: "panel",
          data: {
            booking_id: bookingId,
            actor_side: actorSide,
          },
        },
        msg
      );

      await sendBookingPanel(env, telegramId, bookingId, {
        noticeText: "↩️ Kembali ke ringkasan booking.",
      });

      return true;
    }

    const exactAt = parseExactInput(text);
    if (!exactAt) {
      await sendMessage(
        env,
        chatId,
        "Format jam pas salah.\nContoh: 2026-04-05 18:30",
        {
          reply_markup: buildBookingInputKeyboard(bookingId),
        }
      );
      return true;
    }

    const updated = await proposeBookingExactTime(env, bookingId, {
      actorSide,
      actorTelegramId: telegramId,
      exactAt,
    });

    await createBookingEvent(env, {
      id: makeId(),
      bookingId,
      actorTelegramId: telegramId,
      actorType: actorSide,
      eventType: "exact_time_proposed",
      fromStatus: updated?.status || "negotiating",
      toStatus: updated?.status || "negotiating",
      payload: {
        exact_at: exactAt,
      },
    }).catch(() => null);

    await persistBookingSession(
      env,
      telegramId,
      session,
      {
        step: "panel",
        data: {
          booking_id: bookingId,
          actor_side: actorSide,
        },
      },
      msg
    );

    await sendBookingPanel(env, telegramId, bookingId, {
      noticeText: "✅ Usulan jam pas sudah dikirim.",
    });

    await notifyBookingCounterparty(
      env,
      updated,
      telegramId,
      "🕒 Ada usulan jam pas baru. Buka panel booking untuk melihat."
    ).catch(() => null);

    return true;
  }

  if (step === "await_window_input") {
    if (isCancelText(text)) {
      await persistBookingSession(
        env,
        telegramId,
        session,
        {
          step: "panel",
          data: {
            booking_id: bookingId,
            actor_side: actorSide,
          },
        },
        msg
      );

      await sendBookingPanel(env, telegramId, bookingId, {
        noticeText: "↩️ Kembali ke ringkasan booking.",
      });

      return true;
    }

    const parsedWindow = parseWindowInput(text);
    if (!parsedWindow) {
      await sendMessage(
        env,
        chatId,
        "Format rentang waktu salah.\nContoh: 2026-04-05 18:00 - 20:00",
        {
          reply_markup: buildBookingInputKeyboard(bookingId),
        }
      );
      return true;
    }

    const updated = await proposeBookingWindowTime(env, bookingId, {
      actorSide,
      actorTelegramId: telegramId,
      windowStartAt: parsedWindow.windowStartAt,
      windowEndAt: parsedWindow.windowEndAt,
    });

    await createBookingEvent(env, {
      id: makeId(),
      bookingId,
      actorTelegramId: telegramId,
      actorType: actorSide,
      eventType: "window_time_proposed",
      fromStatus: updated?.status || "negotiating",
      toStatus: updated?.status || "negotiating",
      payload: {
        window_start_at: parsedWindow.windowStartAt,
        window_end_at: parsedWindow.windowEndAt,
      },
    }).catch(() => null);

    await persistBookingSession(
      env,
      telegramId,
      session,
      {
        step: "panel",
        data: {
          booking_id: bookingId,
          actor_side: actorSide,
        },
      },
      msg
    );

    await sendBookingPanel(env, telegramId, bookingId, {
      noticeText: "✅ Usulan rentang waktu sudah dikirim.",
    });

    await notifyBookingCounterparty(
      env,
      updated,
      telegramId,
      "🪟 Ada usulan rentang waktu baru. Buka panel booking untuk melihat."
    ).catch(() => null);

    return true;
  }

  await sendBookingPanel(env, telegramId, bookingId, {
    noticeText: "Gunakan tombol di panel booking.",
  }).catch(() => null);

  return true;
}
