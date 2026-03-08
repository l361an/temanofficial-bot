// routes/telegram.flow.selfProfile.js

import { sendMessage, sendPhoto, sendLongMessage } from "../services/telegramApi.js";
import { saveSession, clearSession } from "../utils/session.js";
import {
  getProfileFullByTelegramId,
  getProfileByTelegramId,
  updateEditableProfileFields,
  updateCloseupPhoto,
  setProfileCategoriesByProfileId,
  listCategoryKodesByProfileId,
} from "../repositories/profilesRepo.js";

import {
  loadCategoriesForChoice,
  buildCategoryChoiceMessage,
  parseMultiIndexInputRequired,
  mapIndexesToCategoryIds,
} from "../utils/categoryFlow.js";

import {
  fmtKV,
  cleanHandle,
  getPhotoFileId,
  sendHtml,
  buildTeManMenuKeyboard,
} from "./telegram.user.shared.js";

export function buildSelfMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👤 Lihat Profile", callback_data: "self:view" }],
      [{ text: "📝 Update Profile", callback_data: "self:update" }],
      [{ text: "💳 Payment", callback_data: "self:payment" }],
    ],
  };
}

function buildUpdateKeyboard() {
  return {
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
  };
}

const EDIT_TEXT_FIELDS = {
  nickname: { field: "nickname", prompt: "Ketik <b>nickname</b> baru:" },
  no_whatsapp: { field: "no_whatsapp", prompt: "Ketik <b>No. Whatsapp</b> baru:" },
  kecamatan: { field: "kecamatan", prompt: "Ketik <b>kecamatan</b> baru:" },
  kota: { field: "kota", prompt: "Ketik <b>kota</b> baru:" },
};

export function buildSelfMenuMessage(profile) {
  const nick = profile?.nickname
    ? String(profile.nickname)
    : profile?.nama_lengkap
      ? String(profile.nama_lengkap)
      : "Partner";

  const status = profile?.status ? String(profile.status) : "-";
  return `Halo ${nick} !\nStatus Partner kamu saat ini <b>${status}</b>, apa yang bisa aku bantu ?`;
}

