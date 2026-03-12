// routes/callbacks/superadmin.adminManager.js

import { sendMessage, upsertCallbackMessage } from "../../services/telegramApi.js";
import {
  listAdmins,
  getAdminByTelegramId,
  updateAdminRole,
  updateAdminStatus,
  deactivateAdminByTelegramId,
  activateAdminByTelegramId,
} from "../../repositories/adminsRepo.js";
import {
  createAdminInviteToken,
  buildAdminInviteStartParam,
} from "../../repositories/adminInviteTokensRepo.js";
import { saveSession, clearSession } from "../../utils/session.js";

import {
  buildAdminManagerKeyboard,
  buildAdminListKeyboard,
  buildAdminControlPanelKeyboard,
  buildAdminRolePickerKeyboard,
  buildAdminStatusPickerKeyboard,
} from "./keyboards.js";

import { CALLBACKS, CALLBACK_PREFIX, SESSION_MODES } from "../telegram.constants.js";
import { escapeHtml } from "./shared.js";

function fmtValue(value) {
  const v = value === null || value === undefined || value === "" ? "-" : String(value);
  return escapeHtml(v);
}

function getBotUsername(env) {
  return String(
    env.TELEGRAM_BOT_USERNAME ||
      env.BOT_USERNAME ||
      env.PUBLIC_BOT_USERNAME ||
      ""
  )
    .trim()
    .replace(/^@/, "");
}

function buildInviteArtifacts(env, token) {
  const cleanToken = String(token || "").trim();
  const username = getBotUsername(env);
  const startParam = buildAdminInviteStartParam(cleanToken);
  const startCommand = startParam ? `/start ${startParam}` : "";
  const inviteUrl =
    username && startParam ? `https://t.me/${username}?start=${startParam}` : null;

  return {
    username,
    token: cleanToken,
    startParam,
    startCommand,
    inviteUrl,
  };
}

function buildAdminManagerText() {
  return [
    "👮 <b>Admin Management</b>",
    "",
    "Pilih aksi di bawah.",
  ].join("\n");
}

function buildAdminListText(rows) {
  if (!rows.length) {
    return [
      "👤 <b>Admin List</b>",
      "",
      "Belum ada admin yang terdaftar.",
    ].join("\n");
  }

  const lines = ["👤 <b>Admin List</b>", ""];

  rows.forEach((row, i) => {
    const uname = row?.username ? `@${String(row.username).replace(/^@/, "")}` : "-";
    lines.push(
      `${i + 1}. <b>${escapeHtml(row.label || "-")}</b>`,
      `   ID: <code>${fmtValue(row.telegram_id)}</code>`,
      `   Username: ${escapeHtml(uname)}`,
      `   Nama: ${fmtValue(row.nama)}`,
      `   Kota: ${fmtValue(row.kota)}`,
      `   Role: <b>${fmtValue(row.normRole)}</b>`,
      `   Status: <b>${fmtValue(row.normStatus)}</b>`,
      ""
    );
  });

  return lines.join("\n").trim();
}

function buildAdminDetailText(row) {
  return [
    "👤 <b>Admin Detail</b>",
    "",
    `Telegram ID : <code>${fmtValue(row?.telegram_id)}</code>`,
    `Username    : ${escapeHtml(row?.username ? `@${String(row.username).replace(/^@/, "")}` : "-")}`,
    `Nama        : ${fmtValue(row?.nama)}`,
    `Kota        : ${fmtValue(row?.kota)}`,
    `Role        : <b>${fmtValue(row?.normRole)}</b>`,
    `Status      : <b>${fmtValue(row?.normStatus)}</b>`,
  ].join("\n");
}

