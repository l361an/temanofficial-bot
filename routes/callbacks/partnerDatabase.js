// routes/callbacks/partnerDatabase.js
import { sendMessage, upsertCallbackMessage } from "../../services/telegramApi.js";
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
    const { env, adminId, msg } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    const text = "🗃️ <b>Partner Database</b>\nPilih menu di bawah:";
    const extra = {
      parse_mode: "HTML",
      reply_markup: buildPartnerDatabaseKeyboard(),
    };

    if (msg) {
      await upsertCallbackMessage(env, msg, text, extra).catch(async () => {
        await sendMessage(env, adminId, text, extra);
      });
      return true;
    }

    await sendMessage(env, adminId, text, extra);
    return true;
  };

  EXACT[CALLBACKS.PARTNER_DATABASE_VIEW] = async (ctx) => {
    const { env, adminId, msg } = ctx;

    await saveSession(env, `state:${adminId}`, {
      mode: SESSION_MODES.PARTNER_VIEW,
      step: "await_target",
    });

    const text =
      "🔎 <b>View Partner</b>\n\n" +
      "Kirim <b>@username</b> atau <b>telegram_id</b> target.\n\n" +
      "Ketik <b>batal</b> untuk keluar.";

    const extra = {
      parse_mode: "HTML",
      reply_markup: buildBackToPartnerDatabaseViewKeyboard(),
    };

    if (msg) {
      await upsertCallbackMessage(env, msg, text, extra).catch(async () => {
        await sendMessage(env, adminId, text, extra);
      });
      return true;
    }

    await sendMessage(env, adminId, text, extra);
    return true;
  };

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_LIST),
    run: async (ctx) => {
      const { env, data, adminId, msg } = ctx;
      const rawKey = String(data.slice(CALLBACK_PREFIX.PM_LIST.length) || "").trim();
      const config = normalizePartnerListKey(rawKey);

      if (!config) {
        const text = "Menu tidak dikenal. Balik ke Partner Database.";
        const extra = {
          reply_markup: buildPartnerDatabaseKeyboard(),
        };

        if (msg) {
          await upsertCallbackMessage(env, msg, text, extra).catch(async () => {
            await sendMessage(env, adminId, text, extra);
          });
          return true;
        }

        await sendMessage(env, adminId, text, extra);
        return true;
      }

      let rows = [];

      if (config.queryStatus === "all") {
        rows = await listProfilesAll(env);
      } else {
        rows = await listProfilesByStatus(env, config.queryStatus);
      }

      if (!rows.length) {
        const text = `Tidak ada data untuk: ${config.title}`;
        const extra = {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        };

        if (msg) {
          await upsertCallbackMessage(env, msg, text, extra).catch(async () => {
            await sendMessage(env, adminId, text, extra);
          });
          return true;
        }

        await sendMessage(env, adminId, text, extra);
        return true;
      }

      const verificatorMap = await buildVerificatorMap(env, rows).catch(() => new Map());

      const text = buildListMessageHtml(config.title, rows, verificatorMap, {
        showStatus: config.showStatus,
      });

      const extra = {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: buildBackToPartnerDatabaseKeyboard(),
      };

      if (msg) {
        await upsertCallbackMessage(env, msg, text, extra).catch(async () => {
          await sendMessage(env, adminId, text, extra);
        });
        return true;
      }

      await sendMessage(env, adminId, text, extra);
      return true;
    },
  });

  return { EXACT, PREFIX };
}
