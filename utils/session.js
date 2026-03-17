// utils/session.js

const SESSION_TTL_SECONDS = 3600;

function nowIso() {
  return new Date().toISOString();
}

function randomId() {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);

  let out = "";
  for (const b of arr) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeMeta(meta = {}) {
  const versionNum = Number(meta?.version);
  const version = Number.isFinite(versionNum) && versionNum > 0 ? Math.floor(versionNum) : 1;

  const updatedAt = String(meta?.updated_at || "").trim() || nowIso();
  const createdAt = String(meta?.created_at || "").trim() || updatedAt;
  const flowId = String(meta?.flow_id || "").trim() || randomId();

  return {
    version,
    flow_id: flowId,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function ensureSessionShape(session) {
  if (!isPlainObject(session)) return null;

  const currentMeta = normalizeMeta(session.__meta || {});
  return {
    ...session,
    __meta: currentMeta,
  };
}

function safeParseJson(raw, key = "") {
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("[session.parse.failed]", {
      key,
      err: err?.message || String(err || ""),
    });
    return null;
  }
}

export async function loadSession(env, key) {
  const raw = await env.BOT_STATE.get(key);
  if (!raw) return null;

  const parsed = safeParseJson(raw, key);
  if (!parsed) return null;

  return ensureSessionShape(parsed);
}

export async function saveSession(env, key, session) {
  if (!isPlainObject(session)) {
    throw new Error("saveSession expects a plain object session");
  }

  const prev = await loadSession(env, key).catch(() => null);
  const prevMeta = normalizeMeta(prev?.__meta || {});
  const nextMetaInput = isPlainObject(session.__meta) ? session.__meta : {};

  const keepCreatedAt =
    String(nextMetaInput.created_at || "").trim() ||
    String(prevMeta.created_at || "").trim() ||
    nowIso();

  const nextVersionBase = Number(nextMetaInput.version);
  const nextVersion =
    Number.isFinite(nextVersionBase) && nextVersionBase > 0
      ? Math.floor(nextVersionBase)
      : Number(prevMeta.version || 0) + 1;

  const nextFlowId =
    String(nextMetaInput.flow_id || "").trim() ||
    String(prevMeta.flow_id || "").trim() ||
    randomId();

  const payload = {
    ...session,
    __meta: {
      version: nextVersion,
      flow_id: nextFlowId,
      created_at: keepCreatedAt,
      updated_at: nowIso(),
    },
  };

  await env.BOT_STATE.put(key, JSON.stringify(payload), {
    expirationTtl: SESSION_TTL_SECONDS,
  });

  return payload;
}

export async function clearSession(env, key) {
  await env.BOT_STATE.delete(key);
}

export function getSessionMeta(session) {
  const normalized = ensureSessionShape(session);
  return normalized?.__meta || null;
}

export function getSessionFlowId(session) {
  return getSessionMeta(session)?.flow_id || null;
}

export function getSessionVersion(session) {
  return getSessionMeta(session)?.version || null;
}

export function bumpSessionVersion(session) {
  const normalized = ensureSessionShape(session || {});
  const meta = normalizeMeta(normalized?.__meta || {});

  return {
    ...normalized,
    __meta: {
      ...meta,
      version: Number(meta.version || 0) + 1,
      updated_at: nowIso(),
    },
  };
}

export function withFreshSessionFlow(session, patch = {}) {
  const normalized = ensureSessionShape(session || {}) || {};
  const currentMeta = normalizeMeta(normalized.__meta || {});

  return {
    ...normalized,
    ...patch,
    __meta: {
      ...currentMeta,
      flow_id: randomId(),
      version: Number(currentMeta.version || 0) + 1,
      updated_at: nowIso(),
    },
  };
}

export function isSameSessionFlow(session, flowId) {
  const currentFlowId = getSessionFlowId(session);
  return !!currentFlowId && !!flowId && currentFlowId === flowId;
}
