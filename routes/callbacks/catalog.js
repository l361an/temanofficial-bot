// routes/callbacks/catalog.js

import { answerCallbackQuery, editCallbackMessage } from "../../services/telegramApi.js";
import { getCatalogPartnerByTelegramId } from "../../repositories/catalogRepo.js";
import { CALLBACK_PREFIX, parseCatalogCallbackPayload } from "../telegram.constants.js";
import {
  buildCatalogPartnerDetailsText,
  buildCatalogPartnerSummaryText,
  buildCatalogPartnerReplyMarkup,
} from "../../services/catalogPublisher.js";

function normalizeString(value) {
  return String(value || "").trim();
}

async function answerAlert(env, callbackQueryId, text) {
  if (!callbackQueryId) return;
  await answerCallbackQuery(env, callbackQueryId, {
    text,
    show_alert: true,
  });
}

async function renderCatalogCard(ctx, mode) {
  const { env, msg, callbackQueryId, data } = ctx;
  const prefix =
    mode === "details"
      ? CALLBACK_PREFIX.CATALOG_DETAILS
      : CALLBACK_PREFIX.CATALOG_DETAILS_CLOSE;

  const { categoryCode, telegramId } = parseCatalogCallbackPayload(data, prefix);
  const normalizedTelegramId = normalizeString(telegramId);
  const normalizedCategoryCode = normalizeString(categoryCode).toLowerCase();

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
      ? buildCatalogPartnerDetailsText(row, normalizedCategoryCode)
      : buildCatalogPartnerSummaryText(row);

  const replyMarkup = buildCatalogPartnerReplyMarkup(
    mode,
    normalizedCategoryCode,
    normalizedTelegramId
  );

  const res = await editCallbackMessage(env, msg, text, {
    parse_mode: "HTML",
    reply_markup: replyMarkup,
    disable_web_page_preview: true,
  });

  if (!res?.ok) {
    throw new Error(res?.description || "failed_to_render_catalog_card");
  }

  await answerCallbackQuery(env, callbackQueryId, {});
}

async function handleCatalogDetails(ctx) {
  await renderCatalogCard(ctx, "details");
}

async function handleCatalogDetailsClose(ctx) {
  await renderCatalogCard(ctx, "summary");
}

async function handleCatalogBook(ctx) {
  const { env, callbackQueryId } = ctx;

  await answerCallbackQuery(env, callbackQueryId, {
    text: "under construction",
    show_alert: true,
  });
}

export function buildCatalogHandlers() {
  return {
    EXACT: {},
    PREFIX: [
      {
        match: (data) => String(data || "").startsWith(CALLBACK_PREFIX.CATALOG_DETAILS_CLOSE),
        run: handleCatalogDetailsClose,
      },
      {
        match: (data) => String(data || "").startsWith(CALLBACK_PREFIX.CATALOG_DETAILS),
        run: handleCatalogDetails,
      },
      {
        match: (data) => String(data || "").startsWith(CALLBACK_PREFIX.CATALOG_BOOK),
        run: handleCatalogBook,
      },
    ],
  };
}
