// routes/telegram.js

import { json } from "../utils/response.js";
import { parseMessage } from "../utils/parseTelegram.js";
import { loadSession, clearSession } from "../utils/session.js";
import { sendMessage, sendPhoto, sendLongMessage } from "../services/telegramApi.js";

import { getAdminRole, getAdminByTelegramId } from "../repositories/adminsRepo.js";
import { isAdminRole, isSuperadminRole } from "../utils/roles.js";

import { handleCallback } from "./telegram.callback.js";
import { handleAdminCommand } from "./telegram.commands.admin.js";
import {
  handleUserCommand,
  buildSelfMenuMessage,
  buildSelfMenuKeyboard,
  buildTeManMenuKeyboard,
  handleUserEditFlow,
} from "./telegram.commands.user.js";
import { handleRegistrationFlow } from "./telegram.flow.js";

import {
  getProfileFullByTelegramId,
  syncProfileUsernameFromTelegram,
  setProfileStatus,
  deleteProfileByTelegramId,
  listCategoryKodesByProfileId,
} from "../repositories/profilesRepo.js";
import { getSetting } from "../repositories/settingsRepo.js";

// HELP pakai HTML biar gak kena error Markdown entities
function buildHelp(role) {
  if (isSuperadminRole(role)) {
    return (
      "📌 <b>Daftar Command (Officer Panel)</b>\n\n" +
      "<b>Admin + Superadmin:</b>\n" +
      "• <code>/start</code> — Buka <b>Officer Home</b> (inline menu)\n" +
      "• <code>/approve @username|telegram_id</code> — Setujui partner (approved)\n" +
      "• <code>/ceksub @username|telegram_id</code> — Cek subscription partner\n\n" +
      "<b>Superadmin only:</b>\n" +
      "• <code>/setlink aturan &lt;url&gt;</code> — Set link (aturan, dll)\n" +
      "• <code>/setwelcome &lt;text&gt;</code> — Ubah welcome text user\n" +
      "• <code>/listcategory</code> — List kategori\n" +
      "• <code>/addcategory &lt;kode&gt;</code> — Tambah kategori\n" +
      "• <code>/delcategory &lt;kode&gt;</code> — Hapus kategori\n\n" +
      "ℹ️ <b>Catatan:</b>\n" +
      "Fitur <b>Partner Database</b> & <b>Partner Moderation</b> sekarang <b>inline-only</b>.\n" +
      "Gunakan <code>/start</code> lalu pilih menu."
    );
  }

  if (isAdminRole(role)) {
    return (
      "📌 <b>Daftar Command (Officer Panel)</b>\n\n" +
      "<b>Admin + Superadmin:</b>\n" +
      "• <code>/start</code> — Buka <b>Officer Home</b> (inline menu)\n" +
      "• <code>/approve @username|telegram_id</code> — Setujui partner (approved)\n" +
      "• <code>/ceksub @username|telegram_id</code> — Cek subscription partner\n\n" +
      "ℹ️ <b>Catatan:</b>\n" +
      "Fitur <b>Partner Database</b> & <b>Partner Moderation</b> sekarang <b>inline-only</b>.\n" +
      "Gunakan <code>/start</code> lalu pilih menu."
    );
  }

  return (
    "ℹ️ <b>Bantuan</b>\n\n" +
    "• <code>/start</code> — Tampilkan Menu TeMan\n" +
    "• <code>/me</code> — Cek role (debug)"
  );
}

// =========================
// Helpers (Partner Moderation + View Partner)
// =========================
const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const fmtKV = (label, value) => {
  const v = value === null || value === undefined || value === "" ? "-" : String(value);
  return `• <b>${escapeHtml(label)}:</b> ${escapeHtml(v)}`;
};

const cleanHandle = (username) => {
  const u = String(username || "").trim().replace(/^@/, "");
  return u ? `@${u}` : "-";
};

async function findTelegramIdByUsername(env, username) {
  const clean = String(username || "").trim().replace(/^@/, "");
  if (!clean) return null;
  const row = await env.DB.prepare(`SELECT telegram_id FROM profiles WHERE username = ? LIMIT 1`)
    .bind(clean)
    .first();
  return row?.telegram_id ?? null;
}

async function resolveTelegramId(env, rawTarget) {
  const target = String(rawTarget || "").trim();
  if (!target) return null;
  if (target.startsWith("@")) return (await findTelegramIdByUsername(env, target)) || null;
  if (/^\d+$/.test(target)) return target;
  return null;
}

function buildBackToPartnerModerationKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🛠️ Kembali ke Partner Moderation", callback_data: "mod:menu" }],
      [{ text: "⬅️ Officer Home", callback_data: "officer:home" }],
    ],
  };
}

function buildBackToPartnerDatabaseViewKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "⬅️ Kembali ke Partner Database", callback_data: "pm:menu" }],
      [{ text: "🏠 Officer Home", callback_data: "officer:home" }],
    ],
  };
}

