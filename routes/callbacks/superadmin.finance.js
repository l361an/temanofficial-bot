// routes/callbacks/superadmin.finance.js

import { sendMessage, sendPhoto, upsertCallbackMessage } from "../../services/telegramApi.js";
import { getSetting, upsertSetting } from "../../repositories/settingsRepo.js";
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

function buildPricingDurationText(classLabel) {
  return [
    "🏷️ <b>Set Pricing</b>",
    "",
    `Class: <b>${String(classLabel || "-")}</b>`,
    "",
    "Pilih durasi harga yang ingin diatur.",
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

async function buildFinanceMenuKeyboard(env) {
  const manualRaw = (await getSetting(env, "payment_manual_enabled")) ?? "1";
  const manualOn = String(manualRaw) !== "0";
  return buildFinanceKeyboard(manualOn);
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
    classId: String(payload.slice(0, lastColonIndex) || "").trim().toLowerCase(),
    durationCode: String(payload.slice(lastColonIndex + 1) || "").trim().toLowerCase(),
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
    await upsertSetting(ctx.env, "payment_manual_enabled", next);
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
      const classId = String(ctx.data || "").slice(CALLBACK_PREFIX.SA_FIN_PRICING_CLASS.length).trim().toLowerCase();
      const classLabel = await getPartnerClassLabel(ctx.env, classId).catch(() => classId);

      return renderMenuMessage(ctx, buildPricingDurationText(classLabel), {
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

      await saveSession(ctx.env, getStateKey(ctx.adminId), {
        mode: SESSION_MODES.SA_FINANCE,
        area: "price",
        step: "await_text",
        class_id: classId,
        duration_code: durationCode,
      });

      const classLabel = await getPartnerClassLabel(ctx.env, classId).catch(() => classId);

      await sendMessage(
        ctx.env,
        ctx.adminId,
        `💰 <b>Set Harga</b>\n\nClass: <b>${classLabel}</b>\nDurasi: <b>${durationCode}</b>\n\nKetik angka harga.\nContoh: <code>150000</code>\n\nKetik <b>batal</b> untuk keluar.`,
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
