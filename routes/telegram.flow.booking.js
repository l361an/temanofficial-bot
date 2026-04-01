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

function isValidCalendarDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);

  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;

  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

function normalizeSqlDatePart(datePart) {
  const raw = normalizeString(datePart);

  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [, yyyy, mm, dd] = m;
    if (!isValidCalendarDate(yyyy, mm, dd)) return "";
    return `${yyyy}-${mm}-${dd}`;
  }

  m = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    if (!isValidCalendarDate(yyyy, mm, dd)) return "";
    return `${yyyy}-${mm}-${dd}`;
  }

  m = raw.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) {
    const [, dd, mm, yy] = m;
    const yyyy = `20${yy}`;
    if (!isValidCalendarDate(yyyy, mm, dd)) return "";
    return `${yyyy}-${mm}-${dd}`;
  }

  return "";
}

function normalizeHmPart(hmPart) {
  const raw = normalizeString(hmPart);
  const m = raw.match(/^(\d{2}):(\d{2})$/);
  if (!m) return "";

  const [, hh, mi] = m;
  const hour = Number(hh);
  const minute = Number(mi);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return "";
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";

  return `${hh}:${mi}`;
}

function buildSqlDateTime(datePart, hmPart) {
  const sqlDate = normalizeSqlDatePart(datePart);
  const sqlHm = normalizeHmPart(hmPart);

  if (!sqlDate || !sqlHm) return "";
  return `${sqlDate} ${sqlHm}`;
}

function parseExactInput(text) {
  const raw = normalizeString(text);
  const m = raw.match(/^([0-9-]{8,10})\s+(\d{2}:\d{2})$/);
  if (!m) return null;

  const exactAt = buildSqlDateTime(m[1], m[2]);
  return exactAt || null;
}

function parseWindowInput(text) {
  const raw = normalizeString(text);
  const m = raw.match(/^([0-9-]{8,10})\s+(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);

  if (!m) {
    return { ok: false, reason: "invalid_format" };
  }

  const [, datePart, startHm, endHm] = m;
  const windowStartAt = buildSqlDateTime(datePart, startHm);
  const windowEndAt = buildSqlDateTime(datePart, endHm);

  if (!windowStartAt || !windowEndAt) {
    return { ok: false, reason: "invalid_format" };
  }

  if (windowEndAt <= windowStartAt) {
    return { ok: false, reason: "invalid_range" };
  }

  return {
    ok: true,
    windowStartAt,
    windowEndAt,
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
        "Format waktu salah.\nContoh: 05-04-26 18:30",
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
      noticeText: "✅ Usulan waktu pas sudah dikirim.",
    });

    await notifyBookingCounterparty(
      env,
      updated,
      telegramId,
      "🕒 Ada usulan waktu pas baru. Buka panel booking untuk melihat."
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
    if (!parsedWindow?.ok) {
      const errorText =
        parsedWindow?.reason === "invalid_range"
          ? "Rentang waktu tidak valid.\nJam akhir harus lebih besar dari jam awal.\nContoh: 05-04-26 18:00 - 20:00"
          : "Format rentang waktu salah.\nContoh: 05-04-26 18:00 - 20:00";

      await sendMessage(
        env,
        chatId,
        errorText,
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
