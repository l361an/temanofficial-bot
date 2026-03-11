// repositories/adminsRepo.js
function normalizeRole(role) {
  const r = String(role ?? "").trim().toLowerCase();
  if (r === "superadmin" || r === "super_admin" || r === "owner" || r === "root") return "superadmin";
  if (r === "admin" || r === "officer" || r === "staff") return "admin";
  return "user";
}

function normalizeStatus(status) {
  const s = String(status ?? "active").trim().toLowerCase();
  if (s === "active" || s === "1" || s === "true" || s === "enabled") return "active";
  if (s === "inactive" || s === "0" || s === "false" || s === "disabled") return "inactive";
  return "inactive";
}

function isActiveStatus(status) {
  return normalizeStatus(status) === "active";
}

function cleanUsername(username) {
  const u = String(username ?? "").trim().replace(/^@/, "");
  return u || "";
}

function cleanName(nama) {
  return String(nama ?? "").trim();
}

function cleanTelegramId(telegramId) {
  return String(telegramId ?? "").trim();
}

function buildAdminLabel(row) {
  const u = cleanUsername(row?.username);
  if (u) return `@${u}`;
  const n = cleanName(row?.nama);
  if (n) return n;
  const tid = cleanTelegramId(row?.telegram_id);
  return tid || "-";
}

function mapAdminRow(row) {
  if (!row) return null;

  const normRole = normalizeRole(row.role);
  const normStatus = normalizeStatus(row.status);

  return {
    telegram_id: cleanTelegramId(row.telegram_id),
    username: row.username ?? null,
    nama: row.nama ?? null,
    role: row.role ?? null,
    normRole,
    status: row.status ?? null,
    normStatus,
    is_active: normStatus === "active",
    label: buildAdminLabel(row),
  };
}

function validateWritableRole(role) {
  const r = normalizeRole(role);
  return r === "admin" || r === "superadmin" ? r : null;
}

async function getRawAdminByTelegramId(env, telegramId) {
  return await env.DB.prepare(
    `
    SELECT telegram_id, username, nama, role, status, dibuat_pada
    FROM admins
    WHERE telegram_id = ?
    LIMIT 1
  `
  )
    .bind(cleanTelegramId(telegramId))
    .first();
}

async function ensureNotRemovingLastActiveSuperadmin(env, targetTelegramId, nextRole, nextStatus) {
  const current = await getRawAdminByTelegramId(env, targetTelegramId);
  if (!current) return { ok: false, reason: "not_found" };

  const currentRole = normalizeRole(current.role);
  const currentStatus = normalizeStatus(current.status);
  const willRemainSuperadmin = normalizeRole(nextRole) === "superadmin" && normalizeStatus(nextStatus) === "active";

  if (!(currentRole === "superadmin" && currentStatus === "active")) {
    return { ok: true };
  }

  if (willRemainSuperadmin) {
    return { ok: true };
  }

  const count = await countActiveSuperadmins(env);
  if (count <= 1) {
    return { ok: false, reason: "last_superadmin" };
  }

  return { ok: true };
}

