// routes/callbacks/partner.category.handlers.js

import {
  sendMessage,
  upsertCallbackMessage,
} from "../../services/telegramApi.js";

import { saveSession, loadSession, clearSession } from "../../utils/session.js";

import {
  getProfileFullByTelegramId,
  setProfileCategoriesByProfileId,
} from "../../repositories/profilesRepo.js";

import {
  buildBackToPartnerDatabaseKeyboard,
} from "./keyboards.partner.js";

import { escapeHtml } from "./shared.js";

import {
  loadCategoryOptions,
  buildCategoryPickerKeyboard,
  PM_CATEGORY_TOGGLE_PREFIX,
  PM_CATEGORY_SAVE_PREFIX,
  PM_CATEGORY_BACK_PREFIX,
} from "./partner.category.js";

import { encodeSelectedCategoryIds } from "./partner.utils.js";

import {
  renderActionMenu,
  renderSuccessState,
} from "./partner.render.js";

const SESSION_MODE = "partner_edit_category";

function logCategoryWarning(tag, meta = {}) {
  console.error(tag, meta);
}

function getSessionKey(adminId) {
  return `state:${adminId}`;
}

function getMessageSourceMeta(msg) {
  return {
    source_chat_id: msg?.chat?.id ?? null,
    source_message_id: msg?.message_id ?? null,
  };
}

function buildFlowVersion() {
  return String(Date.now());
}

function buildCategoryEditText(profile) {
  return (
    `🗂️ <b>Edit Category</b>\n\n` +
    `Partner: <b>${escapeHtml(profile?.nama_lengkap || "-")}</b>\n` +
    `Telegram ID: <code>${escapeHtml(profile?.telegram_id || "-")}</code>\n\n` +
    `Pilih Category dibawah :`
  );
}

function buildStaleCategoryText() {
  return (
    "⚠️ Panel edit category ini sudah tidak aktif.\n\n" +
    "Gunakan panel terbaru atau buka ulang menu partner dari bawah."
  );
}

async function safeLoadCategorySession(env, adminId) {
  try {
    return await loadSession(env, getSessionKey(adminId));
  } catch (err) {
    logCategoryWarning("[partner.category.load_session_failed]", {
      adminId,
      err: err?.message || String(err || ""),
    });
    return null;
  }
}

async function safeSaveCategorySession(env, adminId, payload) {
  try {
    await saveSession(env, getSessionKey(adminId), payload);
    return true;
  } catch (err) {
    logCategoryWarning("[partner.category.save_session_failed]", {
      adminId,
      mode: payload?.mode ?? null,
      targetTelegramId: payload?.targetTelegramId ?? null,
      sourceChatId: payload?.source_chat_id ?? null,
      sourceMessageId: payload?.source_message_id ?? null,
      err: err?.message || String(err || ""),
    });
    return false;
  }
}

async function safeClearCategorySession(env, adminId) {
  try {
    await clearSession(env, getSessionKey(adminId));
    return true;
  } catch (err) {
    logCategoryWarning("[partner.category.clear_session_failed]", {
      adminId,
      err: err?.message || String(err || ""),
    });
    return false;
  }
}

function isTrackedSourceMatch(session, msg) {
  const trackedChatId = session?.source_chat_id ?? null;
  const trackedMessageId = session?.source_message_id ?? null;

  if (!trackedChatId && !trackedMessageId) {
    return true;
  }

  return (
    String(trackedChatId ?? "") === String(msg?.chat?.id ?? "") &&
    String(trackedMessageId ?? "") === String(msg?.message_id ?? "")
  );
}

function isValidCategorySession(session, telegramId, msg) {
  if (!session || session?.mode !== SESSION_MODE) return false;
  if (String(session?.targetTelegramId || "") !== String(telegramId || "")) return false;
  if (!isTrackedSourceMatch(session, msg)) return false;
  return true;
}

