// routes/callbacks/partnerDatabase.js
import { sendMessage, upsertCallbackMessage } from "../../services/telegramApi.js";
import { saveSession, clearSession } from "../../utils/session.js";
import {
  listProfilesAll,
  listProfilesByStatus,
  getProfileFullByTelegramId,
  listCategoryKodesByProfileId,
} from "../../repositories/profilesRepo.js";
import { getAdminByTelegramId } from "../../repositories/adminsRepo.js";
import { getSubscriptionInfoByTelegramId } from "../../repositories/partnerSubscriptionsRepo.js";

import {
  buildPartnerDatabaseKeyboard,
  buildBackToPartnerDatabaseKeyboard,
  buildBackToPartnerDatabaseViewKeyboard,
  buildPartnerControlPanelKeyboard,
  buildPartnerDetailsKeyboard,
  buildPartnerSubscriptionKeyboard,
} from "./keyboards.js";

import {
  buildListMessageHtml,
  buildVerificatorMap,
  escapeHtml,
} from "./shared.js";

import { CALLBACKS, CALLBACK_PREFIX, SESSION_MODES } from "../telegram.constants.js";
import {
  cleanHandle,
  fmtClassId,
  resolveTelegramId,
} from "../../utils/partnerHelpers.js";

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

function partnerStatusLabel(status) {
  const raw = String(status || "").trim().toLowerCase();

  if (raw === "pending_approval") return "Pending";
  if (raw === "approved") return "Approved";
  if (raw === "suspended") return "Suspended";

  return raw ? raw.replaceAll("_", " ") : "-";
}

function premiumAccessLabel(profile, subInfo) {
  const partnerStatus = String(profile?.status || "").trim().toLowerCase();
  const isManualSuspended = Number(profile?.is_manual_suspended || 0) === 1;

  if (partnerStatus === "suspended" || isManualSuspended) return "Non-aktif";
  if (subInfo?.is_active && subInfo?.row) return "Aktif";

  return "Non-aktif";
}

function formatDateTime(value) {
  if (!value) return "-";
  return String(value);
}

function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "Rp 0";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function normalizeDurationCode(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "1d" || v === "3d" || v === "7d" || v === "1m") return v;
  return "";
}

function resolveDurationCode(row) {
  const metaRaw = String(row?.metadata_json || "").trim();
  if (metaRaw) {
    try {
      const meta = JSON.parse(metaRaw);
      const code = normalizeDurationCode(meta?.duration_code);
      if (code) return code;
    } catch {}
  }

  const snapRaw = String(row?.pricing_snapshot_json || "").trim();
  if (snapRaw) {
    try {
      const snap = JSON.parse(snapRaw);
      const code = normalizeDurationCode(snap?.duration_code);
      if (code) return code;
    } catch {}
  }

  const months = Number(row?.duration_months || 0);
  if (months === 1) return "1m";

  return "";
}

function formatDurationLabelFromRow(row) {
  const code = resolveDurationCode(row);

  if (code === "1d") return "1 Hari";
  if (code === "3d") return "3 Hari";
  if (code === "7d") return "7 Hari";
  if (code === "1m") return "1 Bulan";

  const months = Number(row?.duration_months || 0);
  if (Number.isFinite(months) && months > 0) {
    return `${months} Bulan`;
  }

  return "-";
}

function readSourceMessage(session, fallbackMessage = null, adminId = null) {
  const sourceChatId =
    session?.data?.source_chat_id ??
    fallbackMessage?.chat?.id ??
    adminId ??
    null;

  const sourceMessageId =
    session?.data?.source_message_id ??
    fallbackMessage?.message_id ??
    null;

  if (!sourceChatId || !sourceMessageId) return null;

  return {
    chat: { id: sourceChatId },
    message_id: sourceMessageId,
    text: "Partner Database",
  };
}

async function renderPartnerDatabaseMessage(
  env,
  adminId,
  text,
  replyMarkup,
  {
    session = null,
    fallbackMessage = null,
    parseMode = "HTML",
    disableWebPreview = true,
  } = {}
) {
  const sourceMessage = readSourceMessage(session, fallbackMessage, adminId);
  const extra = {
    parse_mode: parseMode,
    reply_markup: replyMarkup,
    disable_web_page_preview: disableWebPreview,
  };

  if (sourceMessage) {
    await upsertCallbackMessage(env, sourceMessage, text, extra).catch(async () => {
      await sendMessage(env, adminId, text, extra);
    });
    return true;
  }

  await sendMessage(env, adminId, text, extra);
  return true;
}

