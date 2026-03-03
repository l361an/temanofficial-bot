// repositories/settingsRepo.js
export async function getSetting(env, key) {
  const { results } = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).all();
  return results?.[0]?.value ?? null;
}

export async function upsertSetting(env, key, value) {
  await env.DB.prepare(
    `
    INSERT OR REPLACE INTO settings (key, value)
    VALUES (?, ?)
  `
  )
    .bind(key, value)
    .run();
}
