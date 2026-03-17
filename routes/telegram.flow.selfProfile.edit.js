// routes/telegram.flow.selfProfile.edit.js

import { saveSession, loadSession, clearSession } from "../utils/session.js";
import { sendMessage, sendPhoto } from "../services/telegramApi.js";
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
import { sendSelfEditMenu } from "./telegram.flow.selfProfile.menu.js";

const EDIT_TEXT_FIELDS = {
  nickname: { field: "nickname", prompt: "Ketik <b>Nickname</b> baru:" },
  no_whatsapp: { field: "no_whatsapp", prompt: "Ketik <b>No. Whatsapp</b> baru:" },
  kecamatan: { field: "kecamatan", prompt: "Ketik <b>Kecamatan</b> baru:" },
  kota: { field: "kota", prompt: "Ketik <b>Kota</b> baru:" },
  start_price: {
    field: "start_price",
    prompt: "Ketik <b>Tarif Minimum</b> dalam angka saja.\n\nContoh: <code>150000</code>",
  },
};

const EDIT_MODE = "edit_profile";
const EDIT_FLOW_ID = "edit_profile";

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

function normalizePriceInput(value) {
  const cleaned = String(value || "").replace(/[^\d]/g, "").trim();
  if (!cleaned) return null;

  const num = Number(cleaned);
  if (!Number.isFinite(num) || num <= 0) return null;

  return Math.floor(num);
}

async function safeLoadEditSession(env, STATE_KEY, telegramId) {
  try {
    return await loadSession(env, STATE_KEY);
  } catch (err) {
    logEditWarning("[selfProfile.edit.load_session_failed]", {
      telegramId,
      err: err?.message || String(err || ""),
    });
    return null;
  }
}