function buildPartnerViewPromptText() {
  return (
    "🔎 <b>View Partner</b>\n\n" +
    "Kirim <b>@username</b> atau <b>telegram_id</b> target.\n\n" +
    "Ketik <b>batal</b> untuk keluar."
  );
}

async function persistPartnerViewSession(
  env,
  adminId,
  currentSession,
  patch = {},
  fallbackMessage = null
) {
  const baseData = {
    source_chat_id:
      patch?.data?.source_chat_id ??
      currentSession?.data?.source_chat_id ??
      fallbackMessage?.chat?.id ??
      adminId ??
      null,
    source_message_id:
      patch?.data?.source_message_id ??
      currentSession?.data?.source_message_id ??
      fallbackMessage?.message_id ??
      null,
    selected_partner_id:
      patch?.data?.selected_partner_id ??
      currentSession?.data?.selected_partner_id ??
      null,
    selected_input:
      patch?.data?.selected_input ??
      currentSession?.data?.selected_input ??
      null,
  };

  await saveSession(env, `state:${adminId}`, {
    mode: SESSION_MODES.PARTNER_VIEW,
    step: patch?.step ?? currentSession?.step ?? "await_target",
    data: baseData,
  });
}

async function getLatestPaymentTicket(env, partnerId) {
  const row = await env.DB.prepare(
    `
    SELECT *
    FROM payment_tickets
    WHERE partner_id = ?
    ORDER BY datetime(created_at) DESC, datetime(updated_at) DESC, id DESC
    LIMIT 1
  `
  )
    .bind(String(partnerId))
    .first();

  return row ?? null;
}

async function loadPartnerContext(env, telegramId) {
  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile) return null;

  const categories = profile.id
    ? await listCategoryKodesByProfileId(env, profile.id).catch(() => [])
    : [];

  let verificatorDisplay = "-";
  if (profile.verificator_admin_id) {
    const vid = String(profile.verificator_admin_id);
    const vRow = await getAdminByTelegramId(env, vid).catch(() => null);
    const vUser = vRow?.username
      ? cleanHandle(vRow.username)
      : vRow?.label
        ? String(vRow.label)
        : "-";
    verificatorDisplay = `${vid} - ${vUser || "-"}`;
  }

  const subInfo = await getSubscriptionInfoByTelegramId(env, telegramId).catch(() => ({
    found: false,
    is_active: false,
    row: null,
  }));

  const latestPayment = await getLatestPaymentTicket(env, telegramId).catch(() => null);

  return {
    profile,
    categories,
    subInfo,
    latestPayment,
    verificatorDisplay,
  };
}

function buildPartnerControlPanelText(context) {
  const { profile, subInfo } = context;
  const premiumAccess = premiumAccessLabel(profile, subInfo);
  const subscriptionStatus = subInfo?.row?.status || "-";
  const username = cleanHandle(profile?.username);
  const selectedLabel = username || profile?.telegram_id || "-";

  return [
    "🎛️ <b>Partner Control Panel</b>",
    "",
    `Target: <b>${escapeHtml(selectedLabel)}</b>`,
    `Nama: <b>${escapeHtml(profile?.nama_lengkap || "-")}</b>`,
    `Telegram ID: <code>${escapeHtml(profile?.telegram_id || "-")}</code>`,
    `Status Partner: <b>${escapeHtml(partnerStatusLabel(profile?.status))}</b>`,
    `Akses Premium: <b>${escapeHtml(premiumAccess)}</b>`,
    `Subscription Status: <b>${escapeHtml(subscriptionStatus)}</b>`,
    `Class Partner: <b>${escapeHtml(fmtClassId(profile?.class_id))}</b>`,
    "",
    "Pilih menu di bawah:",
  ].join("\n");
}

