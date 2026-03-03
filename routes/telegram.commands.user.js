// routes/telegram.commands.user.js

import { sendMessage, sendPhoto, sendLongMessage } from "../services/telegramApi.js";
import { getSetting } from "../repositories/settingsRepo.js";
import { saveSession, clearSession } from "../utils/session.js";
import { isAdminRole } from "../utils/roles.js";

import {
  getProfileFullByTelegramId,
  getProfileByTelegramId,
  updateEditableProfileFields,
  updateCloseupPhoto,
  setProfileCategoriesByProfileId,
  listCategoryKodesByProfileId,
} from "../repositories/profilesRepo.js";

// ✅ Shared category flow
import {
  loadCategoriesForChoice,
  buildCategoryChoiceMessage,
  parseMultiIndexInputRequired,
  mapIndexesToCategoryIds,
} from "../utils/categoryFlow.js";

// =====================
// Helpers
// =====================
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

// NOTE: update profile sekarang boleh untuk semua partner yang sudah terdaftar (status apapun)

const getPhotoFileId = (update) => {
  const msg = update?.message;
  return Array.isArray(msg?.photo) && msg.photo.length ? msg.photo[msg.photo.length - 1]?.file_id ?? null : null;
};

const sendHtml = (env, chatId, text, extra = {}) =>
  sendMessage(env, chatId, text, { parse_mode: "HTML", disable_web_page_preview: true, ...extra });

// =====================
// Keyboards
// =====================

// ✅ MENU UTAMA (selalu tampil)
export const buildTeManMenuKeyboard = () => ({
  inline_keyboard: [[{ text: "📋 Menu TeMan", callback_data: "teman:menu" }]],
});

// ✅ MENU SELF (kalau sudah terdaftar)
// (sesuai requirement: hanya 2 tombol)
export function buildSelfMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👤 Lihat Profile", callback_data: "self:view" }],
      [{ text: "📝 Update Profile", callback_data: "self:update" }],
    ],
  };
}

// UPDATE MENU
const buildUpdateKeyboard = () => ({
  inline_keyboard: [
    [{ text: "✏️ Ubah Nickname", callback_data: "self:edit:nickname" }],
    [{ text: "📞 Ubah No. Whatsapp", callback_data: "self:edit:no_whatsapp" }],
    [{ text: "📍 Ubah Kecamatan", callback_data: "self:edit:kecamatan" }],
    [{ text: "🏙️ Ubah Kota", callback_data: "self:edit:kota" }],
    [{ text: "🗂️ Ubah Kategori", callback_data: "self:edit:kategori" }],
    [{ text: "📸 Ubah Foto Closeup", callback_data: "self:edit:closeup" }],
    [{ text: "⬅️ Kembali", callback_data: "teman:menu" }],
    [{ text: "📋 Menu TeMan", callback_data: "teman:menu" }],
  ],
});

const EDIT_TEXT_FIELDS = {
  nickname: { field: "nickname", prompt: "Ketik <b>nickname</b> baru:" },
  no_whatsapp: { field: "no_whatsapp", prompt: "Ketik <b>No. Whatsapp</b> baru:" },
  kecamatan: { field: "kecamatan", prompt: "Ketik <b>kecamatan</b> baru:" },
  kota: { field: "kota", prompt: "Ketik <b>kota</b> baru:" },
};

// =====================
// Messages
// =====================
export function buildSelfMenuMessage(profile) {
  const nick = profile?.nickname
    ? String(profile.nickname)
    : profile?.nama_lengkap
    ? String(profile.nama_lengkap)
    : "Partner";
  const status = profile?.status ? String(profile.status) : "-";
  return `Halo ${escapeHtml(nick)} !\nStatus Partner kamu saat ini <b>${escapeHtml(status)}</b>, apa yang bisa aku bantu ?`;
}