async function safeSaveEditSession(env, STATE_KEY, telegramId, payload) {
  try {
    await saveSession(env, STATE_KEY, payload);
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

async function safeClearEditSession(env, STATE_KEY, telegramId, context = {}) {
  try {
    await clearSession(env, STATE_KEY);
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

function isEditSession(session) {
  return Boolean(session?.mode === EDIT_MODE);
}

async function stopEdit(env, chatId, STATE_KEY, telegramId, msg, context = {}) {
  await safeClearEditSession(env, STATE_KEY, telegramId, context);
  await sendHtml(env, chatId, msg, {
    reply_markup: buildTeManMenuKeyboard(),
  });
}

async function sendEditSessionStartFailed(env, chatId) {
  await sendHtml(
    env,
    chatId,
    "⚠️ Sistem sedang gangguan dan sesi edit belum berhasil dimulai. Silakan coba lagi ya.",
    {
      reply_markup: buildTeManMenuKeyboard(),
    }
  );
}

async function askTextInput(env, chatId, telegramId, STATE_KEY, field, prompt, sourceMessage = null) {
  const saved = await safeSaveEditSession(env, STATE_KEY, telegramId, {
    ...buildSessionBase(sourceMessage),
    step: "await_text",
    field,
  });

  if (!saved) {
    await sendEditSessionStartFailed(env, chatId);
    return false;
  }

  await sendHtml(env, chatId, prompt, {
    reply_markup: buildTeManMenuKeyboard(),
  });
  return true;
}

async function askCloseupPhoto(env, chatId, telegramId, STATE_KEY, sourceMessage = null) {
  const saved = await safeSaveEditSession(env, STATE_KEY, telegramId, {
    ...buildSessionBase(sourceMessage),
    step: "await_closeup_photo",
  });

  if (!saved) {
    await sendEditSessionStartFailed(env, chatId);
    return false;
  }

  await sendHtml(
    env,
    chatId,
    "Silakan kirim <b>foto closeup</b> terbaru sebagai <b>photo</b>, bukan file.",
    {
      reply_markup: buildTeManMenuKeyboard(),
    }
  );
  return true;
}

async function askKategori(env, chatId, telegramId, STATE_KEY, sourceMessage = null) {
  const cats = await loadCategoriesForChoice(env).catch((err) => {
    logEditWarning("[selfProfile.edit.load_categories_failed]", {
      telegramId,
      err: err?.message || String(err || ""),
    });
    return [];
  });

  if (!cats.length) {
    const saved = await safeSaveEditSession(env, STATE_KEY, telegramId, {
      ...buildSessionBase(sourceMessage),
      step: "await_kategori_select",
      data: { _category_list: [] },
    });

    if (!saved) {
      await sendEditSessionStartFailed(env, chatId);
      return false;
    }

    await sendHtml(env, chatId, "⚠️ Belum ada kategori yang tersedia. Hubungi admin ya.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return true;
  }

  const saved = await safeSaveEditSession(env, STATE_KEY, telegramId, {
    ...buildSessionBase(sourceMessage),
    step: "await_kategori_select",
    data: { _category_list: cats },
  });

  if (!saved) {
    await sendEditSessionStartFailed(env, chatId);
    return false;
  }

  await sendMessage(env, chatId, buildCategoryChoiceMessage(cats), {
    parse_mode: "Markdown",
    reply_markup: buildTeManMenuKeyboard(),
  });
  return true;
}

export async function handleSelfProfileEditCallback({
  env,
  chatId,
  telegramId,
  STATE_KEY,
  data,
  sourceMessage = null,
}) {
  const profile = await getProfileFullByTelegramId(env, telegramId).catch((err) => {
    logEditWarning("[selfProfile.edit.load_profile_failed]", {
      telegramId,
      data,
      err: err?.message || String(err || ""),
    });
    return null;
  });

  if (!profile) {
    await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return true;
  }

  if (data === "self:update") {
    await sendSelfEditMenu(env, chatId, telegramId, { sourceMessage });
    return true;
  }

  if (!data.startsWith("self:edit:")) return false;

  const key = data.split(":")[2] || "";

  if (EDIT_TEXT_FIELDS[key]) {
    await askTextInput(
      env,
      chatId,
      telegramId,
      STATE_KEY,
      EDIT_TEXT_FIELDS[key].field,
      EDIT_TEXT_FIELDS[key].prompt,
      sourceMessage
    );
    return true;
  }

  if (key === "kategori") {
    await askKategori(env, chatId, telegramId, STATE_KEY, sourceMessage);
    return true;
  }

  if (key === "closeup") {
    await askCloseupPhoto(env, chatId, telegramId, STATE_KEY, sourceMessage);
    return true;
  }

  await sendHtml(env, chatId, "Pilihan tidak valid.", {
    reply_markup: buildTeManMenuKeyboard(),
  });
  return true;
}

export async function handleUserProfileEditFlow({
  env,
  chatId,
  telegramId,
  text,
  session,
  STATE_KEY,
  update,
}) {
  const effectiveSession =
    isEditSession(session) ? session : await safeLoadEditSession(env, STATE_KEY, telegramId);

  if (!isEditSession(effectiveSession)) {
    return false;
  }

  const profile = await getProfileFullByTelegramId(env, telegramId).catch((err) => {
    logEditWarning("[selfProfile.edit.load_profile_for_flow_failed]", {
      telegramId,
      step: effectiveSession?.step ?? null,
      err: err?.message || String(err || ""),
    });
    return null;
  });

  if (!profile) {
    await stopEdit(env, chatId, STATE_KEY, telegramId, "Data partner tidak ditemukan.", {
      reason: "profile_not_found",
    });
    return true;
  }

  const photoFileId = getPhotoFileId(update);

  if (effectiveSession?.step === "await_text") {
    const field = effectiveSession?.field;
    const rawValue = String(text || "").trim();

    if (!rawValue) {
      await sendHtml(env, chatId, "⚠️ Input kosong. Coba lagi ya.", {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return true;
    }

    if (!["nickname", "no_whatsapp", "kecamatan", "kota", "start_price"].includes(field)) {
      await stopEdit(env, chatId, STATE_KEY, telegramId, "⚠️ Field tidak valid.", {
        reason: "invalid_field",
        field,
      });
      return true;
    }

    let value = rawValue;

    if (field === "start_price") {
      const normalized = normalizePriceInput(rawValue);

      if (!normalized) {
        await sendHtml(
          env,
          chatId,
          "⚠️ Tarif Minimum harus berupa angka lebih dari 0.\n\nContoh: <code>150000</code>",
          {
            reply_markup: buildTeManMenuKeyboard(),
          }
        );
        return true;
      }

      value = String(normalized);
    }

    try {
      await updateEditableProfileFields(env, telegramId, { [field]: value });
    } catch (err) {
      logEditWarning("[selfProfile.edit.update_text_failed]", {
        telegramId,
        field,
        value,
        err: err?.message || String(err || ""),
      });

      await sendHtml(env, chatId, "⚠️ Gagal update data. Coba lagi ya.", {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return true;
    }

    await safeClearEditSession(env, STATE_KEY, telegramId, {
      reason: "text_update_success",
      field,
    });

    await sendHtml(env, chatId, "✅ Data berhasil diupdate.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return true;
  }

  if (effectiveSession?.step === "await_kategori_select") {
    const categories = Array.isArray(effectiveSession?.data?._category_list)
      ? effectiveSession.data._category_list
      : [];

    if (!categories.length) {
      await stopEdit(
        env,
        chatId,
        STATE_KEY,
        telegramId,
        "⚠️ Belum ada kategori yang tersedia. Hubungi admin ya.",
        { reason: "empty_category_list" }
      );
      return true;
    }

    const parsed = parseMultiIndexInputRequired(text, categories.length);
    if (!parsed.ok) {
      await sendMessage(
        env,
        chatId,
        "Input tidak valid.\nPilih minimal 1.\nKetik nomor dipisah koma.\nContoh: 1,3",
        {
          reply_markup: buildTeManMenuKeyboard(),
        }
      );
      return true;
    }

    const categoryIds = mapIndexesToCategoryIds(parsed.indexes, categories);
    if (!categoryIds.length) {
      await sendMessage(env, chatId, "Pilihan kategori tidak valid. Coba lagi ya.", {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return true;
    }

    try {
      const res = await setProfileCategoriesByProfileId(env, profile.id, categoryIds);
      if (res?.ok === false) {
        logEditWarning("[selfProfile.edit.save_categories_repo_rejected]", {
          telegramId,
          profileId: profile.id,
          categoryIds,
          result: res,
        });

        await sendHtml(env, chatId, "⚠️ Gagal update kategori. Coba lagi ya.", {
          reply_markup: buildTeManMenuKeyboard(),
        });
        return true;
      }
    } catch (err) {
      logEditWarning("[selfProfile.edit.save_categories_failed]", {
        telegramId,
        profileId: profile.id,
        categoryIds,
        err: err?.message || String(err || ""),
      });

      await sendHtml(env, chatId, "⚠️ Gagal update kategori. Coba lagi ya.", {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return true;
    }

    await safeClearEditSession(env, STATE_KEY, telegramId, {
      reason: "category_update_success",
    });

    await sendHtml(env, chatId, "✅ Kategori berhasil diupdate.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return true;
  }

  if (effectiveSession?.step === "await_closeup_photo") {
    if (!photoFileId) {
      await sendHtml(
        env,
        chatId,
        "⚠️ Belum ada foto. Kirim foto closeup ya sebagai photo, bukan file.",
        {
          reply_markup: buildTeManMenuKeyboard(),
        }
      );
      return true;
    }

    try {
      await updateCloseupPhoto(env, telegramId, photoFileId);
    } catch (err) {
      logEditWarning("[selfProfile.edit.update_closeup_failed]", {
        telegramId,
        fileId: photoFileId,
        err: err?.message || String(err || ""),
      });

      await sendHtml(env, chatId, "⚠️ Gagal update foto closeup. Coba lagi ya.", {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return true;
    }

    await safeClearEditSession(env, STATE_KEY, telegramId, {
      reason: "closeup_update_success",
    });

    try {
      await sendPhoto(env, chatId, photoFileId, "✅ Foto closeup berhasil diupdate.", {
        reply_markup: buildTeManMenuKeyboard(),
      });
    } catch (err) {
      logEditWarning("[selfProfile.edit.confirmation_photo_failed]", {
        telegramId,
        fileId: photoFileId,
        err: err?.message || String(err || ""),
      });

      await sendHtml(env, chatId, "✅ Foto closeup berhasil diupdate.", {
        reply_markup: buildTeManMenuKeyboard(),
      });
    }

    return true;
  }

  await stopEdit(
    env,
    chatId,
    STATE_KEY,
    telegramId,
    "⚠️ Sesi update berakhir. Klik Menu TeMan untuk lanjut.",
    { reason: "unknown_edit_step", step: effectiveSession?.step ?? null }
  );
  return true;
}
