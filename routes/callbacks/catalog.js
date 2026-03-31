// routes/callbacks/catalog.js

import { answerCallbackQuery, editCallbackMessage } from "../../services/telegramApi.js";
import { getCatalogPartnerByTelegramId } from "../../repositories/catalogRepo.js";
import { getProfileFullByTelegramId } from "../../repositories/profilesRepo.js";
import { findOrCreateBooking } from "../../repositories/bookingsRepo.js";
import { createBookingEvent } from "../../repositories/bookingEventsRepo.js";
import {
  buildCatalogPartnerDetailsText,
  buildCatalogPartnerSummaryText,
  buildCatalogPartnerReplyMarkup,
} from "../../services/catalogPublisher.js";
import { parseCatalogCallbackPayload, CALLBACK_PREFIX } from "../telegram.constants.js";
import { sendSelfMenu } from "../telegram.flow.selfProfile.menu.js";
import { sendBookingPanel } from "./booking.shared.js";
import { persistBookingSession } from "./booking.session.js";

const DETAILS_PREFIX = CALLBACK_PREFIX.CATALOG_DETAILS;
const DETAILS_CLOSE_PREFIX = CALLBACK_PREFIX.CATALOG_DETAILS_CLOSE;
const BOOK_PREFIX = CALLBACK_PREFIX.CATALOG_BOOK;
const DETAILS_CLOSE_LEGACY_PREFIX = "catalog:close:";

function normalizeString(value) {
  return String(value || "").trim();
}

function makeId() {
  return crypto.randomUUID();
}

async function answerAlert(env, callbackQueryId, text) {
  if (!callbackQueryId) return;
  await answerCallbackQuery(env, callbackQueryId, {
    text,
    show_alert: true,
  });
}

async function renderCatalogCard(ctx, categoryCode, telegramId, mode) {
  const { env, msg, callbackQueryId } = ctx;
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
      ? buildCatalogPartnerDetailsText(row)
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
  const { categoryCode, telegramId } = parseCatalogCallbackPayload(ctx?.data, DETAILS_PREFIX);
  await renderCatalogCard(ctx, categoryCode, telegramId, "details");
}

async function handleCatalogDetailsClose(ctx) {
  let payload = parseCatalogCallbackPayload(ctx?.data, DETAILS_CLOSE_PREFIX);

  if (!payload?.telegramId) {
    const raw = String(ctx?.data || "");
    if (raw.startsWith(DETAILS_CLOSE_LEGACY_PREFIX)) {
      payload = {
        categoryCode: "",
        telegramId: normalizeString(raw.slice(DETAILS_CLOSE_LEGACY_PREFIX.length)),
      };
    }
  }

  await renderCatalogCard(ctx, payload?.categoryCode || "", payload?.telegramId || "", "summary");
}

async function handleCatalogBook(ctx) {
  const { env, callbackQueryId, adminId, msg } = ctx;
  const actorId = normalizeString(adminId);
  const { categoryCode, telegramId: partnerTelegramId } = parseCatalogCallbackPayload(
    ctx?.data,
    BOOK_PREFIX
  );

  if (!actorId || !partnerTelegramId) {
    await answerAlert(env, callbackQueryId, "Data booking tidak valid.");
    return;
  }

  const targetPartner = await getCatalogPartnerByTelegramId(env, partnerTelegramId);
  if (!targetPartner) {
    await answerAlert(env, callbackQueryId, "Partner ini sudah tidak tersedia di katalog.");
    return;
  }

  const actorProfile = await getProfileFullByTelegramId(env, actorId).catch(() => null);
  const actorIsPartner = Boolean(actorProfile);

  if (actorIsPartner) {
    await sendSelfMenu(env, actorId, actorId).catch(() => null);

    if (actorId === String(partnerTelegramId)) {
      await answerAlert(env, callbackQueryId, "Ini profil kamu sendiri. Kamu diarahkan ke menu partner.");
      return;
    }

    await answerAlert(env, callbackQueryId, "Akun partner diarahkan ke menu partner.");
    return;
  }

  const booking = await findOrCreateBooking(env, {
    id: makeId(),
    userTelegramId: actorId,
    partnerTelegramId: String(partnerTelegramId),
    sourceCategoryCode: normalizeString(categoryCode || "").toLowerCase() || null,
  });

  await createBookingEvent(env, {
    id: makeId(),
    bookingId: booking.id,
    actorTelegramId: actorId,
    actorType: "user",
    eventType: "booking_opened_from_catalog",
    fromStatus: null,
    toStatus: booking.status,
    payload: {
      source_category_code: normalizeString(categoryCode || "").toLowerCase() || null,
      partner_telegram_id: String(partnerTelegramId),
    },
  }).catch(() => null);

  await persistBookingSession(
    env,
    actorId,
    null,
    {
      step: "panel",
      data: {
        booking_id: booking.id,
        actor_side: "user",
        source_chat_id: msg?.chat?.id ?? actorId,
        source_message_id: msg?.message_id ?? null,
      },
    },
    msg
  ).catch(() => null);

  const dmRes = await sendBookingPanel(env, actorId, booking.id, {
    noticeText: "🛡️ Booking dibuka dari katalog.",
  }).catch(() => ({ ok: false }));

  if (!dmRes?.ok) {
    await answerAlert(
      env,
      callbackQueryId,
      "Buka /start dulu di chat pribadi bot, lalu klik Safety Booking lagi."
    );
    return;
  }

  await answerAlert(env, callbackQueryId, "Panel booking sudah dikirim ke chat pribadi bot.");
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
