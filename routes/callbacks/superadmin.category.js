// routes/callbacks/superadmin.category.js

import { sendMessage, editMessageReplyMarkup } from "../../services/telegramApi.js";
import { listCategories } from "../../repositories/categoriesRepo.js";
import { saveSession, clearSession } from "../../utils/session.js";

import { buildCategoryKeyboard } from "./keyboards.js";
import { CALLBACKS, SESSION_MODES } from "../telegram.constants.js";
import { escapeHtml } from "./shared.js";

export function buildSuperadminCategoryHandlers() {
  const EXACT = {};

  EXACT[CALLBACKS.SUPERADMIN_CATEGORY_MENU] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) {
      await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    }

    await sendMessage(env, adminId, "🗂️ <b>Category</b>\nPilih aksi:", {
      parse_mode: "HTML",
      reply_markup: buildCategoryKeyboard(),
    });

    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_CATEGORY_LIST] = async (ctx) => {
    const { env, adminId } = ctx;

    const rows = await listCategories(env);

    if (!rows.length) {
      await sendMessage(env, adminId, "📚 <b>Category List</b>\n\nBelum ada kategori.", {
        parse_mode: "HTML",
        reply_markup: buildCategoryKeyboard(),
      });

      return true;
    }

    const lines = ["📚 <b>Category List</b>", ""];

    rows.forEach((r, i) => {
      lines.push(`${i + 1}. ${escapeHtml(r.kode)}`);
    });

    await sendMessage(env, adminId, lines.join("\n"), {
      parse_mode: "HTML",
      reply_markup: buildCategoryKeyboard(),
    });

    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_CATEGORY_ADD] = async (ctx) => {
    const { env, adminId } = ctx;

    await saveSession(env, `state:${adminId}`, {
      mode: SESSION_MODES.SA_CATEGORY,
      action: "add",
      step: "await_text",
    });

    await sendMessage(
      env,
      adminId,
      "➕ <b>Add Category</b>\n\nKirim kode kategori.",
      { parse_mode: "HTML" }
    );

    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_CATEGORY_DEL] = async (ctx) => {
    const { env, adminId } = ctx;

    await saveSession(env, `state:${adminId}`, {
      mode: SESSION_MODES.SA_CATEGORY,
      action: "del",
      step: "await_text",
    });

    await sendMessage(
      env,
      adminId,
      "➖ <b>Delete Category</b>\n\nKirim kode kategori.",
      { parse_mode: "HTML" }
    );

    return true;
  };

  return { EXACT, PREFIX: [] };
}
