// repositories/catalogStatsRepo.js

function normalizeString(value) {
  return String(value || "").trim();
}

function buildZeroStats(telegramId) {
  return {
    telegram_id: normalizeString(telegramId),
    average_rating: 0,
    review_count: 0,
    completed_order_count: 0,
  };
}

export async function getCatalogPartnerStatsByTelegramId(env, telegramId) {
  return buildZeroStats(telegramId);
}

export async function getCatalogPartnerStatsMap(env, telegramIds = []) {
  const ids = Array.isArray(telegramIds)
    ? telegramIds.map((item) => normalizeString(item)).filter(Boolean)
    : [];

  const map = new Map();

  for (const telegramId of ids) {
    map.set(telegramId, buildZeroStats(telegramId));
  }

  return map;
}
