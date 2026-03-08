// routes/callbacks/superadmin.js
import { sendMessage, editMessageReplyMarkup } from "../../services/telegramApi.js";
import { getSetting, upsertSetting } from "../../repositories/settingsRepo.js";
import { listCategories } from "../../repositories/categoriesRepo.js";
import { saveSession, clearSession } from "../../utils/session.js";
import { getPaymentTicketById, rejectPaymentTicket } from "../../repositories/paymentTicketsRepo.js";
import { confirmPaymentAndActivateSubscription } from "../../services/paymentActivationService.js";

import {
  buildSuperadminToolsKeyboard,
  buildConfigKeyboard,
  buildConfigWelcomeKeyboard,
  buildConfigAturanKeyboard,
  buildSettingsKeyboard,
  buildCategoryKeyboard,
  buildFinanceKeyboard,
  buildFinancePricingKeyboard,
  buildFinanceClassPricingKeyboard,
} from "./keyboards.js";

import { deleteSetting, escapeHtml } from "./shared.js";
import { CALLBACKS, CALLBACK_PREFIX, SESSION_MODES } from "../telegram.constants.js";

function formatClassLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "bronze") return "Bronze";
  if (raw === "gold") return "Gold";
  if (raw === "platinum") return "Platinum";
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "-";
}

function formatDurationLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "1d") return "1 Hari";
  if (raw === "3d") return "3 Hari";
  if (raw === "7d") return "7 Hari";
  return "1 Bulan";
}

function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "Rp 0";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateTime(value) {
  if (!value) return "-";

  const raw = String(value).trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, yyyy, mm, dd, hh = "00", mi = "00"] = m;
    return `${dd}-${mm}-${yyyy} ${hh}:${mi}`;
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

async function getFinanceState(env) {
  const manualRaw = (await getSetting(env, "payment_manual_enabled")) ?? "1";
  const manualOn = String(manualRaw) !== "0";

  const keys = [
    "payment_price_bronze_1d",
    "payment_price_bronze_3d",
    "payment_price_bronze_7d",
    "payment_price_bronze_1m",

    "payment_price_gold_1d",
    "payment_price_gold_3d",
    "payment_price_gold_7d",
    "payment_price_gold_1m",

    "payment_price_platinum_1d",
    "payment_price_platinum_3d",
    "payment_price_platinum_7d",
    "payment_price_platinum_1m",
  ];

  const values = {};
  for (const key of keys) {
    values[key] = Number((await getSetting(env, key)) || 0);
  }

  return {
    manualOn,
    prices: values,
  };
}

function buildFinanceText(state) {
  return [
    "💰 <b>Finance</b>",
    "",
    `Set Manual: <b>${state.manualOn ? "ON" : "OFF"}</b>`,
  ].join("\n");
}

function buildFinancePricingText(state) {
  return [
    "🏷️ <b>Set Pricing</b>",
    "",
    `Bronze 1 Hari: <b>${escapeHtml(formatMoney(state.prices.payment_price_bronze_1d))}</b>`,
    `Bronze 3 Hari: <b>${escapeHtml(formatMoney(state.prices.payment_price_bronze_3d))}</b>`,
    `Bronze 7 Hari: <b>${escapeHtml(formatMoney(state.prices.payment_price_bronze_7d))}</b>`,
    `Bronze 1 Bulan: <b>${escapeHtml(formatMoney(state.prices.payment_price_bronze_1m))}</b>`,
    "",
    `Gold 1 Hari: <b>${escapeHtml(formatMoney(state.prices.payment_price_gold_1d))}</b>`,
    `Gold 3 Hari: <b>${escapeHtml(formatMoney(state.prices.payment_price_gold_3d))}</b>`,
    `Gold 7 Hari: <b>${escapeHtml(formatMoney(state.prices.payment_price_gold_7d))}</b>`,
    `Gold 1 Bulan: <b>${escapeHtml(formatMoney(state.prices.payment_price_gold_1m))}</b>`,
    "",
    `Platinum 1 Hari: <b>${escapeHtml(formatMoney(state.prices.payment_price_platinum_1d))}</b>`,
    `Platinum 3 Hari: <b>${escapeHtml(formatMoney(state.prices.payment_price_platinum_3d))}</b>`,
    `Platinum 7 Hari: <b>${escapeHtml(formatMoney(state.prices.payment_price_platinum_7d))}</b>`,
    `Platinum 1 Bulan: <b>${escapeHtml(formatMoney(state.prices.payment_price_platinum_1m))}</b>`,
  ].join("\n");
}

