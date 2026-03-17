// routes/telegram.flow.selfProfile.edit.js

import { saveSession, loadSession, clearSession } from "../utils/session.js";
import { sendMessage, sendPhoto } from "../services/telegramApi.js";
import {
  getProfileFullByTelegramId,
  updateEditableProfileFields,
  setProfileCategoriesByProfileId,
  updateCloseupPhoto,
} from "../repositories/profilesRepo.js";
import { loadCategoriesForChoice } from "./telegram.flow.selfProfile.js";
import { showSelfProfileMenu } from "./telegram.flow.selfProfile.menu.js";

const SESSION_KEY_PREFIX = "state:";
const EDIT_MODE = "edit_profile";
const EDIT_FLOW_ID = "edit_profile";

function sk(userId) {
  return `${SESSION_KEY_PREFIX}${userId}`;
}

function buildFlowVersion() {
  return String(Date.now());
}

function getSourceMeta(sourceMessage = null) {
  return {
    source_chat_id: sourceMessage?.chat?.id ?? null,
    source_message_id: sourceMessage?.message_id ?? null,
  };
}

function logEditWarning(tag, meta = {}) {
  console.error(tag, meta);
}

async function safeLoadEditSession(env, telegramId) {
  try {
    return await loadSession(env, sk(telegramId));
  } catch (err) {
    logEditWarning("[selfProfile.edit.load_session_failed]", {
      telegramId,
      err: err?.message || String(err || ""),
    });
    return null;
  }
}

async function safeSaveEditSession(env, telegramId, payload) {
  try {
    await saveSession(env, sk(telegramId), payload);
    return true;
  } catch (err) {
    logEditWarning("[selfProfile.edit.save_session_failed]", {
      telegramId,
      mode: payload?.mode ?? null,
      step: payload?.step ?? null,
      field: payload?.field ?? null,
      sourceChatId: payload?.source_chat_id ?? null,
      sourceMessageId: payload?.source_message_id ?? null,
      err: err?.message || String(err || ""),
    });
    return false;
  }
}

async function safeClearEditSession(env, telegramId, context = {}) {
  try {
    await clearSession(env, sk(telegramId));
    return true;
  } catch (err) {
    logEditWarning("[selfProfile.edit.clear_session_failed]", {
      telegramId,
      ...context,
      err: err?.message || String(err || ""),
    });
    return false;
  }
}

function buildSessionBase(sourceMessage = null) {
  return {
    mode: EDIT_MODE,
    flow_id: EDIT_FLOW_ID,
    flow_version: buildFlowVersion(),
    ...getSourceMeta(sourceMessage),
  };
}

function isLegacyCompatibleSession(session) {
  if (!session || session?.mode !== EDIT_MODE) return false;
  return true;
}

function stopEdit(env, telegramId, context = {}) {
  return safeClearEditSession(env, telegramId, context);
}

async function askTextInput(env, telegramId, field, label, sourceMessage = null) {
  await safeSaveEditSession(env, telegramId, {
    ...buildSessionBase(sourceMessage),
    step: "await_text",
    field,
    label,
  });

  await sendMessage(
    env,
    telegramId,
    `Silakan kirim ${label} baru.\n\nKetik /batal untuk membatalkan.`
  );
}

async function askKategori(env, telegramId, sourceMessage = null) {
  const categories = await loadCategoriesForChoice(env).catch((err) => {
    logEditWarning("[selfProfile.edit.load_categories_failed]", {
      telegramId,
      err: err?.message || String(err || ""),
    });
    return [];
  });

  if (!categories.length) {
    await sendMessage(env, telegramId, "Kategori belum tersedia.");
    return;
  }

  const listText = categories.map((c) => `• ${c.kode}`).join("\n");

  await safeSaveEditSession(env, telegramId, {
    ...buildSessionBase(sourceMessage),
    step: "await_kategori",
    _category_list: categories,
  });

  await sendMessage(
    env,
    telegramId,
    `Kirim kode kategori, pisahkan dengan koma.\nContoh: SPG,MODEL\n\nDaftar kategori:\n${listText}`
  );
}

async function askCloseupPhoto(env, telegramId, sourceMessage = null) {
  await safeSaveEditSession(env, telegramId, {
    ...buildSessionBase(sourceMessage),
    step: "await_closeup",
  });

  await sendMessage(
    env,
    telegramId,
    "Silakan kirim foto closeup baru.\n\nKetik /batal untuk membatalkan."
  );
}

export async function handleSelfProfileEditCallback(env, telegramId, action, sourceMessage = null) {
  if (action === "nama") {
    await askTextInput(env, telegramId, "nama_lengkap", "nama lengkap", sourceMessage);
    return true;
  }

  if (action === "deskripsi") {
    await askTextInput(env, telegramId, "deskripsi", "deskripsi", sourceMessage);
    return true;
  }

  if (action === "kategori") {
    await askKategori(env, telegramId, sourceMessage);
    return true;
  }

  if (action === "closeup") {
    await askCloseupPhoto(env, telegramId, sourceMessage);
    return true;
  }

  return false;
}

