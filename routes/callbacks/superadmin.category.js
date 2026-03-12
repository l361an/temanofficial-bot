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

function buildCategoryMenuText() {
  return [
    "🗂️ <b>Category</b>",
    "",
    "Kelola daftar kategori partner di sini.",
  ].join("\n");
}

function buildCategoryListText(rows) {
  if (!rows.length) {
    return [
      "📚 <b>Category List</b>",
      "",
      "Belum ada kategori.",
    ].join("\n");
  }

  const lines = [
    "📚 <b>Category List</b>",
    "",
  ];

  rows.forEach((r, i) => {
    lines.push(`${i + 1}. ${escapeHtml(r.kode)}`);
  });

  return lines.join("\n");
}

export function buildSuperadminCategoryHandlers() {
  const EXACT = {};

  EXACT[CALLBACKS.SUPERADMIN_CATEGORY_MENU] = async (ctx) => {
    const { env, adminId } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    return renderMenuMessage(ctx, buildCategoryMenuText(), {
      parse_mode: "HTML",
      reply_markup: buildCategoryKeyboard(),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_CATEGORY_LIST] = async (ctx) => {
    const { env, adminId } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    const rows = await listCategories(env);

    return renderMenuMessage(ctx, buildCategoryListText(rows), {
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
      [
        "➕ <b>Add Category</b>",
        "",
        "Kirim nama / kode kategori baru.",
        "",
        "Ketik <b>batal</b> untuk keluar.",
      ].join("\n"),
      {
        parse_mode: "HTML",
        reply_markup: buildCategoryKeyboard(),
      }
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
      [
        "➖ <b>Delete Category</b>",
        "",
        "Kirim nama / kode kategori yang ingin dihapus.",
        "",
        "Ketik <b>batal</b> untuk keluar.",
      ].join("\n"),
      {
        parse_mode: "HTML",
        reply_markup: buildCategoryKeyboard(),
      }
    );

    return true;
  };

  return { EXACT, PREFIX: [] };
}
