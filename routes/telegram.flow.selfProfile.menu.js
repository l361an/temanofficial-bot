// routes/telegram.flow.selfProfile.menu.js

import { sendMessage, upsertCallbackMessage } from "../services/telegramApi.js";
import { getProfileFullByTelegramId } from "../repositories/profilesRepo.js";
import { CALLBACKS } from "./telegram.constants.js";
import { sendHtml, buildTeManMenuKeyboard, escapeHtml } from "./telegram.user.shared.js";

function fmtPartnerStatusLabel(status) {
  const raw = String(status || "").trim().toLowerCase();

  if (raw === "pending_approval") return "Pending";
  if (raw === "approved") return "Approved";
  if (raw === "suspended") return "Suspended";

  return raw ? raw.replaceAll("_", " ") : "-";
}

function buildCatalogToggleLabel(profile) {
  const isVisible = Number(profile?.is_catalog_visible || 0) === 1;
  return isVisible ? "📢 Katalog: ON" : "📢 Katalog: OFF";
}

export function buildSelfEditMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "✏️ Nickname", callback_data: "self:edit:nickname" },
        { text: "📱 No. Whatsapp", callback_data: "self:edit:no_whatsapp" },
      ],
      [
        { text: "🏘️ Kecamatan", callback_data: "self:edit:kecamatan" },
        { text: "🏙️ Kota", callback_data: "self:edit:kota" },
      ],
      [
        { text: "💰 Tarif Minimum", callback_data: "self:edit:start_price" },
      ],
      [
        { text: "🧩 Kategori", callback_data: "self:edit:kategori" },
      ],
      [
        { text: "📸 Foto Closeup", callback_data: "self:edit:closeup" },
      ],
      [
        { text: "⬅️ Kembali ke Menu Partner", callback_data: "teman:menu" },
      ],
    ],
  };
}

export function buildSelfMenuKeyboard(profile = null) {
  return {
    inline_keyboard: [
      [{ text: "👤 Lihat Profile", callback_data: "self:view" }],
      [{ text: "📝 Update Profile", callback_data: "self:update" }],
      [{ text: buildCatalogToggleLabel(profile), callback_data: CALLBACKS.SELF_CATALOG_TOGGLE }],
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

export function buildSelfEditMenuMessage(profile) {
  const nick = profile?.nickname
    ? String(profile.nickname)
    : profile?.nama_lengkap
      ? String(profile.nama_lengkap)
      : "Partner";

  return [
    `📝 <b>Update Profile Partner</b>`,
    "",
    `Halo <b>${escapeHtml(nick)}</b>, pilih data yang ingin kamu ubah:`,
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
    reply_markup: buildSelfMenuKeyboard(profile),
    disable_web_page_preview: true,
  };

  if (sourceMessage) {
    await upsertCallbackMessage(env, sourceMessage, text, extra);
    return;
  }

  await sendMessage(env, chatId, text, extra);
}

export async function sendSelfEditMenu(env, chatId, telegramId, options = {}) {
  const { sourceMessage = null } = options;

  const profile = await getProfileFullByTelegramId(env, telegramId);

  if (!profile) {
    await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  const text = buildSelfEditMenuMessage(profile);
  const extra = {
    parse_mode: "HTML",
    reply_markup: buildSelfEditMenuKeyboard(),
    disable_web_page_preview: true,
  };

  if (sourceMessage) {
    await upsertCallbackMessage(env, sourceMessage, text, extra);
    return;
  }

  await sendMessage(env, chatId, text, extra);
}
