// routes/callbacks/verification.js
import { sendMessage, editMessageReplyMarkup, editMessageCaption } from "../../services/telegramApi.js";
import { uploadKtpToR2OnApprove } from "../../services/ktpR2.js";

import { getSetting } from "../../repositories/settingsRepo.js";
import { getProfileStatus, approveProfile, rejectProfile } from "../../repositories/profilesRepo.js";
import { listActiveVerificators, getAdminByTelegramId } from "../../repositories/adminsRepo.js";

import { buildMainKeyboard, buildVerificatorKeyboard, buildApproveRejectKeyboard } from "./keyboards.js";

// ini memang ada di file callback kamu sebelumnya :contentReference[oaicite:1]{index=1}
import { buildTeManMenuKeyboard } from "../telegram.commands.user.js";

function upsertVerificatorLine(caption, label) {
  const raw = String(caption || "");
  const line = `Verificator: ${label}`;
  const replaced = raw.replace(/^Verificator\s*:\s*.*$/im, line);
  if (replaced !== raw) return replaced;
  if (!raw.trim()) return line;
  return `${raw}\n\n${line}`;
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

  // pickver/setver/backver
  PREFIX.push({
    match: (d) => d.startsWith("pickver:") || d.startsWith("setver:") || d.startsWith("backver:"),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId, msg } = ctx;
      const parts = data.split(":");
      const action = parts[0];
      const telegramId = parts[1];
      if (!telegramId) return true;

      const status = await getProfileStatus(env, telegramId);
      if (!status) {
        if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
        await sendMessage(env, adminId, `⚠️ Data partner tidak ditemukan.\nTelegram ID: ${telegramId}`);
        return true;
      }
      if (status !== "pending") {
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
        if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, reply_markup).catch(() => {});
        else await sendMessage(env, adminId, `Pilih verificator untuk Telegram ID: ${telegramId}`, { reply_markup });
        return true;
      }

      if (action === "backver") {
        if (msgChatId && msgId) {
          await editMessageReplyMarkup(env, msgChatId, msgId, buildMainKeyboard(telegramId)).catch(() => {});
        }
        return true;
      }

      if (action === "setver") {
        const verificatorId = parts[2];
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

  // approve/reject
  PREFIX.push({
    match: (d) => d.startsWith("approve:") || d.startsWith("reject:"),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId, msg } = ctx;
      const [action, telegramId] = data.split(":");
      if (!telegramId) return true;

      const status = await getProfileStatus(env, telegramId);
      if (!status) {
        if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
        await sendMessage(env, adminId, `⚠️ Data partner tidak ditemukan.\nTelegram ID: ${telegramId}`);
        return true;
      }
      if (status !== "pending") {
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

        await approveProfile(env, telegramId, verificatorId);

        try {
          const up = await uploadKtpToR2OnApprove(env, telegramId);
          await sendMessage(env, adminId, `☁️ Backup KTP ke R2: ${up.skipped ? "SKIP" : "OK"}\nKey: ${up.key}`);
        } catch (e) {
          await sendMessage(env, adminId, `⚠️ Backup KTP ke R2 GAGAL\nTelegram ID: ${telegramId}`);
        }

        const link = (await getSetting(env, "link_aturan")) ?? "-";
        const vRow = await getAdminByTelegramId(env, verificatorId);
        const vLabel = vRow?.label || "-";

        await sendMessage(
          env,
          telegramId,
          `✅ Permintaan Bergabung Disetujui!\n\nVerificator kamu adalah : ${vLabel}\n\nSilakan baca aturan TeMan:\n${link}`,
          { reply_markup: buildTeManMenuKeyboard(), disable_web_page_preview: true }
        );

        await sendMessage(env, adminId, `✅ APPROVED\nTelegram ID: ${telegramId}\nLink aturan: ${link}\nVerificator: ${vLabel}`);

        if (msgChatId && msgId) {
          await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
          const oldCaption = msg?.caption || "";
          await editMessageCaption(env, msgChatId, msgId, `${oldCaption}\n\n✅ APPROVED`).catch(() => {});
        }
        return true;
      }

      if (action === "reject") {
        await rejectProfile(env, telegramId);

        await sendMessage(env, telegramId, "❌ Permintaan Bergabung Ditolak.\nSilakan hubungi admin.", {
          reply_markup: buildTeManMenuKeyboard(),
        });

        await sendMessage(env, adminId, `❌ REJECTED\nTelegram ID: ${telegramId}`);

        if (msgChatId && msgId) {
          await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
          const oldCaption = msg?.caption || "";
          await editMessageCaption(env, msgChatId, msgId, `${oldCaption}\n\n❌ REJECTED`).catch(() => {});
        }
        return true;
      }

      return true;
    },
  });

  return { PREFIX };
}
