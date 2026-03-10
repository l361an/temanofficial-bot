// repositories/partnerSubscriptionsRepo.js

function normalizeReminderColumn(reminderKey) {
  const raw = String(reminderKey || "").trim().toLowerCase();
  if (raw === "h3d") return "reminder_h3d_sent_at";
  if (raw === "h2d") return "reminder_h2d_sent_at";
  if (raw === "h1d") return "reminder_h1d_sent_at";
  if (raw === "h3h") return "reminder_h3h_sent_at";
  throw new Error("invalid_reminder_key");
}

export async function listActiveSubscriptionsByTelegramId(env, telegramId) {
  const { results } = await env.DB.prepare(
    `
    SELECT *
    FROM partner_subscriptions
    WHERE partner_id = ?
      AND status = 'active'
      AND start_at IS NOT NULL
      AND end_at IS NOT NULL
      AND datetime(end_at) > datetime('now')
    ORDER BY datetime(start_at) ASC, datetime(end_at) DESC, datetime(created_at) DESC
  `
  )
    .bind(String(telegramId))
    .all();

  return Array.isArray(results) ? results : [];
}

export async function getActiveSubscriptionByTelegramId(env, telegramId) {
  const row = await env.DB.prepare(
    `
    SELECT *
    FROM partner_subscriptions
    WHERE partner_id = ?
      AND status = 'active'
      AND start_at IS NOT NULL
      AND end_at IS NOT NULL
      AND datetime(start_at) <= datetime('now')
      AND datetime(end_at) > datetime('now')
    ORDER BY datetime(end_at) DESC, datetime(start_at) ASC, datetime(created_at) DESC
    LIMIT 1
  `
  )
    .bind(String(telegramId))
    .first();

  return row ?? null;
}

export async function getLatestSubscriptionByTelegramId(env, telegramId) {
  const row = await env.DB.prepare(
    `
    SELECT *
    FROM partner_subscriptions
    WHERE partner_id = ?
    ORDER BY datetime(created_at) DESC, datetime(updated_at) DESC, id DESC
    LIMIT 1
  `
  )
    .bind(String(telegramId))
    .first();

  return row ?? null;
}

export async function getSubscriptionById(env, id) {
  const row = await env.DB.prepare(
    `
    SELECT *
    FROM partner_subscriptions
    WHERE id = ?
    LIMIT 1
  `
  )
    .bind(String(id))
    .first();

  return row ?? null;
}

export async function createPartnerSubscription(env, payload) {
  const {
    id,
    partnerId,
    paymentTicketId = null,
    classId,
    durationMonths = 0,
    status = "active",
    startAt,
    endAt,
    activatedAt = null,
    expiredAt = null,
    cancelledAt = null,
    cancelledBy = null,
    cancelReason = null,
    reminderH3dSentAt = null,
    reminderH2dSentAt = null,
    reminderH1dSentAt = null,
    reminderH3hSentAt = null,
    sourceType = "payment_ticket",
    sourceRefId = null,
    notes = null,
    metadataJson = null,
  } = payload || {};

  const normalizedDurationMonths = Number(durationMonths);
  const safeDurationMonths =
    Number.isFinite(normalizedDurationMonths) && normalizedDurationMonths >= 0
      ? normalizedDurationMonths
      : 0;

  await env.DB.prepare(
    `
    INSERT INTO partner_subscriptions (
      id,
      partner_id,
      payment_ticket_id,
      class_id,
      duration_months,
      status,
      start_at,
      end_at,
      activated_at,
      expired_at,
      cancelled_at,
      cancelled_by,
      cancel_reason,
      reminder_h3d_sent_at,
      reminder_h2d_sent_at,
      reminder_h1d_sent_at,
      reminder_h3h_sent_at,
      source_type,
      source_ref_id,
      notes,
      metadata_json,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `
  )
    .bind(
      String(id),
      String(partnerId),
      paymentTicketId == null ? null : Number(paymentTicketId),
      String(classId || "bronze").toLowerCase(),
      safeDurationMonths,
      String(status),
      String(startAt),
      String(endAt),
      activatedAt == null ? null : String(activatedAt),
      expiredAt == null ? null : String(expiredAt),
      cancelledAt == null ? null : String(cancelledAt),
      cancelledBy == null ? null : String(cancelledBy),
      cancelReason == null ? null : String(cancelReason),
      reminderH3dSentAt == null ? null : String(reminderH3dSentAt),
      reminderH2dSentAt == null ? null : String(reminderH2dSentAt),
      reminderH1dSentAt == null ? null : String(reminderH1dSentAt),
      reminderH3hSentAt == null ? null : String(reminderH3hSentAt),
      String(sourceType || "payment_ticket"),
      sourceRefId == null ? null : String(sourceRefId),
      notes == null ? null : String(notes),
      metadataJson == null ? null : String(metadataJson)
    )
    .run();

  return getSubscriptionById(env, id);
}

