// routes/telegram.flow.selfProfile.edit.js

import { sendMessage } from "../services/telegramApi.js";
import { saveSession, clearSession } from "../utils/session.js";
import {
  getProfileFullByTelegramId,
  updateEditableProfileFields,
  updateCloseupPhoto,
  setProfileCategoriesByProfileId,
} from "../repositories/profilesRepo.js";

import {
  loadCategoriesForChoice,
  buildCategoryChoiceMessage,
  parseMultiIndexInputRequired,
  mapIndexesToCategoryIds,
} from "../utils/categoryFlow.js";

import {
  getPhotoFileId,
  sendHtml,
  buildTeManMenuKeyboard,
} from "./telegram.user.shared.js";

export function buildUpdateKeyboard() {
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

export async function handleSelfProfileEditCallback({ env, chatId, telegramId, STATE_KEY, data }) {
  const profile = await getProfileFullByTelegramId(env, telegramId);

  if (!profile) {
    await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return true;
  }

  if (data === "self:update") {
    await sendMessage(env, chatId, "Pilih data yang mau kamu update:", {
      parse_mode: "HTML",
      reply_markup: buildUpdateKeyboard(),
      disable_web_page_preview: true,
    });
    return true;
  }

  if (!data.startsWith("self:edit:")) return false;

  const key = data.split(":")[2] || "";

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
      await sendMessage(env, chatId, "Input tidak valid.\nPilih minimal 1.\nKetik nomor dipisah koma.\nContoh: 1,3", {
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