function normalizeKategoriInput(input) {
  return String(input || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

export async function handleUserProfileEditFlow(env, msg) {
  const telegramId = String(msg?.from?.id || "");
  if (!telegramId) return false;

  const session = await safeLoadEditSession(env, telegramId);
  if (!isLegacyCompatibleSession(session)) return false;

  const text = String(msg?.text || "").trim();

  if (text === "/batal") {
    await stopEdit(env, telegramId, { reason: "cancel_command" });
    await sendMessage(env, telegramId, "Perubahan dibatalkan.");
    await showSelfProfileMenu(env, telegramId);
    return true;
  }

  if (session.step === "await_text") {
    const value = text;
    if (!value) {
      await sendMessage(env, telegramId, `Input tidak boleh kosong. Kirim ${session.label} baru atau /batal.`);
      return true;
    }

    try {
      await updateEditableProfileFields(env, telegramId, {
        [session.field]: value,
      });
    } catch (err) {
      logEditWarning("[selfProfile.edit.update_text_failed]", {
        telegramId,
        field: session.field,
        step: session.step,
        err: err?.message || String(err || ""),
      });

      await sendMessage(env, telegramId, "Gagal menyimpan perubahan. Coba lagi.");
      return true;
    }

    await stopEdit(env, telegramId, {
      reason: "text_update_success",
      field: session.field,
    });

    await sendMessage(env, telegramId, `✅ ${session.label} berhasil diperbarui.`);
    await showSelfProfileMenu(env, telegramId);
    return true;
  }

  if (session.step === "await_kategori") {
    const profile = await getProfileFullByTelegramId(env, telegramId).catch((err) => {
      logEditWarning("[selfProfile.edit.load_profile_for_category_failed]", {
        telegramId,
        err: err?.message || String(err || ""),
      });
      return null;
    });

    if (!profile?.id) {
      await stopEdit(env, telegramId, { reason: "profile_missing_on_category_save" });
      await sendMessage(env, telegramId, "Profil tidak ditemukan.");
      return true;
    }

    const picked = normalizeKategoriInput(text);
    const allowed = Array.isArray(session._category_list) ? session._category_list : [];
    const allowedMap = new Map(allowed.map((c) => [String(c.kode || "").toUpperCase(), c]));

    const invalid = picked.filter((kode) => !allowedMap.has(kode));
    if (invalid.length) {
      await sendMessage(
        env,
        telegramId,
        `Kategori tidak valid: ${invalid.join(", ")}\nSilakan kirim ulang atau /batal.`
      );
      return true;
    }

    const selectedCategoryIds = picked
      .map((kode) => allowedMap.get(kode)?.id)
      .filter(Boolean);

    try {
      await setProfileCategoriesByProfileId(env, profile.id, selectedCategoryIds);
    } catch (err) {
      logEditWarning("[selfProfile.edit.save_categories_failed]", {
        telegramId,
        profileId: profile.id,
        selectedCategoryIds,
        err: err?.message || String(err || ""),
      });

      await sendMessage(env, telegramId, "Gagal menyimpan kategori. Coba lagi.");
      return true;
    }

    await stopEdit(env, telegramId, { reason: "category_update_success" });
    await sendMessage(env, telegramId, "✅ Kategori berhasil diperbarui.");
    await showSelfProfileMenu(env, telegramId);
    return true;
  }

  if (session.step === "await_closeup") {
    const photo = Array.isArray(msg?.photo) && msg.photo.length ? msg.photo[msg.photo.length - 1] : null;
    const fileId = photo?.file_id || null;

    if (!fileId) {
      await sendMessage(env, telegramId, "Silakan kirim foto closeup baru atau /batal.");
      return true;
    }

    try {
      await updateCloseupPhoto(env, telegramId, fileId);
    } catch (err) {
      logEditWarning("[selfProfile.edit.update_closeup_failed]", {
        telegramId,
        fileId,
        err: err?.message || String(err || ""),
      });

      await sendMessage(env, telegramId, "Gagal menyimpan foto closeup. Coba lagi.");
      return true;
    }

    await stopEdit(env, telegramId, { reason: "closeup_update_success" });

    await sendPhoto(env, telegramId, fileId, "✅ Foto closeup berhasil diperbarui.").catch((err) => {
      logEditWarning("[selfProfile.edit.confirmation_photo_failed]", {
        telegramId,
        fileId,
        err: err?.message || String(err || ""),
      });
    });

    await showSelfProfileMenu(env, telegramId);
    return true;
  }

  return false;
}
