// repositories/profiles.editRepo.js

function normalizeUsername(u) {
  return String(u ?? "").trim().replace(/^@/, "");
}

export async function deleteProfileByTelegramId(env, telegramId) {
  await env.DB.prepare("DELETE FROM profiles WHERE telegram_id = ?")
    .bind(String(telegramId))
    .run();
}

export async function insertPendingProfile(env, payload) {
  const classId = String(payload?.class_id || "bronze").trim().toLowerCase() || "bronze";

  await env.DB.prepare(
    `
    INSERT INTO profiles (
      id,
      telegram_id,
      nama_lengkap,
      nik,
      foto_ktp_file_id,
      nickname,
      username,
      no_whatsapp,
      kecamatan,
      kota,
      foto_closeup_file_id,
      foto_fullbody_file_id,
      class_id,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_approval')
  `
  )
    .bind(
      payload.id,
      String(payload.telegram_id),
      payload.nama_lengkap,
      payload.nik,
      payload.foto_ktp_file_id,
      payload.nickname,
      payload.username,
      payload.no_whatsapp,
      payload.kecamatan,
      payload.kota,
      payload.foto_closeup_file_id,
      payload.foto_fullbody_file_id,
      classId
    )
    .run();
}

export async function updateProfileClassByTelegramId(env, telegramId, classId) {
  const tid = String(telegramId || "").trim();
  if (!tid) return { ok: false, reason: "empty_tid" };

  const cleanClassId = String(classId || "").trim().toLowerCase();
  const valid = ["bronze", "gold", "platinum"];
  if (!valid.includes(cleanClassId)) return { ok: false, reason: "invalid_class_id" };

  const existing = await env.DB.prepare(
    `
    SELECT id, telegram_id, class_id
    FROM profiles
    WHERE telegram_id = ?
    LIMIT 1
  `
  )
    .bind(tid)
    .first();

  if (!existing?.telegram_id) return { ok: false, reason: "not_found" };

  await env.DB.prepare(
    `
    UPDATE profiles
    SET class_id = ?, diupdate_pada = datetime('now')
    WHERE telegram_id = ?
  `
  )
    .bind(cleanClassId, tid)
    .run();

  return { ok: true, class_id: cleanClassId };
}

export async function syncProfileUsernameFromTelegram(env, telegramId, telegramUsername) {
  const tid = String(telegramId || "").trim();
  if (!tid) return { ok: false, reason: "empty_tid" };

  const uname = normalizeUsername(telegramUsername);

  const existing = await env.DB.prepare(
    `
    SELECT username
    FROM profiles
    WHERE telegram_id = ?
    LIMIT 1
  `
  )
    .bind(tid)
    .first();

  if (!existing) return { ok: true, skipped: true, reason: "no_profile" };

  const curr = normalizeUsername(existing.username);
  if (curr === uname) return { ok: true, skipped: true };

  await env.DB.prepare(
    `
    UPDATE profiles
    SET username = ?, diupdate_pada = datetime('now')
    WHERE telegram_id = ?
  `
  )
    .bind(uname, tid)
    .run();

  return { ok: true, skipped: false };
}

export async function updateEditableProfileFields(env, telegramId, patch) {
  const tid = String(telegramId || "").trim();
  if (!tid) return { ok: false, reason: "empty_tid" };

  const allowed = [
    "nama_lengkap",
    "nickname",
    "no_whatsapp",
    "nik",
    "kecamatan",
    "kota",
    "channel_url",
    "start_price",
  ];

  const keys = Object.keys(patch || {}).filter((k) => allowed.includes(k));
  if (!keys.length) return { ok: false, reason: "no_allowed_fields" };

  const sets = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => patch[k]);

  await env.DB.prepare(
    `
    UPDATE profiles
    SET ${sets}, diupdate_pada = datetime('now')
    WHERE telegram_id = ?
  `
  )
    .bind(...values, tid)
    .run();

  return { ok: true };
}

export async function updateCloseupPhoto(env, telegramId, fotoCloseupFileId) {
  const tid = String(telegramId || "").trim();
  if (!tid) return { ok: false, reason: "empty_tid" };

  const fileId = String(fotoCloseupFileId || "").trim();
  if (!fileId) return { ok: false, reason: "empty_file_id" };

  await env.DB.prepare(
    `
    UPDATE profiles
    SET foto_closeup_file_id = ?, diupdate_pada = datetime('now')
    WHERE telegram_id = ?
  `
  )
    .bind(fileId, tid)
    .run();

  return { ok: true };
}
