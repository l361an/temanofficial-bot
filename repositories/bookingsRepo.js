// repositories/bookingsRepo.js

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function nowSql() {
  return "datetime('now')";
}

function isOpenStatus(status) {
  return ["negotiating", "agreed", "awaiting_dp", "dp_review", "secured", "partner_terlambat", "user_terlambat", "menunggu_bantuan_admin"]
    .includes(normalizeLower(status));
}

function mapBookingRow(row) {
  if (!row) return null;

  return {
    ...row,
    negotiation_round_count: Number(row.negotiation_round_count || 0),
    late_tolerance_minutes: Number(row.late_tolerance_minutes || 0),
    dp_amount: Number(row.dp_amount || 0),
    admin_share_percent: Number(row.admin_share_percent || 0),
    extra_charge_amount: Number(row.extra_charge_amount || 0),
    dukungan_teman_amount: Number(row.dukungan_teman_amount || 0),
    unique_code: Number(row.unique_code || 0),
    total_transfer: Number(row.total_transfer || 0),
  };
}

export async function getBookingById(env, bookingId) {
  const row = await env.DB.prepare(
    `
    SELECT *
    FROM bookings
    WHERE id = ?
    LIMIT 1
  `
  )
    .bind(String(bookingId))
    .first();

  return mapBookingRow(row);
}

export async function getOpenBookingByUserAndPartner(env, userTelegramId, partnerTelegramId) {
  const { results } = await env.DB.prepare(
    `
    SELECT *
    FROM bookings
    WHERE user_telegram_id = ?
      AND partner_telegram_id = ?
      AND status IN (
        'negotiating',
        'agreed',
        'awaiting_dp',
        'dp_review',
        'secured',
        'partner_terlambat',
        'user_terlambat',
        'menunggu_bantuan_admin'
      )
    ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
    LIMIT 1
  `
  )
    .bind(String(userTelegramId), String(partnerTelegramId))
    .all();

  return mapBookingRow(results?.[0] || null);
}

export async function createBooking(env, payload) {
  const {
    id,
    userTelegramId,
    partnerTelegramId,
    sourceCategoryCode = null,
    status = "negotiating",
    lateToleranceMinutes = 30,
    dpAmount = 100000,
    adminSharePercent = 10,
    extraChargeMode = "none",
    extraChargeAmount = 0,
    dukunganTemanAmount = 0,
    uniqueCode = 0,
    totalTransfer = 0,
  } = payload || {};

  await env.DB.prepare(
    `
    INSERT INTO bookings (
      id,
      user_telegram_id,
      partner_telegram_id,
      source_category_code,
      status,
      negotiation_round_count,
      late_tolerance_minutes,
      dp_amount,
      admin_share_percent,
      extra_charge_mode,
      extra_charge_amount,
      dukungan_teman_amount,
      unique_code,
      total_transfer,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ${nowSql()}, ${nowSql()})
  `
  )
    .bind(
      String(id),
      String(userTelegramId),
      String(partnerTelegramId),
      sourceCategoryCode == null ? null : String(sourceCategoryCode).toLowerCase(),
      String(status || "negotiating"),
      Number(lateToleranceMinutes || 30),
      Number(dpAmount || 100000),
      Number(adminSharePercent || 10),
      String(extraChargeMode || "none"),
      Number(extraChargeAmount || 0),
      Number(dukunganTemanAmount || 0),
      Number(uniqueCode || 0),
      Number(totalTransfer || 0)
    )
    .run();

  return getBookingById(env, id);
}

export async function findOrCreateBooking(env, payload) {
  const existing = await getOpenBookingByUserAndPartner(
    env,
    payload?.userTelegramId,
    payload?.partnerTelegramId
  );

  if (existing) return existing;
  return createBooking(env, payload);
}

export async function proposeBookingExactTime(env, bookingId, payload) {
  const {
    actorSide = "user",
    actorTelegramId,
    exactAt,
  } = payload || {};

  await env.DB.prepare(
    `
    UPDATE bookings
    SET status = 'negotiating',
        negotiation_round_count = COALESCE(negotiation_round_count, 0) + 1,
        last_proposal_kind = 'exact',
        last_proposed_exact_at = ?,
        last_proposed_window_start_at = NULL,
        last_proposed_window_end_at = NULL,
        last_proposed_by = ?,
        last_proposed_by_telegram_id = ?,
        last_proposed_at = ${nowSql()},
        updated_at = ${nowSql()}
    WHERE id = ?
  `
  )
    .bind(
      String(exactAt),
      String(actorSide || "user"),
      actorTelegramId == null ? null : String(actorTelegramId),
      String(bookingId)
    )
    .run();

  return getBookingById(env, bookingId);
}

