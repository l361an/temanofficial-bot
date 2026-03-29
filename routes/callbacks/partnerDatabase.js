import { sendMessage, upsertCallbackMessage } from "../../services/telegramApi.js";
import { clearSession } from "../../utils/session.js";
import {
  listProfilesAll,
  listProfilesByStatus,
} from "../../repositories/profilesRepo.js";

import {
  buildPartnerDatabaseKeyboard,
  buildBackToPartnerDatabaseKeyboard,
  buildPartnerSubscriptionAdjustInputKeyboard,
} from "./keyboards.partner.js";

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
import { adjustPartnerSubscriptionByDays } from "../../services/subscriptionAdjustmentService.js";

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function isOwnerRole(role) {
  return normalizeRole(role) === "owner";
}

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

function normalizeSubscriptionAdjustAction(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "add" || raw === "reduce") return raw;
  return "";
}

function buildSubscriptionAdjustPromptText(action, telegramId) {
  const isAdd = action === "add";
  const title = isAdd ? "➕ <b>Tambah Masa Aktif</b>" : "➖ <b>Kurangi Masa Aktif</b>";
  const example = isAdd ? "<code>7 bonus libur nasional</code>" : "<code>2 koreksi input sebelumnya</code>";

  return [
    title,
    `Target : <code>${String(telegramId || "-")}</code>`,
    "",
    "Kirim format:",
    example,
    "",
    "• angka wajib positif",
    "• catatan opsional tapi sangat disarankan",
    "",
    "Ketik <b>batal</b> untuk kembali.",
  ].join("\n");
}

function parseSubscriptionAdjustInput(text) {
  const raw = String(text || "").trim();
  const match = raw.match(/^(\d+)(?:\s+([\s\S]+))?$/);
  if (!match) {
    return { ok: false, reason: "invalid_format" };
  }

  const days = Number(match[1]);
  if (!Number.isFinite(days) || !Number.isInteger(days) || days <= 0) {
    return { ok: false, reason: "invalid_days" };
  }

  return {
    ok: true,
    days,
    note: String(match[2] || "").trim() || null,
  };
}

function buildSubscriptionAdjustValidationText(action) {
  const example = action === "add"
    ? "<code>7 bonus libur nasional</code>"
    : "<code>2 koreksi input sebelumnya</code>";

  return [
    "⚠️ Format input tidak valid.",
    "",
    "Pakai format:",
    example,
    "",
    "Ketik <b>batal</b> untuk kembali.",
  ].join("\n");
}

function buildSubscriptionAdjustFailureNotice(result) {
  const reason = String(result?.reason || "").trim().toLowerCase();

  if (reason === "forbidden_owner_only") {
    return "⚠️ <b>Fitur ini khusus owner.</b>";
  }

  if (reason === "partner_not_found") {
    return "⚠️ Target partner tidak ditemukan.";
  }

  if (reason === "no_active_coverage_to_reduce") {
    return "⚠️ Tidak ada masa aktif yang bisa dikurangi karena partner sedang tidak aktif.";
  }

  if (reason === "reduction_would_end_now_or_past") {
    const maxReducibleDays = Number(result?.max_reducible_days || 0);
    if (maxReducibleDays > 0) {
      return `⚠️ Pengurangan terlalu besar. Maksimal pengurangan aman saat ini: <b>${maxReducibleDays} hari</b>.`;
    }

    return "⚠️ Pengurangan ditolak karena hasil akhirnya akan membuat masa aktif habis sekarang / lewat sekarang.";
  }

  if (reason === "invalid_days") {
    return "⚠️ Jumlah hari tidak valid.";
  }

  return "⚠️ Gagal memproses adjustment masa aktif.";
}

function readSubscriptionAdjustNoticeHtml(result) {
  if (!result || typeof result !== "object") return "";
  if (!("ok" in result) || result.ok !== true) return "";
  if (!("notice_html" in result)) return "";

  return typeof result.notice_html === "string" ? result.notice_html : "";
}