function buildInviteAdminText({ inviteUrl, startCommand, token, role = "admin", expiresAt }) {
  const lines = [
    "🔗 <b>Invite Admin</b>",
    "",
    "Invite link berhasil dibuat.",
    `Role: <b>${escapeHtml(role)}</b>`,
    `Expired At: <code>${escapeHtml(expiresAt || "-")}</code>`,
    "",
  ];

  if (inviteUrl) {
    lines.push("Link invite:");
    lines.push(`<code>${escapeHtml(inviteUrl)}</code>`);
    lines.push("");
  } else {
    lines.push("Bot username env belum ditemukan, jadi deep link otomatis belum bisa dibentuk.");
    lines.push("");
  }

  if (startCommand) {
    lines.push("Fallback command:");
    lines.push(`<code>${escapeHtml(startCommand)}</code>`);
    lines.push("");
  }

  lines.push("Token invite:");
  lines.push(`<code>${escapeHtml(token || "-")}</code>`);
  lines.push("");

  if (!inviteUrl) {
    lines.push("Set salah satu env berikut kalau ingin link t.me terbentuk otomatis:");
    lines.push("• TELEGRAM_BOT_USERNAME");
    lines.push("• BOT_USERNAME");
    lines.push("• PUBLIC_BOT_USERNAME");
    lines.push("");
  }

  lines.push("Flow:");
  lines.push("1. Owner kirim link invite jika tersedia, atau kirim fallback command ke candidate admin");
  lines.push("2. Candidate buka bot TeMan");
  lines.push("3. Candidate kirim fallback command ke bot jika tidak memakai deep link");
  lines.push("4. Bot validasi token");
  lines.push("5. User menjadi admin");

  return lines.join("\n");
}

function buildOwnerOnlyText() {
  return "⛔ Hanya owner yang boleh mengelola data admin.";
}

async function getActor(env, adminId) {
  return await getAdminByTelegramId(env, adminId);
}

async function isOwnerActor(env, adminId) {
  const actor = await getActor(env, adminId);
  return actor?.normRole === "owner";
}

async function denyOwnerOnly(ctx) {
  const { env, adminId } = ctx;
  await clearSession(env, `state:${adminId}`).catch(() => {});
  await sendMessage(env, adminId, buildOwnerOnlyText(), {
    parse_mode: "HTML",
    reply_markup: buildAdminManagerKeyboard(),
  });
  return true;
}

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

async function renderAdminList(ctx) {
  const rows = await listAdmins(ctx.env);

  return renderMenuMessage(ctx, buildAdminListText(rows), {
    parse_mode: "HTML",
    reply_markup: buildAdminListKeyboard(rows),
    disable_web_page_preview: true,
  });
}

async function renderAdminDetail(ctx, targetTelegramId) {
  const row = await getAdminByTelegramId(ctx.env, targetTelegramId);
  const actor = await getActor(ctx.env, ctx.adminId);
  const actorRole = actor?.normRole || "admin";

  if (!row) {
    return renderMenuMessage(ctx, "⚠️ Data admin tidak ditemukan.", {
      reply_markup: buildAdminManagerKeyboard(),
    });
  }

  return renderMenuMessage(ctx, buildAdminDetailText(row), {
    parse_mode: "HTML",
    reply_markup: buildAdminControlPanelKeyboard(row.telegram_id, row, actorRole),
  });
}

