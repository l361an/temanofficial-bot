// routes/callbacks/catalog.js

import { answerCallbackQuery, editCallbackMessage } from "../../services/telegramApi.js";
import { getCatalogPartnerByTelegramId } from "../../repositories/catalogRepo.js";
import { getCatalogPartnerStatsByTelegramId } from "../../repositories/catalogStatsRepo.js";
import { CALLBACK_PREFIX } from "../telegram.constants.js";
import {
  buildCatalogPartnerDetailsText,
  buildCatalogPartnerSummaryText,
  buildCatalogPartnerReplyMarkup,
} from "../../services/catalogPublisher.js";

function normalizeString(value) {
  return String(value || "").trim();
}

function parseTelegramId(data, prefix) {
  const raw = String(data || "");
  if (!raw.startsWith(prefix)) return "";
  return normalizeString(raw.slice(prefix.length));
}

async function answerAlert(env, callbackQueryId, text) {
  if (!callbackQueryId) return;
  await answerCallbackQuery(env, callbackQueryId, {
    text,
    show_alert: true,
  });
}

async function renderCatalogMessage(ctx, telegramId, mode) {
  const { env, msg, callbackQueryId } = ctx;
  const normalizedTelegramId = normalizeString(telegramId);

  if (!normalizedTelegramId) {
    await answerAlert(env, callbackQueryId, "Data partner tidak valid.");
    return;
  }

  const row = await getCatalogPartnerByTelegramId(env, normalizedTelegramId);

  if (!row) {
    await answerAlert(env, callbackQueryId, "Partner ini sudah tidak tersedia di katalog.");
    return;
  }

  const text =
    mode === "details"
      ? buildCatalogPartnerDetailsText(
          row,
          await getCatalogPartnerStatsByTelegramId(env, normalizedTelegramId)
        )
      : buildCatalogPartnerSummaryText(row);

  const replyMarkup = buildCatalogPartnerReplyMarkup(mode, normalizedTelegramId);

  const res = await editCallbackMessage(env, msg, text, {
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });

  if (!res?.ok) {
    throw new Error(res?.description || "failed_to_render_catalog_message");
  }

  if (callbackQueryId) {
    await answerCallbackQuery(env, callbackQueryId, {});
  }
}

async function handleCatalogDetailsOpen(ctx) {
  const telegramId = parseTelegramId(ctx?.data, CALLBACK_PREFIX.CATALOG_DETAILS_OPEN);
  await renderCatalogMessage(ctx, telegramId, "details");
}

async function handleCatalogDetailsClose(ctx) {
  const telegramId = parseTelegramId(ctx?.data, CALLBACK_PREFIX.CATALOG_DETAILS_CLOSE);
  await renderCatalogMessage(ctx, telegramId, "summary");
}

async function handleCatalogBook(ctx) {
  const { env, callbackQueryId } = ctx;

  await answerCallbackQuery(env, callbackQueryId, {
    text: "Safety Booking belum aktif. Tombol ini baru disiapkan dulu.",
    show_alert: true,
  });
}

export function buildCatalogHandlers() {
  return {
    EXACT: {},
    PREFIX: [
      {
        match: (data) => String(data || "").startsWith(CALLBACK_PREFIX.CATALOG_DETAILS_OPEN),
        run: handleCatalogDetailsOpen,
      },
      {
        match: (data) => String(data || "").startsWith(CALLBACK_PREFIX.CATALOG_DETAILS_CLOSE),
        run: handleCatalogDetailsClose,
      },
      {
        match: (data) => String(data || "").startsWith(CALLBACK_PREFIX.CATALOG_BOOK),
        run: handleCatalogBook,
      },
    ],
  };
}
