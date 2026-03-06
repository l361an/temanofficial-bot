// routes/callbacks/partnerClass.js
import { sendMessage, sendPhoto, sendLongMessage, editMessageReplyMarkup } from "../../services/telegramApi.js";
import { getAdminByTelegramId } from "../../repositories/adminsRepo.js";
import {
  getProfileFullByTelegramId,
  listCategoryKodesByProfileId,
  updateProfileClassByTelegramId,
} from "../../repositories/profilesRepo.js";
import {
  buildBackToPartnerDatabaseViewKeyboard,
  buildPartnerClassPickerKeyboard,
  buildPartnerDetailActionsKeyboard,
} from "./keyboards.js";
import { escapeHtml, fmtClassId, fmtHandle } from "./shared.js";

const fmtKV = (label, value) => {
  const v = value === null || value === undefined || value === "" ? "-" : String(value);
  return `• <b>${escapeHtml(label)}:</b> ${escapeHtml(v)}`;
};

async function buildPartnerDetailText(env, profile) {
  const categories = profile?.id ? await listCategoryKodesByProfileId(env, profile.id) : [];
  const kategoriText = categories.length ? categories.join(", ") : "-";

  let verificatorDisplay = "-";
  if (profile?.verificator_admin_id) {
    const vid = String(profile.verificator_admin_id);
    const vRow = await getAdminByTelegramId(env, vid).catch(() => null);
    const vUser = vRow?.username ? fmtHandle(vRow.username) : vRow?.label ? String(vRow.label) : "-";
    verificatorDisplay = `${vid} - ${vUser || "-"}`;
  }

  return (
    "🧾 <b>PARTNER</b>\n" +
    fmtKV("Telegram ID", profile?.telegram_id) +
    "\n" +
    fmtKV("Username", fmtHandle(profile?.username)) +
    "\n" +
    fmtKV("Class ID", fmtClassId(profile?.class_id)) +
    "\n" +
    fmtKV("Nama Lengkap", profile?.nama_lengkap) +
    "\n" +
    fmtKV("Nickname", profile?.nickname) +
    "\n" +
    fmtKV("NIK", profile?.nik) +
    "\n" +
    fmtKV("Kategori", kategoriText) +
    "\n" +
    fmtKV("No. Whatsapp", profile?.no_whatsapp) +
    "\n" +
    fmtKV("Kecamatan", profile?.kecamatan) +
    "\n" +
    fmtKV("Kota", profile?.kota) +
    "\n" +
    fmtKV("Verificator", verificatorDisplay)
  );
}

async function sendPartnerDetailOutput(env, chatId, role, profile) {
  const textSummary = await buildPartnerDetailText(env, profile);
  await sendLongMessage(env, chatId, textSummary, { parse_mode: "HTML", disable_web_page_preview: true });

  for (const [fileId, cap] of [
    [profile?.foto_closeup_file_id, "📸 <b>Foto Closeup</b>"],
    [profile?.foto_fullbody_file_id, "📸 <b>Foto Fullbody</b>"],
    [profile?.foto_ktp_file_id, "🪪 <b>Foto KTP</b>"],
  ]) {
    if (fileId) await sendPhoto(env, chatId, fileId, cap, { parse_mode: "HTML" });
  }

  await sendMessage(env, chatId, "⚙️ <b>Aksi Partner</b>", {
    parse_mode: "HTML",
    reply_markup: buildPartnerDetailActionsKeyboard(profile.telegram_id, role),
  });
}

export function buildPartnerClassHandlers() {
  const EXACT = {};
  const PREFIX = [];

  PREFIX.push({
    match: (d) => d.startsWith("pmclass:start:"),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;
      const telegramId = String(data.split(":")[2] || "").trim();

      if (!telegramId) {
        await sendMessage(env, adminId, "⚠️ Target partner tidak valid.", {
          reply_markup: buildBackToPartnerDatabaseViewKeyboard(),
        });
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId);
      if (!profile) {
        await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
          reply_markup: buildBackToPartnerDatabaseViewKeyboard(),
        });
        return true;
      }

      if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});

      await sendMessage(
        env,
        adminId,
        `🏷️ <b>Ubah Class Partner</b>\n\n` +
          `Partner: <b>${escapeHtml(profile.nama_lengkap || "-")}</b>\n` +
          `Telegram ID: <code>${escapeHtml(profile.telegram_id || "-")}</code>\n` +
          `Class saat ini: <b>${escapeHtml(fmtClassId(profile.class_id))}</b>\n\n` +
          `Pilih class baru di bawah:`,
        {
          parse_mode: "HTML",
          reply_markup: buildPartnerClassPickerKeyboard(profile.telegram_id),
        }
      );
      return true;
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith("pmclass:set:"),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId, role } = ctx;
      const parts = String(data || "").split(":");
      const telegramId = String(parts[2] || "").trim();
      const classId = String(parts[3] || "").trim().toLowerCase();

      if (!telegramId) {
        await sendMessage(env, adminId, "⚠️ Target partner tidak valid.", {
          reply_markup: buildBackToPartnerDatabaseViewKeyboard(),
        });
        return true;
      }

      const res = await updateProfileClassByTelegramId(env, telegramId, classId);
      if (!res.ok) {
        const msg =
          res.reason === "invalid_class_id"
            ? "⚠️ Class ID tidak valid. Pilih Bronze, Gold, atau Platinum."
            : res.reason === "not_found"
              ? "⚠️ Data partner tidak ditemukan."
              : "⚠️ Gagal mengubah class partner.";

        await sendMessage(env, adminId, msg, {
          reply_markup:
            res.reason === "invalid_class_id"
              ? buildPartnerClassPickerKeyboard(telegramId)
              : buildBackToPartnerDatabaseViewKeyboard(),
        });
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId);
      if (!profile) {
        await sendMessage(
          env,
          adminId,
          `✅ Class partner berhasil diubah menjadi <b>${escapeHtml(fmtClassId(classId))}</b>.`,
          {
            parse_mode: "HTML",
            reply_markup: buildBackToPartnerDatabaseViewKeyboard(),
          }
        );
        return true;
      }

      if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});

      await sendMessage(
        env,
        adminId,
        `✅ Class partner berhasil diubah.\n\n` +
          `Partner: <b>${escapeHtml(profile.nama_lengkap || "-")}</b>\n` +
          `Telegram ID: <code>${escapeHtml(profile.telegram_id || "-")}</code>\n` +
          `Class baru: <b>${escapeHtml(fmtClassId(profile.class_id))}</b>`,
        { parse_mode: "HTML" }
      );

      await sendPartnerDetailOutput(env, adminId, role, profile);
      return true;
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith("pmclass:back:"),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId, role } = ctx;
      const telegramId = String(data.split(":")[2] || "").trim();

      if (!telegramId) {
        await sendMessage(env, adminId, "⚠️ Target partner tidak valid.", {
          reply_markup: buildBackToPartnerDatabaseViewKeyboard(),
        });
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId);
      if (!profile) {
        await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
          reply_markup: buildBackToPartnerDatabaseViewKeyboard(),
        });
        return true;
      }

      if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});

      await sendPartnerDetailOutput(env, adminId, role, profile);
      return true;
    },
  });

  return { EXACT, PREFIX };
}
