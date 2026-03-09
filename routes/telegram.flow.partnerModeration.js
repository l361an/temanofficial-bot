// routes/telegram.flow.partnerModeration.js

import { clearSession } from "../utils/session.js";
import { sendMessage, upsertCallbackMessage } from "../services/telegramApi.js";
import {
  getProfileFullByTelegramId,
  deleteProfileByTelegramId,
} from "../repositories/profilesRepo.js";
import { getSetting } from "../repositories/settingsRepo.js";
import { buildTeManMenuKeyboard } from "./telegram.commands.user.js";
import {
  buildBackToPartnerModerationKeyboard,
  buildPartnerModerationKeyboard,
} from "./callbacks/keyboards.js";
import { fmtClassId, resolveTelegramId } from "../utils/partnerHelpers.js";
import { manualSuspendPartner, manualRestorePartner } from "../services/partnerStatusService.js";

function readSourceMessage(chatId, session) {
  const sourceChatId = session?.data?.source_chat_id ?? chatId ?? null;
  const sourceMessageId = session?.data?.source_message_id ?? null;

  if (!sourceChatId || !sourceMessageId) return null;

  return {
    chat: { id: sourceChatId },
    message_id: sourceMessageId,
    text: "Partner Moderation",
  };
}

async function renderModerationPanel(env, chatId, session, text, replyMarkup, extra = {}) {
  const sourceMessage = readSourceMessage(chatId, session);
  const payload = {
    parse_mode: "HTML",
    reply_markup: replyMarkup,
    ...extra,
  };

  if (sourceMessage) {
    await upsertCallbackMessage(env, sourceMessage, text, payload).catch(async () => {
      await sendMessage(env, chatId, text, payload);
    });
    return;
  }

  await sendMessage(env, chatId, text, payload);
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

    await renderModerationPanel(
      env,
      chatId,
      session,
      "✅ Oke, sesi Partner Moderation dibatalkan.",
      buildPartnerModerationKeyboard(role)
    );
    return true;
  }

  const targetId = await resolveTelegramId(env, raw);
  if (!targetId) {
    await renderModerationPanel(
      env,
      chatId,
      session,
      "⚠️ Target tidak valid / tidak ditemukan.\nKirim <b>@username</b> atau <b>telegram_id</b> ya.\n\nKetik <b>batal</b> untuk keluar.",
      buildBackToPartnerModerationKeyboard()
    );
    return true;
  }

  const profile = await getProfileFullByTelegramId(env, targetId);
  if (!profile) {
    await renderModerationPanel(
      env,
      chatId,
      session,
      "⚠️ Data partner tidak ditemukan.",
      buildBackToPartnerModerationKeyboard()
    );
    return true;
  }

  const classId = fmtClassId(profile?.class_id);
  const label = raw.startsWith("@") ? raw : targetId;

  if (!["activate", "suspend", "delete"].includes(action)) {
    await clearSession(env, STATE_KEY);

    await renderModerationPanel(
      env,
      chatId,
      session,
      "⚠️ Aksi moderation tidak valid. Balik ke menu ya.",
      buildPartnerModerationKeyboard(role)
    );
    return true;
  }

  if (action === "delete") {
    await deleteProfileByTelegramId(env, targetId);
    await clearSession(env, STATE_KEY);

    await renderModerationPanel(
      env,
      chatId,
      session,
      `❌ Partner ${label} berhasil dihapus.\nClass ID: ${classId}`,
      buildPartnerModerationKeyboard(role)
    );
    return true;
  }

  if (action === "suspend") {
    const res = await manualSuspendPartner(env, targetId, chatId, null);
    await clearSession(env, STATE_KEY);

    await sendMessage(env, targetId, `⛔ ${res.user_message}`, {
      reply_markup: buildTeManMenuKeyboard(),
    }).catch(() => {});

    await renderModerationPanel(
      env,
      chatId,
      session,
      `✅ Partner ${label} berhasil di-suspend.\nStatus akhir: ${res.status}\nClass ID: ${classId}`,
      buildPartnerModerationKeyboard(role)
    );
    return true;
  }

  if (action === "activate") {
    const res = await manualRestorePartner(env, targetId, chatId, null);
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

    await renderModerationPanel(
      env,
      chatId,
      session,
      `✅ Partner ${label} berhasil di-restore.\nStatus akhir: ${res.status}\nClass ID: ${classId}`,
      buildPartnerModerationKeyboard(role)
    );
    return true;
  }

  return false;
}
