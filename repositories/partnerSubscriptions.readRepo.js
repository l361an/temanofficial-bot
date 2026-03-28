// repositories/partnerSubscriptions.readRepo.js

import { nowJakartaSql } from "../utils/time.js";

export async function listActiveSubscriptionsByTelegramId(env, telegramId) {
  const nowSql = nowJakartaSql();

  const { results } = await env.DB.prepare(
    `
    SELECT *
    FROM partner_subscriptions
    WHERE partner_id = ?
      AND status = 'active'
      AND start_at IS NOT NULL
      AND end_at IS NOT NULL
      AND datetime(end_at) > datetime(?)
    ORDER BY datetime(start_at) ASC, datetime(end_at) DESC, datetime(created_at) DESC
  `
  )
    .bind(String(telegramId), nowSql)
    .all();

  return Array.isArray(results) ? results : [];
}

export async function getActiveSubscriptionByTelegramId(env, telegramId) {
  const nowSql = nowJakartaSql();

  const row = await env.DB.prepare(
    `
    SELECT *
    FROM partner_subscriptions
    WHERE partner_id = ?
      AND status = 'active'
      AND start_at IS NOT NULL
      AND end_at IS NOT NULL
      AND datetime(start_at) <= datetime(?)
      AND datetime(end_at) > datetime(?)
    ORDER BY datetime(end_at) DESC, datetime(start_at) ASC, datetime(created_at) DESC
    LIMIT 1
  `
  )
    .bind(String(telegramId), nowSql, nowSql)
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
