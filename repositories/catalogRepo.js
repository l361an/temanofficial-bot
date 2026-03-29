// repositories/catalogRepo.js

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function normalizePositiveInteger(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.floor(num);
}

const JAKARTA_NOW_SQL = `datetime('now', '+7 hours')`;

function buildActiveSubscriptionExistsClause(profileAlias = "p") {
  return [
    `EXISTS (`,
    `  SELECT 1`,
    `  FROM partner_subscriptions ps`,
    `  WHERE CAST(ps.partner_id AS TEXT) = CAST(${profileAlias}.telegram_id AS TEXT)`,
    `    AND ps.status = 'active'`,
    `    AND ps.start_at IS NOT NULL`,
    `    AND ps.end_at IS NOT NULL`,
    `    AND datetime(ps.start_at) <= ${JAKARTA_NOW_SQL}`,
    `    AND datetime(ps.end_at) > ${JAKARTA_NOW_SQL}`,
    `)`,
  ].join("\n");
}

function buildBaseFilter() {
  return {
    whereSql: [
      `p.status = 'approved'`,
      `IFNULL(p.is_manual_suspended, 0) != 1`,
      `IFNULL(p.is_catalog_visible, 0) = 1`,
      `p.start_price IS NOT NULL`,
      `CAST(p.start_price AS INTEGER) > 0`,
      buildActiveSubscriptionExistsClause("p"),
    ].join("\n  AND "),
    binds: [],
  };
}

function buildCategoryExistsClause() {
  return [
    `p.id IN (`,
    `  SELECT pc_filter.profile_id`,
    `  FROM profile_categories pc_filter`,
    `  JOIN categories c_filter ON c_filter.id = pc_filter.category_id`,
    `  WHERE (c_filter.kode = ? OR LOWER(c_filter.kode) = ?)`,
    `)`,
  ].join("\n");
}

function buildListFilters(options = {}) {
  const base = buildBaseFilter();
  const clauses = [base.whereSql];
  const binds = [...base.binds];

  const telegramId = normalizeString(options.telegramId);
  if (telegramId) {
    clauses.push(`CAST(p.telegram_id AS TEXT) = CAST(? AS TEXT)`);
    binds.push(telegramId);
  }

  const classId = normalizeLower(options.classId);
  if (classId) {
    clauses.push(`LOWER(p.class_id) = ?`);
    binds.push(classId);
  }

  const kota = normalizeLower(options.kota);
  if (kota) {
    clauses.push(`LOWER(p.kota) = ?`);
    binds.push(kota);
  }

  const kecamatan = normalizeLower(options.kecamatan);
  if (kecamatan) {
    clauses.push(`LOWER(p.kecamatan) = ?`);
    binds.push(kecamatan);
  }

  const categoryCode = normalizeLower(options.categoryCode);
  if (categoryCode) {
    clauses.push(buildCategoryExistsClause());
    binds.push(categoryCode, categoryCode);
  }

  const search = normalizeLower(options.search);
  if (search) {
    const pattern = `%${search}%`;
    clauses.push(
      `(
        LOWER(p.nickname) LIKE ?
        OR LOWER(p.nama_lengkap) LIKE ?
        OR LOWER(p.username) LIKE ?
        OR LOWER(p.kota) LIKE ?
        OR LOWER(p.kecamatan) LIKE ?
      )`
    );
    binds.push(pattern, pattern, pattern, pattern, pattern);
  }

  return {
    whereSql: clauses.join("\n  AND "),
    binds,
  };
}

function buildListSql(whereSql) {
  return `
    SELECT
      p.id,
      p.telegram_id,
      p.nama_lengkap,
      p.nickname,
      p.username,
      p.no_whatsapp,
      p.kecamatan,
      p.kota,
      p.channel_url,
      p.foto_closeup_file_id,
      p.foto_fullbody_file_id,
      p.start_price,
      p.class_id,
      p.status,
      p.is_catalog_visible,
      p.is_manual_suspended,
      p.dibuat_pada,
      p.diupdate_pada
    FROM profiles p
    WHERE ${whereSql}
    ORDER BY
      p.kota ASC,
      p.kecamatan ASC,
      p.nickname ASC,
      p.nama_lengkap ASC,
      p.diupdate_pada DESC,
      p.dibuat_pada DESC
    LIMIT ?
    OFFSET ?
  `;
}

function buildCountSql(whereSql) {
  return `
    SELECT COUNT(*) AS total
    FROM profiles p
    WHERE ${whereSql}
  `;
}

async function loadCategoryMap(env, profileIds = []) {
  const ids = Array.isArray(profileIds)
    ? profileIds.map((item) => normalizeString(item)).filter(Boolean)
    : [];

  if (!ids.length) return new Map();

  const placeholders = ids.map(() => "?").join(",");
  const sql = `
    SELECT
      pc.profile_id,
      c.kode
    FROM profile_categories pc
    JOIN categories c ON c.id = pc.category_id
    WHERE pc.profile_id IN (${placeholders})
    ORDER BY c.kode ASC
  `;

  const { results } = await env.DB.prepare(sql).bind(...ids).all();
  const rows = Array.isArray(results) ? results : [];

  const map = new Map();

  for (const row of rows) {
    const profileId = normalizeString(row?.profile_id);
    const kode = normalizeString(row?.kode);
    if (!profileId || !kode) continue;

    if (!map.has(profileId)) {
      map.set(profileId, []);
    }

    map.get(profileId).push(kode);
  }

  return map;
}