export async function getAdminRole(env, telegramId) {
  const id = cleanTelegramId(telegramId);
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

export async function isSuperadmin(env, telegramId) {
  return (await getAdminRole(env, telegramId)) === "superadmin";
}

export async function getFirstActiveSuperadminId(env) {
  const { results } = await env.DB.prepare(
    `
    SELECT telegram_id, role, status
    FROM admins
    ORDER BY dibuat_pada ASC
    LIMIT 100
  `
  ).all();

  if (!results?.length) return null;

  for (const row of results) {
    if (!isActiveStatus(row.status)) continue;
    if (normalizeRole(row.role) === "superadmin") return cleanTelegramId(row.telegram_id);
  }

  return null;
}

export async function countActiveSuperadmins(env) {
  const { results } = await env.DB.prepare(
    `
    SELECT role, status
    FROM admins
    LIMIT 500
  `
  ).all();

  const rows = results ?? [];
  return rows.filter((r) => normalizeRole(r.role) === "superadmin" && isActiveStatus(r.status)).length;
}

export async function listActiveVerificators(env) {
  const rows = await listAdmins(env, { activeOnly: true });
  return rows.filter((r) => r.normRole === "admin" || r.normRole === "superadmin");
}

export async function listAdmins(env, { activeOnly = false } = {}) {
  const { results } = await env.DB.prepare(
    `
    SELECT telegram_id, username, nama, role, status, dibuat_pada
    FROM admins
    ORDER BY dibuat_pada ASC
    LIMIT 500
  `
  ).all();

  let rows = (results ?? []).map(mapAdminRow).filter(Boolean);
  rows = rows.filter((r) => r.normRole === "admin" || r.normRole === "superadmin");

  if (activeOnly) {
    rows = rows.filter((r) => r.is_active);
  }

  rows.sort((a, b) => {
    const ra = a.normRole === "superadmin" ? 0 : 1;
    const rb = b.normRole === "superadmin" ? 0 : 1;
    if (ra !== rb) return ra - rb;

    const sa = a.is_active ? 0 : 1;
    const sb = b.is_active ? 0 : 1;
    if (sa !== sb) return sa - sb;

    return String(a.telegram_id).localeCompare(String(b.telegram_id));
  });

  return rows;
}

export async function getAdminByTelegramId(env, telegramId) {
  const row = await getRawAdminByTelegramId(env, telegramId);
  return mapAdminRow(row);
}

export async function createAdmin(env, payload = {}) {
  const telegramId = cleanTelegramId(payload.telegram_id);
  const username = cleanUsername(payload.username);
  const nama = cleanName(payload.nama);
  const normRole = validateWritableRole(payload.role);
  const normStatus = normalizeStatus(payload.status ?? "active");

  if (!telegramId) return { ok: false, reason: "empty_telegram_id" };
  if (!normRole) return { ok: false, reason: "invalid_role" };
  if (!nama) return { ok: false, reason: "empty_nama" };

  const existing = await getRawAdminByTelegramId(env, telegramId);

  if (existing) {
    const guard = await ensureNotRemovingLastActiveSuperadmin(
      env,
      telegramId,
      normRole,
      normStatus
    );

    if (!guard.ok) return guard;

    await env.DB.prepare(
      `
      UPDATE admins
      SET username = ?, nama = ?, role = ?, status = ?
      WHERE telegram_id = ?
    `
    )
      .bind(username || null, nama, normRole, normStatus, telegramId)
      .run();

    return {
      ok: true,
      action: "updated",
      row: await getAdminByTelegramId(env, telegramId),
    };
  }

  await env.DB.prepare(
    `
    INSERT INTO admins (
      telegram_id,
      username,
      nama,
      role,
      status,
      dibuat_pada
    )
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `
  )
    .bind(telegramId, username || null, nama, normRole, normStatus)
    .run();

  return {
    ok: true,
    action: "created",
    row: await getAdminByTelegramId(env, telegramId),
  };
}

export async function updateAdminProfile(env, telegramId, patch = {}) {
  const targetId = cleanTelegramId(telegramId);
  if (!targetId) return { ok: false, reason: "empty_telegram_id" };

  const current = await getRawAdminByTelegramId(env, targetId);
  if (!current) return { ok: false, reason: "not_found" };

  const nextUsername =
    Object.prototype.hasOwnProperty.call(patch, "username")
      ? cleanUsername(patch.username)
      : current.username ?? null;

  const nextNama =
    Object.prototype.hasOwnProperty.call(patch, "nama")
      ? cleanName(patch.nama)
      : cleanName(current.nama);

  const nextRole =
    Object.prototype.hasOwnProperty.call(patch, "role")
      ? validateWritableRole(patch.role)
      : normalizeRole(current.role);

  const nextStatus =
    Object.prototype.hasOwnProperty.call(patch, "status")
      ? normalizeStatus(patch.status)
      : normalizeStatus(current.status);

  if (!nextNama) return { ok: false, reason: "empty_nama" };
  if (!nextRole) return { ok: false, reason: "invalid_role" };

  const guard = await ensureNotRemovingLastActiveSuperadmin(
    env,
    targetId,
    nextRole,
    nextStatus
  );

  if (!guard.ok) return guard;

  await env.DB.prepare(
    `
    UPDATE admins
    SET username = ?, nama = ?, role = ?, status = ?
    WHERE telegram_id = ?
  `
  )
    .bind(nextUsername || null, nextNama, nextRole, nextStatus, targetId)
    .run();

  return {
    ok: true,
    row: await getAdminByTelegramId(env, targetId),
  };
}

export async function updateAdminUsername(env, telegramId, username) {
  return await updateAdminProfile(env, telegramId, { username });
}

export async function updateAdminNama(env, telegramId, nama) {
  return await updateAdminProfile(env, telegramId, { nama });
}

export async function updateAdminRole(env, telegramId, role) {
  return await updateAdminProfile(env, telegramId, { role });
}

export async function updateAdminStatus(env, telegramId, status) {
  return await updateAdminProfile(env, telegramId, { status });
}

export async function deactivateAdminByTelegramId(env, telegramId) {
  return await updateAdminStatus(env, telegramId, "inactive");
}

export async function activateAdminByTelegramId(env, telegramId) {
  return await updateAdminStatus(env, telegramId, "active");
}

export async function deleteAdminByTelegramId(env, telegramId) {
  const targetId = cleanTelegramId(telegramId);
  if (!targetId) return { ok: false, reason: "empty_telegram_id" };

  const current = await getRawAdminByTelegramId(env, targetId);
  if (!current) return { ok: false, reason: "not_found" };

  const guard = await ensureNotRemovingLastActiveSuperadmin(
    env,
    targetId,
    "admin",
    "inactive"
  );

  if (!guard.ok) return guard;

  await env.DB.prepare(
    `
    DELETE FROM admins
    WHERE telegram_id = ?
  `
  )
    .bind(targetId)
    .run();

  return { ok: true };
}

export {
  normalizeRole,
  normalizeStatus,
  isActiveStatus,
  cleanUsername,
  buildAdminLabel,
};
