// routes/telegram.flow.superadminFinance.js

import { sendMessage, sendPhoto } from "../services/telegramApi.js";
import { getSetting, upsertSetting } from "../repositories/settingsRepo.js";
import { clearSession } from "../utils/session.js";
import { buildFinanceKeyboard, buildFinanceQrisKeyboard } from "./callbacks/keyboards.js";

function formatClassLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "bronze") return "Bronze";
  if (raw === "gold") return "Gold";
  if (raw === "platinum") return "Platinum";
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "-";
}

function formatDurationLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "1d") return "1 Hari";
  if (raw === "3d") return "3 Hari";
  if (raw === "7d") return "7 Hari";
  return "1 Bulan";
}

function buildPriceSettingKey(classId, durationCode) {
  return `payment_price_${String(classId || "").trim().toLowerCase()}_${String(durationCode || "")
    .trim()
    .toLowerCase()}`;
}

async function buildFinanceMenuKeyboard(env) {
  const manualRaw = (await getSetting(env, "payment_manual_enabled")) ?? "1";
  const manualOn = String(manualRaw) !== "0";
  return buildFinanceKeyboard(manualOn);
}

async function cancelFinanceSession(env, chatId, stateKey) {
  await clearSession(env, stateKey).catch(() => {});
  await sendMessage(env, chatId, "✅ Oke, input Finance dibatalkan.", {
    reply_markup: await buildFinanceMenuKeyboard(env),
  });
  return true;
}

export async function handleSuperadminFinanceInput({
  env,
  chatId,
  telegramId,
  text,
  session,
  STATE_KEY,
  update,
}) {
  if (String(session?.mode || "").trim().toLowerCase() !== "sa_finance") {
    return false;
  }

  const rawText = String(text || "").trim();

  if (/^(batal|cancel|keluar)$/i.test(rawText)) {
    return cancelFinanceSession(env, chatId, STATE_KEY);
  }

  if (session?.area === "price" && session?.step === "await_text") {
    const normalized = rawText.replace(/[^\d]/g, "");
    const amount = Number(normalized || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      await sendMessage(
        env,
        chatId,
        "⚠️ Harga tidak valid.\nKetik angka saja.\nContoh: <code>150000</code>\n\nKetik <b>batal</b> untuk keluar.",
        { parse_mode: "HTML" }
      );
      return true;
    }

    const classId = String(session?.class_id || "").trim().toLowerCase();
    const durationCode = String(session?.duration_code || "").trim().toLowerCase();
    const key = buildPriceSettingKey(classId, durationCode);

    await upsertSetting(env, key, String(amount));
    await clearSession(env, STATE_KEY).catch(() => {});

    await sendMessage(
      env,
      chatId,
      `✅ Harga berhasil disimpan.\n${formatClassLabel(classId)} - ${formatDurationLabel(durationCode)} = Rp ${amount.toLocaleString("id-ID")}`,
      {
        reply_markup: await buildFinanceMenuKeyboard(env),
      }
    );
    return true;
  }

  if (session?.area === "qris" && session?.step === "await_photo") {
    const photos = update?.message?.photo || [];
    if (!photos.length) {
      await sendMessage(
        env,
        chatId,
        "⚠️ Kirim <b>photo</b> QRIS ya, bukan file atau teks.\n\nKetik <b>batal</b> untuk keluar.",
        {
          parse_mode: "HTML",
          reply_markup: buildFinanceQrisKeyboard(Boolean(await getSetting(env, "payment_qris_photo_file_id"))),
        }
      );
      return true;
    }

    const best = photos[photos.length - 1];
    const fileId = best?.file_id ? String(best.file_id) : "";
    if (!fileId) {
      await sendMessage(env, chatId, "⚠️ Gagal membaca foto QRIS. Kirim ulang ya.");
      return true;
    }

    await upsertSetting(env, "payment_qris_photo_file_id", fileId);
    await clearSession(env, STATE_KEY).catch(() => {});

    await sendPhoto(env, chatId, fileId, "✅ <b>Foto QRIS berhasil disimpan.</b>", {
      parse_mode: "HTML",
      reply_markup: buildFinanceQrisKeyboard(true),
    });
    return true;
  }

  await clearSession(env, STATE_KEY).catch(() => {});
  await sendMessage(env, chatId, "⚠️ Session Finance tidak valid. Balik ke menu ya.", {
    reply_markup: await buildFinanceMenuKeyboard(env),
  });
  return true;
}