async function loadActiveSubscriptionMap(env, partnerIds = []) {
  const ids = Array.isArray(partnerIds)
    ? partnerIds.map((item) => normalizeString(item)).filter(Boolean)
    : [];

  if (!ids.length) return new Map();

  const placeholders = ids.map(() => "?").join(",");
  const sql = `
    SELECT
      ps.id,
      CAST(ps.partner_id AS TEXT) AS partner_id,
      ps.class_id,
      ps.start_at,
      ps.end_at,
      ps.created_at
    FROM partner_subscriptions ps
    WHERE CAST(ps.partner_id AS TEXT) IN (${placeholders})
      AND ps.status = 'active'
      AND ps.start_at IS NOT NULL
      AND ps.end_at IS NOT NULL
      AND datetime(ps.start_at) <= ${JAKARTA_NOW_SQL}
      AND datetime(ps.end_at) > ${JAKARTA_NOW_SQL}
    ORDER BY
      CAST(ps.partner_id AS TEXT) ASC,
      datetime(ps.end_at) DESC,
      datetime(ps.start_at) ASC,
      datetime(ps.created_at) DESC
  `;

  const { results } = await env.DB.prepare(sql).bind(...ids).all();
  const rows = Array.isArray(results) ? results : [];
  const map = new Map();

  for (const row of rows) {
    const partnerId = normalizeString(row?.partner_id);
    if (!partnerId) continue;

    if (!map.has(partnerId)) {
      map.set(partnerId, row);
    }
  }

  return map;
}

function mapCatalogRow(row, categoryMap, subscriptionMap) {
  if (!row) return null;

  const profileId = normalizeString(row.id);
  const telegramId = normalizeString(row.telegram_id);
  const categoryCodes = categoryMap.get(profileId) || [];
  const activeSubscription = subscriptionMap.get(telegramId) || null;

  return {
    id: row.id ?? null,
    telegram_id: telegramId,
    nama_lengkap: row.nama_lengkap ?? null,
    nickname: row.nickname ?? null,
    username: row.username ?? null,
    no_whatsapp: row.no_whatsapp ?? null,
    kecamatan: row.kecamatan ?? null,
    kota: row.kota ?? null,
    channel_url: row.channel_url ?? null,
    foto_closeup_file_id: row.foto_closeup_file_id ?? null,
    foto_fullbody_file_id: row.foto_fullbody_file_id ?? null,
    start_price: row.start_price == null ? null : Number(row.start_price),
    class_id: row.class_id ?? null,
    status: row.status ?? null,
    is_catalog_visible: Number(row.is_catalog_visible || 0) === 1,
    is_manual_suspended: Number(row.is_manual_suspended || 0) === 1,
    category_codes: categoryCodes,
    category_codes_csv: categoryCodes.join(", "),
    active_subscription_id: activeSubscription?.id ?? null,
    active_subscription_class_id: activeSubscription?.class_id ?? null,
    active_subscription_start_at: activeSubscription?.start_at ?? null,
    active_subscription_end_at: activeSubscription?.end_at ?? null,
    dibuat_pada: row.dibuat_pada ?? null,
    diupdate_pada: row.diupdate_pada ?? null,
  };
}

export async function listCatalogPartners(env, options = {}) {
  const safeLimit = Math.min(normalizePositiveInteger(options.limit, 200), 1000);
  const safeOffset = Math.max(0, normalizePositiveInteger(options.offset, 0));

  const { whereSql, binds } = buildListFilters(options);
  const sql = buildListSql(whereSql);

  const { results } = await env.DB.prepare(sql)
    .bind(...binds, safeLimit, safeOffset)
    .all();

  const rows = Array.isArray(results) ? results : [];
  if (!rows.length) return [];

  const profileIds = rows.map((row) => normalizeString(row?.id)).filter(Boolean);
  const partnerIds = rows.map((row) => normalizeString(row?.telegram_id)).filter(Boolean);

  const [categoryMap, subscriptionMap] = await Promise.all([
    loadCategoryMap(env, profileIds),
    loadActiveSubscriptionMap(env, partnerIds),
  ]);

  return rows
    .map((row) => mapCatalogRow(row, categoryMap, subscriptionMap))
    .filter(Boolean);
}

export async function countCatalogPartners(env, options = {}) {
  const { whereSql, binds } = buildListFilters(options);
  const row = await env.DB.prepare(buildCountSql(whereSql))
    .bind(...binds)
    .first();

  return Number(row?.total || 0);
}

export async function getCatalogPartnerByTelegramId(env, telegramId) {
  const rows = await listCatalogPartners(env, {
    telegramId,
    limit: 1,
    offset: 0,
  });

  return rows[0] || null;
}

export async function listCatalogCategorySummary(env) {
  const base = buildBaseFilter();
  const sql = `
    SELECT
      c.kode AS kode,
      COUNT(DISTINCT p.id) AS total
    FROM profiles p
    JOIN profile_categories pc ON pc.profile_id = p.id
    JOIN categories c ON c.id = pc.category_id
    WHERE ${base.whereSql}
    GROUP BY c.kode
    ORDER BY c.kode ASC
  `;

  const { results } = await env.DB.prepare(sql).bind(...base.binds).all();

  return (results || []).map((row) => ({
    kode: normalizeString(row?.kode),
    total: Number(row?.total || 0),
  }));
}