function buildFinanceClassText(state, classId) {
  const key1d = `payment_price_${classId}_1d`;
  const key3d = `payment_price_${classId}_3d`;
  const key7d = `payment_price_${classId}_7d`;
  const key1m = `payment_price_${classId}_1m`;

  return [
    `🏷️ <b>Pricing ${escapeHtml(formatClassLabel(classId))}</b>`,
    "",
    `1 Hari: <b>${escapeHtml(formatMoney(state.prices[key1d]))}</b>`,
    `3 Hari: <b>${escapeHtml(formatMoney(state.prices[key3d]))}</b>`,
    `7 Hari: <b>${escapeHtml(formatMoney(state.prices[key7d]))}</b>`,
    `1 Bulan: <b>${escapeHtml(formatMoney(state.prices[key1m]))}</b>`,
  ].join("\n");
}

function buildFinancePromptText(classId, durationCode) {
  return [
    `💰 <b>Set Harga ${escapeHtml(formatClassLabel(classId))} - ${escapeHtml(formatDurationLabel(durationCode))}</b>`,
    "",
    `Kirim nominal harga untuk ${escapeHtml(formatDurationLabel(durationCode))}.`,
    "Contoh: <code>150000</code>",
    "",
    "Ketik <b>batal</b> untuk keluar.",
  ].join("\n");
}

function buildPaymentConfirmSummary(ticket, profile = null, subscription = null) {
  const username = String(profile?.username || "").trim().replace(/^@/, "");
  const durationCode = String(subscription?.duration_code || "").trim().toLowerCase();

  const lines = [
    "💳 <b>Payment Confirmed</b>",
    "",
    `Kode Tiket: <code>${escapeHtml(String(ticket?.ticket_code || "-"))}</code>`,
    `Partner ID: <code>${escapeHtml(String(ticket?.partner_id || "-"))}</code>`,
    `Username: <b>${escapeHtml(username ? `@${username}` : "-")}</b>`,
    `Class ID: <b>${escapeHtml(formatClassLabel(ticket?.class_id))}</b>`,
    `Durasi: <b>${escapeHtml(formatDurationLabel(durationCode))}</b>`,
    `Masa Aktif: <b>${escapeHtml(formatDateTime(subscription?.start_at))}</b> s.d <b>${escapeHtml(formatDateTime(subscription?.end_at))}</b>`,
    `Nominal: <b>${escapeHtml(formatMoney(ticket?.amount_final))}</b>`,
  ];
  return lines.join("\n");
}