// =========================
// Partner Moderation: text input handler (inline-only)
// =========================
async function handlePartnerModerationInput({ env, chatId, text, session, STATE_KEY }) {
  const action = String(session?.action || "").toLowerCase();
  const raw = String(text || "").trim();

  if (/^(batal|cancel|keluar)$/i.test(raw)) {
    await clearSession(env, STATE_KEY);
    await sendMessage(env, chatId, "✅ Oke, sesi Partner Moderation dibatalkan.", {
      reply_markup: buildBackToPartnerModerationKeyboard(),
    });
    return true;
  }

  const targetId = await resolveTelegramId(env, raw);
  if (!targetId) {
    await sendMessage(
      env,
      chatId,
      "⚠️ Target tidak valid / tidak ditemukan.\nKirim <b>@username</b> atau <b>telegram_id</b> ya.\n\nKetik <b>batal</b> untuk keluar.",
      { parse_mode: "HTML", reply_markup: buildBackToPartnerModerationKeyboard() }
    );
    return true;
  }

  const label = raw.startsWith("@") ? raw : targetId;

  if (!["activate", "suspend", "delete"].includes(action)) {
    await clearSession(env, STATE_KEY);
    await sendMessage(env, chatId, "⚠️ Aksi moderation tidak valid. Balik ke menu ya.", {
      reply_markup: buildBackToPartnerModerationKeyboard(),
    });
    return true;
  }

  if (action === "delete") {
    await deleteProfileByTelegramId(env, targetId);
    await clearSession(env, STATE_KEY);
    await sendMessage(env, chatId, `❌ Partner ${label} berhasil dihapus.`, {
      reply_markup: buildBackToPartnerModerationKeyboard(),
    });
    return true;
  }

  if (action === "suspend") {
    await setProfileStatus(env, targetId, "suspended");
    await clearSession(env, STATE_KEY);

    await sendMessage(
      env,
      targetId,
      "⛔ Akun kamu saat ini *SUSPENDED*.\nKamu tidak akan tampil di grup.\nSilakan hubungi admin.",
      { parse_mode: "Markdown", reply_markup: buildTeManMenuKeyboard() }
    ).catch(() => {});

    await sendMessage(env, chatId, `✅ Partner ${label} berhasil di-suspend (suspended).`, {
      reply_markup: buildBackToPartnerModerationKeyboard(),
    });
    return true;
  }

  if (action === "activate") {
    await setProfileStatus(env, targetId, "active");
    await clearSession(env, STATE_KEY);

    const link = (await getSetting(env, "link_aturan")) ?? "-";
    await sendMessage(
      env,
      targetId,
      `✅ Status akun kamu sekarang *AKTIF* (ACTIVE).\n\nSilakan baca aturan dulu:\n${link}`,
      { parse_mode: "Markdown", disable_web_page_preview: true, reply_markup: buildTeManMenuKeyboard() }
    ).catch(() => {});

    await sendMessage(env, chatId, `✅ Partner ${label} berhasil di-activate (active).`, {
      reply_markup: buildBackToPartnerModerationKeyboard(),
    });
    return true;
  }

  return false;
}