export async function cancelActiveSubscriptionsByTelegramId(
  env,
  telegramId,
  {
    cancelledBy = null,
    cancelReason = "replaced_by_payment_activation",
  } = {}
) {
  const activeRows = await listActiveSubscriptionsByTelegramId(env, telegramId);
  if (!activeRows.length) {
    return {
      ok: true,
      count: 0,
      rows: [],
    };
  }

  await env.DB.prepare(
    `
    UPDATE partner_subscriptions
    SET status = 'cancelled',
        cancelled_at = COALESCE(cancelled_at, datetime('now')),
        cancelled_by = COALESCE(?, cancelled_by),
        cancel_reason = COALESCE(?, cancel_reason),
        updated_at = datetime('now')
    WHERE partner_id = ?
      AND status = 'active'
      AND start_at IS NOT NULL
      AND end_at IS NOT NULL
      AND datetime(end_at) > datetime('now')
  `
  )
    .bind(
      cancelledBy == null ? null : String(cancelledBy),
      cancelReason == null ? null : String(cancelReason),
      String(telegramId)
    )
    .run();

  return {
    ok: true,
    count: activeRows.length,
    rows: activeRows,
  };
}

export async function replaceActiveSubscriptionByTelegramId(
  env,
  telegramId,
  payload,
  {
    cancelledBy = null,
    cancelReason = "replaced_by_payment_activation",
  } = {}
) {
  await cancelActiveSubscriptionsByTelegramId(env, telegramId, {
    cancelledBy,
    cancelReason,
  });

  const created = await createPartnerSubscription(env, payload);
  return created;
}

export async function expireDueSubscriptions(env) {
  const { results } = await env.DB.prepare(
    `
    SELECT DISTINCT partner_id
    FROM partner_subscriptions
    WHERE status = 'active'
      AND end_at IS NOT NULL
      AND datetime(end_at) <= datetime('now')
  `
  ).all();

  await env.DB.prepare(
    `
    UPDATE partner_subscriptions
    SET status = 'expired',
        expired_at = COALESCE(expired_at, datetime('now')),
        updated_at = datetime('now')
    WHERE status = 'active'
      AND end_at IS NOT NULL
      AND datetime(end_at) <= datetime('now')
  `
  ).run();

  return {
    ok: true,
    partnerIds: (results || []).map((r) => String(r.partner_id)).filter(Boolean),
  };
}

export async function getSubscriptionInfoByTelegramId(env, telegramId) {
  const active = await getActiveSubscriptionByTelegramId(env, telegramId);
  if (active) {
    return {
      found: true,
      is_active: true,
      row: active,
    };
  }

  const latest = await getLatestSubscriptionByTelegramId(env, telegramId);
  if (!latest) {
    return {
      found: false,
      is_active: false,
      row: null,
    };
  }

  return {
    found: true,
    is_active: false,
    row: latest,
  };
}

export async function listSubscriptionsDueForReminder(
  env,
  reminderKey,
  {
    limit = 200,
  } = {}
) {
  const reminderColumn = normalizeReminderColumn(reminderKey);
  const safeLimit =
    Number.isFinite(Number(limit)) && Number(limit) > 0
      ? Math.min(Number(limit), 1000)
      : 200;

  let lowerExpr = "";
  let upperExpr = "";

  if (reminderKey === "h3d") {
    lowerExpr = "datetime('now', '+3 days')";
    upperExpr = "datetime('now', '+3 days', '+1 hour')";
  } else if (reminderKey === "h2d") {
    lowerExpr = "datetime('now', '+2 days')";
    upperExpr = "datetime('now', '+2 days', '+1 hour')";
  } else if (reminderKey === "h1d") {
    lowerExpr = "datetime('now', '+1 day')";
    upperExpr = "datetime('now', '+1 day', '+1 hour')";
  } else if (reminderKey === "h3h") {
    lowerExpr = "datetime('now', '+3 hours')";
    upperExpr = "datetime('now', '+4 hours')";
  } else {
    throw new Error("invalid_reminder_key");
  }

  const sql = `
    SELECT *
    FROM partner_subscriptions
    WHERE status = 'active'
      AND end_at IS NOT NULL
      AND datetime(end_at) > datetime('now')
      AND datetime(end_at) >= ${lowerExpr}
      AND datetime(end_at) < ${upperExpr}
      AND ${reminderColumn} IS NULL
    ORDER BY datetime(end_at) ASC, datetime(created_at) ASC
    LIMIT ${safeLimit}
  `;

  const { results } = await env.DB.prepare(sql).all();
  return Array.isArray(results) ? results : [];
}

export async function markSubscriptionReminderSent(
  env,
  subscriptionId,
  reminderKey,
  sentAt = null
) {
  const reminderColumn = normalizeReminderColumn(reminderKey);
  const sql = `
    UPDATE partner_subscriptions
    SET ${reminderColumn} = COALESCE(${reminderColumn}, ?),
        updated_at = datetime('now')
    WHERE id = ?
  `;

  const safeSentAt =
    sentAt == null
      ? new Date().toISOString().slice(0, 19).replace("T", " ")
      : String(sentAt);

  await env.DB.prepare(sql)
    .bind(safeSentAt, String(subscriptionId))
    .run();

  return { ok: true };
}

export async function resetSubscriptionReminderMarker(env, subscriptionId, reminderKey) {
  const reminderColumn = normalizeReminderColumn(reminderKey);
  const sql = `
    UPDATE partner_subscriptions
    SET ${reminderColumn} = NULL,
        updated_at = datetime('now')
    WHERE id = ?
  `;

  await env.DB.prepare(sql)
    .bind(String(subscriptionId))
    .run();

  return { ok: true };
}