async function notifyStaleCategoryPanel(env, adminId, msg) {
  const sourceMessage = msg || null;

  if (sourceMessage?.chat?.id && sourceMessage?.message_id) {
    const res = await upsertCallbackMessage(
      env,
      sourceMessage,
      buildStaleCategoryText(),
      {
        parse_mode: "HTML",
        reply_markup: buildBackToPartnerDatabaseKeyboard(),
      }
    ).catch((err) => {
      logCategoryWarning("[partner.category.notify_stale_upsert_failed]", {
        adminId,
        sourceChatId: sourceMessage?.chat?.id ?? null,
        sourceMessageId: sourceMessage?.message_id ?? null,
        err: err?.message || String(err || ""),
      });
      return null;
    });

    if (res?.ok) return true;
  }

  await sendMessage(env, adminId, buildStaleCategoryText(), {
    parse_mode: "HTML",
    reply_markup: buildBackToPartnerDatabaseKeyboard(),
  }).catch((err) => {
    logCategoryWarning("[partner.category.notify_stale_send_failed]", {
      adminId,
      sourceChatId: sourceMessage?.chat?.id ?? null,
      sourceMessageId: sourceMessage?.message_id ?? null,
      err: err?.message || String(err || ""),
    });
  });

  return true;
}

async function renderCategoryPicker(env, adminId, msg, profile, nextIds) {
  const categories = await loadCategoryOptions(env).catch((err) => {
    logCategoryWarning("[partner.category.load_options_failed]", {
      adminId,
      targetTelegramId: profile?.telegram_id ?? null,
      err: err?.message || String(err || ""),
    });
    return [];
  });

  const text = buildCategoryEditText(profile);

  const res = await upsertCallbackMessage(env, msg, text, {
    parse_mode: "HTML",
    reply_markup: buildCategoryPickerKeyboard(
      profile.telegram_id,
      categories,
      nextIds
    ),
  }).catch((err) => {
    logCategoryWarning("[partner.category.render_picker_upsert_failed]", {
      adminId,
      targetTelegramId: profile?.telegram_id ?? null,
      sourceChatId: msg?.chat?.id ?? null,
      sourceMessageId: msg?.message_id ?? null,
      err: err?.message || String(err || ""),
    });

    return null;
  });

  if (res?.ok) {
    return {
      ok: true,
      anchor_chat_id: res?.chat_id ?? res?.result?.chat?.id ?? msg?.chat?.id ?? adminId,
      anchor_message_id: res?.message_id ?? res?.result?.message_id ?? msg?.message_id ?? null,
    };
  }

  const fallback = await sendMessage(env, adminId, text, {
    parse_mode: "HTML",
    reply_markup: buildCategoryPickerKeyboard(
      profile.telegram_id,
      categories,
      nextIds
    ),
  }).catch((err) => {
    logCategoryWarning("[partner.category.render_picker_send_failed]", {
      adminId,
      targetTelegramId: profile?.telegram_id ?? null,
      err: err?.message || String(err || ""),
    });

    return null;
  });

  return {
    ok: Boolean(fallback?.ok),
    anchor_chat_id: fallback?.result?.chat?.id ?? adminId,
    anchor_message_id: fallback?.result?.message_id ?? null,
  };
}

function buildSessionPayload(profile, nextIds, anchor) {
  return {
    mode: SESSION_MODE,
    targetTelegramId: profile.telegram_id,
    categoryIds: nextIds,
    flow_id: SESSION_MODE,
    flow_version: buildFlowVersion(),
    source_chat_id: anchor?.anchor_chat_id ?? null,
    source_message_id: anchor?.anchor_message_id ?? null,
  };
}

