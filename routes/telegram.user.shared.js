// routes/telegram.user.shared.js

import { sendMessage } from "../services/telegramApi.js";

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

export const normalizeStatus = (value) => String(value || "").trim().toLowerCase();
export const normalizeClassId = (value) => String(value || "").trim().toLowerCase();

export function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "Rp 0";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export function pad2(value) {
  return String(value).padStart(2, "0");
}

export function formatDateTime(value) {
  if (!value) return "-";

  const raw = String(value).trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, yyyy, mm, dd, hh = "00", mi = "00"] = m;
    return `${dd}-${mm}-${yyyy} ${hh}:${mi}`;
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function makeSqlDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export function addHours(baseDate, hours) {
  const d = new Date(baseDate);
  d.setHours(d.getHours() + Number(hours || 0));
  return d;
}

export function randomInt(min, max) {
  const lo = Math.min(Number(min || 0), Number(max || 0));
  const hi = Math.max(Number(min || 0), Number(max || 0));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

export function makeTicketCode(telegramId) {
  const suffix = String(telegramId || "").slice(-4) || "0000";
  const stamp = Date.now().toString().slice(-8);
  return `TMN-${suffix}-${stamp}`;
}

export const getPhotoFileId = (update) => {
  const msg = update?.message;
  return Array.isArray(msg?.photo) && msg.photo.length ? msg.photo[msg.photo.length - 1]?.file_id ?? null : null;
};

export const sendHtml = (env, chatId, text, extra = {}) =>
  sendMessage(env, chatId, text, { parse_mode: "HTML", disable_web_page_preview: true, ...extra });

export const buildTeManMenuKeyboard = () => ({
  inline_keyboard: [[{ text: "📋 Menu TeMan", callback_data: "teman:menu" }]],
});
