// repositories/partnerSubscriptionsRepo.js

function nowSql() {
  return "datetime('now')";
}

export async function getActiveSubscriptionByTelegramId(env, telegramId) {
  const row = await env.DB.prepare(
    `
    SELECT *
    FROM partner_subscriptions
    WHERE telegram_id = ?
      AND status = 'active'
      AND starts_at IS NOT NULL
      AND ends_at IS NOT NULL
      AND datetime(starts_at) <= datetime('now')
      AND datetime(ends_at) > datetime('now')
    ORDER BY datetime(ends_at) DESC, datetime(dibuat_pada) DESC
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
    WHERE telegram_id = ?
    ORDER BY datetime(dibuat_pada) DESC, datetime(id) DESC
    LIMIT 1
  `
  )
    .bind(String(telegramId))
    .first();

  return row ?? null;
}

export async function createPartnerSubscription(env, payload) {
  const {
    id,
    telegramId,
    profileId,
    classId,
    ticketId = null,
    status = "active",
    startsAt,
    endsAt,
    activatedAt = null,
    activatedBy = null,
  } = payload || {};

  await env.DB.prepare(
    `
    INSERT INTO partner_subscriptions (
      id,
      telegram_id,
      profile_id,
      class_id,
      ticket_id,
      status,
      starts_at,
      ends_at,
      activated_at,
      activated_by,
      dibuat_pada,
      diupdate_pada
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${nowSql()}, ${nowSql()})
  `
  )
    .bind(
      String(id),
      String(telegramId),
      profileId == null ? null : String(profileId),
      String(classId || "bronze").toLowerCase(),
      ticketId == null ? null : String(ticketId),
      String(status),
      String(startsAt),
      String(endsAt),
      activatedAt == null ? null : String(activatedAt),
      activatedBy == null ? null : String(activatedBy)
    )
    .run();

  return { ok: true };
}

export async function expireElapsedSubscriptions(env) {
  const res = await env.DB.prepare(
    `
    UPDATE partner_subscriptions
    SET status = 'expired',
        diupdate_pada = ${nowSql()}
    WHERE status = 'active'
      AND ends_at IS NOT NULL
      AND datetime(ends_at) <= datetime('now')
  `
  ).run();

  return {
    ok: true,
    changes: Number(res?.meta?.changes || 0),
  };
}

export async function listExpiredActiveSubscriptionOwners(env) {
  const { results } = await env.DB.prepare(
    `
    SELECT telegram_id
    FROM partner_subscriptions
    WHERE status = 'active'
      AND ends_at IS NOT NULL
      AND datetime(ends_at) <= datetime('now')
    GROUP BY telegram_id
  `
  ).all();

  return (results || []).map((r) => String(r.telegram_id)).filter(Boolean);
}
