// routes/telegram.flow.partnerModeration.js

import { clearSession } from "../utils/session.js";
import { sendMessage } from "../services/telegramApi.js";
import {
  getProfileFullByTelegramId,
  deleteProfileByTelegramId,
} from "../repositories/profilesRepo.js";
import { getSetting } from "../repositories/settingsRepo.js";
import { buildTeManMenuKeyboard } from "./telegram.commands.user.js";
import {
  buildBackToPartnerModerationKeyboard,
  buildPartnerModerationKeyboard,
} from "./callbacks/keyboards.partner.js";
import { fmtClassId, resolveTelegramId } from "../utils/partnerHelpers.js";
import { manualSuspendPartner, manualRestorePartner } from "../services/partnerStatusService.js";
import { syncPartnerGroupRole } from "../services/partnerGroupRoleService.js";

async function sendModerationPanel(env, chatId, text, replyMarkup, extra = {}) {
  await sendMessage(env, chatId, text, {
    parse_mode: "HTML",
    reply_markup: replyMarkup,
    ...extra,
  });
}

export async function handlePartnerModerationInput({
  env,
  chatId,
  text,
  session,
  STATE_KEY,
  role,
}) {
  const action = String(session?.action || "").toLowerCase();
  const raw = String(text || "").trim();

  if (/^(batal|cancel|keluar)$/i.test(raw)) {
    await clearSession(env, STATE_KEY);

    await sendModerationPanel(
      env,
      chatId,
      "✅ Oke, sesi Partner Moderation dibatalkan.",
      buildPartnerModerationKeyboard(role)
    );
    return true;
  }

  const targetId = await resolveTelegramId(env, raw);
  if (!targetId) {
    await sendModerationPanel(
      env,
      chatId,
      "⚠️ Target tidak valid / tidak ditemukan.\nKirim <b>@username</b> atau <b>telegram_id</b> ya.\n\nKetik <b>batal</b> untuk keluar.",
      buildBackToPartnerModerationKeyboard()
    );
    return true;
  }

  const profile = await getProfileFullByTelegramId(env, targetId);
  if (!profile) {
    await sendModerationPanel(
      env,
      chatId,
      "⚠️ Data partner tidak ditemukan.",
      buildBackToPartnerModerationKeyboard()
    );
    return true;
  }

  const classId = fmtClassId(profile?.class_id);
  const label = raw.startsWith("@") ? raw : targetId;

  if (!["restore", "suspend", "delete"].includes(action)) {
    await clearSession(env, STATE_KEY);

    await sendModerationPanel(
      env,
      chatId,
      "⚠️ Aksi moderation tidak valid. Balik ke menu ya.",
      buildPartnerModerationKeyboard(role)
    );
    return true;
  }

  if (action === "delete") {
    await deleteProfileByTelegramId(env, targetId);
    await clearSession(env, STATE_KEY);

    await sendModerationPanel(
      env,
      chatId,
      `❌ Partner ${label} berhasil dihapus.\nClass ID: ${classId}`,
      buildPartnerModerationKeyboard(role)
    );
    return true;
  }

  if (action === "suspend") {
    const res = await manualSuspendPartner(env, targetId, chatId, null);
    const groupRoleSync = await syncPartnerGroupRole(env, targetId).catch((error) => ({
      ok: false,
      reason: error?.message || String(error),
    }));

    await clearSession(env, STATE_KEY);

    await sendMessage(env, targetId, `⛔ ${res.user_message}`, {
      reply_markup: buildTeManMenuKeyboard(),
    }).catch(() => {});

    await sendMessage(
      env,
      chatId,
      [
        `✅ Partner ${label} berhasil di-suspend.`,
        `Status akhir: ${res.status}`,
        `Class ID: ${classId}`,
        "",
        `Group role sync: ${groupRoleSync?.ok ? "OK" : "FAILED"}`,
      ].join("\n")
    );

    await sendModerationPanel(
      env,
      chatId,
      "Pilih aksi Partner Moderation berikutnya:",
      buildPartnerModerationKeyboard(role)
    );
    return true;
  }

  if (action === "restore") {
    const res = await manualRestorePartner(env, targetId, chatId, null);
    const groupRoleSync = await syncPartnerGroupRole(env, targetId).catch((error) => ({
      ok: false,
      reason: error?.message || String(error),
    }));

    await clearSession(env, STATE_KEY);

    const link = (await getSetting(env, "link_aturan")) ?? "-";
    const userText =
      res.reason_code === "payment_confirmed"
        ? `${res.user_message}\n\nIkuti seluruh arahan Admin dan\nBaca ATURAN MAIN TeMan:\n${link}`
        : res.user_message;

    await sendMessage(env, targetId, userText, {
      disable_web_page_preview: true,
      reply_markup: buildTeManMenuKeyboard(),
    }).catch(() => {});

    await sendMessage(
      env,
      chatId,
      [
        `✅ Partner ${label} berhasil di-restore.`,
        `Status akhir: ${res.status}`,
        `Class ID: ${classId}`,
        "",
        `Group role sync: ${groupRoleSync?.ok ? "OK" : "FAILED"}`,
      ].join("\n")
    );

    await sendModerationPanel(
      env,
      chatId,
      "Pilih aksi Partner Moderation berikutnya:",
      buildPartnerModerationKeyboard(role)
    );
    return true;
  }

  return false;
}
