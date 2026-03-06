// utils/partnerHelpers.js

export const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const fmtKV = (label, value) => {
  const v = value === null || value === undefined || value === "" ? "-" : String(value);
  return `• <b>${escapeHtml(label)}:</b> ${escapeHtml(v)}`;
};

export const cleanHandle = (username) => {
  const u = String(username || "").trim().replace(/^@/, "");
  return u ? `@${u}` : "-";
};

export const fmtClassId = (classId) => {
  const v = String(classId || "").trim().toLowerCase();
  if (v === "bronze") return "Bronze";
  if (v === "gold") return "Gold";
  if (v === "platinum") return "Platinum";
  return "-";
};

export async function findTelegramIdByUsername(env, username) {
  const clean = String(username || "").trim().replace(/^@/, "");
  if (!clean) return null;

  const row = await env.DB.prepare(
    `SELECT telegram_id FROM profiles WHERE username = ? LIMIT 1`
  )
    .bind(clean)
    .first();

  return row?.telegram_id ?? null;
}

export async function resolveTelegramId(env, rawTarget) {
  const target = String(rawTarget || "").trim();
  if (!target) return null;

  if (target.startsWith("@")) {
    return (await findTelegramIdByUsername(env, target)) || null;
  }

  if (/^\d+$/.test(target)) return target;

  return null;
}