// =========================
// Partner Database: view partner (inline-only)
// =========================
async function handlePartnerViewInput({ env, chatId, text, STATE_KEY }) {
  const raw = String(text || "").trim();

  if (/^(batal|cancel|keluar)$/i.test(raw)) {
    await clearSession(env, STATE_KEY);
    await sendMessage(env, chatId, "✅ Oke, sesi View Partner dibatalkan.", {
      reply_markup: buildBackToPartnerDatabaseViewKeyboard(),
    });
    return true;
  }

  const targetId = await resolveTelegramId(env, raw);
  if (!targetId) {
    await sendMessage(
      env,
      chatId,
      "⚠️ Target tidak valid / tidak ditemukan.\nKirim <b>@username</b> atau <b>telegram_id</b> ya.\n\nKetik <b>batal</b> untuk keluar.",
      { parse_mode: "HTML", reply_markup: buildBackToPartnerDatabaseViewKeyboard() }
    );
    return true;
  }

  const profile = await getProfileFullByTelegramId(env, targetId);
  if (!profile) {
    await sendMessage(env, chatId, "Data partner tidak ditemukan.", {
      parse_mode: "HTML",
      reply_markup: buildBackToPartnerDatabaseViewKeyboard(),
    });
    return true;
  }

  const categories = profile.id ? await listCategoryKodesByProfileId(env, profile.id) : [];
  const kategoriText = categories.length ? categories.join(", ") : "-";

  // ✅ Verificator: id - @username
  let verificatorDisplay = "-";
  if (profile.verificator_admin_id) {
    const vid = String(profile.verificator_admin_id);
    const vRow = await getAdminByTelegramId(env, vid).catch(() => null);
    const vUser = vRow?.username ? cleanHandle(vRow.username) : (vRow?.label ? String(vRow.label) : "-");
    verificatorDisplay = `${vid} - ${vUser || "-"}`;
  }

  const textSummary =
    "🧾 <b>PARTNER</b>\n" +
    fmtKV("Telegram ID", profile.telegram_id) +
    "\n" +
    fmtKV("Username", cleanHandle(profile.username)) +
    "\n" +
    fmtKV("Nama Lengkap", profile.nama_lengkap) +
    "\n" +
    fmtKV("Nickname", profile.nickname) +
    "\n" +
    fmtKV("NIK", profile.nik) +
    "\n" +
    fmtKV("Kategori", kategoriText) +
    "\n" +
    fmtKV("No. Whatsapp", profile.no_whatsapp) +
    "\n" +
    fmtKV("Kecamatan", profile.kecamatan) +
    "\n" +
    fmtKV("Kota", profile.kota) +
    "\n" +
    fmtKV("Verificator", verificatorDisplay);

  await sendLongMessage(env, chatId, textSummary, { parse_mode: "HTML", disable_web_page_preview: true });

  for (const [fileId, cap] of [
    [profile.foto_closeup_file_id, "📸 <b>Foto Closeup</b>"],
    [profile.foto_fullbody_file_id, "📸 <b>Foto Fullbody</b>"],
    [profile.foto_ktp_file_id, "🪪 <b>Foto KTP</b>"],
  ]) {
    if (fileId) await sendPhoto(env, chatId, fileId, cap, { parse_mode: "HTML" });
  }

  await clearSession(env, STATE_KEY);
  await sendMessage(env, chatId, "✅ Selesai.", { reply_markup: buildBackToPartnerDatabaseViewKeyboard() });
  return true;
}

export async function handleTelegramWebhook(request, env) {
  try {
    const update = await request.json();

    if (update.callback_query) {
      return handleCallback(update, env);
    }

    if (!update.message) return json({ ok: true });

    const { chatId, telegramId, username, text } = parseMessage(update.message);
    const STATE_KEY = `state:${telegramId}`;

    const role = await getAdminRole(env, telegramId);

    await syncProfileUsernameFromTelegram(env, telegramId, username).catch(() => {});

    // COMMANDS
    if (text && text.startsWith("/")) {
      const raw = String(text || "").trim();
      const baseCmd = raw.split(/\s+/)[0].split("@")[0];

      if (baseCmd === "/help" || baseCmd === "/cmd") {
        await sendMessage(env, chatId, buildHelp(role), { parse_mode: "HTML" });
        return json({ ok: true });
      }

      if (isAdminRole(role)) {
        const handled = await handleAdminCommand({ env, chatId, text: raw, telegramId, role });
        if (handled) return json({ ok: true });
      }

      const handledUser = await handleUserCommand({ env, chatId, telegramId, role, text: raw, STATE_KEY });
      if (handledUser) return json({ ok: true });

      await sendMessage(env, chatId, "Command tidak dikenali. Ketik /help ya.", {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return json({ ok: true });
    }

    // TEXT FLOW
    const session = await loadSession(env, STATE_KEY);

    if (isAdminRole(role)) {
      if (session?.mode === "partner_moderation") {
        await handlePartnerModerationInput({ env, chatId, text, session, STATE_KEY });
        return json({ ok: true });
      }

      if (session?.mode === "partner_view") {
        await handlePartnerViewInput({ env, chatId, text, STATE_KEY });
        return json({ ok: true });
      }

      if (!session) {
        await sendMessage(env, chatId, "Halo Officer TeMan. Ketik /start untuk menu, atau /help untuk daftar command.");
        return json({ ok: true });
      }
    }

    if (!session && !isAdminRole(role)) {
      const profile = await getProfileFullByTelegramId(env, telegramId);
      if (profile) {
        await sendMessage(env, chatId, buildSelfMenuMessage(profile), {
          parse_mode: "HTML",
          reply_markup: buildSelfMenuKeyboard(),
        });
        return json({ ok: true });
      }

      await sendMessage(env, chatId, "Klik <b>Menu TeMan</b> untuk mulai ya.", {
        parse_mode: "HTML",
        reply_markup: buildTeManMenuKeyboard(),
      });
      return json({ ok: true });
    }

    if (session?.mode === "edit_profile") {
      await handleUserEditFlow({ env, chatId, telegramId, username, text, session, STATE_KEY, update });
      return json({ ok: true });
    }

    await handleRegistrationFlow({ update, env, chatId, telegramId, username, text, session, STATE_KEY });
    return json({ ok: true });
  } catch (err) {
    console.error("ERROR TELEGRAM WEBHOOK:", err);
    return json({ ok: true });
  }
}
