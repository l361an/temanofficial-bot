// routes/callbacks/partnerClass.js

import { sendMessage, sendPhoto, sendLongMessage, editMessageReplyMarkup } from "../../services/telegramApi.js";
import { saveSession, loadSession } from "../../utils/session.js";
import { getAdminByTelegramId } from "../../repositories/adminsRepo.js";
import {
  getProfileFullByTelegramId,
  listCategoryKodesByProfileId,
  setProfileCategoriesByProfileId,
  updateProfileClassByTelegramId,
} from "../../repositories/profilesRepo.js";
import {
  buildBackToPartnerDatabaseKeyboard,
  buildPartnerClassPickerKeyboard,
  buildPartnerDetailsKeyboard,
  buildPartnerVerificatorPickerKeyboard,
} from "./keyboards.partner.js";
import { escapeHtml, fmtClassId, fmtHandle } from "./shared.js";
import { CALLBACKS, CALLBACK_PREFIX, SESSION_MODES, cb } from "../telegram.constants.js";

const PM_CATEGORY_TOGGLE_PREFIX = "pm_cat_toggle:";
const PM_CATEGORY_SAVE_PREFIX = "pm_cat_save:";
const PM_CATEGORY_BACK_PREFIX = "pm_cat_back:";

const fmtKV = (label, value) => {
  const v = value === null || value === undefined || value === "" ? "-" : String(value);
  return `• <b>${escapeHtml(label)}:</b> ${escapeHtml(v)}`;
};

function buildBackToPanelAndHomeKeyboard(telegramId) {
  return {
    inline_keyboard: [[
      { text: "⬅️ Back to Panel", callback_data: cb.pmPanelBack(telegramId) },
      { text: "🏠 Officer Home", callback_data: CALLBACKS.OFFICER_HOME },
    ]],
  };
}

function getPartnerEditFieldMeta(field) {
  const key = String(field || "").trim();

  if (key === "nama_lengkap") {
    return {
      key,
      label: "Nama Lengkap",
      currentKey: "nama_lengkap",
      prompt: "Ketik Nama Baru",
    };
  }
  if (key === "nickname") {
    return {
      key,
      label: "Nickname",
      currentKey: "nickname",
      prompt: "Ketik Nickname Baru",
    };
  }
  if (key === "no_whatsapp") {
    return {
      key,
      label: "No. Whatsapp",
      currentKey: "no_whatsapp",
      prompt: "Ketik No. Whatsapp Baru",
    };
  }
  if (key === "nik") {
    return {
      key,
      label: "NIK",
      currentKey: "nik",
      prompt: "Ketik NIK Baru",
    };
  }
  if (key === "kecamatan") {
    return {
      key,
      label: "Kecamatan",
      currentKey: "kecamatan",
      prompt: "Ketik Kecamatan Baru",
    };
  }
  if (key === "kota") {
    return {
      key,
      label: "Kota",
      currentKey: "kota",
      prompt: "Ketik Kota Baru",
    };
  }
  if (key === "channel_url") {
    return {
      key,
      label: "Channel Partner",
      currentKey: "channel_url",
      prompt: "Ketik Link Channel Partner Baru",
    };
  }

  return null;
}

function buildRoleBadge(role) {
  const r = String(role || "").trim().toLowerCase();
  if (r === "owner") return "👑";
  if (r === "superadmin") return "🛡️";
  return "👤";
}

