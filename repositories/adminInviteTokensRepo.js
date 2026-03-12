// repositories/adminInviteTokensRepo.js

function cleanText(v) {
  return String(v ?? "").trim();
}

function normalizeRole(role) {
  const r = cleanText(role).toLowerCase();
  if (r === "superadmin") return "superadmin";
  return "admin";
}

function normalizeStatus(status) {
  const s = cleanText(status).toLowerCase();
  if (s === "used") return "used";
  if (s === "expired") return "expired";
  if (s === "revoked") return "revoked";
  return "active";
}

function nowIso() {
  return new Date().toISOString();
}

function buildExpiryIso(hours = 24) {
  const n = Number(hours);
  const safeHours = Number.isFinite(n) && n > 0 ? n : 24;
  return new Date(Date.now() + safeHours * 60 * 60 * 1000).toISOString();
}

function randomToken(bytes = 18) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);

  let out = "";
  for (const b of arr) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

function mapRow(row) {
  if (!row) return null;

  return {
    id: row.id ?? null,
    token: cleanText(row.token),
    role: normalizeRole(row.role),
    status: normalizeStatus(row.status),
    created_by: row.created_by ? cleanText(row.created_by) : null,
    used_by: row.used_by ? cleanText(row.used_by) : null,
    used_at: row.used_at || null,
    expires_at: row.expires_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    is_active: normalizeStatus(row.status) === "active",
    is_used: normalizeStatus(row.status) === "used",
    is_expired:
      !!row.expires_at &&
      new Date(row.expires_at).getTime() <= Date.now(),
  };
}

export async function getAdminInviteTokenByToken(env, token) {
  const value = cleanText(token);
  if (!value) return null;

  const row = await env.DB.prepare(
    `
    SELECT
      id,
      token,
      role,
      status,
      created_by,
      used_by,
      used_at,
      expires_at,
      created_at,
      updated_at
    FROM admin_invite_tokens
    WHERE token = ?
    LIMIT 1
    `
  )
    .bind(value)
    .first();

  return mapRow(row);
}

export async function listActiveAdminInviteTokens(env) {
  const { results } = await env.DB.prepare(
    `
    SELECT
      id,
      token,
      role,
      status,
      created_by,
      used_by,
      used_at,
      expires_at,
      created_at,
      updated_at
    FROM admin_invite_tokens
    WHERE status = 'active'
    ORDER BY created_at DESC
    LIMIT 100
    `
  ).all();

  return (results ?? []).map(mapRow).filter(Boolean);
}

export async function createAdminInviteToken(
  env,
  { createdBy, role = "admin", expiryHours = 24 } = {}
) {
  const token = randomToken(18);
  const normalizedRole = normalizeRole(role);
  const createdByValue = cleanText(createdBy) || null;
  const expiresAt = buildExpiryIso(expiryHours);
  const now = nowIso();

  await env.DB.prepare(
    `
    INSERT INTO admin_invite_tokens (
      token,
      role,
      status,
      created_by,
      expires_at,
      created_at,
      updated_at
    )
    VALUES (?, ?, 'active', ?, ?, ?, ?)
    `
  )
    .bind(token, normalizedRole, createdByValue, expiresAt, now, now)
    .run();

  return await getAdminInviteTokenByToken(env, token);
}

export async function markAdminInviteTokenUsed(env, token, usedBy) {
  const value = cleanText(token);
  const usedByValue = cleanText(usedBy);

  if (!value) return { ok: false, reason: "empty_token" };
  if (!usedByValue) return { ok: false, reason: "empty_used_by" };

  const row = await getAdminInviteTokenByToken(env, value);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== "active") return { ok: false, reason: "not_active" };
  if (row.is_expired) return { ok: false, reason: "expired" };

  const now = nowIso();

  await env.DB.prepare(
    `
    UPDATE admin_invite_tokens
    SET
      status = 'used',
      used_by = ?,
      used_at = ?,
      updated_at = ?
    WHERE token = ?
    `
  )
    .bind(usedByValue, now, now, value)
    .run();

  return {
    ok: true,
    row: await getAdminInviteTokenByToken(env, value),
  };
}

export async function revokeAdminInviteToken(env, token) {
  const value = cleanText(token);
  if (!value) return { ok: false, reason: "empty_token" };

  const row = await getAdminInviteTokenByToken(env, value);
  if (!row) return { ok: false, reason: "not_found" };

  await env.DB.prepare(
    `
    UPDATE admin_invite_tokens
    SET
      status = 'revoked',
      updated_at = ?
    WHERE token = ?
    `
  )
    .bind(nowIso(), value)
    .run();

  return {
    ok: true,
    row: await getAdminInviteTokenByToken(env, value),
  };
}

export async function expireAdminInviteTokens(env) {
  const now = nowIso();

  const res = await env.DB.prepare(
    `
    UPDATE admin_invite_tokens
    SET
      status = 'expired',
      updated_at = ?
    WHERE status = 'active'
      AND expires_at <= ?
    `
  )
    .bind(now, now)
    .run();

  return {
    ok: true,
    changes: Number(res?.meta?.changes || 0),
  };
}

export async function validateAdminInviteToken(env, token) {
  const value = cleanText(token);
  if (!value) return { ok: false, reason: "empty_token" };

  await expireAdminInviteTokens(env);

  const row = await getAdminInviteTokenByToken(env, value);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== "active") return { ok: false, reason: row.status || "not_active" };
  if (row.is_expired) return { ok: false, reason: "expired" };

  return {
    ok: true,
    row,
  };
}

export function buildAdminInviteStartParam(token) {
  const value = cleanText(token);
  return value ? `invite_admin_${value}` : "";
}

export function parseAdminInviteStartParam(startParam) {
  const raw = cleanText(startParam);
  const prefix = "invite_admin_";
  if (!raw.startsWith(prefix)) return null;

  const token = cleanText(raw.slice(prefix.length));
  return token || null;
}
