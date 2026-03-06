// repositories/profilesRepo.js
export async function deleteProfileByTelegramId(env, telegramId) {
  await env.DB.prepare("DELETE FROM profiles WHERE telegram_id = ?").bind(String(telegramId)).run();
}

export async function listProfilesByStatus(env, status) {
  const clean = String(status || "").trim();
  if (!clean) return [];
  const { results } = await env.DB.prepare(
    `
    SELECT telegram_id, nama_lengkap, username, nickname, verificator_admin_id
    FROM profiles
    WHERE status = ?
    ORDER BY diupdate_pada DESC, dibuat_pada DESC, nama_lengkap ASC
  `
  )
    .bind(clean)
    .all();
  return results ?? [];
}

// list all partners (no status filter)
export async function listProfilesAll(env) {
  const { results } = await env.DB.prepare(
    `
    SELECT telegram_id, nama_lengkap, username, nickname, status, verificator_admin_id
    FROM profiles
    ORDER BY diupdate_pada DESC, dibuat_pada DESC, nama_lengkap ASC
  `
  ).all();
  return results ?? [];
}

export async function getProfileStatus(env, telegramId) {
  const { results } = await env.DB.prepare("SELECT status FROM profiles WHERE telegram_id = ? LIMIT 1")
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

export async function resetRejectedProfile(env, telegramId) {
  const tid = String(telegramId);
  const existing = await getProfileByTelegramId(env, tid);
  if (!existing?.telegram_id) return { ok: true, didReset: false };
  if (existing.status !== "rejected") return { ok: false, reason: "not_rejected", existing };

  await env.DB.prepare("DELETE FROM profile_categories WHERE profile_id = ?").bind(String(existing.id)).run();
  await env.DB.prepare("DELETE FROM profiles WHERE telegram_id = ?").bind(tid).run();
  return { ok: true, didReset: true };
}

export async function approveProfile(env, telegramId, adminId) {
  await env.DB.prepare(
    `
    UPDATE profiles
    SET status = 'approved',
        verificator_admin_id = ?
    WHERE telegram_id = ?
  `
  )
    .bind(String(adminId), String(telegramId))
    .run();
}

export async function rejectProfile(env, telegramId) {
  await env.DB.prepare("UPDATE profiles SET status = 'rejected' WHERE telegram_id = ?").bind(String(telegramId)).run();
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
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

export async function setProfileStatus(env, telegramId, status) {
  await env.DB.prepare("UPDATE profiles SET status = ? WHERE telegram_id = ?")
    .bind(String(status), String(telegramId))
    .run();
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

export async function getProfileFullByTelegramId(env, telegramId) {
  const row = await env.DB.prepare("SELECT * FROM profiles WHERE telegram_id = ? LIMIT 1")
    .bind(String(telegramId))
    .first();
  return row ?? null;
}

export async function listCategoryKodesByProfileId(env, profileId) {
  try {
    const res = await env.DB.prepare(
      `
      SELECT c.kode AS kode
      FROM profile_categories pc
      JOIN categories c ON c.id = pc.category_id
      WHERE pc.profile_id = ?
      ORDER BY c.kode ASC
    `
    )
      .bind(String(profileId))
      .all();

    return (res?.results || []).map((r) => r.kode).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeUsername(u) {
  return String(u ?? "").trim().replace(/^@/, "");
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

  const allowed = ["nickname", "no_whatsapp", "kecamatan", "kota"];
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

/**
 * shared setter for profile categories (by IDs)
 * - replace all existing categories with provided categoryIds
 * - wajib minimal 1 kalau function ini dipakai
 */
export async function setProfileCategoriesByProfileId(env, profileId, categoryIds) {
  const pid = String(profileId || "").trim();
  if (!pid) return { ok: false, reason: "empty_profile_id" };

  const ids = Array.isArray(categoryIds) ? categoryIds.map((x) => String(x).trim()).filter(Boolean) : [];
  if (!ids.length) return { ok: false, reason: "empty_category_ids" };

  const placeholders = ids.map(() => "?").join(",");
  const check = await env.DB.prepare(
    `
    SELECT id
    FROM categories
    WHERE id IN (${placeholders})
  `
  )
    .bind(...ids)
    .all();

  const existingIds = (check?.results || []).map((r) => r.id).filter(Boolean);
  if (!existingIds.length) return { ok: false, reason: "no_match" };

  await env.DB.prepare("DELETE FROM profile_categories WHERE profile_id = ?").bind(pid).run();

  for (const cid of existingIds) {
    await env.DB.prepare("INSERT INTO profile_categories (profile_id, category_id) VALUES (?, ?)")
      .bind(pid, String(cid))
      .run();
  }

  await env.DB.prepare("UPDATE profiles SET diupdate_pada = datetime('now') WHERE id = ?").bind(pid).run();

  return { ok: true, count: existingIds.length };
}

// legacy keep for backward compatibility
export async function setProfileCategoriesByCodes(env, telegramId, kodeList) {
  const tid = String(telegramId || "").trim();
  if (!tid) return { ok: false, reason: "empty_tid" };

  const profile = await env.DB.prepare(
    `
    SELECT id
    FROM profiles
    WHERE telegram_id = ?
    LIMIT 1
  `
  )
    .bind(tid)
    .first();

  if (!profile?.id) return { ok: false, reason: "no_profile" };

  const codes = Array.isArray(kodeList) ? kodeList.map((x) => String(x).trim()).filter(Boolean) : [];
  if (!codes.length) return { ok: false, reason: "empty_codes" };

  const placeholders = codes.map(() => "?").join(",");
  const res = await env.DB.prepare(
    `
    SELECT id, kode
    FROM categories
    WHERE kode IN (${placeholders})
       OR LOWER(kode) IN (${placeholders})
  `
  )
    .bind(...codes, ...codes.map((c) => c.toLowerCase()))
    .all();

  const rows = res?.results || [];
  const ids = rows.map((r) => r.id).filter(Boolean);
  if (!ids.length) return { ok: false, reason: "no_match" };

  await env.DB.prepare("DELETE FROM profile_categories WHERE profile_id = ?").bind(String(profile.id)).run();

  for (const cid of ids) {
    await env.DB.prepare("INSERT INTO profile_categories (profile_id, category_id) VALUES (?, ?)")
      .bind(String(profile.id), String(cid))
      .run();
  }

  await env.DB.prepare("UPDATE profiles SET diupdate_pada = datetime('now') WHERE id = ?")
    .bind(String(profile.id))
    .run();

  return { ok: true, count: ids.length };
}
