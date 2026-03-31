// routes/callbacks/superadmin.partnerClass.js

import { sendMessage, upsertCallbackMessage } from "../../services/telegramApi.js";
import { saveSession, clearSession } from "../../utils/session.js";
import {
  deactivatePartnerClass,
  deletePartnerClass,
  getDefaultPartnerClassId,
  listActivePartnerClasses,
  listPartnerClasses,
  listProfilesUsingClassId,
  setDefaultPartnerClassId,
} from "../../repositories/partnerClassesRepo.js";
import {
  buildPartnerClassBackKeyboard,
  buildPartnerClassMenuKeyboard,
  buildPartnerClassSelectionKeyboard,
} from "./keyboards.superadmin.js";
import { CALLBACKS, CALLBACK_PREFIX, SESSION_MODES } from "../telegram.constants.js";
import { escapeHtml } from "./shared.js";

function isOwnerRole(role) {
  return String(role || "").trim().toLowerCase() === "owner";
}

function getStateKey(adminId) {
  return `state:${adminId}`;
}

async function renderMenuMessage(ctx, text, extra) {
  const { env, adminId, msg } = ctx;

  if (msg) {
    const res = await upsertCallbackMessage(env, msg, text, extra);
    if (res?.ok) return true;
  }

  await sendMessage(env, adminId, text, extra);
  return true;
}

async function denyOwnerOnly(ctx) {
  const { env, adminId } = ctx;
  await sendMessage(env, adminId, "⛔ Menu ini hanya untuk owner.");
  return true;
}

function buildPartnerClassMenuText() {
  return [
    "🏷️ <b>Partner Class</b>",
    "",
    "Pilih aksi di bawah.",
  ].join("\n");
}

function buildPartnerClassListText(rows, defaultClassId) {
  const lines = [
    "📋 <b>Partner Class List</b>",
    "",
  ];

  if (!rows.length) {
    lines.push("Belum ada class.");
    return lines.join("\n");
  }

  rows.forEach((row, index) => {
    const isDefault = row.id === defaultClassId;
    const statusLabel = Number(row.is_active) === 1 ? "aktif" : "nonaktif";

    lines.push(
      `${index + 1}. <b>${escapeHtml(row.label)}</b>` +
        (isDefault ? " ⭐ <b>default</b>" : "")
    );
    lines.push(`ID: <code>${escapeHtml(row.id)}</code>`);
    lines.push(`Status: <b>${escapeHtml(statusLabel)}</b>`);
    lines.push("");
  });

  return lines.join("\n");
}

function buildProfilesUsingClassText(classId, rows = []) {
  const lines = [
    `⚠️ <b>Class tidak bisa di-delete</b>`,
    "",
    `Masih dipakai oleh partner dengan class <code>${escapeHtml(classId)}</code>:`,
    "",
  ];

  rows.slice(0, 30).forEach((row, index) => {
    lines.push(
      `${index + 1}. <b>${escapeHtml(row.nama_lengkap || "-")}</b> ` +
        `(<code>${escapeHtml(row.telegram_id || "-")}</code>)`
    );
  });

  if (rows.length > 30) {
    lines.push("");
    lines.push(`Dan ${rows.length - 30} partner lainnya.`);
  }

  lines.push("");
  lines.push("Pindahkan dulu ke class aktif lain, baru delete.");

  return lines.join("\n");
}

async function startPartnerClassSession(env, adminId, patch = {}) {
  const stateKey = getStateKey(adminId);
  await saveSession(env, stateKey, {
    mode: SESSION_MODES.SA_CONFIG,
    flow_id: "sa_partner_class",
    flow_version: 1,
    ...patch,
  });
}