function buildPartnerDetailsText(context) {
  const { profile, categories, verificatorDisplay } = context;
  const kategoriText = categories.length ? categories.join(", ") : "-";

  return [
    "👤 <b>Partner Details</b>",
    "",
    `Nama Lengkap: <b>${escapeHtml(profile?.nama_lengkap || "-")}</b>`,
    `Nickname: <b>${escapeHtml(profile?.nickname || "-")}</b>`,
    `Username: <b>${escapeHtml(cleanHandle(profile?.username) || "-")}</b>`,
    `Telegram ID: <code>${escapeHtml(profile?.telegram_id || "-")}</code>`,
    `NIK: <b>${escapeHtml(profile?.nik || "-")}</b>`,
    `No. Whatsapp: <b>${escapeHtml(profile?.no_whatsapp || "-")}</b>`,
    `Kecamatan: <b>${escapeHtml(profile?.kecamatan || "-")}</b>`,
    `Kota: <b>${escapeHtml(profile?.kota || "-")}</b>`,
    `Kategori: <b>${escapeHtml(kategoriText)}</b>`,
    `Verificator: <b>${escapeHtml(verificatorDisplay || "-")}</b>`,
    `Approved At: <b>${escapeHtml(formatDateTime(profile?.approved_at))}</b>`,
    `Approved By: <b>${escapeHtml(profile?.approved_by || "-")}</b>`,
  ].join("\n");
}

function buildPartnerSubscriptionText(context) {
  const { profile, subInfo, latestPayment } = context;
  const premiumAccess = premiumAccessLabel(profile, subInfo);
  const row = subInfo?.row || null;
  const durationLabel = formatDurationLabelFromRow(row);

  const lines = [
    "💳 <b>Partner Subscription</b>",
    "",
    `Akses Premium: <b>${escapeHtml(premiumAccess)}</b>`,
    `Class Partner: <b>${escapeHtml(fmtClassId(profile?.class_id))}</b>`,
    `Subscription Status: <b>${escapeHtml(row?.status || "-")}</b>`,
    `Durasi: <b>${escapeHtml(durationLabel)}</b>`,
    `Start At: <b>${escapeHtml(formatDateTime(row?.start_at))}</b>`,
    `End At: <b>${escapeHtml(formatDateTime(row?.end_at))}</b>`,
    `Activated At: <b>${escapeHtml(formatDateTime(row?.activated_at))}</b>`,
    `Expired At: <b>${escapeHtml(formatDateTime(row?.expired_at))}</b>`,
    `Source Type: <b>${escapeHtml(row?.source_type || "-")}</b>`,
    `Source Ref ID: <b>${escapeHtml(row?.source_ref_id || "-")}</b>`,
  ];

  if (latestPayment) {
    lines.push("");
    lines.push("🧾 <b>Latest Payment</b>");
    lines.push(`Kode Tiket: <b>${escapeHtml(latestPayment.ticket_code || "-")}</b>`);
    lines.push(`Status: <b>${escapeHtml(latestPayment.status || "-")}</b>`);
    lines.push(`Durasi: <b>${escapeHtml(formatDurationLabelFromRow(latestPayment))}</b>`);
    lines.push(`Harga Dasar: <b>${escapeHtml(formatMoney(latestPayment.amount_base))}</b>`);
    lines.push(`Kode Unik: <b>${escapeHtml(latestPayment.unique_code ?? "0")}</b>`);
    lines.push(`Total Bayar: <b>${escapeHtml(formatMoney(latestPayment.amount_final))}</b>`);
    lines.push(`Requested At: <b>${escapeHtml(formatDateTime(latestPayment.requested_at))}</b>`);
    lines.push(`Expires At: <b>${escapeHtml(formatDateTime(latestPayment.expires_at))}</b>`);
    lines.push(`Confirmed At: <b>${escapeHtml(formatDateTime(latestPayment.confirmed_at))}</b>`);
  }

  return lines.join("\n");
}

export async function renderPartnerControlPanel(
  env,
  adminId,
  telegramId,
  role,
  { session = null, fallbackMessage = null, selectedInput = null } = {}
) {
  const context = await loadPartnerContext(env, telegramId);

  if (!context?.profile) {
    await renderPartnerDatabaseMessage(
      env,
      adminId,
      "⚠️ Data partner tidak ditemukan.",
      buildBackToPartnerDatabaseViewKeyboard(role),
      { session, fallbackMessage }
    );
    return false;
  }

  await persistPartnerViewSession(
    env,
    adminId,
    session,
    {
      step: "selected",
      data: {
        selected_partner_id: String(context.profile.telegram_id),
        selected_input: selectedInput ?? session?.data?.selected_input ?? null,
      },
    },
    fallbackMessage
  );

  const text = buildPartnerControlPanelText(context);
  const replyMarkup = buildPartnerControlPanelKeyboard(context.profile.telegram_id, role);

  await renderPartnerDatabaseMessage(env, adminId, text, replyMarkup, {
    session,
    fallbackMessage,
  });

  return true;
}

