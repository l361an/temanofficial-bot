// routes/callbacks/superadmin.finance.js

import { sendMessage, sendPhoto, upsertCallbackMessage } from "../../services/telegramApi.js";
import { getSetting } from "../../repositories/settingsRepo.js";
import { getPartnerClassLabel } from "../../repositories/partnerClassesRepo.js";
import { saveSession, clearSession } from "../../utils/session.js";
import {
  buildFinanceKeyboard,
  buildFinanceQrisKeyboard,
  buildFinancePricingKeyboard,
  buildFinanceClassPricingKeyboard,
} from "./keyboards.finance.js";
import { CALLBACKS, CALLBACK_PREFIX, SESSION_MODES } from "../telegram.constants.js";

function getStateKey(adminId) {
  return `state:${adminId}`;
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

function buildCanonicalPriceSettingKey(classId, durationCode) {
  return `payment_price_${normalizeClassId(classId)}_${normalizeDurationCode(durationCode)}`;
}

function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "Belum diset";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function formatDurationLabel(value) {
  const raw = normalizeDurationCode(value);
  if (raw === "1d") return "1 Hari";
  if (raw === "3d") return "3 Hari";
  if (raw === "7d") return "7 Hari";
  return "1 Bulan";
}

async function getCurrentPrice(env, classId, durationCode) {
  const key = buildCanonicalPriceSettingKey(classId, durationCode);
  const raw = await getSetting(env, key);
  const amount = Number(raw || 0);

  return {
    key,
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
  };
}

async function getPricingSnapshot(env, classId) {
  const keys = {
    d1: buildCanonicalPriceSettingKey(classId, "1d"),
    d3: buildCanonicalPriceSettingKey(classId, "3d"),
    d7: buildCanonicalPriceSettingKey(classId, "7d"),
    m1: buildCanonicalPriceSettingKey(classId, "1m"),
  };

  const { results } = await env.DB.prepare(
    `
    SELECT key, value
    FROM settings
    WHERE key IN (?, ?, ?, ?)
  `
  )
    .bind(keys.d1, keys.d3, keys.d7, keys.m1)
    .all();

  const map = new Map();
  for (const row of results || []) {
    map.set(String(row.key || ""), Number(row.value || 0));
  }

  const readAmount = (key) => {
    const amount = Number(map.get(key) || 0);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  };

  return {
    d1: { key: keys.d1, amount: readAmount(keys.d1) },
    d3: { key: keys.d3, amount: readAmount(keys.d3) },
    d7: { key: keys.d7, amount: readAmount(keys.d7) },
    m1: { key: keys.m1, amount: readAmount(keys.m1) },
  };
}

function buildFinanceMenuText(manualOn) {
  return [
    "💰 <b>Finance</b>",
    "",
    `Manual Payment: <b>${manualOn ? "ON" : "OFF"}</b>`,
    "",
    "Pilih menu Finance di bawah.",
  ].join("\n");
}

function buildPricingClassText() {
  return [
    "🏷️ <b>Set Pricing</b>",
    "",
    "Pilih class aktif yang ingin diatur harganya.",
  ].join("\n");
}

function buildPricingDurationText(classLabel, snapshot) {
  return [
    "🏷️ <b>Set Pricing</b>",
    "",
    `Class: <b>${String(classLabel || "-")}</b>`,
    "",
    "<b>Harga saat ini:</b>",
    `• 1 Hari: <b>${formatMoney(snapshot?.d1?.amount)}</b>`,
    `• 3 Hari: <b>${formatMoney(snapshot?.d3?.amount)}</b>`,
    `• 7 Hari: <b>${formatMoney(snapshot?.d7?.amount)}</b>`,
    `• 1 Bulan: <b>${formatMoney(snapshot?.m1?.amount)}</b>`,
    "",
    "Pilih durasi harga yang ingin diatur.",
  ].join("\n");
}

function buildPriceInputText(classLabel, durationCode, oldAmount) {
  return [
    "💰 <b>Set Harga</b>",
    "",
    `Class: <b>${String(classLabel || "-")}</b>`,
    `Durasi: <b>${formatDurationLabel(durationCode)}</b>`,
    `Harga saat ini: <b>${formatMoney(oldAmount)}</b>`,
    "",
    "Ketik angka harga baru.",
    "Contoh: <code>150000</code>",
    "",
    "Ketik <b>batal</b> untuk keluar.",
  ].join("\n");
}

async function renderMenuMessage(ctx, text, extra) {
  const { env, adminId, msg } = ctx;

  if (msg) {
    const res = await upsertCallbackMessage(env, msg, text, extra).catch(() => null);
    if (res?.ok) return true;
  }

  await sendMessage(env, adminId, text, extra);
  return true;
}

async function openFinanceMenu(ctx) {
  const manualRaw = (await getSetting(ctx.env, "payment_manual_enabled")) ?? "1";
  const manualOn = String(manualRaw) !== "0";

  await clearSession(ctx.env, getStateKey(ctx.adminId)).catch(() => {});
  return renderMenuMessage(ctx, buildFinanceMenuText(manualOn), {
    parse_mode: "HTML",
    reply_markup: buildFinanceKeyboard(manualOn),
  });
}

function parsePricingSetPayload(data) {
  const raw = String(data || "");
  if (!raw.startsWith(CALLBACK_PREFIX.SA_FIN_PRICE_SET)) {
    return { classId: "", durationCode: "" };
  }

  const payload = raw.slice(CALLBACK_PREFIX.SA_FIN_PRICE_SET.length);
  const lastColonIndex = payload.lastIndexOf(":");
  if (lastColonIndex <= 0) return { classId: "", durationCode: "" };

  return {
    classId: normalizeClassId(payload.slice(0, lastColonIndex)),
    durationCode: normalizeDurationCode(payload.slice(lastColonIndex + 1)),
  };
}

export function buildSuperadminFinanceHandlers() {
  const EXACT = {};
  const PREFIX = [];

  EXACT[CALLBACKS.SUPERADMIN_FINANCE_MENU] = async (ctx) => {
    return openFinanceMenu(ctx);
  };

  EXACT[CALLBACKS.SUPERADMIN_FINANCE_MANUAL_TOGGLE] = async (ctx) => {
    const current = (await getSetting(ctx.env, "payment_manual_enabled")) ?? "1";
    const next = String(current) === "0" ? "1" : "0";
    await ctx.env.DB.prepare(
      `
      INSERT OR REPLACE INTO settings (key, value)
      VALUES (?, ?)
    `
    )
      .bind("payment_manual_enabled", next)
      .run();

    return openFinanceMenu(ctx);
  };

  EXACT[CALLBACKS.SUPERADMIN_FINANCE_PRICING_MENU] = async (ctx) => {
    await clearSession(ctx.env, getStateKey(ctx.adminId)).catch(() => {});

    return renderMenuMessage(ctx, buildPricingClassText(), {
      parse_mode: "HTML",
      reply_markup: await buildFinancePricingKeyboard(ctx.env),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_FINANCE_QRIS_MENU] = async (ctx) => {
    await clearSession(ctx.env, getStateKey(ctx.adminId)).catch(() => {});
    const fileId = String((await getSetting(ctx.env, "payment_qris_photo_file_id")) || "").trim();

    return renderMenuMessage(ctx, "🖼️ <b>QRIS Payment</b>\n\nKelola gambar QRIS untuk pembayaran manual.", {
      parse_mode: "HTML",
      reply_markup: buildFinanceQrisKeyboard(Boolean(fileId)),
    });
  };

  EXACT[CALLBACKS.SUPERADMIN_FINANCE_QRIS_VIEW] = async (ctx) => {
    const fileId = String((await getSetting(ctx.env, "payment_qris_photo_file_id")) || "").trim();
    if (!fileId) {
      return renderMenuMessage(ctx, "⚠️ QRIS belum diset.", {
        reply_markup: buildFinanceQrisKeyboard(false),
      });
    }

    await sendPhoto(ctx.env, ctx.adminId, fileId, "🖼️ <b>QRIS Saat Ini</b>", {
      parse_mode: "HTML",
      reply_markup: buildFinanceQrisKeyboard(true),
    });

    return true;
  };

  EXACT[CALLBACKS.SUPERADMIN_FINANCE_QRIS_SET] = async (ctx) => {
    await saveSession(ctx.env, getStateKey(ctx.adminId), {
      mode: SESSION_MODES.SA_FINANCE,
      area: "qris",
      step: "await_photo",
    });

    await sendMessage(
      ctx.env,
      ctx.adminId,
      "📸 <b>Upload QRIS</b>\n\nKirim foto QRIS baru.\n\nKetik <b>batal</b> untuk keluar.",
      {
        parse_mode: "HTML",
        reply_markup: buildFinanceQrisKeyboard(Boolean(await getSetting(ctx.env, "payment_qris_photo_file_id"))),
      }
    );

    return true;
  };

  PREFIX.push({
    match: (d) => String(d || "").startsWith(CALLBACK_PREFIX.SA_FIN_PRICING_CLASS),
    run: async (ctx) => {
      const classId = normalizeClassId(String(ctx.data || "").slice(CALLBACK_PREFIX.SA_FIN_PRICING_CLASS.length));

      const [classLabel, snapshot] = await Promise.all([
        getPartnerClassLabel(ctx.env, classId).catch(() => classId),
        getPricingSnapshot(ctx.env, classId),
      ]);

      return renderMenuMessage(ctx, buildPricingDurationText(classLabel, snapshot), {
        parse_mode: "HTML",
        reply_markup: buildFinanceClassPricingKeyboard(classId),
      });
    },
  });

  PREFIX.push({
    match: (d) => String(d || "").startsWith(CALLBACK_PREFIX.SA_FIN_PRICE_SET),
    run: async (ctx) => {
      const { classId, durationCode } = parsePricingSetPayload(ctx.data);
      if (!classId || !durationCode) {
        await sendMessage(ctx.env, ctx.adminId, "⚠️ Payload pricing tidak valid.");
        return true;
      }

      const [current, classLabel] = await Promise.all([
        getCurrentPrice(ctx.env, classId, durationCode),
        getPartnerClassLabel(ctx.env, classId).catch(() => classId),
      ]);

      await saveSession(ctx.env, getStateKey(ctx.adminId), {
        mode: SESSION_MODES.SA_FINANCE,
        area: "price",
        step: "await_text",
        class_id: classId,
        duration_code: durationCode,
        previous_amount: current.amount,
      });

      await sendMessage(
        ctx.env,
        ctx.adminId,
        buildPriceInputText(classLabel, durationCode, current.amount),
        {
          parse_mode: "HTML",
          reply_markup: buildFinanceClassPricingKeyboard(classId),
        }
      );

      return true;
    },
  });

  return { EXACT, PREFIX };
}
