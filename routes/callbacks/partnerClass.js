// routes/callbacks/partnerClass.js
import { sendMessage, sendPhoto, sendLongMessage, editMessageReplyMarkup } from "../../services/telegramApi.js";
import { saveSession } from "../../utils/session.js";
import { getAdminByTelegramId, listActiveVerificators } from "../../repositories/adminsRepo.js";
import {
  getProfileFullByTelegramId,
  listCategoryKodesByProfileId,
  updateProfileClassByTelegramId,
} from "../../repositories/profilesRepo.js";
import {
  buildBackToPartnerDatabaseViewKeyboard,
  buildPartnerClassPickerKeyboard,
  buildPartnerDetailActionsKeyboard,
  buildPartnerVerificatorPickerKeyboard,
} from "./keyboards.js";
import { escapeHtml, fmtClassId, fmtHandle } from "./shared.js";
import { CALLBACK_PREFIX, SESSION_MODES } from "../telegram.constants.js";

const fmtKV = (label, value) => {
  const v = value === null || value === undefined || value === "" ? "-" : String(value);
  return `• <b>${escapeHtml(label)}:</b> ${escapeHtml(v)}`;
};

export async function buildPartnerDetailText(env, profile) {
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

export async function sendPartnerDetailOutput(env, chatId, role, profile) {
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

async function updatePartnerVerificator(env, telegramId, verificatorAdminId) {
  const tid = String(telegramId || "").trim();
  const aid = String(verificatorAdminId || "").trim();

  if (!tid) return { ok: false, reason: "empty_tid" };
  if (!aid) return { ok: false, reason: "empty_admin_id" };

  const profile = await getProfileFullByTelegramId(env, tid);
  if (!profile?.telegram_id) return { ok: false, reason: "not_found" };

  await env.DB.prepare(
    `
    UPDATE profiles
    SET verificator_admin_id = ?, diupdate_pada = datetime('now')
    WHERE telegram_id = ?
  `
  )
    .bind(aid, tid)
    .run();

  return { ok: true };
}

export function buildPartnerClassHandlers() {
  const EXACT = {};
  const PREFIX = [];

  // =========================
  // UBAH CLASS
  // =========================
  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_CLASS_START),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;
      const telegramId = String(data.slice(CALLBACK_PREFIX.PM_CLASS_START.length) || "").trim();

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

      if (msgChatId && msgId) {
        await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      }

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
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_CLASS_SET),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId, role } = ctx;
      const payload = String(data.slice(CALLBACK_PREFIX.PM_CLASS_SET.length));
      const [telegramId, classId] = payload.split(":");

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

      if (msgChatId && msgId) {
        await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      }

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
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_CLASS_BACK),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId, role } = ctx;
      const telegramId = String(data.slice(CALLBACK_PREFIX.PM_CLASS_BACK.length) || "").trim();

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

      if (msgChatId && msgId) {
        await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      }

      await sendPartnerDetailOutput(env, adminId, role, profile);
      return true;
    },
  });

  // =========================
  // UBAH VERIFICATOR
  // =========================
  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_VER_START),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;
      const telegramId = String(data.slice(CALLBACK_PREFIX.PM_VER_START.length) || "").trim();

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

      const verificators = await listActiveVerificators(env);
      if (!verificators.length) {
        await sendMessage(env, adminId, "⚠️ Tidak ada verificator aktif di tabel admins.", {
          reply_markup: buildPartnerDetailActionsKeyboard(profile.telegram_id, ctx.role),
        });
        return true;
      }

      if (msgChatId && msgId) {
        await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      }

      await sendMessage(
        env,
        adminId,
        `👤 <b>Ubah Verificator Partner</b>\n\n` +
          `Partner: <b>${escapeHtml(profile.nama_lengkap || "-")}</b>\n` +
          `Telegram ID: <code>${escapeHtml(profile.telegram_id || "-")}</code>\n\n` +
          `Pilih verificator baru di bawah:`,
        {
          parse_mode: "HTML",
          reply_markup: buildPartnerVerificatorPickerKeyboard(profile.telegram_id, verificators),
        }
      );
      return true;
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_VER_SET),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId, role } = ctx;
      const payload = String(data.slice(CALLBACK_PREFIX.PM_VER_SET.length));
      const [telegramId, verificatorId] = payload.split(":");

      if (!telegramId || !verificatorId) {
        await sendMessage(env, adminId, "⚠️ Target partner / verificator tidak valid.", {
          reply_markup: buildBackToPartnerDatabaseViewKeyboard(),
        });
        return true;
      }

      const adminRow = await getAdminByTelegramId(env, verificatorId);
      if (!adminRow) {
        await sendMessage(env, adminId, "⚠️ Verificator tidak ditemukan di tabel admins.");
        return true;
      }

      if (!(adminRow.normRole === "admin" || adminRow.normRole === "superadmin")) {
        await sendMessage(env, adminId, "⚠️ Role ini tidak bisa jadi verificator.");
        return true;
      }

      const res = await updatePartnerVerificator(env, telegramId, verificatorId);
      if (!res.ok) {
        const msg =
          res.reason === "not_found"
            ? "⚠️ Data partner tidak ditemukan."
            : "⚠️ Gagal mengubah verificator partner.";
        await sendMessage(env, adminId, msg, {
          reply_markup: buildBackToPartnerDatabaseViewKeyboard(),
        });
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId);
      if (!profile) {
        await sendMessage(env, adminId, `✅ Verificator partner berhasil diubah ke ${adminRow.label}.`, {
          reply_markup: buildBackToPartnerDatabaseViewKeyboard(),
        });
        return true;
      }

      if (msgChatId && msgId) {
        await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      }

      await sendMessage(
        env,
        adminId,
        `✅ Verificator partner berhasil diubah.\n\n` +
          `Partner: <b>${escapeHtml(profile.nama_lengkap || "-")}</b>\n` +
          `Telegram ID: <code>${escapeHtml(profile.telegram_id || "-")}</code>\n` +
          `Verificator baru: <b>${escapeHtml(adminRow.label || "-")}</b>`,
        { parse_mode: "HTML" }
      );

      await sendPartnerDetailOutput(env, adminId, role, profile);
      return true;
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_VER_BACK),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId, role } = ctx;
      const telegramId = String(data.slice(CALLBACK_PREFIX.PM_VER_BACK.length) || "").trim();

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

      if (msgChatId && msgId) {
        await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      }

      await sendPartnerDetailOutput(env, adminId, role, profile);
      return true;
    },
  });

  // =========================
  // UBAH FOTO CLOSEUP
  // =========================
  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_PHOTO_START),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId, role } = ctx;
      const telegramId = String(data.slice(CALLBACK_PREFIX.PM_PHOTO_START.length) || "").trim();

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

      await saveSession(env, `state:${adminId}`, {
        mode: SESSION_MODES.PARTNER_EDIT_CLOSEUP,
        targetTelegramId: profile.telegram_id,
      });

      if (msgChatId && msgId) {
        await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      }

      await sendMessage(
        env,
        adminId,
        `📸 <b>Ubah Foto CloseUp</b>\n\n` +
          `Partner: <b>${escapeHtml(profile.nama_lengkap || "-")}</b>\n` +
          `Telegram ID: <code>${escapeHtml(profile.telegram_id || "-")}</code>\n\n` +
          `Silakan kirim <b>foto closeup baru</b> sekarang.\n\n` +
          `Ketik <b>batal</b> untuk keluar.`,
        {
          parse_mode: "HTML",
          reply_markup: buildPartnerDetailActionsKeyboard(profile.telegram_id, role),
        }
      );
      return true;
    },
  });

  return { EXACT, PREFIX };
}
