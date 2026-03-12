// routes/callbacks/verification.js
import { sendMessage, editMessageReplyMarkup, editMessageCaption } from "../../services/telegramApi.js";
import { uploadKtpToR2OnApprove } from "../../services/ktpR2.js";

import { getSetting } from "../../repositories/settingsRepo.js";
import {
  getProfileStatus,
  approveProfile,
  deleteProfileByTelegramId,
  getProfileFullByTelegramId,
} from "../../repositories/profilesRepo.js";
import { listActiveVerificators, getAdminByTelegramId } from "../../repositories/adminsRepo.js";

import {
  buildMainKeyboard,
  buildVerificatorKeyboard,
  buildApproveRejectKeyboard,
} from "./keyboards.verification.js";
import { buildTeManMenuKeyboard } from "../telegram.commands.user.js";
import { CALLBACK_PREFIX, CALLBACKS } from "../telegram.constants.js";
import { markRegistrationApproved } from "../../services/partnerStatusService.js";
import { syncPartnerGroupRole } from "../../services/partnerGroupRoleService.js";
import { fmtClassId } from "../../utils/partnerHelpers.js";

function upsertVerificatorLine(caption, label) {
  const raw = String(caption || "");
  const line = `Verificator: ${label}`;
  const replaced = raw.replace(/^Verificator\s*:\s*.*$/im, line);
  if (replaced !== raw) return replaced;
  if (!raw.trim()) return line;
  return `${raw}\n\n${line}`;
}

function buildOfficerHomeOnlyKeyboard() {
  return {
    inline_keyboard: [[{ text: "🏠 Officer Home", callback_data: CALLBACKS.OFFICER_HOME }]],
  };
}

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
  const v = row?.verificator_admin_id;
  return v ? String(v) : null;
}