export function buildSuperadminAdminManagerHandlers() {
  const EXACT = {};
  const PREFIX = [];

  EXACT[CALLBACKS.SUPERADMIN_ADMIN_MENU] = async (ctx) => {
    const { env, adminId } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    return renderMenuMessage(ctx, buildAdminManagerText(), {
      parse_mode: "HTML",
      reply_markup: buildAdminManagerKeyboard(),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_ADMIN_LIST] = async (ctx) => {
    const { env, adminId } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});
    return renderAdminList(ctx);
  };

  EXACT[CALLBACKS.SUPERADMIN_ADMIN_ADD] = async (ctx) => {
    const { env, adminId } = ctx;

    await clearSession(env, `state:${adminId}`).catch(() => {});

    if (!(await isOwnerActor(env, adminId))) {
      return denyOwnerOnly(ctx);
    }

    const created = await createAdminInviteToken(env, {
      createdBy: adminId,
      role: "admin",
      expiryHours: 24,
    });

    const artifacts = buildInviteArtifacts(env, created?.token);

    return renderMenuMessage(
      ctx,
      buildInviteAdminText({
        inviteUrl: artifacts.inviteUrl,
        startCommand: artifacts.startCommand,
        token: created?.token,
        role: created?.role || "admin",
        expiresAt: created?.expires_at,
      }),
      {
        parse_mode: "HTML",
        reply_markup: buildAdminManagerKeyboard(),
        disable_web_page_preview: true,
      }
    );
  };

  EXACT[CALLBACKS.SUPERADMIN_ADMIN_BACK] = async (ctx) => {
    const { env, adminId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    return renderMenuMessage(ctx, buildAdminManagerText(), {
      parse_mode: "HTML",
      reply_markup: buildAdminManagerKeyboard(),
    });
  };

  PREFIX.push({
    match: (d) =>
      d.startsWith(CALLBACK_PREFIX.SA_ADMIN_OPEN) ||
      d.startsWith(CALLBACK_PREFIX.SA_ADMIN_EDIT_USERNAME) ||
      d.startsWith(CALLBACK_PREFIX.SA_ADMIN_EDIT_NAMA) ||
      d.startsWith(CALLBACK_PREFIX.SA_ADMIN_EDIT_KOTA) ||
      d.startsWith(CALLBACK_PREFIX.SA_ADMIN_EDIT_ROLE) ||
      d.startsWith(CALLBACK_PREFIX.SA_ADMIN_EDIT_STATUS) ||
      d.startsWith(CALLBACK_PREFIX.SA_ADMIN_ROLE_SET) ||
      d.startsWith(CALLBACK_PREFIX.SA_ADMIN_STATUS_SET) ||
      d.startsWith(CALLBACK_PREFIX.SA_ADMIN_DEACTIVATE) ||
      d.startsWith(CALLBACK_PREFIX.SA_ADMIN_ACTIVATE),

    run: async (ctx) => {
      const { env, adminId, data } = ctx;
      const actor = await getActor(env, adminId);
      const actorRole = actor?.normRole || "admin";

      if (data.startsWith(CALLBACK_PREFIX.SA_ADMIN_OPEN)) {
        const targetTelegramId = String(data.slice(CALLBACK_PREFIX.SA_ADMIN_OPEN.length) || "").trim();
        return renderAdminDetail(ctx, targetTelegramId);
      }

      if (data.startsWith(CALLBACK_PREFIX.SA_ADMIN_EDIT_USERNAME)) {
        if (actorRole !== "owner") {
          return denyOwnerOnly(ctx);
        }

        const targetTelegramId = String(data.slice(CALLBACK_PREFIX.SA_ADMIN_EDIT_USERNAME.length) || "").trim();
        const row = await getAdminByTelegramId(env, targetTelegramId);

        if (!row) {
          await sendMessage(env, adminId, "⚠️ Data admin tidak ditemukan.", {
            reply_markup: buildAdminManagerKeyboard(),
          });
          return true;
        }

        await saveSession(env, `state:${adminId}`, {
          mode: SESSION_MODES.SA_ADMIN_MANAGER,
          action: "edit_username",
          target_telegram_id: row.telegram_id,
          step: "await_text",
        });

        await sendMessage(
          env,
          adminId,
          [
            "✏️ <b>Edit Username Admin</b>",
            "",
            `Target: <b>${escapeHtml(row.label || "-")}</b>`,
            `Saat ini: <b>${escapeHtml(row.username ? `@${String(row.username).replace(/^@/, "")}` : "-")}</b>`,
            "",
            "Kirim username baru tanpa @ atau dengan @.",
            "Ketik <b>-</b> untuk kosongkan username.",
            "",
            "Ketik <b>batal</b> untuk keluar.",
          ].join("\n"),
          {
            parse_mode: "HTML",
            reply_markup: buildAdminControlPanelKeyboard(row.telegram_id, row, actorRole),
          }
        );

        return true;
      }

      if (data.startsWith(CALLBACK_PREFIX.SA_ADMIN_EDIT_NAMA)) {
        if (actorRole !== "owner") {
          return denyOwnerOnly(ctx);
        }

        const targetTelegramId = String(data.slice(CALLBACK_PREFIX.SA_ADMIN_EDIT_NAMA.length) || "").trim();
        const row = await getAdminByTelegramId(env, targetTelegramId);

        if (!row) {
          await sendMessage(env, adminId, "⚠️ Data admin tidak ditemukan.", {
            reply_markup: buildAdminManagerKeyboard(),
          });
          return true;
        }

        await saveSession(env, `state:${adminId}`, {
          mode: SESSION_MODES.SA_ADMIN_MANAGER,
          action: "edit_nama",
          target_telegram_id: row.telegram_id,
          step: "await_text",
        });

        await sendMessage(
          env,
          adminId,
          [
            "✏️ <b>Edit Nama Admin</b>",
            "",
            `Target: <b>${escapeHtml(row.label || "-")}</b>`,
            `Saat ini: <b>${fmtValue(row.nama)}</b>`,
            "",
            "Kirim nama baru.",
            "",
            "Ketik <b>batal</b> untuk keluar.",
          ].join("\n"),
          {
            parse_mode: "HTML",
            reply_markup: buildAdminControlPanelKeyboard(row.telegram_id, row, actorRole),
          }
        );

        return true;
      }

      if (data.startsWith(CALLBACK_PREFIX.SA_ADMIN_EDIT_KOTA)) {
        if (actorRole !== "owner") {
          return denyOwnerOnly(ctx);
        }

        const targetTelegramId = String(data.slice(CALLBACK_PREFIX.SA_ADMIN_EDIT_KOTA.length) || "").trim();
        const row = await getAdminByTelegramId(env, targetTelegramId);

        if (!row) {
          await sendMessage(env, adminId, "⚠️ Data admin tidak ditemukan.", {
            reply_markup: buildAdminManagerKeyboard(),
          });
          return true;
        }

        await saveSession(env, `state:${adminId}`, {
          mode: SESSION_MODES.SA_ADMIN_MANAGER,
          action: "edit_kota",
          target_telegram_id: row.telegram_id,
          step: "await_text",
        });

        await sendMessage(
          env,
          adminId,
          [
            "✏️ <b>Edit Kota Admin</b>",
            "",
            `Target: <b>${escapeHtml(row.label || "-")}</b>`,
            `Saat ini: <b>${fmtValue(row.kota)}</b>`,
            "",
            "Kirim kota baru.",
            "Ketik <b>-</b> untuk kosongkan kota.",
            "",
            "Ketik <b>batal</b> untuk keluar.",
          ].join("\n"),
          {
            parse_mode: "HTML",
            reply_markup: buildAdminControlPanelKeyboard(row.telegram_id, row, actorRole),
          }
        );

        return true;
      }

      if (data.startsWith(CALLBACK_PREFIX.SA_ADMIN_EDIT_ROLE)) {
        if (actorRole !== "owner") {
          return denyOwnerOnly(ctx);
        }

        const targetTelegramId = String(data.slice(CALLBACK_PREFIX.SA_ADMIN_EDIT_ROLE.length) || "").trim();
        const row = await getAdminByTelegramId(env, targetTelegramId);

        if (!row) {
          await sendMessage(env, adminId, "⚠️ Data admin tidak ditemukan.", {
            reply_markup: buildAdminManagerKeyboard(),
          });
          return true;
        }

        return renderMenuMessage(ctx, buildAdminDetailText(row), {
          parse_mode: "HTML",
          reply_markup: buildAdminRolePickerKeyboard(row.telegram_id),
        });
      }

      if (data.startsWith(CALLBACK_PREFIX.SA_ADMIN_EDIT_STATUS)) {
        if (actorRole !== "owner") {
          return denyOwnerOnly(ctx);
        }

        const targetTelegramId = String(data.slice(CALLBACK_PREFIX.SA_ADMIN_EDIT_STATUS.length) || "").trim();
        const row = await getAdminByTelegramId(env, targetTelegramId);

        if (!row) {
          await sendMessage(env, adminId, "⚠️ Data admin tidak ditemukan.", {
            reply_markup: buildAdminManagerKeyboard(),
          });
          return true;
        }

        return renderMenuMessage(ctx, buildAdminDetailText(row), {
          parse_mode: "HTML",
          reply_markup: buildAdminStatusPickerKeyboard(row.telegram_id),
        });
      }

      if (data.startsWith(CALLBACK_PREFIX.SA_ADMIN_ROLE_SET)) {
        if (actorRole !== "owner") {
          return denyOwnerOnly(ctx);
        }

        const raw = String(data.slice(CALLBACK_PREFIX.SA_ADMIN_ROLE_SET.length) || "").trim();
        const [targetTelegramId, nextRole = ""] = raw.split(":");

        const res = await updateAdminRole(env, targetTelegramId, nextRole);
        if (!res?.ok) {
          const reason = String(res?.reason || "");
          const msg =
            reason === "last_superadmin"
              ? "⛔ Superadmin aktif terakhir tidak boleh diturunkan / dinonaktifkan."
              : reason === "not_found"
                ? "⚠️ Data admin tidak ditemukan."
                : "⚠️ Gagal update role admin.";
          await sendMessage(env, adminId, msg, {
            reply_markup: buildAdminManagerKeyboard(),
          });
          return true;
        }

        return renderAdminDetail(ctx, targetTelegramId);
      }

      if (data.startsWith(CALLBACK_PREFIX.SA_ADMIN_STATUS_SET)) {
        if (actorRole !== "owner") {
          return denyOwnerOnly(ctx);
        }

        const raw = String(data.slice(CALLBACK_PREFIX.SA_ADMIN_STATUS_SET.length) || "").trim();
        const [targetTelegramId, nextStatus = ""] = raw.split(":");

        const res = await updateAdminStatus(env, targetTelegramId, nextStatus);
        if (!res?.ok) {
          const reason = String(res?.reason || "");
          const msg =
            reason === "last_superadmin"
              ? "⛔ Superadmin aktif terakhir tidak boleh dinonaktifkan."
              : reason === "not_found"
                ? "⚠️ Data admin tidak ditemukan."
                : "⚠️ Gagal update status admin.";
          await sendMessage(env, adminId, msg, {
            reply_markup: buildAdminManagerKeyboard(),
          });
          return true;
        }

        return renderAdminDetail(ctx, targetTelegramId);
      }

      if (data.startsWith(CALLBACK_PREFIX.SA_ADMIN_DEACTIVATE)) {
        if (actorRole !== "owner") {
          return denyOwnerOnly(ctx);
        }

        const targetTelegramId = String(data.slice(CALLBACK_PREFIX.SA_ADMIN_DEACTIVATE.length) || "").trim();

        const res = await deactivateAdminByTelegramId(env, targetTelegramId);
        if (!res?.ok) {
          const reason = String(res?.reason || "");
          const msg =
            reason === "last_superadmin"
              ? "⛔ Superadmin aktif terakhir tidak boleh dinonaktifkan."
              : reason === "not_found"
                ? "⚠️ Data admin tidak ditemukan."
                : "⚠️ Gagal menonaktifkan admin.";
          await sendMessage(env, adminId, msg, {
            reply_markup: buildAdminManagerKeyboard(),
          });
          return true;
        }

        return renderAdminDetail(ctx, targetTelegramId);
      }

      if (data.startsWith(CALLBACK_PREFIX.SA_ADMIN_ACTIVATE)) {
        if (actorRole !== "owner") {
          return denyOwnerOnly(ctx);
        }

        const targetTelegramId = String(data.slice(CALLBACK_PREFIX.SA_ADMIN_ACTIVATE.length) || "").trim();

        const res = await activateAdminByTelegramId(env, targetTelegramId);
        if (!res?.ok) {
          const reason = String(res?.reason || "");
          const msg =
            reason === "not_found"
              ? "⚠️ Data admin tidak ditemukan."
              : "⚠️ Gagal mengaktifkan admin.";
          await sendMessage(env, adminId, msg, {
            reply_markup: buildAdminManagerKeyboard(),
          });
          return true;
        }

        return renderAdminDetail(ctx, targetTelegramId);
      }

      return true;
    },
  });

  return { EXACT, PREFIX };
}
