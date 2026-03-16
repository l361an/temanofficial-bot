// routes/callbacks/verification.js

import {
  sendMessage,
  editMessageReplyMarkup,
  editMessageCaption,
} from "../../services/telegramApi.js";

import {
  getProfileStatus,
  approveProfile,
  deleteProfileByTelegramId,
  getProfileFullByTelegramId,
} from "../../repositories/profilesRepo.js";

import { listAdmins, getAdminByTelegramId } from "../../repositories/adminsRepo.js";

import {
  buildMainKeyboard,
  buildVerificatorKeyboard,
  buildApproveRejectKeyboard,
} from "./keyboards.verification.js";

import { buildTeManMenuKeyboard } from "../telegram.commands.user.js";
import { CALLBACK_PREFIX } from "../telegram.constants.js";

async function setProfileVerificator(env, telegramId, verificatorAdminId) {
  await env.DB.prepare(`
    UPDATE profiles
    SET verificator_admin_id = ?
    WHERE telegram_id = ?
  `)
    .bind(String(verificatorAdminId), String(telegramId))
    .run();
}

async function getProfileVerificatorId(env, telegramId) {
  const row = await env.DB.prepare(`
    SELECT verificator_admin_id
    FROM profiles
    WHERE telegram_id = ?
    LIMIT 1
  `)
    .bind(String(telegramId))
    .first();

  return row?.verificator_admin_id
    ? String(row.verificator_admin_id)
    : null;
}

async function notifyOfficerNewPartner(env, telegramId) {
  const admins = await listAdmins(env, { activeOnly: true }).catch(() => []);

  for (const a of admins) {
    await sendMessage(
      env,
      a.telegram_id,
      `✅ Partner baru telah di-APPROVE\nTelegram ID: ${telegramId}`
    ).catch(() => {});
  }
}

export function buildVerificationHandlers() {
  const PREFIX = [];

  PREFIX.push({
    match: (d) =>
      d.startsWith(CALLBACK_PREFIX.PICK_VER) ||
      d.startsWith(CALLBACK_PREFIX.SET_VER),

    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;

      let telegramId = "";

      if (data.startsWith(CALLBACK_PREFIX.PICK_VER)) {
        telegramId = data.slice(CALLBACK_PREFIX.PICK_VER.length);
      }

      if (data.startsWith(CALLBACK_PREFIX.SET_VER)) {
        const payload = data.slice(CALLBACK_PREFIX.SET_VER.length);
        telegramId = payload.split(":")[0];
      }

      if (!telegramId) return true;

      const status = await getProfileStatus(env, telegramId);

      if (status !== "pending_approval") {
        await sendMessage(
          env,
          adminId,
          `⚠️ Partner sudah diproses.\nStatus: ${status}`
        );
        return true;
      }

      if (data.startsWith(CALLBACK_PREFIX.PICK_VER)) {
        const list = await listAdmins(env, { activeOnly: true });

        const reply_markup = buildVerificatorKeyboard(telegramId, list);

        await editMessageReplyMarkup(env, msgChatId, msgId, reply_markup);
        return true;
      }

      if (data.startsWith(CALLBACK_PREFIX.SET_VER)) {
        const payload = data.slice(CALLBACK_PREFIX.SET_VER.length);
        const verificatorId = payload.split(":")[1];

        await setProfileVerificator(env, telegramId, verificatorId);

        await sendMessage(
          env,
          adminId,
          `✅ Verificator diset.\nTelegram ID: ${telegramId}`,
          { reply_markup: buildApproveRejectKeyboard(telegramId) }
        );

        return true;
      }

      return true;
    },
  });

  PREFIX.push({
    match: (d) =>
      d.startsWith(CALLBACK_PREFIX.APPROVE) ||
      d.startsWith(CALLBACK_PREFIX.REJECT),

    run: async (ctx) => {
      const { env, data, adminId } = ctx;

      const isApprove = data.startsWith(CALLBACK_PREFIX.APPROVE);

      const telegramId = isApprove
        ? data.slice(CALLBACK_PREFIX.APPROVE.length)
        : data.slice(CALLBACK_PREFIX.REJECT.length);

      const status = await getProfileStatus(env, telegramId);

      if (status !== "pending_approval") {
        await sendMessage(
          env,
          adminId,
          `⚠️ Partner sudah diproses sebelumnya.\nStatus sekarang: ${status}`
        );
        return true;
      }

      if (isApprove) {
        const verificatorId = await getProfileVerificatorId(env, telegramId);

        if (!verificatorId) {
          await sendMessage(
            env,
            adminId,
            "⚠️ Pilih verificator dulu sebelum approve."
          );
          return true;
        }

        await approveProfile(env, telegramId, verificatorId);

        await sendMessage(
          env,
          telegramId,
          "🎉 Selamat! Akun partner kamu sudah di-APPROVE.",
          { reply_markup: buildTeManMenuKeyboard() }
        );

        await notifyOfficerNewPartner(env, telegramId);

        return true;
      }

      await deleteProfileByTelegramId(env, telegramId);

      await sendMessage(
        env,
        telegramId,
        "❌ Permintaan bergabung ditolak.",
        { reply_markup: buildTeManMenuKeyboard() }
      );

      return true;
    },
  });

  return { PREFIX };
}
