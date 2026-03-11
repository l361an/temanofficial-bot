// repositories/profiles.categoryRepo.js

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

export async function setProfileCategoriesByProfileId(env, profileId, categoryIds) {
  const pid = String(profileId || "").trim();
  if (!pid) return { ok: false, reason: "empty_profile_id" };

  const ids = Array.isArray(categoryIds)
    ? categoryIds.map((x) => String(x).trim()).filter(Boolean)
    : [];
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

  await env.DB.prepare("DELETE FROM profile_categories WHERE profile_id = ?")
    .bind(pid)
    .run();

  for (const cid of existingIds) {
    await env.DB.prepare(
      "INSERT INTO profile_categories (profile_id, category_id) VALUES (?, ?)"
    )
      .bind(pid, String(cid))
      .run();
  }

  await env.DB.prepare(
    "UPDATE profiles SET diupdate_pada = datetime('now') WHERE id = ?"
  )
    .bind(pid)
    .run();

  return { ok: true, count: existingIds.length };
}

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

  const codes = Array.isArray(kodeList)
    ? kodeList.map((x) => String(x).trim()).filter(Boolean)
    : [];
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

  await env.DB.prepare("DELETE FROM profile_categories WHERE profile_id = ?")
    .bind(String(profile.id))
    .run();

  for (const cid of ids) {
    await env.DB.prepare(
      "INSERT INTO profile_categories (profile_id, category_id) VALUES (?, ?)"
    )
      .bind(String(profile.id), String(cid))
      .run();
  }

  await env.DB.prepare(
    "UPDATE profiles SET diupdate_pada = datetime('now') WHERE id = ?"
  )
    .bind(String(profile.id))
    .run();

  return { ok: true, count: ids.length };
}