export function buildPartnerCategoryDomainHandlers() {
  const EXACT = {};
  const PREFIX = [];

  /**
   * TOGGLE CATEGORY
   */
  PREFIX.push({
    match: (d) => d.startsWith(PM_CATEGORY_TOGGLE_PREFIX),
    run: async (ctx) => {
      const { env, data, adminId, msg } = ctx;

      const payload = String(
        data.slice(PM_CATEGORY_TOGGLE_PREFIX.length) || ""
      );

      const [telegramId, categoryId] = payload.split(":");

      if (!telegramId || !categoryId) {
        await sendMessage(env, adminId, "⚠️ Category target tidak valid.");
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId).catch((err) => {
        logCategoryWarning("[partner.category.get_profile_failed]", {
          adminId,
          telegramId,
          err: err?.message || String(err || ""),
        });
        return null;
      });

      if (!profile) {
        await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const session = await safeLoadCategorySession(env, adminId);

      if (
        session?.mode === SESSION_MODE &&
        String(session?.targetTelegramId || "") === String(profile.telegram_id || "") &&
        !isTrackedSourceMatch(session, msg)
      ) {
        await notifyStaleCategoryPanel(env, adminId, msg);
        return true;
      }

      const currentIds = encodeSelectedCategoryIds(session?.categoryIds || []);
      const nextSet = new Set(currentIds);

      if (nextSet.has(String(categoryId))) {
        nextSet.delete(String(categoryId));
      } else {
        nextSet.add(String(categoryId));
      }

      const nextIds = Array.from(nextSet).sort();
      const anchor = await renderCategoryPicker(env, adminId, msg, profile, nextIds);

      if (!anchor?.ok) {
        await sendMessage(env, adminId, "⚠️ Gagal menampilkan panel category terbaru.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        }).catch((err) => {
          logCategoryWarning("[partner.category.render_picker_total_failure]", {
            adminId,
            targetTelegramId: profile.telegram_id,
            err: err?.message || String(err || ""),
          });
        });
        return true;
      }

      await safeSaveCategorySession(
        env,
        adminId,
        buildSessionPayload(profile, nextIds, anchor)
      );

      return true;
    },
  });

  /**
   * SAVE CATEGORY
   */
  PREFIX.push({
    match: (d) => d.startsWith(PM_CATEGORY_SAVE_PREFIX),
    run: async (ctx) => {
      const { env, data, adminId, msg } = ctx;

      const telegramId = String(
        data.slice(PM_CATEGORY_SAVE_PREFIX.length) || ""
      ).trim();

      if (!telegramId) {
        await sendMessage(env, adminId, "⚠️ Target partner tidak valid.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId).catch((err) => {
        logCategoryWarning("[partner.category.save.get_profile_failed]", {
          adminId,
          telegramId,
          err: err?.message || String(err || ""),
        });
        return null;
      });

      if (!profile?.id) {
        await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const session = await safeLoadCategorySession(env, adminId);

      if (!session || session?.mode !== SESSION_MODE) {
        await notifyStaleCategoryPanel(env, adminId, msg);
        return true;
      }

      if (
        String(session?.targetTelegramId || "") !== String(telegramId) ||
        !isTrackedSourceMatch(session, msg)
      ) {
        await notifyStaleCategoryPanel(env, adminId, msg);
        return true;
      }

      const selectedIds = encodeSelectedCategoryIds(session?.categoryIds || []);

      try {
        await setProfileCategoriesByProfileId(env, profile.id, selectedIds);
      } catch (err) {
        logCategoryWarning("[partner.category.save.set_profile_categories_failed]", {
          adminId,
          telegramId,
          profileId: profile.id,
          selectedIds,
          sourceChatId: msg?.chat?.id ?? null,
          sourceMessageId: msg?.message_id ?? null,
          err: err?.message || String(err || ""),
        });

        await sendMessage(env, adminId, "⚠️ Gagal menyimpan category partner. Coba lagi dari panel terbaru.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        }).catch((sendErr) => {
          logCategoryWarning("[partner.category.save.error_notice_failed]", {
            adminId,
            telegramId,
            err: sendErr?.message || String(sendErr || ""),
          });
        });

        return true;
      }

      await safeClearCategorySession(env, adminId);
      await renderSuccessState(env, adminId, telegramId, "Category", msg);

      return true;
    },
  });

  /**
   * BACK
   */
  PREFIX.push({
    match: (d) => d.startsWith(PM_CATEGORY_BACK_PREFIX),
    run: async (ctx) => {
      const { env, data, adminId, msg, role } = ctx;

      const telegramId = String(
        data.slice(PM_CATEGORY_BACK_PREFIX.length) || ""
      ).trim();

      if (!telegramId) {
        await sendMessage(env, adminId, "⚠️ Target partner tidak valid.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const session = await safeLoadCategorySession(env, adminId);

      if (
        session?.mode === SESSION_MODE &&
        String(session?.targetTelegramId || "") === String(telegramId) &&
        !isTrackedSourceMatch(session, msg)
      ) {
        await notifyStaleCategoryPanel(env, adminId, msg);
        return true;
      }

      await safeClearCategorySession(env, adminId);
      await renderActionMenu(env, adminId, telegramId, role, msg);

      return true;
    },
  });

  return { EXACT, PREFIX };
}
