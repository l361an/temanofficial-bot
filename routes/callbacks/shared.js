// routes/callbacks/shared.js

export async function deleteSetting(env, key) {
  await env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(key).run();
}

export const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const fmtHandle = (username) => {
  const u = String(username || "").trim();
  if (!u) return "-";
  return u.startsWith("@") ? u : `@${u}`;
};

function titleCaseWords(value) {
  return String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const fmtClassId = (classId) => {
  const v = String(classId || "").trim().toLowerCase();
  if (!v) return "-";
  if (v === "bronze") return "Bronze";
  if (v === "gold") return "Gold";
  if (v === "platinum") return "Platinum";
  return titleCaseWords(v);
};

export function buildVerificatorLine(row, verificatorMap) {
  const vid = row?.verificator_admin_id ? String(row.verificator_admin_id) : "";
  if (!vid) return `Verificator: <b>-</b>`;
  const uname = verificatorMap?.get(vid) || "-";
  return `Verificator: <code>${escapeHtml(vid)}</code> - <b>${escapeHtml(uname)}</b>`;
}

function fmtStatusLabel(status) {
  const raw = String(status || "").trim().toLowerCase();
  if (raw === "pending_approval") return "Pending";
  if (raw === "approved") return "Approved";
  if (raw === "suspended") return "Suspended";
  return raw ? raw.replaceAll("_", " ") : "-";
}

export function buildListMessageHtml(title, rows, verificatorMap, { showStatus = false } = {}) {
  const lines = [`📋 <b>${escapeHtml(title)}:</b>`, ""];

  rows.forEach((r) => {
    lines.push(`👤 <b>${escapeHtml(r?.nama_lengkap ? String(r.nama_lengkap) : "-")}</b>`);
    if (showStatus) lines.push(`Status: <b>${escapeHtml(fmtStatusLabel(r?.status))}</b>`);
    lines.push(`Class ID: <b>${escapeHtml(fmtClassId(r?.class_id))}</b>`);
    lines.push(`ID: <code>${escapeHtml(r?.telegram_id ? String(r.telegram_id) : "-")}</code>`);
    lines.push(`Username: <b>${escapeHtml(r?.username ? fmtHandle(r.username) : "-")}</b>`);
    lines.push(`Nickname: <b>${escapeHtml(r?.nickname ? String(r.nickname) : "-")}</b>`);
    lines.push(buildVerificatorLine(r, verificatorMap));
    lines.push("");
  });

  return lines.join("\n");
}

export async function buildVerificatorMap(env, rows) {
  const ids = [
    ...new Set((rows || []).map((r) => r?.verificator_admin_id).filter(Boolean).map((x) => String(x))),
  ];

  const map = new Map();
  if (!ids.length) return map;

  const placeholders = ids.map(() => "?").join(",");
  const q = `SELECT telegram_id, username FROM admins WHERE telegram_id IN (${placeholders})`;
  const stmt = env.DB.prepare(q).bind(...ids);
  const { results } = await stmt.all();

  (results || []).forEach((r) => {
    const tid = String(r.telegram_id);
    const u = String(r.username || "").trim().replace(/^@/, "");
    map.set(tid, u ? `@${u}` : "-");
  });

  ids.forEach((id) => {
    if (!map.has(id)) map.set(id, "-");
  });

  return map;
}