async function loadEligibleVerificators(env) {
  const rows = await env.DB.prepare(
    `
    SELECT telegram_id, username, nama, role, status
    FROM admins
    WHERE lower(status) = 'active'
      AND lower(role) IN ('owner', 'superadmin', 'admin')
    ORDER BY
      CASE lower(role)
        WHEN 'owner' THEN 0
        WHEN 'superadmin' THEN 1
        ELSE 2
      END,
      COALESCE(NULLIF(trim(nama), ''), NULLIF(trim(username), ''), telegram_id) ASC
  `
  ).all();

  return (rows?.results || []).map((row) => {
    const tid = String(row.telegram_id || "").trim();
    const uname = row.username ? `@${String(row.username).replace(/^@/, "")}` : "-";
    const nama = String(row.nama || "").trim();
    const role = String(row.role || "").trim().toLowerCase();

    const baseLabel = nama || uname || tid;
    return {
      telegram_id: tid,
      label: `${buildRoleBadge(role)} ${baseLabel} (${role || "admin"})`,
      role,
      username: uname,
      nama,
    };
  });
}

async function loadCategoryOptions(env) {
  const rows = await env.DB.prepare(
    `
    SELECT id, kode, nama
    FROM categories
    ORDER BY kode ASC, nama ASC
  `
  ).all();

  return (rows?.results || []).map((row) => ({
    id: String(row.id),
    kode: String(row.kode || "").trim(),
    nama: String(row.nama || "").trim(),
  }));
}

function encodeSelectedCategoryIds(ids = []) {
  return Array.from(new Set((ids || []).map((v) => String(v).trim()).filter(Boolean))).sort();
}