async function startSubscriptionAdjustFlow({
  env,
  adminId,
  telegramId,
  role,
  action,
  session,
  msg,
}) {
  if (!isOwnerRole(role)) {
    return renderPartnerSubscriptionPage(env, adminId, telegramId, role, {
      session,
      fallbackMessage: msg,
      noticeText: "⚠️ <b>Fitur ini khusus owner.</b>",
    });
  }

  const safeAction = normalizeSubscriptionAdjustAction(action);
  if (!safeAction) {
    return renderPartnerSubscriptionPage(env, adminId, telegramId, role, {
      session,
      fallbackMessage: msg,
      noticeText: "⚠️ Aksi subscription tidak valid.",
    });
  }

  const promptAnchor = await renderPartnerDatabaseMessage(
    env,
    adminId,
    buildSubscriptionAdjustPromptText(safeAction, telegramId),
    buildPartnerSubscriptionAdjustInputKeyboard(telegramId),
    { session, fallbackMessage: msg }
  );

  await persistPartnerViewSession(
    env,
    adminId,
    session,
    {
      step: "await_subscription_adjust_input",
      data: {
        source_chat_id: promptAnchor?.anchor_chat_id ?? adminId,
        source_message_id: promptAnchor?.anchor_message_id ?? null,
        selected_partner_id: String(telegramId),
        subscription_adjust_action: safeAction,
        details_anchor_chat_id: null,
        details_anchor_message_id: null,
      },
    },
    msg
  );

  return true;
}

async function handleSubscriptionAdjustInput({
  env,
  adminId,
  text,
  role,
  session,
  msg,
}) {
  const targetId = String(session?.data?.selected_partner_id || "").trim();
  const action = normalizeSubscriptionAdjustAction(session?.data?.subscription_adjust_action);

  if (!targetId || !action) {
    await clearSession(env, `state:${adminId}`).catch(() => {});
    await renderPartnerDatabaseMessage(
      env,
      adminId,
      "⚠️ Session adjustment tidak valid. Balik ke menu Partner Database ya.",
      buildPartnerDatabaseKeyboard(),
      { session, fallbackMessage: msg }
    );
    return true;
  }

  const raw = String(text || "").trim();

  if (/^(batal|cancel|keluar)$/i.test(raw)) {
    await renderPartnerSubscriptionPage(env, adminId, targetId, role, {
      session,
      fallbackMessage: msg,
      noticeText: "✅ Oke, input adjustment masa aktif dibatalkan.",
    });
    return true;
  }

  const parsed = parseSubscriptionAdjustInput(raw);
  if (!parsed.ok) {
    const promptAnchor = await renderPartnerDatabaseMessage(
      env,
      adminId,
      buildSubscriptionAdjustValidationText(action),
      buildPartnerSubscriptionAdjustInputKeyboard(targetId),
      { session, fallbackMessage: msg }
    );

    await persistPartnerViewSession(
      env,
      adminId,
      session,
      {
        step: "await_subscription_adjust_input",
        data: {
          source_chat_id: promptAnchor?.anchor_chat_id ?? adminId,
          source_message_id: promptAnchor?.anchor_message_id ?? null,
          selected_partner_id: targetId,
          subscription_adjust_action: action,
        },
      },
      msg
    );

    return true;
  }

  const result = await adjustPartnerSubscriptionByDays(env, {
    actorId: adminId,
    targetPartnerId: targetId,
    action,
    days: parsed.days,
    note: parsed.note,
  });

  if (!result?.ok) {
    await renderPartnerSubscriptionPage(env, adminId, targetId, role, {
      session,
      fallbackMessage: msg,
      noticeText: buildSubscriptionAdjustFailureNotice(result),
    });
    return true;
  }

  await renderPartnerSubscriptionPage(env, adminId, targetId, role, {
    session,
    fallbackMessage: msg,
    noticeText: readSubscriptionAdjustNoticeHtml(result),
  });

  return true;
}