export function buildSuperadminPartnerClassHandlers() {
  const EXACT = {};
  const PREFIX = [];

  EXACT[CALLBACKS.SUPERADMIN_PARTNER_CLASS_MENU] = async (ctx) => {
    if (!isOwnerRole(ctx.role)) return denyOwnerOnly(ctx);

    await clearSession(ctx.env, getStateKey(ctx.adminId)).catch(() => {});
    return renderMenuMessage(ctx, buildPartnerClassMenuText(), {
      parse_mode: "HTML",
      reply_markup: buildPartnerClassMenuKeyboard(),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_PARTNER_CLASS_LIST] = async (ctx) => {
    if (!isOwnerRole(ctx.role)) return denyOwnerOnly(ctx);

    const rows = await listPartnerClasses(ctx.env);
    const defaultClassId = await getDefaultPartnerClassId(ctx.env);

    return renderMenuMessage(ctx, buildPartnerClassListText(rows, defaultClassId), {
      parse_mode: "HTML",
      reply_markup: buildPartnerClassBackKeyboard(),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_PARTNER_CLASS_ADD] = async (ctx) => {
    if (!isOwnerRole(ctx.role)) return denyOwnerOnly(ctx);

    await startPartnerClassSession(ctx.env, ctx.adminId, {
      area: "partner_class_add_label",
      step: "await_text",
    });

    await sendMessage(
      ctx.env,
      ctx.adminId,
      "➕ <b>Tambah Class</b>\n\nKetik nama / label class baru.\n\nContoh:\n• <b>General</b>\n• <b>VIP Plus</b>\n• <b>Corporate A</b>\n\nBot akan buatkan <code>class_id</code> otomatis dan langsung simpan.\n\nKetik <b>batal</b> untuk keluar.",
      {
        parse_mode: "HTML",
        reply_markup: buildPartnerClassBackKeyboard(),
      }
    );

    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_PARTNER_CLASS_SET_DEFAULT] = async (ctx) => {
    if (!isOwnerRole(ctx.role)) return denyOwnerOnly(ctx);

    const rows = await listActivePartnerClasses(ctx.env);

    return renderMenuMessage(ctx, "⭐ <b>Set Default Class</b>\n\nPilih class default baru.", {
      parse_mode: "HTML",
      reply_markup: buildPartnerClassSelectionKeyboard(rows, "default"),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_PARTNER_CLASS_RENAME] = async (ctx) => {
    if (!isOwnerRole(ctx.role)) return denyOwnerOnly(ctx);

    const rows = await listPartnerClasses(ctx.env);

    return renderMenuMessage(ctx, "✏️ <b>Rename Label Class</b>\n\nPilih class yang mau di-rename.", {
      parse_mode: "HTML",
      reply_markup: buildPartnerClassSelectionKeyboard(rows, "rename"),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_PARTNER_CLASS_DEACTIVATE] = async (ctx) => {
    if (!isOwnerRole(ctx.role)) return denyOwnerOnly(ctx);

    const defaultClassId = await getDefaultPartnerClassId(ctx.env);
    const rows = (await listActivePartnerClasses(ctx.env)).filter((row) => row.id !== defaultClassId);

    return renderMenuMessage(ctx, "⛔ <b>Nonaktifkan Class</b>\n\nPilih class aktif yang mau dinonaktifkan.", {
      parse_mode: "HTML",
      reply_markup: buildPartnerClassSelectionKeyboard(rows, "deactivate"),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_PARTNER_CLASS_DELETE] = async (ctx) => {
    if (!isOwnerRole(ctx.role)) return denyOwnerOnly(ctx);

    const defaultClassId = await getDefaultPartnerClassId(ctx.env);
    const rows = (await listPartnerClasses(ctx.env)).filter((row) => row.id !== defaultClassId);

    return renderMenuMessage(ctx, "🗑️ <b>Delete Class</b>\n\nPilih class yang mau di-delete.", {
      parse_mode: "HTML",
      reply_markup: buildPartnerClassSelectionKeyboard(rows, "delete"),
    });
  };

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.SA_PCLASS_DEFAULT_SET),
    run: async (ctx) => {
      if (!isOwnerRole(ctx.role)) return denyOwnerOnly(ctx);

      const classId = String(ctx.data || "").slice(CALLBACK_PREFIX.SA_PCLASS_DEFAULT_SET.length).trim();
      const res = await setDefaultPartnerClassId(ctx.env, classId);

      const text = res?.ok
        ? `✅ Default class diubah ke <code>${escapeHtml(classId)}</code>.`
        : "⚠️ Gagal set default class.";

      return renderMenuMessage(ctx, text, {
        parse_mode: "HTML",
        reply_markup: buildPartnerClassMenuKeyboard(),
      });
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.SA_PCLASS_RENAME_START),
    run: async (ctx) => {
      if (!isOwnerRole(ctx.role)) return denyOwnerOnly(ctx);

      const classId = String(ctx.data || "").slice(CALLBACK_PREFIX.SA_PCLASS_RENAME_START.length).trim();

      await startPartnerClassSession(ctx.env, ctx.adminId, {
        area: "partner_class_rename",
        step: "await_text",
        class_id: classId,
      });

      await sendMessage(
        ctx.env,
        ctx.adminId,
        `✏️ <b>Rename Label</b>\n\nClass ID: <code>${escapeHtml(classId)}</code>\n\nKetik label baru.\n\nKetik <b>batal</b> untuk keluar.`,
        {
          parse_mode: "HTML",
          reply_markup: buildPartnerClassBackKeyboard(),
        }
      );

      return true;
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.SA_PCLASS_DEACTIVATE_EXEC),
    run: async (ctx) => {
      if (!isOwnerRole(ctx.role)) return denyOwnerOnly(ctx);

      const classId = String(ctx.data || "").slice(CALLBACK_PREFIX.SA_PCLASS_DEACTIVATE_EXEC.length).trim();
      const res = await deactivatePartnerClass(ctx.env, classId);

      const text = res?.ok
        ? `✅ Class <code>${escapeHtml(classId)}</code> dinonaktifkan.`
        : "⚠️ Gagal menonaktifkan class.";

      return renderMenuMessage(ctx, text, {
        parse_mode: "HTML",
        reply_markup: buildPartnerClassMenuKeyboard(),
      });
    },
  });

  PREFIX.push({
    match: (d) => d.startsWith(CALLBACK_PREFIX.SA_PCLASS_DELETE_EXEC),
    run: async (ctx) => {
      if (!isOwnerRole(ctx.role)) return denyOwnerOnly(ctx);

      const classId = String(ctx.data || "").slice(CALLBACK_PREFIX.SA_PCLASS_DELETE_EXEC.length).trim();
      const profiles = await listProfilesUsingClassId(ctx.env, classId);

      if (profiles.length) {
        return renderMenuMessage(ctx, buildProfilesUsingClassText(classId, profiles), {
          parse_mode: "HTML",
          reply_markup: buildPartnerClassBackKeyboard(CALLBACKS.SUPERADMIN_PARTNER_CLASS_DELETE),
        });
      }

      const res = await deletePartnerClass(ctx.env, classId);
      const text = res?.ok
        ? `✅ Class <code>${escapeHtml(classId)}</code> berhasil di-delete.`
        : "⚠️ Gagal delete class.";

      return renderMenuMessage(ctx, text, {
        parse_mode: "HTML",
        reply_markup: buildPartnerClassMenuKeyboard(),
      });
    },
  });

  return { EXACT, PREFIX };
}
