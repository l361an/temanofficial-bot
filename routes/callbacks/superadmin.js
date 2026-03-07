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
} from "./keyboards.js";

import { deleteSetting, escapeHtml } from "./shared.js";
import { CALLBACKS, CALLBACK_PREFIX, SESSION_MODES } from "../telegram.constants.js";

function buildPaymentConfirmSummary(ticket) {
  const lines = [
    "💳 <b>Payment Confirmed</b>",
    "",
    `Ticket ID: <code>${escapeHtml(String(ticket.id || "-"))}</code>`,
    `Partner ID: <code>${escapeHtml(String(ticket.partner_id || "-"))}</code>`,
    `Class ID: <b>${escapeHtml(String(ticket.class_id || "-"))}</b>`,
    `Durasi: <b>${escapeHtml(String(ticket.duration_months || "-"))}</b> bulan`,
    `Nominal: <b>${escapeHtml(String(ticket.final_amount || 0))}</b>`,
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
    const raw = (await getSetting(env, "payment_manual_enabled")) ?? "1";
    const manualOn = String(raw) !== "0";
    const text =
      "💰 <b>Finance</b>\n\n" +
      `Manual payment: <b>${manualOn ? "ON" : "OFF"}</b>\n` +
      "Provider: <i>manual</i>\n";
    await sendMessage(env, adminId, text, {
      parse_mode: "HTML",
      reply_markup: buildFinanceKeyboard(manualOn),
    });
    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_FINANCE_MANUAL_TOGGLE] = async (ctx) => {
    const { env, adminId } = ctx;
    const raw = (await getSetting(env, "payment_manual_enabled")) ?? "1";
    const manualOn = String(raw) !== "0";
    const next = manualOn ? "0" : "1";
    await upsertSetting(env, "payment_manual_enabled", next);
    const nowOn = next !== "0";
    await sendMessage(env, adminId, `✅ Manual payment sekarang: ${nowOn ? "ON" : "OFF"}`, {
      reply_markup: buildFinanceKeyboard(nowOn),
    });
    return true;
  };

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

        await sendMessage(env, adminId, buildPaymentConfirmSummary(ticket), {
          parse_mode: "HTML",
          reply_markup: buildFinanceKeyboard(true),
        });

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

        await sendMessage(
          env,
          adminId,
          `❌ Payment ticket direject.\nTicket ID: ${ticketId}\nPartner ID: ${ticket.partner_id}`,
          { reply_markup: buildFinanceKeyboard(true) }
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
