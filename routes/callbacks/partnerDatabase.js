// routes/callbacks/partnerDatabase.js
import { sendMessage, upsertCallbackMessage } from "../../services/telegramApi.js";
import { clearSession } from "../../utils/session.js";
import {
  listProfilesAll,
  listProfilesByStatus,
} from "../../repositories/profilesRepo.js";

import {
  buildPartnerDatabaseKeyboard,
  buildBackToPartnerDatabaseKeyboard,
  buildBackToPartnerDatabaseViewKeyboard,
} from "./keyboards.js";

import {
  buildListMessageHtml,
  buildVerificatorMap,
} from "./shared.js";

import { CALLBACKS, CALLBACK_PREFIX } from "../telegram.constants.js";
import { resolveTelegramId } from "../../utils/partnerHelpers.js";

import {
  persistPartnerViewSession,
  resolveTargetTelegramId,
} from "./partnerDatabase.session.js";

import {
  renderPartnerControlPanel,
  renderPartnerDetailsPage,
  renderPartnerSubscriptionPage,
  renderPartnerDatabaseMessage,
  buildPartnerViewPromptText,
} from "./partnerDatabase.render.js";

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

export async function handlePartnerViewSearchInput({
  env,
  chatId,
  adminId,
  text,
  role,
  session,
  STATE_KEY,
}) {
  const raw = String(text || "").trim();

  if (/^(batal|cancel|keluar)$/i.test(raw)) {
    await clearSession(env, STATE_KEY);
    await renderPartnerDatabaseMessage(
      env,
      adminId,
      "✅ Oke, sesi View Partner dibatalkan.",
      buildPartnerDatabaseKeyboard(role),
      { session }
    );
    return true;
  }

  const targetId = await resolveTelegramId(env, raw);
  if (!targetId) {
    await renderPartnerDatabaseMessage(
      env,
      adminId,
      "⚠️ Target tidak valid / tidak ditemukan.\nKirim <b>@username</b> atau <b>telegram_id</b> ya.\n\nKetik <b>batal</b> untuk keluar.",
      buildBackToPartnerDatabaseViewKeyboard(role),
      { session }
    );
    return true;
  }

  return renderPartnerControlPanel(env, adminId || chatId, targetId, role, {
    session,
    selectedInput: raw,
  });
}

export function buildPartnerDatabaseHandlers() {
  const EXACT = {};
  const PREFIX = [];

  EXACT[CALLBACKS.PARTNER_DATABASE_MENU] = async (ctx) => {
    const { env, adminId, msg, role } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    const text = "🗃️ <b>Partner Database</b>\nPilih menu di bawah:";
    const extra = {
      parse_mode: "HTML",
      reply_markup: buildPartnerDatabaseKeyboard(role),
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
    const { env, adminId, msg, role } = ctx;

    await persistPartnerViewSession(
      env,
      adminId,
      null,
      { step: "await_target" },
      msg
    );

    const text = buildPartnerViewPromptText();
    const extra = {
      parse_mode: "HTML",
      reply_markup: buildBackToPartnerDatabaseViewKeyboard(role),
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
      const { env, data, adminId, msg, role } = ctx;
      const rawKey = String(data.slice(CALLBACK_PREFIX.PM_LIST.length) || "").trim();
      const config = normalizePartnerListKey(rawKey);

      if (!config) {
        const text = "Menu tidak dikenal. Balik ke Partner Database.";
        const extra = { reply_markup: buildPartnerDatabaseKeyboard(role) };

        if (msg) {
          await upsertCallbackMessage(env, msg, text, extra).catch(async () => {
            await sendMessage(env, adminId, text, extra);
          });
          return true;
        }

        await sendMessage(env, adminId, text, extra);
        return true;
      }

      const rows =
        config.queryStatus === "all"
          ? await listProfilesAll(env)
          : await listProfilesByStatus(env, config.queryStatus);

      if (!rows.length) {
        const text = `Tidak ada data untuk: ${config.title}`;
        const extra = { reply_markup: buildBackToPartnerDatabaseKeyboard(role) };

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
        reply_markup: buildBackToPartnerDatabaseKeyboard(role),
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

  /**
   * FIX BUG:
   * BACK harus diproses dulu sebelum OPEN
   * supaya pm:panel:back:XXXX tidak ditangkap pm:panel:
   */
  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_PANEL_BACK),
    run: async (ctx) => {
      const { env, data, adminId, msg, role, session } = ctx;

      const telegramId = resolveTargetTelegramId(
        String(data.slice(CALLBACK_PREFIX.PM_PANEL_BACK.length) || "").trim(),
        session
      );

      if (!telegramId) {
        await renderPartnerDatabaseMessage(
          env,
          adminId,
          "⚠️ Data partner tidak ditemukan.",
          buildPartnerDatabaseKeyboard(role),
          { session, fallbackMessage: msg }
        );
        return true;
      }

      await renderPartnerControlPanel(env, adminId, telegramId, role, {
        session,
        fallbackMessage: msg,
      });

      return true;
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_PANEL_OPEN),
    run: async (ctx) => {
      const { env, data, adminId, msg, role, session } = ctx;

      const telegramId = resolveTargetTelegramId(
        String(data.slice(CALLBACK_PREFIX.PM_PANEL_OPEN.length) || "").trim(),
        session
      );

      if (!telegramId) {
        await renderPartnerDatabaseMessage(
          env,
          adminId,
          "⚠️ Target partner tidak valid.",
          buildPartnerDatabaseKeyboard(role),
          { session, fallbackMessage: msg }
        );
        return true;
      }

      await renderPartnerControlPanel(env, adminId, telegramId, role, {
        session,
        fallbackMessage: msg,
      });

      return true;
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_DETAILS_OPEN),
    run: async (ctx) => {
      const { env, data, adminId, msg, role, session } = ctx;

      const telegramId = resolveTargetTelegramId(
        String(data.slice(CALLBACK_PREFIX.PM_DETAILS_OPEN.length) || "").trim(),
        session
      );

      if (!telegramId) {
        await renderPartnerDatabaseMessage(
          env,
          adminId,
          "⚠️ Target partner tidak valid.",
          buildPartnerDatabaseKeyboard(role),
          { session, fallbackMessage: msg }
        );
        return true;
      }

      await renderPartnerDetailsPage(env, adminId, telegramId, role, {
        session,
        fallbackMessage: msg,
      });

      return true;
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_SUBSCRIPTION_OPEN),
    run: async (ctx) => {
      const { env, data, adminId, msg, role, session } = ctx;

      const telegramId = resolveTargetTelegramId(
        String(data.slice(CALLBACK_PREFIX.PM_SUBSCRIPTION_OPEN.length) || "").trim(),
        session
      );

      if (!telegramId) {
        await renderPartnerDatabaseMessage(
          env,
          adminId,
          "⚠️ Target partner tidak valid.",
          buildPartnerDatabaseKeyboard(role),
          { session, fallbackMessage: msg }
        );
        return true;
      }

      await renderPartnerSubscriptionPage(env, adminId, telegramId, role, {
        session,
        fallbackMessage: msg,
      });

      return true;
    },
  });

  return { EXACT, PREFIX };
}
