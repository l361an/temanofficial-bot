// routes/telegram.flow.superadminFinance.js

import { sendMessage, sendPhoto } from "../services/telegramApi.js";
import { getSetting, upsertSetting, deleteSetting } from "../repositories/settingsRepo.js";
import { getPartnerClassLabel } from "../repositories/partnerClassesRepo.js";
import { clearSession } from "../utils/session.js";
import {
  buildFinanceKeyboard,
  buildFinanceQrisKeyboard,
  buildFinanceClassPricingKeyboard,
} from "./callbacks/keyboards.finance.js";

function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "Belum diset";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function normalizeClassId(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDurationCode(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "1h") return "1d";
  if (raw === "3h") return "3d";
  if (raw === "7h") return "7d";
  if (raw === "1m") return "1m";
  if (raw === "1d") return "1d";
  if (raw === "3d") return "3d";
  if (raw === "7d") return "7d";
  return "1m";
}

function formatDurationLabel(value) {
  const raw = normalizeDurationCode(value);
  if (raw === "1d") return "1 Hari";
  if (raw === "3d") return "3 Hari";
  if (raw === "7d") return "7 Hari";
  return "1 Bulan";
}

function buildCanonicalPriceSettingKey(classId, durationCode) {
  return `payment_price_${normalizeClassId(classId)}_${normalizeDurationCode(durationCode)}`;
}

function getDurationAliases(durationCode) {
  const code = normalizeDurationCode(durationCode);

  if (code === "1d") return ["1d", "1h"];
  if (code === "3d") return ["3d", "3h"];
  if (code === "7d") return ["7d", "7h"];
  return ["1m"];
}

function buildLegacyPriceKeyCandidates(classId, durationCode) {
  const cid = normalizeClassId(classId);
  const aliases = getDurationAliases(durationCode);
  const out = new Set();

  for (const alias of aliases) {
    out.add(`pp_price_${cid}_${alias}`);
    out.add(`payment_${cid}_${alias}`);
    out.add(`${cid}_price_${alias}`);
    out.add(`payment_price_${cid}_${alias}`);
  }

  return [...out];
}

async function cleanupLegacyPricingSlot(env, classId, durationCode) {
  const canonicalKey = buildCanonicalPriceSettingKey(classId, durationCode);
  const legacyKeys = buildLegacyPriceKeyCandidates(classId, durationCode).filter((key) => key !== canonicalKey);

  for (const key of legacyKeys) {
    await deleteSetting(env, key).catch(() => {});
  }
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

    const classId = normalizeClassId(session?.class_id);
    const durationCode = normalizeDurationCode(session?.duration_code);
    const previousAmount = Number(session?.previous_amount || 0);
    const key = buildCanonicalPriceSettingKey(classId, durationCode);

    await upsertSetting(env, key, String(amount));
    await cleanupLegacyPricingSlot(env, classId, durationCode);
    await clearSession(env, STATE_KEY).catch(() => {});

    const classLabel = await getPartnerClassLabel(env, classId).catch(() => classId);

    await sendMessage(
      env,
      chatId,
      `✅ Harga berhasil disimpan.\n\n` +
        `Class: <b>${classLabel}</b>\n` +
        `Durasi: <b>${formatDurationLabel(durationCode)}</b>\n` +
        `Harga lama: <b>${formatMoney(previousAmount)}</b>\n` +
        `Harga baru: <b>${formatMoney(amount)}</b>`,
      {
        parse_mode: "HTML",
        reply_markup: buildFinanceClassPricingKeyboard(classId),
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
