// repositories/bookingEventsRepo.js

function normalizeString(value) {
  return String(value || "").trim();
}

function safeJsonStringify(value) {
  if (value == null) return null;

  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function mapRow(row) {
  if (!row) return null;

  return {
    ...row,
    payload: (() => {
      const raw = normalizeString(row.payload_json);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })(),
  };
}

export async function createBookingEvent(env, payload) {
  const {
    id,
    bookingId,
    actorTelegramId = null,
    actorType = null,
    eventType,
    fromStatus = null,
    toStatus = null,
    payload: eventPayload = null,
  } = payload || {};

  await env.DB.prepare(
    `
    INSERT INTO booking_events (
      id,
      booking_id,
      actor_telegram_id,
      actor_type,
      event_type,
      from_status,
      to_status,
      payload_json,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `
  )
    .bind(
      String(id),
      String(bookingId),
      actorTelegramId == null ? null : String(actorTelegramId),
      actorType == null ? null : String(actorType),
      String(eventType || ""),
      fromStatus == null ? null : String(fromStatus),
      toStatus == null ? null : String(toStatus),
      safeJsonStringify(eventPayload)
    )
    .run();

  return { ok: true };
}

export async function listBookingEvents(env, bookingId) {
  const { results } = await env.DB.prepare(
    `
    SELECT *
    FROM booking_events
    WHERE booking_id = ?
    ORDER BY datetime(created_at) ASC, id ASC
  `
  )
    .bind(String(bookingId))
    .all();

  return (results || []).map(mapRow).filter(Boolean);
}