export async function renderPartnerDetailsPage(
  env,
  adminId,
  telegramId,
  role,
  { session = null, fallbackMessage = null } = {}
) {
  const context = await loadPartnerContext(env, telegramId);

  if (!context?.profile) {
    await renderPartnerDatabaseMessage(
      env,
      adminId,
      "⚠️ Data partner tidak ditemukan.",
      buildPartnerDatabaseKeyboard(role),
      { session, fallbackMessage }
    );
    return false;
  }

  await persistPartnerViewSession(
    env,
    adminId,
    session,
    {
      step: "selected",
      data: { selected_partner_id: String(context.profile.telegram_id) },
    },
    fallbackMessage
  );

  await renderPartnerDatabaseMessage(
    env,
    adminId,
    buildPartnerDetailsText(context),
    buildPartnerDetailsKeyboard(context.profile.telegram_id, role),
    { session, fallbackMessage }
  );

  return true;
}

export async function renderPartnerSubscriptionPage(
  env,
  adminId,
  telegramId,
  role,
  { session = null, fallbackMessage = null } = {}
) {
  const context = await loadPartnerContext(env, telegramId);

  if (!context?.profile) {
    await renderPartnerDatabaseMessage(
      env,
      adminId,
      "⚠️ Data partner tidak ditemukan.",
      buildPartnerDatabaseKeyboard(role),
      { session, fallbackMessage }
    );
    return false;
  }

  await persistPartnerViewSession(
    env,
    adminId,
    session,
    {
      step: "selected",
      data: { selected_partner_id: String(context.profile.telegram_id) },
    },
    fallbackMessage
  );

  await renderPartnerDatabaseMessage(
    env,
    adminId,
    buildPartnerSubscriptionText(context),
    buildPartnerSubscriptionKeyboard(context.profile.telegram_id, role),
    { session, fallbackMessage }
  );

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
      {
        step: "await_target",
      },
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
        const extra = {
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

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_PANEL_OPEN),
    run: async (ctx) => {
      const { env, data, adminId, msg, role } = ctx;
      const telegramId = String(data.slice(CALLBACK_PREFIX.PM_PANEL_OPEN.length) || "").trim();

      if (!telegramId) {
        await renderPartnerDatabaseMessage(
          env,
          adminId,
          "⚠️ Target partner tidak valid.",
          buildPartnerDatabaseKeyboard(role),
          { fallbackMessage: msg }
        );
        return true;
      }

      await renderPartnerControlPanel(env, adminId, telegramId, role, {
        fallbackMessage: msg,
      });
      return true;
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_DETAILS_OPEN),
    run: async (ctx) => {
      const { env, data, adminId, msg, role } = ctx;
      const telegramId = String(data.slice(CALLBACK_PREFIX.PM_DETAILS_OPEN.length) || "").trim();

      if (!telegramId) {
        await renderPartnerDatabaseMessage(
          env,
          adminId,
          "⚠️ Target partner tidak valid.",
          buildPartnerDatabaseKeyboard(role),
          { fallbackMessage: msg }
        );
        return true;
      }

      await renderPartnerDetailsPage(env, adminId, telegramId, role, {
        fallbackMessage: msg,
      });
      return true;
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_SUBSCRIPTION_OPEN),
    run: async (ctx) => {
      const { env, data, adminId, msg, role } = ctx;
      const telegramId = String(data.slice(CALLBACK_PREFIX.PM_SUBSCRIPTION_OPEN.length) || "").trim();

      if (!telegramId) {
        await renderPartnerDatabaseMessage(
          env,
          adminId,
          "⚠️ Target partner tidak valid.",
          buildPartnerDatabaseKeyboard(role),
          { fallbackMessage: msg }
        );
        return true;
      }

      await renderPartnerSubscriptionPage(env, adminId, telegramId, role, {
        fallbackMessage: msg,
      });
      return true;
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.PM_PANEL_BACK),
    run: async (ctx) => {
      const { env, data, adminId, msg, role } = ctx;
      const telegramId = String(data.slice(CALLBACK_PREFIX.PM_PANEL_BACK.length) || "").trim();

      if (!telegramId) {
        await renderPartnerDatabaseMessage(
          env,
          adminId,
          "⚠️ Target partner tidak valid.",
          buildPartnerDatabaseKeyboard(role),
          { fallbackMessage: msg }
        );
        return true;
      }

      await renderPartnerControlPanel(env, adminId, telegramId, role, {
        fallbackMessage: msg,
      });
      return true;
    },
  });

  return { EXACT, PREFIX };
}
