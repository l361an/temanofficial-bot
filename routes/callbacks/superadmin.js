// routes/callbacks/superadmin.js
import { sendMessage, editMessageReplyMarkup } from "../../services/telegramApi.js";
import { getSetting, upsertSetting } from "../../repositories/settingsRepo.js";
import { listCategories } from "../../repositories/categoriesRepo.js";
import { saveSession, clearSession } from "../../utils/session.js";

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

export function buildSuperadminHandlers() {
  const EXACT = {};
  const PREFIX = [];

  EXACT["sa:tools:menu"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(env, adminId, "⚙️ <b>Superadmin Tools</b>\nPilih menu:", {
      parse_mode: "HTML",
      reply_markup: buildSuperadminToolsKeyboard(),
    });
    return true;
  };

  EXACT["sa:cfg:menu"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(env, adminId, "🧩 <b>Config</b>\nPilih yang mau diupdate:", {
      parse_mode: "HTML",
      reply_markup: buildConfigKeyboard(),
    });
    return true;
  };

  EXACT["sa:cfg:welcome"] = async (ctx) => {
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

  EXACT["sa:cfg:welcome_edit"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await saveSession(env, `state:${adminId}`, { mode: "sa_config", area: "welcome", step: "await_text" });
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(
      env,
      adminId,
      "✏️ <b>Edit Welcome Message</b>\n\nKirim teks welcome baru.\n\nKetik <b>batal</b> untuk keluar.",
      {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "sa:cfg:welcome" }]] },
      }
    );
    return true;
  };

  EXACT["sa:cfg:aturan"] = async (ctx) => {
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

  EXACT["sa:cfg:aturan_edit"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await saveSession(env, `state:${adminId}`, { mode: "sa_config", area: "aturan", step: "await_text" });
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(
      env,
      adminId,
      "✏️ <b>Edit Link Aturan</b>\n\nKirim URL aturan baru (contoh: https://domain.com/aturan).\n\nKetik <b>batal</b> untuk keluar.",
      {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "sa:cfg:aturan" }]] },
      }
    );
    return true;
  };

  EXACT["sa:settings:menu"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(env, adminId, "⚙️ <b>Settings</b>\nPilih menu:", {
      parse_mode: "HTML",
      reply_markup: buildSettingsKeyboard(),
    });
    return true;
  };

  EXACT["sa:cat:menu"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(env, adminId, "🗂️ <b>Category</b>\nPilih aksi:", {
      parse_mode: "HTML",
      reply_markup: buildCategoryKeyboard(),
    });
    return true;
  };

  EXACT["sa:cat:list"] = async (ctx) => {
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

  EXACT["sa:cat:add"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await saveSession(env, `state:${adminId}`, { mode: "sa_category", action: "add", step: "await_text" });
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(
      env,
      adminId,
      "➕ <b>Add Category</b>\n\nKirim <b>kode kategori</b> (contoh: Cuci Sofa).\n\nKetik <b>batal</b> untuk keluar.",
      { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "sa:cat:menu" }]] } }
    );
    return true;
  };

  EXACT["sa:cat:del"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await saveSession(env, `state:${adminId}`, { mode: "sa_category", action: "del", step: "await_text" });
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(
      env,
      adminId,
      "➖ <b>Delete Category</b>\n\nKirim <b>kode kategori</b> yang mau dihapus.\n\nKetik <b>batal</b> untuk keluar.",
      { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "sa:cat:menu" }]] } }
    );
    return true;
  };

  EXACT["sa:fin:menu"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    const raw = (await getSetting(env, "payment_manual_enabled")) ?? "1";
    const manualOn = String(raw) !== "0";
    const text =
      "💰 <b>Finance</b>\n\n" +
      `Manual payment: <b>${manualOn ? "ON" : "OFF"}</b>\n` +
      "Provider: <i>placeholder</i> (Xendit/Midtrans nanti)\n";
    await sendMessage(env, adminId, text, { parse_mode: "HTML", reply_markup: buildFinanceKeyboard(manualOn) });
    return true;
  };

  EXACT["sa:fin:manual_toggle"] = async (ctx) => {
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

  const CONFIRM_PREFIX = ["setwelcome_confirm:", "setwelcome_cancel:", "setlink_confirm:", "setlink_cancel:"];

  PREFIX.push({
    match: (d) => CONFIRM_PREFIX.some((p) => d.startsWith(p)),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;
      const [action, ownerId] = data.split(":");

      if (String(ownerId) !== String(adminId)) {
        await sendMessage(env, adminId, "⚠️ Aksi ini bukan untuk akunmu.");
        return true;
      }

      if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});

      if (action === "setwelcome_confirm" || action === "setwelcome_cancel") {
        const draftKey = `draft_welcome:${adminId}`;
        const draftText = await getSetting(env, draftKey);
        if (!draftText) {
          await sendMessage(env, adminId, "⚠️ Draft welcome tidak ditemukan / sudah dibatalkan.");
          return true;
        }
        if (action === "setwelcome_cancel") {
          await deleteSetting(env, draftKey);
          await sendMessage(env, adminId, "❌ Draft welcome dibatalkan.", { reply_markup: buildSuperadminToolsKeyboard() });
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
          await sendMessage(env, adminId, "❌ Draft link aturan dibatalkan.", { reply_markup: buildSuperadminToolsKeyboard() });
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
