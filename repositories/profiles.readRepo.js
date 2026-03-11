// repositories/profiles.readRepo.js

export async function listProfilesByStatus(env, status) {
  const clean = String(status || "").trim();
  if (!clean) return [];

  const { results } = await env.DB.prepare(
    `
    SELECT telegram_id, nama_lengkap, username, nickname, class_id, verificator_admin_id
    FROM profiles
    WHERE status = ?
    ORDER BY diupdate_pada DESC, dibuat_pada DESC, nama_lengkap ASC
  `
  )
    .bind(clean)
    .all();

  return results ?? [];
}

export async function listProfilesAll(env) {
  const { results } = await env.DB.prepare(
    `
    SELECT telegram_id, nama_lengkap, username, nickname, class_id, status, verificator_admin_id
    FROM profiles
    ORDER BY diupdate_pada DESC, dibuat_pada DESC, nama_lengkap ASC
  `
  ).all();

  return results ?? [];
}

export async function getProfileStatus(env, telegramId) {
  const { results } = await env.DB.prepare(
    "SELECT status FROM profiles WHERE telegram_id = ? LIMIT 1"
  )
    .bind(String(telegramId))
    .all();

  return results?.[0]?.status ?? null;
}

export async function getProfileByTelegramId(env, telegramId) {
  const row = await env.DB.prepare(
    `
    SELECT id, telegram_id, status, nama_lengkap, username, nickname, class_id
    FROM profiles
    WHERE telegram_id = ?
    LIMIT 1
  `
  )
    .bind(String(telegramId))
    .first();

  return row ?? null;
}

export async function getProfileFullByTelegramId(env, telegramId) {
  const row = await env.DB.prepare(
    "SELECT * FROM profiles WHERE telegram_id = ? LIMIT 1"
  )
    .bind(String(telegramId))
    .first();

  return row ?? null;
}

export async function getSubscriptionInfo(env, telegramId) {
  try {
    const { results } = await env.DB.prepare(
      `
      SELECT subscription_status, subscription_end_at
      FROM profiles
      WHERE telegram_id = ?
      LIMIT 1
    `
    )
      .bind(String(telegramId))
      .all();

    if (!results?.length) return { supported: true, found: false };

    return {
      supported: true,
      found: true,
      subscription_status: results[0]?.subscription_status ?? null,
      subscription_end_at: results[0]?.subscription_end_at ?? null,
    };
  } catch {
    return { supported: false };
  }
}
