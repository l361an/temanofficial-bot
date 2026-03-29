// routes/callbacks/catalog.js

import { answerCallbackQuery, editCallbackMessage } from "../../services/telegramApi.js";
import { getCatalogPartnerByTelegramId } from "../../repositories/catalogRepo.js";
import {
  buildCatalogPartnerDetailsText,
  buildCatalogPartnerSummaryText,
  buildCatalogPartnerReplyMarkup,
} from "../../services/catalogPublisher.js";

const DETAILS_PREFIX = "catalog:details:";
const DETAILS_CLOSE_PREFIX = "catalog:details:close:";
const DETAILS_CLOSE_LEGACY_PREFIX = "catalog:close:";
const BOOK_PREFIX = "catalog:book:";

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

async function renderCatalogCard(ctx, telegramId, mode) {
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
      ? buildCatalogPartnerDetailsText(row)
      : buildCatalogPartnerSummaryText(row);

  const replyMarkup = buildCatalogPartnerReplyMarkup(mode, normalizedTelegramId);

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
  const telegramId = parseTelegramId(ctx?.data, DETAILS_PREFIX)
    .replace(/^close:/, "")
    .trim();

  await renderCatalogCard(ctx, telegramId, "details");
}

async function handleCatalogDetailsClose(ctx) {
  let telegramId = parseTelegramId(ctx?.data, DETAILS_CLOSE_PREFIX);

  if (!telegramId) {
    telegramId = parseTelegramId(ctx?.data, DETAILS_CLOSE_LEGACY_PREFIX);
  }

  await renderCatalogCard(ctx, telegramId, "summary");
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
        match: (data) => String(data || "").startsWith(DETAILS_CLOSE_PREFIX),
        run: handleCatalogDetailsClose,
      },
      {
        match: (data) => String(data || "").startsWith(DETAILS_CLOSE_LEGACY_PREFIX),
        run: handleCatalogDetailsClose,
      },
      {
        match: (data) => {
          const raw = String(data || "");
          return raw.startsWith(DETAILS_PREFIX) && !raw.startsWith(DETAILS_CLOSE_PREFIX);
        },
        run: handleCatalogDetails,
      },
      {
        match: (data) => String(data || "").startsWith(BOOK_PREFIX),
        run: handleCatalogBook,
      },
    ],
  };
}
