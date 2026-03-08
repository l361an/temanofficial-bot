// routes/telegram.js

import { json } from "../utils/response.js";
import { parseMessage } from "../utils/parseTelegram.js";
import { loadSession, clearSession } from "../utils/session.js";
import { sendMessage } from "../services/telegramApi.js";

import { getAdminRole } from "../repositories/adminsRepo.js";
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
import { handlePartnerModerationInput } from "./telegram.flow.partnerModeration.js";
import { handlePartnerViewInput } from "./telegram.flow.partnerView.js";
import { handlePartnerCloseupInput } from "./telegram.flow.partnerCloseup.js";
import { handleSuperadminConfigInput } from "./telegram.flow.superadminConfig.js";
import { handleSuperadminCategoryInput } from "./telegram.flow.superadminCategory.js";
import { handlePaymentProofUpload } from "./telegram.flow.paymentProof.js";

import {
  getProfileFullByTelegramId,
  syncProfileUsernameFromTelegram,
} from "../repositories/profilesRepo.js";
import {
  buildHelpText,
  buildOfficerIdleText,
} from "./telegram.messages.js";
import { SESSION_MODES } from "./telegram.constants.js";

function isRegistrationPhotoStep(session) {
  const step = String(session?.step || "").trim().toLowerCase();
  return ["upload_closeup", "upload_fullbody", "upload_ktp"].includes(step);
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

    if (text && text.startsWith("/")) {
      const raw = String(text || "").trim();
      const baseCmd = raw.split(/\s+/)[0].split("@")[0];

      if (baseCmd === "/help" || baseCmd === "/cmd") {
        await sendMessage(env, chatId, buildHelpText(role), { parse_mode: "HTML" });
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

    const session = await loadSession(env, STATE_KEY);

    if (isAdminRole(role)) {
      if (session?.mode === SESSION_MODES.PARTNER_MODERATION) {
        await handlePartnerModerationInput({ env, chatId, text, session, STATE_KEY });
        return json({ ok: true });
      }

      if (session?.mode === SESSION_MODES.PARTNER_VIEW) {
        await handlePartnerViewInput({ env, chatId, text, STATE_KEY, role });
        return json({ ok: true });
      }

      if (session?.mode === SESSION_MODES.PARTNER_EDIT_CLOSEUP) {
        await handlePartnerCloseupInput({ env, chatId, text, session, STATE_KEY, role, update });
        return json({ ok: true });
      }

      if (session?.mode === SESSION_MODES.SA_CONFIG) {
        if (!isSuperadminRole(role)) {
          await clearSession(env, STATE_KEY);
          await sendMessage(env, chatId, "⛔ Aksi ini hanya untuk Superadmin.");
          return json({ ok: true });
        }
        await handleSuperadminConfigInput({ env, chatId, telegramId, text, session, STATE_KEY });
        return json({ ok: true });
      }

      if (session?.mode === SESSION_MODES.SA_CATEGORY) {
        if (!isSuperadminRole(role)) {
          await clearSession(env, STATE_KEY);
          await sendMessage(env, chatId, "⛔ Aksi ini hanya untuk Superadmin.");
          return json({ ok: true });
        }
        await handleSuperadminCategoryInput({ env, chatId, text, session, STATE_KEY });
        return json({ ok: true });
      }

      if (!session) {
        await sendMessage(env, chatId, buildOfficerIdleText());
        return json({ ok: true });
      }
    }

    if (!isAdminRole(role)) {
      if (session?.mode === SESSION_MODES.EDIT_PROFILE) {
        await handleUserEditFlow({ env, chatId, telegramId, username, text, session, STATE_KEY, update });
        return json({ ok: true });
      }

      if (session) {
        const handledRegistration = await handleRegistrationFlow({
          update,
          env,
          chatId,
          telegramId,
          username,
          text,
          session,
          STATE_KEY,
        });

        if (handledRegistration) {
          return json({ ok: true });
        }
      }

      if (update?.message?.photo && !isRegistrationPhotoStep(session)) {
        const handledPaymentProof = await handlePaymentProofUpload({
          env,
          chatId,
          telegramId,
          update,
        });

        if (handledPaymentProof) {
          return json({ ok: true });
        }
      }

      if (!session) {
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
    }

    if (session?.mode === SESSION_MODES.EDIT_PROFILE) {
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
