// routes/callbacks/superadmin.category.js

import { sendMessage, upsertCallbackMessage } from "../../services/telegramApi.js";
import { listCategories } from "../../repositories/categoriesRepo.js";
import { saveSession, clearSession } from "../../utils/session.js";

import { buildCategoryKeyboard } from "./keyboards.js";
import { CALLBACKS, SESSION_MODES } from "../telegram.constants.js";
import { escapeHtml } from "./shared.js";

async function renderMenuMessage(ctx, text, extra) {
  const { env, adminId, msg } = ctx;

  if (msg) {
    await upsertCallbackMessage(env, msg, text, extra).catch(async () => {
      await sendMessage(env, adminId, text, extra);
    });
    return true;
  }

  await sendMessage(env, adminId, text, extra);
  return true;
}

export function buildSuperadminCategoryHandlers() {
  const EXACT = {};

  EXACT[CALLBACKS.SUPERADMIN_CATEGORY_MENU] = async (ctx) => {
    const { env, adminId } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    return renderMenuMessage(ctx, "🗂️ <b>Category</b>\nPilih aksi:", {
      parse_mode: "HTML",
      reply_markup: buildCategoryKeyboard(),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_CATEGORY_LIST] = async (ctx) => {
    const { env } = ctx;

    const rows = await listCategories(env);

    if (!rows.length) {
      return renderMenuMessage(ctx, "📚 <b>Category List</b>\n\nBelum ada kategori.", {
        parse_mode: "HTML",
        reply_markup: buildCategoryKeyboard(),
      });
    }

    const lines = ["📚 <b>Category List</b>", ""];

    rows.forEach((r, i) => {
      lines.push(`${i + 1}. ${escapeHtml(r.kode)}`);
    });

    return renderMenuMessage(ctx, lines.join("\n"), {
      parse_mode: "HTML",
      reply_markup: buildCategoryKeyboard(),
    });
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
      "➕ <b>Add Category</b>\n\nKetik Kategori Baru.",
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
      "➖ <b>Delete Category</b>\n\nKetik Kategori Yang Ingin Dihapus.",
      { parse_mode: "HTML" }
    );

    return true;
  };

  return { EXACT, PREFIX: [] };
}
