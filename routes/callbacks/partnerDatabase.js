// routes/callbacks/partnerDatabase.js
import { sendMessage, editMessageReplyMarkup } from "../../services/telegramApi.js";
import { saveSession, clearSession } from "../../utils/session.js";
import { listProfilesAll, listProfilesByStatus } from "../../repositories/profilesRepo.js";

import {
  buildPartnerDatabaseKeyboard,
  buildBackToPartnerDatabaseKeyboard,
  buildBackToPartnerDatabaseViewKeyboard,
} from "./keyboards.js";

import { buildListMessageHtml, buildVerificatorMap } from "./shared.js";
import { CALLBACKS, CALLBACK_PREFIX, SESSION_MODES } from "../telegram.constants.js";

function normalizePartnerListKey(value) {
  const raw = String(value || "").trim().toLowerCase();

  if (raw === "all") {
    return {
      queryStatus: "all",
      title: "PARTNER (ALL)",
      showStatus: true,
    };
  }

  if (raw === "pending" || raw === "pending_approval") {
    return {
      queryStatus: "pending_approval",
      title: "PARTNER PENDING APPROVAL",
      showStatus: false,
    };
  }

  if (raw === "approved") {
    return {
      queryStatus: "approved",
      title: "PARTNER APPROVED",
      showStatus: false,
    };
  }

  if (raw === "suspended") {
    return {
      queryStatus: "suspended",
      title: "PARTNER SUSPENDED",
      showStatus: false,
    };
  }

  return null;
}

export function buildPartnerDatabaseHandlers() {
  const EXACT = {};
  const PREFIX = [];

  EXACT[CALLBACKS.PARTNER_DATABASE_MENU] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    if (msgChatId && msgId) {
      await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    }

    await sendMessage(env, adminId, "🗃️ <b>Partner Database</b>\nPilih menu di bawah:", {
      parse_mode: "HTML",
      reply_markup: buildPartnerDatabaseKeyboard(),
    });

    return true;
  };

  EXACT[CALLBACKS.PARTNER_DATABASE_VIEW] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;

    await saveSession(env, `state:${adminId}`, {
      mode: SESSION_MODES.PARTNER_VIEW,
      step: "await_target",
    });

    if (msgChatId && msgId) {
      await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    }

    await sendMessage(
      env,
      adminId,
      "🔎 <b>View Partner</b>\n\nKirim <b>@username</b> atau <b>telegram_id</b> target.\n\nKetik <b>batal</b> untuk keluar.",
      {
        parse_mode: "HTML",
        reply_markup: buildBackToPartnerDatabaseViewKeyboard(),
      }
    );

    return true;
  };

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_LIST),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;
      const rawKey = String(data.slice(CALLBACK_PREFIX.PM_LIST.length) || "").trim();
      const config = normalizePartnerListKey(rawKey);

      if (!config) {
        if (msgChatId && msgId) {
          await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
        }

        await sendMessage(env, adminId, "Menu tidak dikenal. Balik ke Partner Database.", {
          reply_markup: buildPartnerDatabaseKeyboard(),
        });

        return true;
      }

      let rows = [];

      if (config.queryStatus === "all") {
        rows = await listProfilesAll(env);
      } else {
        rows = await listProfilesByStatus(env, config.queryStatus);
      }

      if (!rows.length) {
        if (msgChatId && msgId) {
          await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
        }

        await sendMessage(env, adminId, `Tidak ada data untuk: ${config.title}`, {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });

        return true;
      }

      const verificatorMap = await buildVerificatorMap(env, rows).catch(() => new Map());

      if (msgChatId && msgId) {
        await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      }

      const text = buildListMessageHtml(config.title, rows, verificatorMap, {
        showStatus: config.showStatus,
      });

      await sendMessage(env, adminId, text, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: buildBackToPartnerDatabaseKeyboard(),
      });

      return true;
    },
  });

  return { EXACT, PREFIX };
}
