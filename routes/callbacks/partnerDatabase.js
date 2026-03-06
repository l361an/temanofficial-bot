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

export function buildPartnerDatabaseHandlers() {
  const EXACT = {};
  const PREFIX = [];

  EXACT["pm:menu"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(env, adminId, "🗃️ <b>Partner Database</b>\nPilih menu di bawah:", {
      parse_mode: "HTML",
      reply_markup: buildPartnerDatabaseKeyboard(),
    });
    return true;
  };

  EXACT["pm:view"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await saveSession(env, `state:${adminId}`, { mode: "partner_view", step: "await_target" });
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(
      env,
      adminId,
      "🔎 <b>View Partner</b>\n\nKirim <b>@username</b> atau <b>telegram_id</b> target.\n\nKetik <b>batal</b> untuk keluar.",
      { parse_mode: "HTML", reply_markup: buildBackToPartnerDatabaseViewKeyboard() }
    );
    return true;
  };

  PREFIX.push({
    match: (d) => d.startsWith("pm:list:"),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId } = ctx;
      const key = String(data.split(":")[2] || "").trim();

      let rows = [];
      let title = "";
      let showStatus = false;

      if (key === "all") {
        rows = await listProfilesAll(env);
        title = "PARTNER (ALL)";
        showStatus = true;
      } else if (["pending", "approved", "suspended", "active"].includes(key)) {
        rows = await listProfilesByStatus(env, key);
        title = `PARTNER ${key.toUpperCase()}`;
      } else {
        if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
        await sendMessage(env, adminId, "Menu tidak dikenal. Balik ke Partner Database.", {
          reply_markup: buildPartnerDatabaseKeyboard(),
        });
        return true;
      }

      if (!rows.length) {
        if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
        await sendMessage(env, adminId, `Tidak ada data untuk: ${title}`, {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      }

      const verificatorMap = await buildVerificatorMap(env, rows).catch(() => new Map());
      if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      const text = buildListMessageHtml(title, rows, verificatorMap, { showStatus });

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
