// routes/callbacks/partner.verificator.js

import { getProfileFullByTelegramId } from "../../repositories/profilesRepo.js";

export async function loadEligibleVerificators(env) {
  const rows = await env.DB.prepare(
    `
    SELECT telegram_id, username, role, status
    FROM admins
    WHERE lower(status) = 'active'
      AND lower(role) IN ('owner', 'superadmin', 'admin')
    ORDER BY
      CASE lower(role)
        WHEN 'owner' THEN 0
        WHEN 'superadmin' THEN 1
        ELSE 2
      END,
      COALESCE(NULLIF(trim(username), ''), telegram_id) ASC
  `
  ).all();

  return (rows?.results || [])
    .map((row) => {
      const tid = String(row.telegram_id || "").trim();
      const uname = String(row.username || "").trim().replace(/^@/, "");
      return {
        telegram_id: tid,
        label: uname ? `@${uname}` : tid,
      };
    })
    .filter((row) => row.telegram_id);
}

export async function updatePartnerVerificator(env, telegramId, verificatorAdminId) {
  const tid = String(telegramId || "").trim();
  const aid = String(verificatorAdminId || "").trim();

  if (!tid) return { ok: false, reason: "empty_tid" };
  if (!aid) return { ok: false, reason: "empty_admin_id" };

  const profile = await getProfileFullByTelegramId(env, tid);
  if (!profile?.telegram_id) return { ok: false, reason: "not_found" };

  await env.DB.prepare(
    `
    UPDATE profiles
    SET verificator_admin_id = ?, diupdate_pada = datetime('now')
    WHERE telegram_id = ?
  `
  )
    .bind(aid, tid)
    .run();

  return { ok: true };
}
