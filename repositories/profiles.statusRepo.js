// repositories/profiles.statusRepo.js

export async function approveProfile(env, telegramId, adminId) {
  await env.DB.prepare(
    `
    UPDATE profiles
    SET status = 'approved',
        status_reason = 'registration_approved',
        status_changed_at = datetime('now'),
        status_changed_by = ?,
        admin_note = NULL,
        approved_at = datetime('now'),
        approved_by = ?,
        verificator_admin_id = ?,
        diupdate_pada = datetime('now')
    WHERE telegram_id = ?
  `
  )
    .bind(String(adminId), String(adminId), String(adminId), String(telegramId))
    .run();
}

export async function suspendProfile(env, telegramId, adminId, reason = null) {
  await env.DB.prepare(
    `
    UPDATE profiles
    SET status = 'suspended',
        status_reason = 'manual_suspend',
        status_changed_at = datetime('now'),
        status_changed_by = ?,
        admin_note = ?,
        is_manual_suspended = 1,
        suspended_at = datetime('now'),
        suspended_by = ?,
        suspend_reason = ?,
        diupdate_pada = datetime('now')
    WHERE telegram_id = ?
  `
  )
    .bind(
      String(adminId),
      reason == null ? null : String(reason),
      String(adminId),
      reason == null ? "manual_suspend" : String(reason),
      String(telegramId)
    )
    .run();
}

export async function setProfileStatus(env, telegramId, status) {
  await env.DB.prepare(
    `
    UPDATE profiles
    SET status = ?, diupdate_pada = datetime('now')
    WHERE telegram_id = ?
  `
  )
    .bind(String(status), String(telegramId))
    .run();
}

export async function setProfileStatusAuditFields(env, telegramId, options = {}) {
  const {
    status,
    statusReason = null,
    statusChangedBy = null,
    adminNote = null,
  } = options || {};

  await env.DB.prepare(
    `
    UPDATE profiles
    SET status = ?,
        status_reason = ?,
        status_changed_at = datetime('now'),
        status_changed_by = ?,
        admin_note = ?,
        diupdate_pada = datetime('now')
    WHERE telegram_id = ?
  `
  )
    .bind(
      String(status),
      statusReason == null ? null : String(statusReason),
      statusChangedBy == null ? null : String(statusChangedBy),
      adminNote == null ? null : String(adminNote),
      String(telegramId)
    )
    .run();
}

export async function markManualSuspendProfile(env, telegramId, options = {}) {
  const {
    adminId = null,
    statusReason = "manual_suspend",
    adminNote = null,
  } = options || {};

  await env.DB.prepare(
    `
    UPDATE profiles
    SET status = 'suspended',
        status_reason = ?,
        status_changed_at = datetime('now'),
        status_changed_by = ?,
        admin_note = ?,
        is_manual_suspended = 1,
        suspended_at = datetime('now'),
        suspended_by = ?,
        suspend_reason = ?,
        diupdate_pada = datetime('now')
    WHERE telegram_id = ?
  `
  )
    .bind(
      String(statusReason),
      adminId == null ? null : String(adminId),
      adminNote == null ? null : String(adminNote),
      adminId == null ? null : String(adminId),
      adminNote == null ? "manual_suspend" : String(adminNote),
      String(telegramId)
    )
    .run();
}

export async function clearManualSuspendProfile(env, telegramId) {
  await env.DB.prepare(
    `
    UPDATE profiles
    SET is_manual_suspended = 0,
        diupdate_pada = datetime('now')
    WHERE telegram_id = ?
  `
  )
    .bind(String(telegramId))
    .run();
}
