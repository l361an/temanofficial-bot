// routes/telegram.flow.superadminAdminManager.js

import { sendMessage } from "../services/telegramApi.js";
import {
  createAdmin,
  updateAdminUsername,
  updateAdminNama,
  updateAdminKota,
  getAdminByTelegramId,
} from "../repositories/adminsRepo.js";
import { clearSession } from "../utils/session.js";
import {
  buildAdminManagerKeyboard,
  buildAdminControlPanelKeyboard,
} from "./callbacks/keyboards.js";

function normalizeInputText(text) {
  return String(text || "").trim();
}

function cleanUsernameInput(text) {
  const raw = normalizeInputText(text);
  if (raw === "-") return "";
  return raw.replace(/^@/, "");
}

function cleanKotaInput(text) {
  const raw = normalizeInputText(text);
  if (raw === "-") return "";
  return raw;
}

function buildPanel(row) {
  return buildAdminControlPanelKeyboard(row.telegram_id, row);
}

async function cancelFlow(env, chatId, stateKey) {
  await clearSession(env, stateKey).catch(() => {});
  await sendMessage(env, chatId, "✅ Oke, input Admin Management dibatalkan.", {
    reply_markup: buildAdminManagerKeyboard(),
  });
  return true;
}

export async function handleSuperadminAdminManagerInput({
  env,
  chatId,
  text,
  session,
  STATE_KEY,
}) {
  if (String(session?.mode || "").trim().toLowerCase() !== "sa_admin_manager") {
    return false;
  }

  const rawText = normalizeInputText(text);

  if (/^(batal|cancel|keluar)$/i.test(rawText)) {
    return cancelFlow(env, chatId, STATE_KEY);
  }

  if (session?.action === "add" && session?.step === "await_telegram_id") {
    const telegramId = rawText.replace(/[^\d-]/g, "");
    if (!telegramId) {
      await sendMessage(
        env,
        chatId,
        "⚠️ Telegram ID tidak valid.\nKirim angka telegram_id.\n\nKetik <b>batal</b> untuk keluar.",
        { parse_mode: "HTML" }
      );
      return true;
    }

    session.target_telegram_id = telegramId;
    session.step = "await_username";

    await env.BOT_STATE.put(STATE_KEY, JSON.stringify(session), { expirationTtl: 3600 });

    await sendMessage(
      env,
      chatId,
      [
        "➕ <b>Add Admin</b>",
        "",
        `Telegram ID: <code>${telegramId}</code>`,
        "",
        "Kirim username admin.",
        "Boleh dengan @ atau tanpa @.",
        "Ketik <b>-</b> jika kosong.",
        "",
        "Ketik <b>batal</b> untuk keluar.",
      ].join("\n"),
      { parse_mode: "HTML" }
    );
    return true;
  }

  if (session?.action === "add" && session?.step === "await_username") {
    session.username = cleanUsernameInput(rawText);
    session.step = "await_nama";

    await env.BOT_STATE.put(STATE_KEY, JSON.stringify(session), { expirationTtl: 3600 });

    await sendMessage(
      env,
      chatId,
      [
        "➕ <b>Add Admin</b>",
        "",
        `Telegram ID: <code>${String(session.target_telegram_id || "")}</code>`,
        `Username: <b>${session.username ? `@${session.username}` : "-"}</b>`,
        "",
        "Kirim nama admin.",
        "",
        "Ketik <b>batal</b> untuk keluar.",
      ].join("\n"),
      { parse_mode: "HTML" }
    );
    return true;
  }

  if (session?.action === "add" && session?.step === "await_nama") {
    const nama = rawText;
    if (!nama) {
      await sendMessage(
        env,
        chatId,
        "⚠️ Nama tidak boleh kosong.\n\nKetik <b>batal</b> untuk keluar.",
        { parse_mode: "HTML" }
      );
      return true;
    }

    session.nama = nama;
    session.step = "await_kota";

    await env.BOT_STATE.put(STATE_KEY, JSON.stringify(session), { expirationTtl: 3600 });

    await sendMessage(
      env,
      chatId,
      [
        "➕ <b>Add Admin</b>",
        "",
        `Telegram ID: <code>${String(session.target_telegram_id || "")}</code>`,
        `Username: <b>${session.username ? `@${session.username}` : "-"}</b>`,
        `Nama: <b>${nama}</b>`,
        "",
        "Kirim kota admin.",
        "Ketik <b>-</b> jika kosong.",
        "",
        "Ketik <b>batal</b> untuk keluar.",
      ].join("\n"),
      { parse_mode: "HTML" }
    );
    return true;
  }

  if (session?.action === "add" && session?.step === "await_kota") {
    session.kota = cleanKotaInput(rawText);
    session.step = "await_role";

    await env.BOT_STATE.put(STATE_KEY, JSON.stringify(session), { expirationTtl: 3600 });

    await sendMessage(
      env,
      chatId,
      [
        "➕ <b>Add Admin</b>",
        "",
        `Telegram ID: <code>${String(session.target_telegram_id || "")}</code>`,
        `Username: <b>${session.username ? `@${session.username}` : "-"}</b>`,
        `Nama: <b>${session.nama}</b>`,
        `Kota: <b>${session.kota || "-"}</b>`,
        "",
        "Kirim role:",
        "<code>admin</code> atau <code>superadmin</code>",
        "",
        "Ketik <b>batal</b> untuk keluar.",
      ].join("\n"),
      { parse_mode: "HTML" }
    );
    return true;
  }

  if (session?.action === "add" && session?.step === "await_role") {
    const role = rawText.toLowerCase();
    if (!["admin", "superadmin"].includes(role)) {
      await sendMessage(
        env,
        chatId,
        "⚠️ Role tidak valid.\nKetik <code>admin</code> atau <code>superadmin</code>.\n\nKetik <b>batal</b> untuk keluar.",
        { parse_mode: "HTML" }
      );
      return true;
    }

    const res = await createAdmin(env, {
      telegram_id: session.target_telegram_id,
      username: session.username || null,
      nama: session.nama,
      kota: session.kota || null,
      role,
      status: "active",
    });

    if (!res?.ok) {
      const reason = String(res?.reason || "");
      const msg =
        reason === "last_superadmin"
          ? "⛔ Superadmin aktif terakhir tidak boleh diubah."
          : reason === "invalid_role"
            ? "⚠️ Role tidak valid."
            : reason === "empty_nama"
              ? "⚠️ Nama admin wajib diisi."
              : reason === "empty_telegram_id"
                ? "⚠️ Telegram ID admin wajib diisi."
                : "⚠️ Gagal menyimpan admin.";
      await sendMessage(env, chatId, msg, {
        reply_markup: buildAdminManagerKeyboard(),
      });
      return true;
    }

    await clearSession(env, STATE_KEY).catch(() => {});
    const row = res.row;

    await sendMessage(
      env,
      chatId,
      `✅ Admin berhasil ${res.action === "created" ? "ditambahkan" : "diupdate"}.`,
      {
        reply_markup: buildPanel(row),
      }
    );
    return true;
  }

  if (session?.action === "edit_username" && session?.step === "await_text") {
    const targetTelegramId = String(session?.target_telegram_id || "").trim();
    const username = cleanUsernameInput(rawText);

    const res = await updateAdminUsername(env, targetTelegramId, username);
    if (!res?.ok) {
      await clearSession(env, STATE_KEY).catch(() => {});
      await sendMessage(env, chatId, "⚠️ Gagal update username admin.", {
        reply_markup: buildAdminManagerKeyboard(),
      });
      return true;
    }

    await clearSession(env, STATE_KEY).catch(() => {});
    const row = await getAdminByTelegramId(env, targetTelegramId);

    await sendMessage(env, chatId, "✅ Username admin berhasil diupdate.", {
      reply_markup: buildPanel(row),
    });
    return true;
  }

  if (session?.action === "edit_nama" && session?.step === "await_text") {
    const targetTelegramId = String(session?.target_telegram_id || "").trim();
    const nama = rawText;

    if (!nama) {
      await sendMessage(
        env,
        chatId,
        "⚠️ Nama tidak boleh kosong.\n\nKetik <b>batal</b> untuk keluar.",
        { parse_mode: "HTML" }
      );
      return true;
    }

    const res = await updateAdminNama(env, targetTelegramId, nama);
    if (!res?.ok) {
      await clearSession(env, STATE_KEY).catch(() => {});
      await sendMessage(env, chatId, "⚠️ Gagal update nama admin.", {
        reply_markup: buildAdminManagerKeyboard(),
      });
      return true;
    }

    await clearSession(env, STATE_KEY).catch(() => {});
    const row = await getAdminByTelegramId(env, targetTelegramId);

    await sendMessage(env, chatId, "✅ Nama admin berhasil diupdate.", {
      reply_markup: buildPanel(row),
    });
    return true;
  }

  if (session?.action === "edit_kota" && session?.step === "await_text") {
    const targetTelegramId = String(session?.target_telegram_id || "").trim();
    const kota = cleanKotaInput(rawText);

    const res = await updateAdminKota(env, targetTelegramId, kota);
    if (!res?.ok) {
      await clearSession(env, STATE_KEY).catch(() => {});
      await sendMessage(env, chatId, "⚠️ Gagal update kota admin.", {
        reply_markup: buildAdminManagerKeyboard(),
      });
      return true;
    }

    await clearSession(env, STATE_KEY).catch(() => {});
    const row = await getAdminByTelegramId(env, targetTelegramId);

    await sendMessage(env, chatId, "✅ Kota admin berhasil diupdate.", {
      reply_markup: buildPanel(row),
    });
    return true;
  }

  await clearSession(env, STATE_KEY).catch(() => {});
  await sendMessage(env, chatId, "⚠️ Session Admin Management tidak valid. Balik ke menu ya.", {
    reply_markup: buildAdminManagerKeyboard(),
  });
  return true;
}
