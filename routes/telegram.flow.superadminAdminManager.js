// routes/telegram.flow.superadminAdminManager.js

import { sendMessage } from "../services/telegramApi.js";
import {
  getAdminByTelegramId,
  updateAdminUsername,
  updateAdminNama,
  updateAdminKota,
} from "../repositories/adminsRepo.js";
import {
  clearSession,
  getSessionMeta,
} from "../utils/session.js";
import { buildAdminControlPanelKeyboard, buildAdminManagerKeyboard } from "./callbacks/keyboards.superadmin.js";
import { SESSION_MODES } from "./telegram.constants.js";

const EDITABLE_ACTIONS = new Set([
  "edit_username",
  "edit_nama",
  "edit_kota",
]);

const SESSION_MAX_AGE_MS = 15 * 60 * 1000;

function logError(tag, meta = {}) {
  console.error(tag, meta);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtValue(value) {
  const v = value === null || value === undefined || value === "" ? "-" : String(value);
  return escapeHtml(v);
}

function normalizeText(text) {
  return String(text || "").trim();
}

function isCancelText(text) {
  return /^(batal|cancel|keluar)$/i.test(normalizeText(text));
}

function normalizeUsernameInput(text) {
  const raw = normalizeText(text);
  if (!raw) return { ok: false, reason: "empty_username" };
  if (raw === "-") return { ok: true, value: null };

  const cleaned = raw.replace(/^@+/, "").trim().toLowerCase();
  if (!cleaned) return { ok: false, reason: "empty_username" };

  if (!/^[a-z0-9_]{5,32}$/i.test(cleaned)) {
    return { ok: false, reason: "invalid_username_format" };
  }

  return { ok: true, value: cleaned };
}

function normalizeNamaInput(text) {
  const raw = normalizeText(text);
  if (!raw) return { ok: false, reason: "empty_nama" };
  if (raw === "-") return { ok: false, reason: "empty_nama" };

  return { ok: true, value: raw };
}

function normalizeKotaInput(text) {
  const raw = normalizeText(text);
  if (!raw) return { ok: false, reason: "empty_kota" };
  if (raw === "-") return { ok: true, value: null };

  return { ok: true, value: raw };
}

function getSessionAgeMs(session) {
  const meta = getSessionMeta(session);
  const updatedAt = String(meta?.updated_at || "").trim();
  if (!updatedAt) return null;

  const ts = new Date(updatedAt).getTime();
  if (!Number.isFinite(ts)) return null;

  return Date.now() - ts;
}

function isSessionExpired(session) {
  const age = getSessionAgeMs(session);
  if (age === null) return false;
  return age > SESSION_MAX_AGE_MS;
}

function buildAdminDetailText(row) {
  return [
    "👤 <b>Admin Detail</b>",
    "",
    `Telegram ID : <code>${fmtValue(row?.telegram_id)}</code>`,
    `Username    : ${escapeHtml(row?.username ? `@${String(row.username).replace(/^@/, "")}` : "-")}`,
    `Nama        : ${fmtValue(row?.nama)}`,
    `Kota        : ${fmtValue(row?.kota)}`,
    `Role        : <b>${fmtValue(row?.normRole)}</b>`,
    `Status      : <b>${fmtValue(row?.normStatus)}</b>`,
  ].join("\n");
}

function buildCancelSuccessText(targetLabel) {
  return [
    "✅ Edit admin dibatalkan.",
    "",
    `Target: <b>${escapeHtml(targetLabel || "-")}</b>`,
  ].join("\n");
}

function buildSessionExpiredText() {
  return [
    "⚠️ Session edit admin sudah kedaluwarsa.",
    "",
    "Silakan buka panel admin lagi lalu ulangi aksi edit dari menu terbaru.",
  ].join("\n");
}

function buildInvalidSessionText() {
  return [
    "⚠️ Session edit admin tidak valid.",
    "",
    "Silakan buka ulang panel admin dari menu terbaru.",
  ].join("\n");
}

function buildValidationErrorText(action, reason) {
  if (action === "edit_username") {
    if (reason === "empty_username") {
      return "⚠️ Username tidak boleh kosong. Kirim username baru tanpa @ atau dengan @.\nKetik <b>-</b> untuk kosongkan username.";
    }
    if (reason === "invalid_username_format") {
      return "⚠️ Format username tidak valid. Gunakan 5-32 karakter, hanya huruf, angka, atau underscore.";
    }
    return "⚠️ Username admin tidak valid.";
  }

  if (action === "edit_nama") {
    if (reason === "empty_nama") {
      return "⚠️ Nama admin tidak boleh kosong.";
    }
    return "⚠️ Nama admin tidak valid.";
  }

  if (action === "edit_kota") {
    if (reason === "empty_kota") {
      return "⚠️ Kota tidak boleh kosong. Ketik <b>-</b> untuk kosongkan kota.";
    }
    return "⚠️ Kota admin tidak valid.";
  }

  return "⚠️ Input tidak valid.";
}

function buildSuccessText(action, row) {
  const target = escapeHtml(row?.label || row?.nama || row?.telegram_id || "-");

  if (action === "edit_username") {
    return [
      "✅ <b>Username admin berhasil diupdate</b>",
      "",
      `Target: <b>${target}</b>`,
      `Username baru: <b>${escapeHtml(row?.username ? `@${String(row.username).replace(/^@/, "")}` : "-")}</b>`,
    ].join("\n");
  }

  if (action === "edit_nama") {
    return [
      "✅ <b>Nama admin berhasil diupdate</b>",
      "",
      `Target: <b>${target}</b>`,
      `Nama baru: <b>${fmtValue(row?.nama)}</b>`,
    ].join("\n");
  }

  if (action === "edit_kota") {
    return [
      "✅ <b>Kota admin berhasil diupdate</b>",
      "",
      `Target: <b>${target}</b>`,
      `Kota baru: <b>${fmtValue(row?.kota)}</b>`,
    ].join("\n");
  }

  return "✅ Data admin berhasil diupdate.";
}

function buildMutationErrorText(action, reason) {
  if (reason === "not_found") {
    return "⚠️ Data admin tidak ditemukan.";
  }

  if (action === "edit_nama" && reason === "empty_nama") {
    return "⚠️ Nama admin tidak boleh kosong.";
  }

  if (action === "edit_username" && reason === "invalid_username") {
    return "⚠️ Username admin tidak valid.";
  }

  return "⚠️ Gagal update data admin.";
}

async function clearSessionSafely(env, stateKey, meta = {}) {
  try {
    await clearSession(env, stateKey);
    return { ok: true };
  } catch (err) {
    logError("[sa.admin_manager_input.clear_session.failed]", {
      stateKey,
      ...meta,
      err: err?.message || String(err || ""),
    });
    return { ok: false, err };
  }
}

async function resolveTargetRow(env, targetTelegramId) {
  if (!targetTelegramId) return null;
  return await getAdminByTelegramId(env, targetTelegramId);
}

async function updateAdminField(env, action, targetTelegramId, rawText) {
  if (action === "edit_username") {
    const normalized = normalizeUsernameInput(rawText);
    if (!normalized.ok) return normalized;

    const res = await updateAdminUsername(env, targetTelegramId, normalized.value);
    return {
      ok: !!res?.ok,
      reason: res?.reason || null,
      row: res?.row || null,
    };
  }

  if (action === "edit_nama") {
    const normalized = normalizeNamaInput(rawText);
    if (!normalized.ok) return normalized;

    const res = await updateAdminNama(env, targetTelegramId, normalized.value);
    return {
      ok: !!res?.ok,
      reason: res?.reason || null,
      row: res?.row || null,
    };
  }

  if (action === "edit_kota") {
    const normalized = normalizeKotaInput(rawText);
    if (!normalized.ok) return normalized;

    const res = await updateAdminKota(env, targetTelegramId, normalized.value);
    return {
      ok: !!res?.ok,
      reason: res?.reason || null,
      row: res?.row || null,
    };
  }

  return {
    ok: false,
    reason: "unsupported_action",
    row: null,
  };
}

export async function handleSuperadminAdminManagerInput({
  env,
  chatId,
  text,
  session,
  STATE_KEY,
}) {
  if (!session) return false;
  if (session?.mode !== SESSION_MODES.SA_ADMIN_MANAGER) return false;

  const action = normalizeText(session?.action);
  const targetTelegramId = normalizeText(session?.target_telegram_id);
  const targetLabel = normalizeText(session?.target_label);
  const step = normalizeText(session?.step || "await_text");

  if (!EDITABLE_ACTIONS.has(action)) {
    return false;
  }

  if (step !== "await_text") {
    await clearSessionSafely(env, STATE_KEY, {
      action,
      targetTelegramId,
      reason: "invalid_step",
      step,
    });

    await sendMessage(env, chatId, buildInvalidSessionText(), {
      parse_mode: "HTML",
      reply_markup: buildAdminManagerKeyboard(),
    });
    return true;
  }

  if (!targetTelegramId) {
    await clearSessionSafely(env, STATE_KEY, {
      action,
      reason: "missing_target",
    });

    await sendMessage(env, chatId, buildInvalidSessionText(), {
      parse_mode: "HTML",
      reply_markup: buildAdminManagerKeyboard(),
    });
    return true;
  }

  if (isSessionExpired(session)) {
    await clearSessionSafely(env, STATE_KEY, {
      action,
      targetTelegramId,
      reason: "session_expired",
      sessionMeta: getSessionMeta(session),
    });

    await sendMessage(env, chatId, buildSessionExpiredText(), {
      parse_mode: "HTML",
      reply_markup: buildAdminManagerKeyboard(),
    });
    return true;
  }

  const rawText = normalizeText(text);

  if (!rawText) {
    return true;
  }

  const currentTarget = await resolveTargetRow(env, targetTelegramId);
  if (!currentTarget) {
    await clearSessionSafely(env, STATE_KEY, {
      action,
      targetTelegramId,
      reason: "target_not_found",
    });

    await sendMessage(env, chatId, "⚠️ Data admin target tidak ditemukan.", {
      reply_markup: buildAdminManagerKeyboard(),
    });
    return true;
  }

  if (isCancelText(rawText)) {
    await clearSessionSafely(env, STATE_KEY, {
      action,
      targetTelegramId,
      reason: "user_cancel",
    });

    await sendMessage(env, chatId, buildCancelSuccessText(targetLabel || currentTarget.label), {
      parse_mode: "HTML",
      reply_markup: buildAdminControlPanelKeyboard(currentTarget.telegram_id, currentTarget, "owner"),
    });
    return true;
  }

  const result = await updateAdminField(env, action, targetTelegramId, rawText);

  if (!result?.ok) {
    const validationOnly =
      result?.reason === "empty_username" ||
      result?.reason === "invalid_username_format" ||
      result?.reason === "empty_nama" ||
      result?.reason === "empty_kota";

    if (validationOnly) {
      await sendMessage(env, chatId, buildValidationErrorText(action, result.reason), {
        parse_mode: "HTML",
        reply_markup: buildAdminControlPanelKeyboard(currentTarget.telegram_id, currentTarget, "owner"),
      });
      return true;
    }

    if (result?.reason === "unsupported_action") {
      await clearSessionSafely(env, STATE_KEY, {
        action,
        targetTelegramId,
        reason: "unsupported_action",
      });

      await sendMessage(env, chatId, buildInvalidSessionText(), {
        parse_mode: "HTML",
        reply_markup: buildAdminManagerKeyboard(),
      });
      return true;
    }

    logError("[sa.admin_manager_input.update_failed]", {
      action,
      targetTelegramId,
      reason: result?.reason || "unknown",
      sessionMeta: getSessionMeta(session),
    });

    await clearSessionSafely(env, STATE_KEY, {
      action,
      targetTelegramId,
      reason: result?.reason || "update_failed",
    });

    await sendMessage(env, chatId, buildMutationErrorText(action, result?.reason), {
      parse_mode: "HTML",
      reply_markup: buildAdminControlPanelKeyboard(currentTarget.telegram_id, currentTarget, "owner"),
    });
    return true;
  }

  const freshRow =
    result?.row || (await resolveTargetRow(env, targetTelegramId));

  await clearSessionSafely(env, STATE_KEY, {
    action,
    targetTelegramId,
    reason: "success",
  });

  await sendMessage(env, chatId, buildSuccessText(action, freshRow || currentTarget), {
    parse_mode: "HTML",
    reply_markup: buildAdminControlPanelKeyboard(
      (freshRow || currentTarget).telegram_id,
      freshRow || currentTarget,
      "owner"
    ),
  });

  await sendMessage(env, chatId, buildAdminDetailText(freshRow || currentTarget), {
    parse_mode: "HTML",
    reply_markup: buildAdminControlPanelKeyboard(
      (freshRow || currentTarget).telegram_id,
      freshRow || currentTarget,
      "owner"
    ),
  });

  return true;
}

export default {
  handleSuperadminAdminManagerInput,
};