export async function handlePartnerViewSearchInput({
  env,
  chatId,
  adminId,
  text,
  role,
  session,
  STATE_KEY,
  msg,
}) {
  if (String(session?.step || "").trim().toLowerCase() === "await_subscription_adjust_input") {
    return handleSubscriptionAdjustInput({
      env,
      adminId,
      text,
      role,
      session,
      msg,
    });
  }

  const raw = String(text || "").trim();

  if (/^(batal|cancel|keluar)$/i.test(raw)) {
    await clearSession(env, STATE_KEY);

    const anchor = await renderPartnerDatabaseMessage(
      env,
      adminId,
      "✅ Oke, sesi View Partner dibatalkan.",
      buildPartnerDatabaseKeyboard(),
      {
        session,
        fallbackMessage: msg,
        forceNewMessage: true,
      }
    );

    await persistPartnerViewSession(
      env,
      adminId,
      null,
      {
        step: "await_target",
        data: {
          source_chat_id: anchor?.anchor_chat_id ?? adminId,
          source_message_id: anchor?.anchor_message_id ?? null,
          selected_partner_id: null,
          selected_input: null,
          details_anchor_chat_id: null,
          details_anchor_message_id: null,
          subscription_adjust_action: null,
        },
      },
      null
    );

    return true;
  }

  const targetId = await resolveTelegramId(env, raw);
  if (!targetId) {
    const anchor = await renderPartnerDatabaseMessage(
      env,
      adminId,
      "⚠️ Target tidak valid / tidak ditemukan.\nKirim <b>@username</b> atau <b>telegram_id</b> ya.\n\nKetik <b>batal</b> untuk keluar.",
      buildBackToPartnerDatabaseKeyboard(),
      {
        session,
        fallbackMessage: msg,
        forceNewMessage: true,
      }
    );

    await persistPartnerViewSession(
      env,
      adminId,
      session,
      {
        step: "await_target",
        data: {
          source_chat_id: anchor?.anchor_chat_id ?? adminId,
          source_message_id: anchor?.anchor_message_id ?? null,
          selected_partner_id: null,
          selected_input: raw,
          details_anchor_chat_id: null,
          details_anchor_message_id: null,
          subscription_adjust_action: null,
        },
      },
      null
    );

    return true;
  }

  return renderPartnerControlPanel(env, adminId || chatId, targetId, role, {
    session,
    fallbackMessage: msg,
    selectedInput: raw,
    forceNewMessage: true,
  });
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

    await persistPartnerViewSession(
      env,
      adminId,
      null,
      {
        step: "await_target",
        data: {
          subscription_adjust_action: null,
        },
      },
      msg
    );

    const text = buildPartnerViewPromptText();
    const extra = {
      parse_mode: "HTML",
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
  };

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_LIST),
    run: async (ctx) => {
      const { env, data, adminId, msg } = ctx;
      const rawKey = String(data.slice(CALLBACK_PREFIX.PM_LIST.length) || "").trim();
      const config = normalizePartnerListKey(rawKey);

      if (!config) {
        const text = "Menu tidak dikenal. Balik ke Partner Database.";
        const extra = { reply_markup: buildPartnerDatabaseKeyboard() };

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
        const extra = { reply_markup: buildBackToPartnerDatabaseKeyboard() };

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
          buildPartnerDatabaseKeyboard(),
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
          buildPartnerDatabaseKeyboard(),
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
          buildPartnerDatabaseKeyboard(),
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
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_SUBSCRIPTION_ADD_START),
    run: async (ctx) => {
      const { env, data, adminId, msg, role, session } = ctx;

      const telegramId = resolveTargetTelegramId(
        String(data.slice(CALLBACK_PREFIX.PM_SUBSCRIPTION_ADD_START.length) || "").trim(),
        session
      );

      if (!telegramId) {
        await renderPartnerDatabaseMessage(
          env,
          adminId,
          "⚠️ Target partner tidak valid.",
          buildPartnerDatabaseKeyboard(),
          { session, fallbackMessage: msg }
        );
        return true;
      }

      return startSubscriptionAdjustFlow({
        env,
        adminId,
        telegramId,
        role,
        action: "add",
        session,
        msg,
      });
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_SUBSCRIPTION_REDUCE_START),
    run: async (ctx) => {
      const { env, data, adminId, msg, role, session } = ctx;

      const telegramId = resolveTargetTelegramId(
        String(data.slice(CALLBACK_PREFIX.PM_SUBSCRIPTION_REDUCE_START.length) || "").trim(),
        session
      );

      if (!telegramId) {
        await renderPartnerDatabaseMessage(
          env,
          adminId,
          "⚠️ Target partner tidak valid.",
          buildPartnerDatabaseKeyboard(),
          { session, fallbackMessage: msg }
        );
        return true;
      }

      return startSubscriptionAdjustFlow({
        env,
        adminId,
        telegramId,
        role,
        action: "reduce",
        session,
        msg,
      });
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
          buildPartnerDatabaseKeyboard(),
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
