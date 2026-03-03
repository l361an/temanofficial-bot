// utils/session.js
export async function loadSession(env, key) {
  const raw = await env.BOT_STATE.get(key);
  return raw ? JSON.parse(raw) : null;
}

export async function saveSession(env, key, session) {
  await env.BOT_STATE.put(key, JSON.stringify(session), { expirationTtl: 3600 });
}

export async function clearSession(env, key) {
  await env.BOT_STATE.delete(key);
}
