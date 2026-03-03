// repositories/adminsRepo.js
function normalizeRole(role) {
  const r = String(role ?? "").trim().toLowerCase();
  if (r === "superadmin" || r === "super_admin" || r === "owner" || r === "root") return "superadmin";
  if (r === "admin" || r === "officer" || r === "staff") return "admin";
  return "user";
}

function isActiveStatus(status) {
  const s = String(status ?? "active").trim().toLowerCase();
  return s === "active" || s === "1" || s === "true" || s === "enabled";
}

function cleanUsername(username) {
  const u = String(username ?? "").trim().replace(/^@/, "");
  return u || "";
}

function buildAdminLabel(row) {
  const u = cleanUsername(row?.username);
  if (u) return `@${u}`;
  const n = String(row?.nama ?? "").trim();
  if (n) return n;
  const tid = String(row?.telegram_id ?? "").trim();
  return tid || "-";
}

export async function getAdminRole(env, telegramId) {
  const id = String(telegramId);
  const { results } = await env.DB.prepare(
    `
    SELECT role, status
    FROM admins
    WHERE telegram_id = ?
    LIMIT 1
  `
  )
    .bind(id)
    .all();

  if (!results?.length) return "user";
  const row = results[0];
  if (!isActiveStatus(row.status)) return "user";
  return normalizeRole(row.role);
}

export async function getFirstActiveSuperadminId(env) {
  const { results } = await env.DB.prepare(
    `
    SELECT telegram_id, role, status
    FROM admins
    ORDER BY dibuat_pada ASC
    LIMIT 50
  `
  ).all();

  if (!results?.length) return null;
  for (const row of results) {
    if (!isActiveStatus(row.status)) continue;
    if (normalizeRole(row.role) === "superadmin") return String(row.telegram_id);
  }
  return null;
}

export async function listActiveVerificators(env) {
  const { results } = await env.DB.prepare(
    `
    SELECT telegram_id, username, nama, role, status
    FROM admins
    ORDER BY dibuat_pada ASC
    LIMIT 100
  `
  ).all();

  const rows = results ?? [];
  return rows
    .filter((r) => isActiveStatus(r.status))
    .map((r) => ({ ...r, _normRole: normalizeRole(r.role) }))
    .filter((r) => r._normRole === "admin" || r._normRole === "superadmin")
    .map((r) => ({
      telegram_id: String(r.telegram_id),
      username: r.username ?? null,
      nama: r.nama ?? null,
      role: r._normRole,
      label: buildAdminLabel(r),
    }));
}

export async function getAdminByTelegramId(env, telegramId) {
  const row = await env.DB.prepare(
    `
    SELECT telegram_id, username, nama, role, status
    FROM admins
    WHERE telegram_id = ?
    LIMIT 1
  `
  )
    .bind(String(telegramId))
    .first();

  if (!row) return null;

  const normRole = normalizeRole(row.role);
  return {
    telegram_id: String(row.telegram_id),
    username: row.username ?? null,
    nama: row.nama ?? null,
    role: row.role ?? null,
    normRole,
    status: row.status ?? null,
    label: buildAdminLabel(row),
  };
}
