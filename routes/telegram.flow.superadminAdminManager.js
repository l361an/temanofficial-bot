// routes/telegram.flow.superadminAdminManager.js

import { sendMessage } from "../services/telegramApi.js";
import {
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

function buildPanel(row, actorRole = "owner") {
  return buildAdminControlPanelKeyboard(row.telegram_id, row, actorRole);
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
      reply_markup: buildPanel(row, "owner"),
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
      reply_markup: buildPanel(row, "owner"),
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
      reply_markup: buildPanel(row, "owner"),
    });
    return true;
  }

  await clearSession(env, STATE_KEY).catch(() => {});
  await sendMessage(env, chatId, "⚠️ Session Admin Management tidak valid. Balik ke menu ya.", {
    reply_markup: buildAdminManagerKeyboard(),
  });
  return true;
}
