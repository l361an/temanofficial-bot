// routes/callbacks/partner.edit.handlers.js

import {
  sendMessage,
  editMessageReplyMarkup,
} from "../../services/telegramApi.js";

import { saveSession } from "../../utils/session.js";

import { getProfileFullByTelegramId } from "../../repositories/profilesRepo.js";

import {
  buildBackToPartnerDatabaseKeyboard,
} from "./keyboards.partner.js";

import { escapeHtml } from "./shared.js";
import { CALLBACK_PREFIX, SESSION_MODES } from "../telegram.constants.js";

import {
  loadCategoryOptions,
  buildCategoryPickerKeyboard,
} from "./partner.category.js";

import {
  buildBackAndHomeKeyboard,
} from "./partner.render.js";

import { encodeSelectedCategoryIds } from "./partner.utils.js";

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function canManagePartnerEdit(role) {
  const currentRole = normalizeRole(role);
  return currentRole === "owner" || currentRole === "superadmin";
}

function getPartnerEditFieldMeta(field) {
  const key = String(field || "").trim();

  if (key === "nama_lengkap") {
    return {
      key,
      currentKey: "nama_lengkap",
      label: "Nama Lengkap",
      prompt: "Kirim nama lengkap baru",
    };
  }

  if (key === "nickname") {
    return {
      key,
      currentKey: "nickname",
      label: "Nickname",
      prompt: "Kirim nickname baru",
    };
  }

  if (key === "no_whatsapp") {
    return {
      key,
      currentKey: "no_whatsapp",
      label: "Whatsapp",
      prompt: "Kirim nomor Whatsapp baru",
    };
  }

  if (key === "nik") {
    return {
      key,
      currentKey: "nik",
      label: "NIK",
      prompt: "Kirim NIK baru",
    };
  }

  if (key === "kecamatan") {
    return {
      key,
      currentKey: "kecamatan",
      label: "Kecamatan",
      prompt: "Kirim kecamatan baru",
    };
  }

  if (key === "kota") {
    return {
      key,
      currentKey: "kota",
      label: "Kota",
      prompt: "Kirim kota baru",
    };
  }

  if (key === "channel_url") {
    return {
      key,
      currentKey: "channel_url",
      label: "Channel",
      prompt: "Kirim link channel Telegram baru. Contoh: https://t.me/namachannel atau @namachannel",
    };
  }

  return null;
}

export function buildPartnerEditDomainHandlers() {
  const EXACT = {};
  const PREFIX = [];

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_EDIT_START),
    run: async (ctx) => {
      const { env, data, adminId, role, msgChatId, msgId } = ctx;

      if (!canManagePartnerEdit(role)) {
        await sendMessage(
          env,
          adminId,
          "⚠️ Hanya owner / superadmin yang bisa mengubah data partner.",
          {
            reply_markup: buildBackToPartnerDatabaseKeyboard(),
          }
        );
        return true;
      }

      const payload = String(
        data.slice(CALLBACK_PREFIX.PM_EDIT_START.length) || ""
      );

      const [telegramId, field] = payload.split(":");

      if (!telegramId || !field) {
        await sendMessage(env, adminId, "⚠️ Target partner / field tidak valid.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const profile = await getProfileFullByTelegramId(env, telegramId);

      if (!profile) {
        await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      if (field === "category") {
        const categories = await loadCategoryOptions(env);

        if (!categories.length) {
          await sendMessage(env, adminId, "⚠️ Belum ada category yang tersedia.", {
            reply_markup: buildBackAndHomeKeyboard(profile.telegram_id),
          });
          return true;
        }

        const selectedIds = profile?.id
          ? await env.DB.prepare(`
              SELECT category_id
              FROM profile_categories
              WHERE profile_id = ?
              ORDER BY category_id ASC
            `)
              .bind(String(profile.id))
              .all()
              .then((res) => (res?.results || []).map((r) => String(r.category_id)))
              .catch(() => [])
          : [];

        await saveSession(env, `state:${adminId}`, {
          mode: "partner_edit_category",
          targetTelegramId: profile.telegram_id,
          categoryIds: encodeSelectedCategoryIds(selectedIds),
        });

        if (msgChatId && msgId) {
          await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
        }

        await sendMessage(
          env,
          adminId,
          `🗂️ <b>Edit Category</b>\n\n` +
            `Partner: <b>${escapeHtml(profile.nama_lengkap || "-")}</b>\n` +
            `Telegram ID: <code>${escapeHtml(profile.telegram_id || "-")}</code>\n\n` +
            `Pilih Category di bawah:`,
          {
            parse_mode: "HTML",
            reply_markup: buildCategoryPickerKeyboard(
              profile.telegram_id,
              categories,
              selectedIds
            ),
          }
        );

        return true;
      }

      const meta = getPartnerEditFieldMeta(field);

      if (!meta) {
        await sendMessage(env, adminId, "⚠️ Field partner tidak didukung.", {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      await saveSession(env, `state:${adminId}`, {
        mode: SESSION_MODES.PARTNER_EDIT_TEXT,
        targetTelegramId: profile.telegram_id,
        field: meta.key,
      });

      if (msgChatId && msgId) {
        await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      }

      const currentValue =
        profile?.[meta.currentKey] == null || String(profile?.[meta.currentKey]).trim() === ""
          ? "-"
          : String(profile?.[meta.currentKey]);

      await sendMessage(
        env,
        adminId,
        `📝 <b>Edit ${escapeHtml(meta.label)}</b>\n\n` +
          `Partner: <b>${escapeHtml(profile.nama_lengkap || "-")}</b>\n` +
          `Telegram ID: <code>${escapeHtml(profile.telegram_id || "-")}</code>\n` +
          `Current: <code>${escapeHtml(currentValue)}</code>\n\n` +
          `${escapeHtml(meta.prompt)}.\n` +
          `Ketik <b>-</b> untuk kosongkan field.\n\n` +
          `Ketik <b>batal</b> untuk keluar.`,
        {
          parse_mode: "HTML",
          reply_markup: buildBackAndHomeKeyboard(profile.telegram_id),
        }
      );

      return true;
    },
  });

  return { EXACT, PREFIX };
}
