// routes/admin.js

import { json, error } from "../utils/response.js";

export async function handleAdmin(request, env, url) {
  if (url.pathname === "/admin/check") {
    const telegramId = url.searchParams.get("telegram_id");
    if (!telegramId) return error("telegram_id required");

    const { results } = await env.DB
      .prepare("SELECT * FROM admins WHERE telegram_id = ?")
      .bind(telegramId)
      .all();

    if (results.length === 0) return error("NOT ADMIN", 403);

    return json({ message: "ADMIN VALID" });
  }

  if (url.pathname === "/admin/approve") {
    const telegramId = url.searchParams.get("telegram_id");
    const profileId = url.searchParams.get("profile_id");

    if (!telegramId || !profileId)
      return error("telegram_id & profile_id required");

    const { results: admin } = await env.DB
      .prepare("SELECT * FROM admins WHERE telegram_id = ?")
      .bind(telegramId)
      .all();

    if (admin.length === 0) return error("NOT ADMIN", 403);

    await env.DB
      .prepare("UPDATE profiles SET status = 'approved' WHERE id = ?")
      .bind(profileId)
      .run();

    await env.DB
      .prepare(`
        INSERT INTO verification_logs (profile_id, admin_id, action, created_at)
        VALUES (?, ?, 'approve', datetime('now'))
      `)
      .bind(profileId, admin[0].id)
      .run();

    return json({ message: "PROFILE APPROVED" });
  }
}