export function buildSuperadminHandlers() {
  const EXACT = {};
  const PREFIX = [];

  EXACT[CALLBACKS.SUPERADMIN_TOOLS_MENU] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(env, adminId, "⚙️ <b>Superadmin Tools</b>\nPilih menu:", {
      parse_mode: "HTML",
      reply_markup: buildSuperadminToolsKeyboard(),
    });
    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_CONFIG_MENU] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(env, adminId, "🧩 <b>Config</b>\nPilih yang mau diupdate:", {
      parse_mode: "HTML",
      reply_markup: buildConfigKeyboard(),
    });
    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_CONFIG_WELCOME] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    const current = (await getSetting(env, "welcome_partner")) || "-";
    await sendMessage(
      env,
      adminId,
      "👋 <b>Welcome Message</b>\n\n<b>Current:</b>\n<pre>" + escapeHtml(current) + "</pre>",
      { parse_mode: "HTML", reply_markup: buildConfigWelcomeKeyboard() }
    );
    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_CONFIG_WELCOME_EDIT] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await saveSession(env, `state:${adminId}`, {
      mode: SESSION_MODES.SA_CONFIG,
      area: "welcome",
      step: "await_text",
    });
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(
      env,
      adminId,
      "✏️ <b>Edit Welcome Message</b>\n\nKirim teks welcome baru.\n\nKetik <b>batal</b> untuk keluar.",
      {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_CONFIG_WELCOME }]] },
      }
    );
    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_CONFIG_ATURAN] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    const current = (await getSetting(env, "link_aturan")) || "-";
    await sendMessage(
      env,
      adminId,
      "🔗 <b>Link Aturan</b>\n\n<b>Current:</b>\n<pre>" + escapeHtml(current) + "</pre>",
      { parse_mode: "HTML", disable_web_page_preview: true, reply_markup: buildConfigAturanKeyboard() }
    );
    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_CONFIG_ATURAN_EDIT] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await saveSession(env, `state:${adminId}`, {
      mode: SESSION_MODES.SA_CONFIG,
      area: "aturan",
      step: "await_text",
    });
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(
      env,
      adminId,
      "✏️ <b>Edit Link Aturan</b>\n\nKirim URL aturan baru (contoh: https://domain.com/aturan).\n\nKetik <b>batal</b> untuk keluar.",
      {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_CONFIG_ATURAN }]] },
      }
    );
    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_SETTINGS_MENU] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(env, adminId, "⚙️ <b>Settings</b>\nPilih menu:", {
      parse_mode: "HTML",
      reply_markup: buildSettingsKeyboard(),
    });
    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_CATEGORY_MENU] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(env, adminId, "🗂️ <b>Category</b>\nPilih aksi:", {
      parse_mode: "HTML",
      reply_markup: buildCategoryKeyboard(),
    });
    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_CATEGORY_LIST] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    const rows = await listCategories(env);
    if (!rows.length) {
      await sendMessage(env, adminId, "📚 <b>Category List</b>\n\nBelum ada kategori.", {
        parse_mode: "HTML",
        reply_markup: buildCategoryKeyboard(),
      });
      return true;
    }
    const lines = ["📚 <b>Category List</b>", ""];
    rows.forEach((r, i) => lines.push(`${i + 1}. ${escapeHtml(r.kode)}`));
    await sendMessage(env, adminId, lines.join("\n"), {
      parse_mode: "HTML",
      reply_markup: buildCategoryKeyboard(),
    });
    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_CATEGORY_ADD] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await saveSession(env, `state:${adminId}`, {
      mode: SESSION_MODES.SA_CATEGORY,
      action: "add",
      step: "await_text",
    });
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(
      env,
      adminId,
      "➕ <b>Add Category</b>\n\nKirim <b>kode kategori</b> (contoh: Cuci Sofa).\n\nKetik <b>batal</b> untuk keluar.",
      {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_CATEGORY_MENU }]] },
      }
    );
    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_CATEGORY_DEL] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await saveSession(env, `state:${adminId}`, {
      mode: SESSION_MODES.SA_CATEGORY,
      action: "del",
      step: "await_text",
    });
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(
      env,
      adminId,
      "➖ <b>Delete Category</b>\n\nKirim <b>kode kategori</b> yang mau dihapus.\n\nKetik <b>batal</b> untuk keluar.",
      {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_CATEGORY_MENU }]] },
      }
    );
    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_FINANCE_MENU] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    const state = await getFinanceState(env);
    await sendMessage(env, adminId, buildFinanceText(state), {
      parse_mode: "HTML",
      reply_markup: buildFinanceKeyboard(state.manualOn),
    });
    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_FINANCE_MANUAL_TOGGLE] = async (ctx) => {
    const { env, adminId } = ctx;
    const raw = (await getSetting(env, "payment_manual_enabled")) ?? "1";
    const manualOn = String(raw) !== "0";
    const next = manualOn ? "0" : "1";
    await upsertSetting(env, "payment_manual_enabled", next);

    const state = await getFinanceState(env);
    await sendMessage(env, adminId, `✅ Set Manual sekarang: ${state.manualOn ? "ON" : "OFF"}`, {
      reply_markup: buildFinanceKeyboard(state.manualOn),
    });
    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_FINANCE_PRICING_MENU] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    const state = await getFinanceState(env);
    await sendMessage(env, adminId, buildFinancePricingText(state), {
      parse_mode: "HTML",
      reply_markup: buildFinancePricingKeyboard(),
    });
    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_FINANCE_PRICING_BRONZE_MENU] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    const state = await getFinanceState(env);
    await sendMessage(env, adminId, buildFinanceClassText(state, "bronze"), {
      parse_mode: "HTML",
      reply_markup: buildFinanceClassPricingKeyboard("bronze"),
    });
    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_FINANCE_PRICING_GOLD_MENU] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    const state = await getFinanceState(env);
    await sendMessage(env, adminId, buildFinanceClassText(state, "gold"), {
      parse_mode: "HTML",
      reply_markup: buildFinanceClassPricingKeyboard("gold"),
    });
    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_FINANCE_PRICING_PLATINUM_MENU] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    const state = await getFinanceState(env);
    await sendMessage(env, adminId, buildFinanceClassText(state, "platinum"), {
      parse_mode: "HTML",
      reply_markup: buildFinanceClassPricingKeyboard("platinum"),
    });
    return true;
  };

  const financePriceActions = [
    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_BRONZE_1D, "bronze", "1d"],
    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_BRONZE_3D, "bronze", "3d"],
    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_BRONZE_7D, "bronze", "7d"],
    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_BRONZE_1M, "bronze", "1m"],

    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_GOLD_1D, "gold", "1d"],
    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_GOLD_3D, "gold", "3d"],
    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_GOLD_7D, "gold", "7d"],
    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_GOLD_1M, "gold", "1m"],

    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_PLATINUM_1D, "platinum", "1d"],
    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_PLATINUM_3D, "platinum", "3d"],
    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_PLATINUM_7D, "platinum", "7d"],
    [CALLBACKS.SUPERADMIN_FINANCE_PRICE_PLATINUM_1M, "platinum", "1m"],
  ];

  for (const [callbackKey, classId, durationCode] of financePriceActions) {
    EXACT[callbackKey] = async (ctx) => {
      const { env, adminId, msgChatId, msgId } = ctx;
      await saveSession(env, `state:${adminId}`, {
        mode: SESSION_MODES.SA_FINANCE,
        area: "price",
        class_id: classId,
        duration_code: durationCode,
        step: "await_text",
      });
      if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      await sendMessage(env, adminId, buildFinancePromptText(classId, durationCode), {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICING_MENU }]],
        },
      });
      return true;
    };
  }

  const CONFIRM_PREFIX = [
    CALLBACK_PREFIX.SETWELCOME_CONFIRM,
    CALLBACK_PREFIX.SETWELCOME_CANCEL,
    CALLBACK_PREFIX.SETLINK_CONFIRM,
    CALLBACK_PREFIX.SETLINK_CANCEL,
    CALLBACK_PREFIX.PAYCONFIRM_OK,
    CALLBACK_PREFIX.PAYCONFIRM_REJECT,
  ];

  PREFIX.push({
    match: (d) => CONFIRM_PREFIX.some((p) => d.startsWith(p)),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;

      if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});

      if (data.startsWith(CALLBACK_PREFIX.PAYCONFIRM_OK)) {
        const ticketId = data.slice(CALLBACK_PREFIX.PAYCONFIRM_OK.length);
        const ticket = await getPaymentTicketById(env, ticketId);

        if (!ticket) {
          await sendMessage(env, adminId, "⚠️ Ticket payment tidak ditemukan.");
          return true;
        }

        if (String(ticket.status) === "confirmed") {
          await sendMessage(env, adminId, "⚠️ Ticket ini sudah dikonfirmasi sebelumnya.");
          return true;
        }

        const res = await confirmPaymentAndActivateSubscription(env, ticketId, adminId, null);
        if (!res.ok) {
          await sendMessage(env, adminId, `⚠️ Gagal confirm payment. Reason: ${escapeHtml(String(res.reason || "-"))}`, {
            parse_mode: "HTML",
          });
          return true;
        }

        const state = await getFinanceState(env);

        await sendMessage(
          env,
          adminId,
          buildPaymentConfirmSummary(ticket, res.profile, res.subscription),
          {
            parse_mode: "HTML",
            reply_markup: buildFinanceKeyboard(state.manualOn),
          }
        );

        await sendMessage(
          env,
          res.profile.telegram_id,
          res.user_message,
          { reply_markup: undefined }
        ).catch(() => {});

        return true;
      }

      if (data.startsWith(CALLBACK_PREFIX.PAYCONFIRM_REJECT)) {
        const ticketId = data.slice(CALLBACK_PREFIX.PAYCONFIRM_REJECT.length);
        const ticket = await getPaymentTicketById(env, ticketId);

        if (!ticket) {
          await sendMessage(env, adminId, "⚠️ Ticket payment tidak ditemukan.");
          return true;
        }

        if (String(ticket.status) === "confirmed") {
          await sendMessage(env, adminId, "⚠️ Ticket ini sudah confirmed, tidak bisa direject.");
          return true;
        }

        await rejectPaymentTicket(env, ticketId, adminId, "Rejected by superadmin callback");
        const state = await getFinanceState(env);

        await sendMessage(
          env,
          adminId,
          `❌ Payment ticket direject.\nTicket ID: ${ticketId}\nPartner ID: ${ticket.partner_id}`,
          { reply_markup: buildFinanceKeyboard(state.manualOn) }
        );

        await sendMessage(
          env,
          ticket.partner_id,
          "❌ Bukti pembayaran kamu ditolak. Silakan hubungi admin TeMan atau upload ulang sesuai instruksi.",
          {}
        ).catch(() => {});

        return true;
      }

      const [action, ownerId] = data.split(":");

      if (String(ownerId) !== String(adminId)) {
        await sendMessage(env, adminId, "⚠️ Aksi ini bukan untuk akunmu.");
        return true;
      }

      if (action === "setwelcome_confirm" || action === "setwelcome_cancel") {
        const draftKey = `draft_welcome:${adminId}`;
        const draftText = await getSetting(env, draftKey);
        if (!draftText) {
          await sendMessage(env, adminId, "⚠️ Draft welcome tidak ditemukan / sudah dibatalkan.");
          return true;
        }
        if (action === "setwelcome_cancel") {
          await deleteSetting(env, draftKey);
          await sendMessage(env, adminId, "❌ Draft welcome dibatalkan.", {
            reply_markup: buildSuperadminToolsKeyboard(),
          });
          return true;
        }
        await upsertSetting(env, "welcome_partner", draftText);
        await deleteSetting(env, draftKey);
        await sendMessage(env, adminId, "✅ Welcome message berhasil diupdate.\n\n*Welcome baru:*\n" + draftText, {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
          reply_markup: buildSuperadminToolsKeyboard(),
        });
        return true;
      }

      if (action === "setlink_confirm" || action === "setlink_cancel") {
        const draftKey = `draft_link_aturan:${adminId}`;
        const draftUrl = await getSetting(env, draftKey);
        if (!draftUrl) {
          await sendMessage(env, adminId, "⚠️ Draft link aturan tidak ditemukan / sudah dibatalkan.");
          return true;
        }
        if (action === "setlink_cancel") {
          await deleteSetting(env, draftKey);
          await sendMessage(env, adminId, "❌ Draft link aturan dibatalkan.", {
            reply_markup: buildSuperadminToolsKeyboard(),
          });
          return true;
        }
        await upsertSetting(env, "link_aturan", draftUrl);
        await deleteSetting(env, draftKey);
        await sendMessage(env, adminId, `✅ Link aturan berhasil diupdate:\n${draftUrl}`, {
          disable_web_page_preview: true,
          reply_markup: buildSuperadminToolsKeyboard(),
        });
        return true;
      }

      return true;
    },
  });

  return { EXACT, PREFIX };
}
