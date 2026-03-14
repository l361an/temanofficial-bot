// routes/callbacks/partner.render.js

import {
  sendMessage,
  sendPhoto,
  sendLongMessage,
  upsertCallbackMessage,
} from "../../services/telegramApi.js";
import { getAdminByTelegramId } from "../../repositories/adminsRepo.js";
import {
  listCategoryKodesByProfileId,
  getProfileFullByTelegramId,
} from "../../repositories/profilesRepo.js";
import {
  buildBackToPartnerDatabaseKeyboard,
  buildPartnerDetailsKeyboard,
} from "./keyboards.partner.js";
import { CALLBACKS, cb } from "../telegram.constants.js";
import { escapeHtml, fmtClassId, fmtHandle } from "./shared.js";
import { fmtKV } from "./partner.utils.js";

export const PM_PREVIEW_PREFIX = "pm_preview:";

export function buildBackAndHomeKeyboard(telegramId, backCallbackData = null) {
  return {
    inline_keyboard: [[
      { text: "⬅️ Back", callback_data: backCallbackData || cb.pmEditBack(telegramId) },
      { text: "🏠 Officer Home", callback_data: CALLBACKS.OFFICER_HOME },
    ]],
  };
}

export function buildSuccessKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [
        { text: "⬅️ Back", callback_data: cb.pmEditBack(telegramId) },
        { text: "👁️ Preview", callback_data: `${PM_PREVIEW_PREFIX}${telegramId}` },
      ],
      [{ text: "🏠 Officer Home", callback_data: CALLBACKS.OFFICER_HOME }],
    ],
  };
}

export async function renderActionMenu(env, adminId, telegramId, role, msg = null) {
  const profile = await getProfileFullByTelegramId(env, telegramId);

  if (!profile) {
    if (msg) {
      await upsertCallbackMessage(env, msg, "⚠️ Data partner tidak ditemukan.", {
        reply_markup: buildBackToPartnerDatabaseKeyboard(),
      }).catch(async () => {
        await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
      });
      return true;
    }

    await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
      reply_markup: buildBackToPartnerDatabaseKeyboard(),
    });
    return true;
  }

  const text = [
    "⚙️ <b>Aksi Partner</b>",
    "",
    `Partner: <b>${escapeHtml(profile.nama_lengkap || "-")}</b>`,
    `Telegram ID: <code>${escapeHtml(profile.telegram_id || "-")}</code>`,
    "",
    "Pilih aksi dibawah :",
  ].join("\n");

  const extra = {
    parse_mode: "HTML",
    reply_markup: buildPartnerDetailsKeyboard(profile.telegram_id, role),
  };

  if (msg) {
    await upsertCallbackMessage(env, msg, text, extra).catch(async () => {
      await sendMessage(env, adminId, text, extra);
    });
    return true;
  }

  await sendMessage(env, adminId, text, extra);
  return true;
}

export async function renderSuccessState(env, adminId, telegramId, label, msg = null) {
  const text = `✅ Data ${label} berhasil diupdate !!!`;
  const extra = { reply_markup: buildSuccessKeyboard(telegramId) };

  if (msg) {
    await upsertCallbackMessage(env, msg, text, extra).catch(async () => {
      await sendMessage(env, adminId, text, extra);
    });
    return true;
  }

  await sendMessage(env, adminId, text, extra);
  return true;
}

export async function buildPartnerDetailText(env, profile) {
  const categories = profile?.id ? await listCategoryKodesByProfileId(env, profile.id) : [];
  const kategoriText = categories.length ? categories.join(", ") : "-";

  let verificatorDisplay = "-";
  if (profile?.verificator_admin_id) {
    const vid = String(profile.verificator_admin_id);
    const vRow = await getAdminByTelegramId(env, vid).catch(() => null);
    const vUser = vRow?.username ? fmtHandle(vRow.username) : "-";
    verificatorDisplay = vUser || "-";
  }

  return (
    "🧾 <b>PARTNER</b>\n" +
    fmtKV("Telegram ID", profile?.telegram_id) + "\n" +
    fmtKV("Username", fmtHandle(profile?.username)) + "\n" +
    fmtKV("Class ID", fmtClassId(profile?.class_id)) + "\n" +
    fmtKV("Nama Lengkap", profile?.nama_lengkap) + "\n" +
    fmtKV("Nickname", profile?.nickname) + "\n" +
    fmtKV("NIK", profile?.nik) + "\n" +
    fmtKV("Kategori", kategoriText) + "\n" +
    fmtKV("No. Whatsapp", profile?.no_whatsapp) + "\n" +
    fmtKV("Kecamatan", profile?.kecamatan) + "\n" +
    fmtKV("Kota", profile?.kota) + "\n" +
    fmtKV("Channel", profile?.channel_url) + "\n" +
    fmtKV("Verificator", verificatorDisplay)
  );
}

export async function sendPartnerDetailOutput(env, chatId, role, profile) {
  const textSummary = await buildPartnerDetailText(env, profile);

  await sendLongMessage(env, chatId, textSummary, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });

  for (const [fileId, cap] of [
    [profile?.foto_closeup_file_id, "📸 <b>Foto Closeup</b>"],
    [profile?.foto_fullbody_file_id, "📸 <b>Foto Fullbody</b>"],
    [profile?.foto_ktp_file_id, "🪪 <b>Foto KTP</b>"],
  ]) {
    if (fileId) {
      await sendPhoto(env, chatId, fileId, cap, { parse_mode: "HTML" });
    }
  }

  await sendMessage(env, chatId, "⚙️ <b>Aksi Partner</b>", {
    parse_mode: "HTML",
    reply_markup: buildPartnerDetailsKeyboard(profile.telegram_id, role),
  });
}