// buang kalimat ajakan /mulai dari welcome setting (biar gak dobel)
function sanitizeWelcome(text) {
  const raw = String(text || "").trim();
  if (!raw) return raw;

  // hapus baris yang mengandung "/mulai" atau "* /mulai *"
  const lines = raw
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => !/\/mulai/i.test(l));

  // juga hapus kalimat "ketik mulai" yang implisit
  const joined = lines.join("\n").replace(/langsung aja ketik\s+\*?\/?mulai\*?.*$/gim, "").trim();

  return joined || raw;
}

const buildTeManWelcome = async (env) => {
  const fromSetting = await getSetting(env, "welcome_partner");
  const fallback = "👋 Selamat datang Partner Mandiri\n\nKlik <b>Menu TeMan</b> di bawah ya.";
  return sanitizeWelcome(fromSetting || fallback);
};

// =====================
// Profile view
// =====================
async function sendSelfProfile(env, chatId, telegramId) {
  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile)
    return void (await sendHtml(env, chatId, "Data partner tidak ditemukan.", { reply_markup: buildTeManMenuKeyboard() }));

  const categories = profile.id ? await listCategoryKodesByProfileId(env, profile.id) : [];
  const kategoriText = categories.length ? categories.join(", ") : "-";

  const textSummary =
    "🧾 <b>PROFILE</b>\n" +
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
    fmtKV("Status", profile.status);

  await sendLongMessage(env, chatId, textSummary, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: buildTeManMenuKeyboard(),
  });

  if (profile.foto_closeup_file_id) {
    await sendPhoto(env, chatId, profile.foto_closeup_file_id, "📸 <b>Foto Closeup</b>", {
      parse_mode: "HTML",
      reply_markup: buildTeManMenuKeyboard(),
    });
  }
}

// =====================
// Edit flow helpers (Menu TeMan selalu tersedia setelah selesai)
// =====================
async function askTextInput(env, chatId, STATE_KEY, field, prompt) {
  await saveSession(env, STATE_KEY, { mode: "edit_profile", step: "await_text", field });
  await sendHtml(env, chatId, prompt, { reply_markup: buildTeManMenuKeyboard() });
}

async function askCloseupPhoto(env, chatId, STATE_KEY) {
  await saveSession(env, STATE_KEY, { mode: "edit_profile", step: "await_closeup_photo" });
  await sendHtml(env, chatId, "Silakan kirim <b>foto CLOSEUP</b> terbaru (sebagai foto, bukan file).", {
    reply_markup: buildTeManMenuKeyboard(),
  });
}

