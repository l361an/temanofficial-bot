// routes/telegram.flow.selfProfile.menu.js

import { sendMessage, upsertCallbackMessage } from "../services/telegramApi.js";
import { getProfileFullByTelegramId } from "../repositories/profilesRepo.js";
import { sendHtml, buildTeManMenuKeyboard, escapeHtml } from "./telegram.user.shared.js";

function fmtPartnerStatusLabel(status) {
  const raw = String(status || "").trim().toLowerCase();

  if (raw === "pending_approval") return "Pending Approval";
  if (raw === "approved") return "Approved";
  if (raw === "active") return "Active";
  if (raw === "suspended") return "Suspended";

  return raw ? raw.replaceAll("_", " ") : "-";
}

export function buildSelfMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👤 Lihat Profile", callback_data: "self:view" }],
      [{ text: "📝 Update Profile", callback_data: "self:update" }],
      [{ text: "💎 Premium Partner", callback_data: "self:payment" }],
    ],
  };
}

export function buildSelfMenuMessage(profile) {
  const nick = profile?.nickname
    ? String(profile.nickname)
    : profile?.nama_lengkap
      ? String(profile.nama_lengkap)
      : "Partner";

  const statusLabel = fmtPartnerStatusLabel(profile?.status);

  return [
    `Halo ${escapeHtml(nick)} !!!`,
    `Status Partnership kamu saat ini <b>${escapeHtml(statusLabel)}</b>...`,
    "Apa yang bisa TeMan bantu hari ini ?",
  ].join("\n");
}

export async function sendSelfMenu(env, chatId, telegramId, options = {}) {
  const { sourceMessage = null } = options;

  const profile = await getProfileFullByTelegramId(env, telegramId);

  if (!profile) {
    await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  const text = buildSelfMenuMessage(profile);
  const extra = {
    parse_mode: "HTML",
    reply_markup: buildSelfMenuKeyboard(),
    disable_web_page_preview: true,
  };

  if (sourceMessage) {
    await upsertCallbackMessage(env, sourceMessage, text, extra);
    return;
  }

  await sendMessage(env, chatId, text, extra);
}