async function sendSelfProfile(env, chatId, telegramId) {
  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile) {
    await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

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

async function askTextInput(env, chatId, STATE_KEY, field, prompt) {
  await saveSession(env, STATE_KEY, {
    mode: "edit_profile",
    step: "await_text",
    field,
  });

  await sendHtml(env, chatId, prompt, {
    reply_markup: buildTeManMenuKeyboard(),
  });
}

async function askCloseupPhoto(env, chatId, STATE_KEY) {
  await saveSession(env, STATE_KEY, {
    mode: "edit_profile",
    step: "await_closeup_photo",
  });

  await sendHtml(env, chatId, "Silakan kirim <b>foto CLOSEUP</b> terbaru (sebagai foto, bukan file).", {
    reply_markup: buildTeManMenuKeyboard(),
  });
}

async function askKategori(env, chatId, STATE_KEY) {
  const cats = await loadCategoriesForChoice(env);

  if (!cats.length) {
    await saveSession(env, STATE_KEY, {
      mode: "edit_profile",
      step: "await_kategori_select",
      data: { _category_list: [] },
    });

    await sendHtml(env, chatId, "⚠️ Belum ada kategori yang tersedia. Hubungi admin ya.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  await saveSession(env, STATE_KEY, {
    mode: "edit_profile",
    step: "await_kategori_select",
    data: { _category_list: cats },
  });

  await sendMessage(env, chatId, buildCategoryChoiceMessage(cats), {
    parse_mode: "Markdown",
    reply_markup: buildTeManMenuKeyboard(),
  });
}

async function stopEdit(env, chatId, STATE_KEY, msg) {
  await clearSession(env, STATE_KEY);
  await sendHtml(env, chatId, msg, {
    reply_markup: buildTeManMenuKeyboard(),
  });
}

async function sendSelfMenu(env, chatId, telegramId) {
  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile) {
    await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  await sendMessage(env, chatId, buildSelfMenuMessage(profile), {
    parse_mode: "HTML",
    reply_markup: buildSelfMenuKeyboard(),
    disable_web_page_preview: true,
  });
}

export async function handleSelfProfileInlineCallback(update, env) {
  const data = update?.callback_query?.data || "";
  const msg = update?.callback_query?.message;
  const chatId = msg?.chat?.id;
  const telegramId = String(update?.callback_query?.from?.id || "");
  const STATE_KEY = `state:${telegramId}`;

  if (!chatId || !telegramId) return true;

  if (data === "teman:menu") {
    const existing = await getProfileByTelegramId(env, telegramId).catch(() => null);

    if (existing?.telegram_id) {
      await sendSelfMenu(env, chatId, telegramId);
      return true;
    }

    await saveSession(env, STATE_KEY, { step: "input_nama", data: {} });
    await sendMessage(env, chatId, "Masukkan Nama Lengkap:");
    return true;
  }

  const ensureRegistered = async () => {
    const p = await getProfileFullByTelegramId(env, telegramId);
    if (!p) {
      await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return null;
    }
    return p;
  };

  if (data === "self:view") {
    await sendSelfProfile(env, chatId, telegramId);
    return true;
  }

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

    if (EDIT_TEXT_FIELDS[key]) {
      await askTextInput(env, chatId, STATE_KEY, EDIT_TEXT_FIELDS[key].field, EDIT_TEXT_FIELDS[key].prompt);
      return true;
    }

    if (key === "kategori") {
      await askKategori(env, chatId, STATE_KEY);
      return true;
    }

    if (key === "closeup") {
      await askCloseupPhoto(env, chatId, STATE_KEY);
      return true;
    }

    await sendHtml(env, chatId, "Pilihan tidak valid.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return true;
  }

  return false;
}

export async function handleUserProfileEditFlow({ env, chatId, telegramId, text, session, STATE_KEY, update }) {
  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile) {
    await stopEdit(env, chatId, STATE_KEY, "Data partner tidak ditemukan.");
    return;
  }

  const photoFileId = getPhotoFileId(update);

  if (session?.step === "await_text") {
    const field = session?.field;
    const value = String(text || "").trim();

    if (!value) {
      await sendHtml(env, chatId, "⚠️ Input kosong. Coba lagi ya.", {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return;
    }

    if (!["nickname", "no_whatsapp", "kecamatan", "kota"].includes(field)) {
      await stopEdit(env, chatId, STATE_KEY, "⚠️ Field tidak valid.");
      return;
    }

    await updateEditableProfileFields(env, telegramId, { [field]: value });

    await clearSession(env, STATE_KEY);
    await sendHtml(env, chatId, "✅ Data berhasil diupdate.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  if (session?.step === "await_kategori_select") {
    const categories = Array.isArray(session?.data?._category_list) ? session.data._category_list : [];

    if (!categories.length) {
      await stopEdit(env, chatId, STATE_KEY, "⚠️ Belum ada kategori yang tersedia. Hubungi admin ya.");
      return;
    }

    const parsed = parseMultiIndexInputRequired(text, categories.length);
    if (!parsed.ok) {
      await sendMessage(env, chatId, "Input tidak valid. Pilih minimal 1.\nKetik nomor dipisah koma.\nContoh: 1,3", {
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
    await sendHtml(env, chatId, "✅ Kategori berhasil diupdate.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  if (session?.step === "await_closeup_photo") {
    if (!photoFileId) {
      await sendHtml(env, chatId, "⚠️ Belum ada foto. Kirim foto closeup ya (bukan file).", {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return;
    }

    await updateCloseupPhoto(env, telegramId, photoFileId);

    await clearSession(env, STATE_KEY);
    await sendHtml(env, chatId, "✅ Foto closeup berhasil diupdate.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  await stopEdit(env, chatId, STATE_KEY, "⚠️ Sesi update berakhir. Klik Menu TeMan untuk lanjut.");
}