async function askKategori(env, chatId, STATE_KEY) {
  const cats = await loadCategoriesForChoice(env);

  if (!cats.length) {
    await saveSession(env, STATE_KEY, { mode: "edit_profile", step: "await_kategori_select", data: { _category_list: [] } });
    await sendHtml(env, chatId, "⚠️ Belum ada kategori yang tersedia. Hubungi admin ya.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  // simpan list kategori ke session supaya parse konsisten
  await saveSession(env, STATE_KEY, {
    mode: "edit_profile",
    step: "await_kategori_select",
    data: { _category_list: cats },
  });

  // gunakan message yang sama dengan registrasi (angka)
  await sendMessage(env, chatId, buildCategoryChoiceMessage(cats), {
    parse_mode: "Markdown",
    reply_markup: buildTeManMenuKeyboard(),
  });
}

async function stopEdit(env, chatId, STATE_KEY, msg) {
  await clearSession(env, STATE_KEY);
  await sendHtml(env, chatId, msg, { reply_markup: buildTeManMenuKeyboard() });
}

async function sendSelfMenu(env, chatId, telegramId) {
  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile)
    return void (await sendHtml(env, chatId, "Data partner tidak ditemukan.", { reply_markup: buildTeManMenuKeyboard() }));

  await sendMessage(env, chatId, buildSelfMenuMessage(profile), {
    parse_mode: "HTML",
    reply_markup: buildSelfMenuKeyboard(),
    disable_web_page_preview: true,
  });
}

// =====================
// Commands
// =====================
export async function handleUserCommand({ env, chatId, telegramId, role, text }) {
  if (text === "/me") {
    await sendMessage(env, chatId, `🧾 DEBUG ROLE\n\ntelegramId: ${telegramId}\nrole: ${role ?? "-"}`, {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return true;
  }

  if (text === "/help") {
    await sendHtml(
      env,
      chatId,
      "ℹ️ <b>Help</b>\n\n• <code>/start</code> — Menu\n• <code>/cmd</code> — Menu",
      { reply_markup: buildTeManMenuKeyboard() }
    );
    return true;
  }

  // /start dan /cmd: hanya tampil 1 tombol Menu TeMan (tanpa cek DB)
  if (text === "/start" || text === "/cmd") {
    if (isAdminRole(role)) {
      await sendMessage(env, chatId, "Halo Officer, ketik /help untuk daftar command.");
      return true;
    }

    const welcome = await buildTeManWelcome(env);
    await sendMessage(env, chatId, welcome, {
      parse_mode: "HTML",
      reply_markup: buildTeManMenuKeyboard(),
      disable_web_page_preview: true,
    });
    return true;
  }

  // /mulai: deprecated (tetap jawab arahkan ke Menu TeMan)
  if (text === "/mulai") {
    if (isAdminRole(role)) {
      await sendMessage(env, chatId, "Halo Officer, ketik /help untuk daftar command.");
      return true;
    }
    await sendMessage(env, chatId, "Klik <b>Menu TeMan</b> untuk mulai ya.", {
      parse_mode: "HTML",
      reply_markup: buildTeManMenuKeyboard(),
    });
    return true;
  }

  return false;
}

// =====================
// Callback handler
// - teman:* (Menu TeMan)
// - self:*  (Lihat/Update)
// =====================
export async function handleSelfInlineCallback(update, env) {
  const data = update?.callback_query?.data || "";
  const msg = update?.callback_query?.message;
  const chatId = msg?.chat?.id;
  const telegramId = String(update?.callback_query?.from?.id || "");
  const STATE_KEY = `state:${telegramId}`;
  if (!chatId || !telegramId) return true;

  // -----------------
  // teman:* (MENU UTAMA)
  // -----------------
  if (data.startsWith("teman:")) {
    // teman:menu -> cek DB
    if (data === "teman:menu") {
      const existing = await getProfileByTelegramId(env, telegramId).catch(() => null);

      // sudah terdaftar (status apapun) kecuali rejected
      if (existing?.telegram_id && String(existing.status || "").toLowerCase() !== "rejected") {
        await sendSelfMenu(env, chatId, telegramId);
        return true;
      }

      // belum terdaftar / rejected -> mulai registrasi langsung
      await saveSession(env, STATE_KEY, { step: "input_nama", data: {} });
      await sendMessage(env, chatId, "Masukkan Nama Lengkap:");
      return true;
    }

    return true;
  }

  // -----------------
  // self:* (SELF MENU)
  // -----------------
  if (!data.startsWith("self:")) return false;

  const loadProfile = async () => getProfileFullByTelegramId(env, telegramId);

  const ensureRegistered = async () => {
    const p = await loadProfile();
    if (!p)
      return void (await sendHtml(env, chatId, "Data partner tidak ditemukan.", { reply_markup: buildTeManMenuKeyboard() })), null;
    return p;
  };

  if (data === "self:view") return (await sendSelfProfile(env, chatId, telegramId)), true;

  if (data === "self:update") {
    const p = await ensureRegistered();
    if (!p) return true;

    await sendMessage(env, chatId, "Pilih data yang mau kamu update:", {
      parse_mode: "HTML",
      reply_markup: buildUpdateKeyboard(),
      disable_web_page_preview: true,
    });
    return true;
  }

  if (data.startsWith("self:edit:")) {
    const key = data.split(":")[2] || "";
    const p = await ensureRegistered();
    if (!p) return true;

    if (EDIT_TEXT_FIELDS[key])
      return (
        await askTextInput(env, chatId, STATE_KEY, EDIT_TEXT_FIELDS[key].field, EDIT_TEXT_FIELDS[key].prompt),
        true
      );

    if (key === "kategori") return (await askKategori(env, chatId, STATE_KEY)), true;
    if (key === "closeup") return (await askCloseupPhoto(env, chatId, STATE_KEY)), true;

    await sendHtml(env, chatId, "Pilihan tidak valid.", { reply_markup: buildTeManMenuKeyboard() });
    return true;
  }

  return true;
}

// =====================
// Text/Photo flow untuk update profile
// =====================
export async function handleUserEditFlow({ env, chatId, telegramId, text, session, STATE_KEY, update }) {
  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile) return void (await stopEdit(env, chatId, STATE_KEY, "Data partner tidak ditemukan."));
  // semua status boleh update (yang penting profile ada)
  // (menu self tetap dikontrol di teman:menu, sehingga user yang rejected tidak masuk ke update)

  const photoFileId = getPhotoFileId(update);

  if (session?.step === "await_text") {
    const field = session?.field;
    const value = String(text || "").trim();

    if (!value)
      return void (await sendHtml(env, chatId, "⚠️ Input kosong. Coba lagi ya.", { reply_markup: buildTeManMenuKeyboard() }));
    if (!["nickname", "no_whatsapp", "kecamatan", "kota"].includes(field))
      return void (await stopEdit(env, chatId, STATE_KEY, "⚠️ Field tidak valid."));

    await updateEditableProfileFields(env, telegramId, { [field]: value });

    await clearSession(env, STATE_KEY);
    await sendHtml(env, chatId, "✅ Data berhasil diupdate.", { reply_markup: buildTeManMenuKeyboard() });

    return;
  }

  // ✅ Update kategori: pakai flow yang sama dengan registrasi (angka) dan wajib pilih 1
  if (session?.step === "await_kategori_select") {
    const categories = Array.isArray(session?.data?._category_list) ? session.data._category_list : [];

    if (!categories.length) {
      await stopEdit(env, chatId, STATE_KEY, "⚠️ Belum ada kategori yang tersedia. Hubungi admin ya.");
      return;
    }

    const parsed = parseMultiIndexInputRequired(text, categories.length);
    if (!parsed.ok) {
      await sendMessage(env, chatId, `Input tidak valid. Pilih minimal 1.\nKetik nomor dipisah koma.\nContoh: 1,3`, {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return;
    }

    const categoryIds = mapIndexesToCategoryIds(parsed.indexes, categories);
    if (!categoryIds.length) {
      await sendMessage(env, chatId, "Pilihan kategori tidak valid. Coba lagi ya.", {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return;
    }

    const res = await setProfileCategoriesByProfileId(env, profile.id, categoryIds);
    if (!res?.ok) {
      await sendHtml(env, chatId, "⚠️ Gagal update kategori. Coba lagi ya.", {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return;
    }

    await clearSession(env, STATE_KEY);
    await sendHtml(env, chatId, "✅ Kategori berhasil diupdate.", { reply_markup: buildTeManMenuKeyboard() });
    return;
  }

  if (session?.step === "await_closeup_photo") {
    if (!photoFileId)
      return void (
        await sendHtml(env, chatId, "⚠️ Belum ada foto. Kirim foto closeup ya (bukan file).", { reply_markup: buildTeManMenuKeyboard() })
      );

    await updateCloseupPhoto(env, telegramId, photoFileId);

    await clearSession(env, STATE_KEY);
    await sendHtml(env, chatId, "✅ Foto closeup berhasil diupdate.", { reply_markup: buildTeManMenuKeyboard() });
    return;
  }

  await stopEdit(env, chatId, STATE_KEY, "⚠️ Sesi update berakhir. Klik Menu TeMan untuk lanjut.");
}