export function buildVerificationHandlers() {
  const PREFIX = [];

  PREFIX.push({
    match: (d) =>
      d.startsWith(CALLBACK_PREFIX.PICK_VER) ||
      d.startsWith(CALLBACK_PREFIX.SET_VER) ||
      d.startsWith(CALLBACK_PREFIX.BACK_VER),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId, msg } = ctx;

      let action = "";
      let telegramId = "";

      if (data.startsWith(CALLBACK_PREFIX.PICK_VER)) {
        action = "pickver";
        telegramId = data.slice(CALLBACK_PREFIX.PICK_VER.length);
      } else if (data.startsWith(CALLBACK_PREFIX.BACK_VER)) {
        action = "backver";
        telegramId = data.slice(CALLBACK_PREFIX.BACK_VER.length);
      } else if (data.startsWith(CALLBACK_PREFIX.SET_VER)) {
        action = "setver";
        const payload = data.slice(CALLBACK_PREFIX.SET_VER.length);
        telegramId = payload.split(":")[0] || "";
      }

      if (!telegramId) return true;

      const status = await getProfileStatus(env, telegramId);
      if (!status) {
        if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
        await sendMessage(env, adminId, `⚠️ Data partner tidak ditemukan.\nTelegram ID: ${telegramId}`);
        return true;
      }
      if (status !== "pending_approval") {
        if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
        await sendMessage(env, adminId, `⚠️ Tidak bisa diubah. Status saat ini: ${status}\nTelegram ID: ${telegramId}`);
        return true;
      }

      if (action === "pickver") {
        const list = await listActiveVerificators(env);
        if (!list.length) {
          await sendMessage(env, adminId, "⚠️ Tidak ada verificator aktif di tabel admins.");
          return true;
        }
        const reply_markup = buildVerificatorKeyboard(telegramId, list);
        if (msgChatId && msgId) {
          await editMessageReplyMarkup(env, msgChatId, msgId, reply_markup).catch(() => {});
        } else {
          await sendMessage(env, adminId, `Pilih verificator untuk Telegram ID: ${telegramId}`, { reply_markup });
        }
        return true;
      }

      if (action === "backver") {
        if (msgChatId && msgId) {
          await editMessageReplyMarkup(env, msgChatId, msgId, buildMainKeyboard(telegramId)).catch(() => {});
        }
        return true;
      }

      if (action === "setver") {
        const payload = data.slice(CALLBACK_PREFIX.SET_VER.length);
        const verificatorId = payload.split(":")[1] || "";
        if (!verificatorId) return true;

        const adminRow = await getAdminByTelegramId(env, verificatorId);
        if (!adminRow) {
          await sendMessage(env, adminId, "⚠️ Verificator tidak ditemukan di tabel admins.");
          return true;
        }
        if (!(adminRow.normRole === "admin" || adminRow.normRole === "superadmin")) {
          await sendMessage(env, adminId, "⚠️ Role ini tidak bisa jadi verificator.");
          return true;
        }

        await setProfileVerificator(env, telegramId, verificatorId);

        if (msgChatId && msgId) {
          const oldCaption = msg?.caption || "";
          const newCaption = upsertVerificatorLine(oldCaption, adminRow.label);
          await editMessageCaption(env, msgChatId, msgId, newCaption).catch(() => {});
          await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
        }

        await sendMessage(env, adminId, `✅ Verificator diset: ${adminRow.label}\nTelegram ID partner: ${telegramId}`, {
          reply_markup: buildApproveRejectKeyboard(telegramId),
        });
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
      const { env, data, adminId, msgChatId, msgId, msg } = ctx;

      const isApprove = data.startsWith(CALLBACK_PREFIX.APPROVE);
      const action = isApprove ? "approve" : "reject";
      const telegramId = isApprove
        ? data.slice(CALLBACK_PREFIX.APPROVE.length)
        : data.slice(CALLBACK_PREFIX.REJECT.length);

      if (!telegramId) return true;

      const status = await getProfileStatus(env, telegramId);
      if (!status) {
        if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
        await sendMessage(env, adminId, `⚠️ Data partner tidak ditemukan.\nTelegram ID: ${telegramId}`);
        return true;
      }
      if (status !== "pending_approval") {
        if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
        await sendMessage(env, adminId, `⚠️ Tidak bisa diproses. Status saat ini: ${status}\nTelegram ID: ${telegramId}`);
        return true;
      }

      if (action === "approve") {
        const verificatorId = await getProfileVerificatorId(env, telegramId);
        if (!verificatorId) {
          await sendMessage(env, adminId, "⚠️ Belum ada verificator.\nSilakan klik tombol 👤 Pilih Verificator dulu, lalu Approve.");
          return true;
        }

        const profile = await getProfileFullByTelegramId(env, telegramId);
        if (!profile) {
          await sendMessage(env, adminId, `⚠️ Data partner tidak ditemukan.\nTelegram ID: ${telegramId}`);
          return true;
        }

        await approveProfile(env, telegramId, verificatorId);
        const approvedRes = await markRegistrationApproved(env, telegramId, verificatorId);

        const groupRoleSync = await syncPartnerGroupRole(env, telegramId).catch((error) => ({
          ok: false,
          reason: error?.message || String(error),
        }));

        try {
          const up = await uploadKtpToR2OnApprove(env, telegramId);
          await sendMessage(env, adminId, `☁️ Backup KTP ke R2: ${up.skipped ? "SKIP" : "OK"}\nKey: ${up.key}`);
        } catch (e) {
          await sendMessage(env, adminId, `⚠️ Backup KTP ke R2 GAGAL\nTelegram ID: ${telegramId}`);
        }

        const vRow = await getAdminByTelegramId(env, verificatorId);
        const vLabel = vRow?.label || "-";
        const classLabel = fmtClassId(profile.class_id);

        await sendMessage(
          env,
          telegramId,
          approvedRes.user_message,
          { reply_markup: buildTeManMenuKeyboard() }
        ).catch(() => {});

        await sendMessage(
          env,
          adminId,
          [
            `✅ APPROVED`,
            `Telegram ID: ${telegramId}`,
            `Status akhir: approved`,
            `Class ID: ${classLabel}`,
            `Verificator: ${vLabel}`,
            ``,
            `Group role sync: ${groupRoleSync?.ok ? "OK" : "FAILED"}`,
          ].join("\n"),
          {
            reply_markup: buildOfficerHomeOnlyKeyboard(),
          }
        );

        if (msgChatId && msgId) {
          await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
          const oldCaption = msg?.caption || "";
          await editMessageCaption(env, msgChatId, msgId, `${oldCaption}\n\n✅ APPROVED`).catch(() => {});
        }
        return true;
      }

      if (action === "reject") {
        await deleteProfileByTelegramId(env, telegramId);

        await sendMessage(
          env,
          telegramId,
          "❌ Permintaan Bergabung Ditolak.\nSilakan daftar ulang jika ingin mengajukan kembali.",
          { reply_markup: buildTeManMenuKeyboard() }
        ).catch(() => {});

        await sendMessage(env, adminId, `❌ REGISTRATION REJECTED & DELETED\nTelegram ID: ${telegramId}`);

        if (msgChatId && msgId) {
          await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
          const oldCaption = msg?.caption || "";
          await editMessageCaption(env, msgChatId, msgId, `${oldCaption}\n\n❌ REGISTRATION REJECTED`).catch(() => {});
        }
        return true;
      }

      return true;
    },
  });

  return { PREFIX };
}