export async function proposeBookingWindowTime(env, bookingId, payload) {
  const {
    actorSide = "user",
    actorTelegramId,
    windowStartAt,
    windowEndAt,
  } = payload || {};

  await env.DB.prepare(
    `
    UPDATE bookings
    SET status = 'negotiating',
        negotiation_round_count = COALESCE(negotiation_round_count, 0) + 1,
        last_proposal_kind = 'window',
        last_proposed_exact_at = NULL,
        last_proposed_window_start_at = ?,
        last_proposed_window_end_at = ?,
        last_proposed_by = ?,
        last_proposed_by_telegram_id = ?,
        last_proposed_at = ${nowSql()},
        updated_at = ${nowSql()}
    WHERE id = ?
  `
  )
    .bind(
      String(windowStartAt),
      String(windowEndAt),
      String(actorSide || "user"),
      actorTelegramId == null ? null : String(actorTelegramId),
      String(bookingId)
    )
    .run();

  return getBookingById(env, bookingId);
}

export async function acceptCurrentExactProposal(env, bookingId) {
  const current = await getBookingById(env, bookingId);
  if (!current) return null;

  const exactAt = normalizeString(current.last_proposed_exact_at);
  if (!exactAt) return current;

  await env.DB.prepare(
    `
    UPDATE bookings
    SET status = 'agreed',
        agreed_exact_at = ?,
        updated_at = ${nowSql()}
    WHERE id = ?
  `
  )
    .bind(exactAt, String(bookingId))
    .run();

  return getBookingById(env, bookingId);
}

export async function cancelBooking(env, bookingId) {
  await env.DB.prepare(
    `
    UPDATE bookings
    SET status = 'cancelled',
        cancelled_at = ${nowSql()},
        updated_at = ${nowSql()}
    WHERE id = ?
  `
  )
    .bind(String(bookingId))
    .run();

  return getBookingById(env, bookingId);
}

export async function markBookingExpired(env, bookingId) {
  await env.DB.prepare(
    `
    UPDATE bookings
    SET status = 'expired',
        expired_at = ${nowSql()},
        updated_at = ${nowSql()}
    WHERE id = ?
  `
  )
    .bind(String(bookingId))
    .run();

  return getBookingById(env, bookingId);
}

export async function markBookingCompleted(env, bookingId) {
  await env.DB.prepare(
    `
    UPDATE bookings
    SET status = 'completed',
        completed_at = ${nowSql()},
        updated_at = ${nowSql()}
    WHERE id = ?
  `
  )
    .bind(String(bookingId))
    .run();

  return getBookingById(env, bookingId);
}

export async function requestBookingAdminHelp(env, bookingId) {
  await env.DB.prepare(
    `
    UPDATE bookings
    SET status = 'menunggu_bantuan_admin',
        admin_help_requested_at = ${nowSql()},
        updated_at = ${nowSql()}
    WHERE id = ?
  `
  )
    .bind(String(bookingId))
    .run();

  return getBookingById(env, bookingId);
}

export async function markBookingSecured(env, bookingId) {
  await env.DB.prepare(
    `
    UPDATE bookings
    SET status = 'secured',
        secured_at = ${nowSql()},
        updated_at = ${nowSql()}
    WHERE id = ?
  `
  )
    .bind(String(bookingId))
    .run();

  return getBookingById(env, bookingId);
}

export async function markBookingLateStatus(env, bookingId, lateStatus) {
  const safeStatus = normalizeLower(lateStatus);
  if (safeStatus !== "partner_terlambat" && safeStatus !== "user_terlambat") {
    return getBookingById(env, bookingId);
  }

  await env.DB.prepare(
    `
    UPDATE bookings
    SET status = ?,
        updated_at = ${nowSql()}
    WHERE id = ?
  `
  )
    .bind(String(safeStatus), String(bookingId))
    .run();

  return getBookingById(env, bookingId);
}