function buildCategoryPickerKeyboard(telegramId, categories = [], selectedIds = []) {
  const selectedSet = new Set(encodeSelectedCategoryIds(selectedIds));
  const rows = [];
  const max = Math.min(categories.length, 30);

  for (let i = 0; i < max; i += 2) {
    const a = categories[i];
    const b = categories[i + 1];
    const row = [];

    const aSelected = selectedSet.has(a.id);
    row.push({
      text: `${aSelected ? "✅" : "☑️"} ${a.kode || a.nama || a.id}`,
      callback_data: `${PM_CATEGORY_TOGGLE_PREFIX}${telegramId}:${a.id}`,
    });

    if (b) {
      const bSelected = selectedSet.has(b.id);
      row.push({
        text: `${bSelected ? "✅" : "☑️"} ${b.kode || b.nama || b.id}`,
        callback_data: `${PM_CATEGORY_TOGGLE_PREFIX}${telegramId}:${b.id}`,
      });
    }

    rows.push(row);
  }

  rows.push([
    { text: "💾 Simpan Category", callback_data: `${PM_CATEGORY_SAVE_PREFIX}${telegramId}` },
  ]);

  rows.push([
    { text: "⬅️ Back to Panel", callback_data: `${PM_CATEGORY_BACK_PREFIX}${telegramId}` },
    { text: "🏠 Officer Home", callback_data: CALLBACKS.OFFICER_HOME },
  ]);

  return { inline_keyboard: rows };
}

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
    fmtKV("Channel Partner", profile?.channel_url) +
    "\n" +
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

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_CLASS_START),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;
      const telegramId = String(data.slice(CALLBACK_PREFIX.PM_CLASS_START.length) || "").trim();

      if (!telegramId) {
        await sendMessage(env, adminId, "⚠️ Target partner tidak valid.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId);
      if (!profile) {
        await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
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
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
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
              : buildBackToPartnerDatabaseKeyboard(),
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
            reply_markup: buildBackToPartnerDatabaseKeyboard(),
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
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId);
      if (!profile) {
        await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
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

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_VER_START),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;
      const telegramId = String(data.slice(CALLBACK_PREFIX.PM_VER_START.length) || "").trim();

      if (!telegramId) {
        await sendMessage(env, adminId, "⚠️ Target partner tidak valid.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId);
      if (!profile) {
        await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const verificators = await loadEligibleVerificators(env);
      if (!verificators.length) {
        await sendMessage(env, adminId, "⚠️ Tidak ada owner / admin / superadmin aktif di tabel admins.", {
          reply_markup: buildPartnerDetailsKeyboard(profile.telegram_id, ctx.role),
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
          `Pilih owner / admin / superadmin di bawah:`,
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
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const adminRow = await getAdminByTelegramId(env, verificatorId);
      if (!adminRow) {
        await sendMessage(env, adminId, "⚠️ Verificator tidak ditemukan di tabel admins.");
        return true;
      }

      if (!["owner", "admin", "superadmin"].includes(String(adminRow.normRole || "").toLowerCase())) {
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
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId);
      if (!profile) {
        await sendMessage(env, adminId, `✅ Verificator partner berhasil diubah ke ${adminRow.label}.`, {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
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
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId);
      if (!profile) {
        await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
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

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_PHOTO_START),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId, role } = ctx;
      const telegramId = String(data.slice(CALLBACK_PREFIX.PM_PHOTO_START.length) || "").trim();

      if (!telegramId) {
        await sendMessage(env, adminId, "⚠️ Target partner tidak valid.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId);
      if (!profile) {
        await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
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
          reply_markup: buildBackToPanelAndHomeKeyboard(profile.telegram_id),
        }
      );
      return true;
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_EDIT_START),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;
      const payload = String(data.slice(CALLBACK_PREFIX.PM_EDIT_START.length) || "");
      const [telegramId, field] = payload.split(":");

      if (!telegramId || !field) {
        await sendMessage(env, adminId, "⚠️ Target partner / field tidak valid.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId);
      if (!profile) {
        await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      if (field === "category") {
        const categories = await loadCategoryOptions(env);
        if (!categories.length) {
          await sendMessage(env, adminId, "⚠️ Belum ada category yang tersedia.", {
            reply_markup: buildBackToPanelAndHomeKeyboard(profile.telegram_id),
          });
          return true;
        }

        const selectedIds = profile?.id
          ? await env.DB.prepare(
              `
              SELECT category_id
              FROM profile_categories
              WHERE profile_id = ?
              ORDER BY category_id ASC
            `
            )
              .bind(String(profile.id))
              .all()
              .then((res) => (res?.results || []).map((r) => String(r.category_id)))
              .catch(() => [])
          : [];

        await saveSession(env, `state:${adminId}`, {
          mode: "partner_edit_category",
          targetTelegramId: profile.telegram_id,
          categoryIds: encodeSelectedCategoryIds(selectedIds),
        });

        if (msgChatId && msgId) {
          await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
        }

        await sendMessage(
          env,
          adminId,
          `🗂️ <b>Edit Category</b>\n\n` +
            `Partner: <b>${escapeHtml(profile.nama_lengkap || "-")}</b>\n` +
            `Telegram ID: <code>${escapeHtml(profile.telegram_id || "-")}</code>\n\n` +
            `Pilih category yang ingin aktif, lalu klik <b>Simpan Category</b>.`,
          {
            parse_mode: "HTML",
            reply_markup: buildCategoryPickerKeyboard(profile.telegram_id, categories, selectedIds),
          }
        );
        return true;
      }

      const meta = getPartnerEditFieldMeta(field);
      if (!meta) {
        await sendMessage(env, adminId, "⚠️ Field partner tidak didukung.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      await saveSession(env, `state:${adminId}`, {
        mode: SESSION_MODES.PARTNER_EDIT_TEXT,
        targetTelegramId: profile.telegram_id,
        field: meta.key,
      });

      if (msgChatId && msgId) {
        await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      }

      const currentValue = profile?.[meta.currentKey] ?? "-";

      await sendMessage(
        env,
        adminId,
        `📝 <b>Edit ${escapeHtml(meta.label)}</b>\n\n` +
          `Partner: <b>${escapeHtml(profile.nama_lengkap || "-")}</b>\n` +
          `Telegram ID: <code>${escapeHtml(profile.telegram_id || "-")}</code>\n` +
          `Current: <b>${escapeHtml(currentValue || "-")}</b>\n\n` +
          `${escapeHtml(meta.prompt)}.\n` +
          `Ketik <b>-</b> untuk kosongkan field.\n\n` +
          `Ketik <b>batal</b> untuk keluar.`,
        {
          parse_mode: "HTML",
          reply_markup: buildBackToPanelAndHomeKeyboard(profile.telegram_id),
        }
      );
      return true;
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith(PM_CATEGORY_TOGGLE_PREFIX),
    run: async (ctx) => {
      const { env, data, adminId } = ctx;
      const payload = String(data.slice(PM_CATEGORY_TOGGLE_PREFIX.length) || "");
      const [telegramId, categoryId] = payload.split(":");

      if (!telegramId || !categoryId) {
        await sendMessage(env, adminId, "⚠️ Category target tidak valid.");
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId);
      if (!profile) {
        await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const session = await loadSession(env, `state:${adminId}`).catch(() => null);
      const currentIds = encodeSelectedCategoryIds(session?.categoryIds || []);
      const nextSet = new Set(currentIds);

      if (nextSet.has(String(categoryId))) {
        nextSet.delete(String(categoryId));
      } else {
        nextSet.add(String(categoryId));
      }

      const nextIds = Array.from(nextSet).sort();
      await saveSession(env, `state:${adminId}`, {
        mode: "partner_edit_category",
        targetTelegramId: profile.telegram_id,
        categoryIds: nextIds,
      });

      const categories = await loadCategoryOptions(env);

      await sendMessage(
        env,
        adminId,
        `🗂️ <b>Edit Category</b>\n\n` +
          `Partner: <b>${escapeHtml(profile.nama_lengkap || "-")}</b>\n` +
          `Telegram ID: <code>${escapeHtml(profile.telegram_id || "-")}</code>\n\n` +
          `Pilih category yang ingin aktif, lalu klik <b>Simpan Category</b>.`,
        {
          parse_mode: "HTML",
          reply_markup: buildCategoryPickerKeyboard(profile.telegram_id, categories, nextIds),
        }
      );

      return true;
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith(PM_CATEGORY_SAVE_PREFIX),
    run: async (ctx) => {
      const { env, data, adminId, role } = ctx;
      const telegramId = String(data.slice(PM_CATEGORY_SAVE_PREFIX.length) || "").trim();

      if (!telegramId) {
        await sendMessage(env, adminId, "⚠️ Target partner tidak valid.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId);
      if (!profile?.id) {
        await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const session = await loadSession(env, `state:${adminId}`).catch(() => null);
      const selectedIds = encodeSelectedCategoryIds(session?.categoryIds || []);

      await setProfileCategoriesByProfileId(env, profile.id, selectedIds);
      await saveSession(env, `state:${adminId}`, {
        mode: null,
      }).catch(() => {});

      const refreshed = await getProfileFullByTelegramId(env, telegramId);
      await sendMessage(env, adminId, "✅ Category partner berhasil diupdate.");
      await sendPartnerDetailOutput(env, adminId, role, refreshed || profile);
      return true;
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith(PM_CATEGORY_BACK_PREFIX),
    run: async (ctx) => {
      const { env, data, adminId, role } = ctx;
      const telegramId = String(data.slice(PM_CATEGORY_BACK_PREFIX.length) || "").trim();

      if (!telegramId) {
        await sendMessage(env, adminId, "⚠️ Target partner tidak valid.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId);
      if (!profile) {
        await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      await sendPartnerDetailOutput(env, adminId, role, profile);
      return true;
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_EDIT_BACK),
    run: async (ctx) => {
      const { env, data, adminId, role } = ctx;
      const telegramId = String(data.slice(CALLBACK_PREFIX.PM_EDIT_BACK.length) || "").trim();

      if (!telegramId) {
        await sendMessage(env, adminId, "⚠️ Target partner tidak valid.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId);
      if (!profile) {
        await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      await sendPartnerDetailOutput(env, adminId, role, profile);
      return true;
    },
  });

  return { EXACT, PREFIX };
}
