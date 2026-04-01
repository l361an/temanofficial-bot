// services/catalogPublisher.js

import { sendMessage, sendPhoto, deleteMessage } from "./telegramApi.js";
import { listCatalogPartners, countCatalogPartners } from "../repositories/catalogRepo.js";
import { getCatalogTargets } from "../repositories/catalogTargetsRepo.js";
import {
  getCatalogPublishState,
  findCatalogPublishStateByMessageId,
  upsertCatalogPublishState,
  removeCatalogPublishState,
} from "../repositories/catalogPublishStateRepo.js";
import { CALLBACKS } from "../routes/telegram.constants.js";

const DEFAULT_PAGE_SIZE = 3;
const VIEW_TYPE_FEED = "feed";
const VIEW_TYPE_ON_DEMAND = "on_demand";
const DETAILS_PREFIX = "catalog:details:";
const DETAILS_CLOSE_PREFIX = "catalog:details:close:";
const PAGER_PLACEHOLDER_TEXT = "Navigasi Premium Partner";

const SAFETY_BOOKING_BOT_USERNAME = "temanofficial_bot";
const SAFETY_BOOKING_START_PREFIX = "safety_booking";

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeChatId(value) {
  return normalizeString(value);
}

function normalizeTopicId(value) {
  const raw = normalizeString(value);
  return raw || null;
}

function normalizeCategoryCode(value) {
  const raw = normalizeString(value);
  return raw || null;
}

function normalizeKota(value) {
  const raw = normalizeString(value);
  return raw || null;
}

function normalizeKecamatan(value) {
  const raw = normalizeString(value);
  return raw || null;
}

function normalizeThreadId(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.floor(num);
}

function normalizePositiveInteger(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
}

function normalizeNonNegativeInteger(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.floor(num);
}

function normalizeViewType(value) {
  const raw = normalizeString(value).toLowerCase();
  return raw === VIEW_TYPE_ON_DEMAND ? VIEW_TYPE_ON_DEMAND : VIEW_TYPE_FEED;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function encodeCatalogCallbackPayload(categoryCode, telegramId) {
  const normalizedTelegramId = normalizeString(telegramId);
  const normalizedCategoryCode = normalizeLower(categoryCode);

  if (!normalizedTelegramId) return "";

  if (!normalizedCategoryCode) {
    return normalizedTelegramId;
  }

  return `${normalizedCategoryCode}:${normalizedTelegramId}`;
}

function formatMoney(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return "-";

  try {
    return new Intl.NumberFormat("id-ID").format(num);
  } catch {
    return String(Math.floor(num));
  }
}

function formatCurrencyLabel(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return "-";
  return `Rp. ${formatMoney(num)}`;
}

function buildTargetSendExtra(target = {}) {
  const threadId = normalizeThreadId(target?.topic_id);
  if (!threadId) return {};
  return { message_thread_id: threadId };
}

function buildLocationText(row) {
  const kecamatan = normalizeString(row?.kecamatan);
  const kota = normalizeString(row?.kota);

  if (kecamatan && kota) return `${kecamatan} - ${kota}`;
  if (kota) return kota;
  if (kecamatan) return kecamatan;
  return "-";
}

function buildUsernameValue(row) {
  return normalizeString(row?.username).replace(/^@+/, "");
}

function buildUsernameLink(username) {
  const clean = normalizeString(username).replace(/^@+/, "");
  if (!clean) return "-";
  return `<a href="https://t.me/${encodeURIComponent(clean)}">@${escapeHtml(clean)}</a>`;
}

function buildPartnerHeadline(row) {
  const nickname = normalizeString(row?.nickname) || "Partner";
  const username = buildUsernameValue(row);

  if (username) {
    return `<b>${escapeHtml(nickname)}</b> - ${buildUsernameLink(username)}`;
  }

  return `<b>${escapeHtml(nickname)}</b> - -`;
}

function buildCategoryLabel(row) {
  const csv = normalizeString(row?.category_codes_csv);
  if (csv) return csv;

  if (Array.isArray(row?.category_codes) && row.category_codes.length) {
    return row.category_codes.join(", ");
  }

  return "-";
}

function buildChannelHtml(url) {
  const value = normalizeString(url);
  if (!value) return "-";

  if (/^https?:\/\//i.test(value)) {
    return `<a href="${escapeHtml(value)}">${escapeHtml(value)}</a>`;
  }

  if (/^@?[A-Za-z0-9_]{5,}$/i.test(value)) {
    const clean = value.replace(/^@+/, "");
    const href = `https://t.me/${clean}`;
    return `<a href="${escapeHtml(href)}">${escapeHtml(href)}</a>`;
  }

  return escapeHtml(value);
}

function buildFilterLabel(filters = {}) {
  const kecamatan = normalizeString(filters?.kecamatan);
  const kota = normalizeString(filters?.kota);

  if (kecamatan && kota) return `${kecamatan} - ${kota}`;
  if (kota) return kota;
  return "";
}

function normalizeCatalogTarget(target = {}) {
  return {
    chat_id: normalizeChatId(target?.chat_id),
    topic_id: normalizeTopicId(target?.topic_id),
    category_code: normalizeCategoryCode(target?.category_code),
    kota: normalizeKota(target?.kota),
    kecamatan: normalizeKecamatan(target?.kecamatan),
    view_type: normalizeViewType(target?.view_type),
  };
}

function computeTotalPages(total, pageSize) {
  const safeTotal = normalizeNonNegativeInteger(total, 0);
  const safePageSize = Math.max(1, normalizePositiveInteger(pageSize, DEFAULT_PAGE_SIZE));
  if (safeTotal <= 0) return 0;
  return Math.ceil(safeTotal / safePageSize);
}

function computeLastOffset(total, pageSize) {
  const totalPages = computeTotalPages(total, pageSize);
  if (totalPages <= 1) return 0;
  return (totalPages - 1) * Math.max(1, normalizePositiveInteger(pageSize, DEFAULT_PAGE_SIZE));
}

function normalizePageOffset(offset, total, pageSize) {
  const safeOffset = normalizeNonNegativeInteger(offset, 0);
  const lastOffset = computeLastOffset(total, pageSize);
  if (safeOffset > lastOffset) return lastOffset;
  return safeOffset;
}

function sanitizeDeepLinkToken(value) {
  return normalizeString(value).replace(/[^A-Za-z0-9_-]/g, "");
}

function buildBotDeepLink(username, startPayload) {
  const cleanUsername = normalizeString(username).replace(/^@+/, "");
  const cleanPayload = sanitizeDeepLinkToken(startPayload);

  if (!cleanUsername) return "";

  if (!cleanPayload) {
    return `https://t.me/${encodeURIComponent(cleanUsername)}`;
  }

  return `https://t.me/${encodeURIComponent(cleanUsername)}?start=${encodeURIComponent(cleanPayload)}`;
}

function buildSafetyBookingStartPayload(partnerTelegramId) {
  const cleanPartnerId = sanitizeDeepLinkToken(partnerTelegramId);
  if (!cleanPartnerId) {
    return SAFETY_BOOKING_START_PREFIX;
  }

  return `${SAFETY_BOOKING_START_PREFIX}_${cleanPartnerId}`;
}

function buildSafetyBookingUrl(partnerTelegramId) {
  return buildBotDeepLink(
    SAFETY_BOOKING_BOT_USERNAME,
    buildSafetyBookingStartPayload(partnerTelegramId)
  );
}

export function buildCatalogPartnerSummaryText(row) {
  return buildPartnerHeadline(row);
}

export function buildCatalogPartnerDetailsText(row) {
  return [
    `Partner : ${buildPartnerHeadline(row)}`,
    `Area : ${escapeHtml(buildLocationText(row))}`,
    `Kategori : ${escapeHtml(buildCategoryLabel(row))}`,
    `Start From : ${escapeHtml(formatCurrencyLabel(row?.start_price))}`,
    `Channel : ${buildChannelHtml(row?.channel_url)}`,
  ].join("\n");
}

export function buildCatalogPartnerReplyMarkup(mode, categoryCodeOrTelegramId, maybeTelegramId) {
  const normalizedMode = normalizeString(mode).toLowerCase() === "details" ? "details" : "summary";
  const normalizedCategoryCode = maybeTelegramId === undefined ? "" : normalizeLower(categoryCodeOrTelegramId);
  const normalizedTelegramId = normalizeString(maybeTelegramId ?? categoryCodeOrTelegramId);

  if (!normalizedTelegramId) {
    return undefined;
  }

  const payload = encodeCatalogCallbackPayload(normalizedCategoryCode, normalizedTelegramId);
  if (!payload) {
    return undefined;
  }

  const detailButton =
    normalizedMode === "details"
      ? {
          text: "Tutup",
          callback_data: `${DETAILS_CLOSE_PREFIX}${payload}`,
        }
      : {
          text: "Details",
          callback_data: `${DETAILS_PREFIX}${payload}`,
        };

  const safetyBookingUrl = buildSafetyBookingUrl(normalizedTelegramId);

  return {
    inline_keyboard: [
      [
        detailButton,
        {
          text: "Safety Booking",
          url: safetyBookingUrl,
        },
      ],
    ],
  };
}

function buildCatalogPagerReplyMarkup(total, pageSize) {
  if (computeTotalPages(total, pageSize) <= 1) {
    return undefined;
  }

  return {
    inline_keyboard: [
      [
        { text: "⬅️ Prev", callback_data: CALLBACKS.CATALOG_PAGE_PREV },
        { text: "Next ➡️", callback_data: CALLBACKS.CATALOG_PAGE_NEXT },
      ],
    ],
  };
}

function pickCatalogPhotoFileId(row) {
  const closeup = normalizeString(row?.foto_closeup_file_id);
  const fullbody = normalizeString(row?.foto_fullbody_file_id);

  if (closeup) return closeup;
  if (fullbody) return fullbody;
  return null;
}

function buildEmptyCatalogText(categoryCode, filters = {}) {
  const locationLabel = buildFilterLabel(filters);

  if (locationLabel) {
    return [
      `📚 <b>Katalog ${escapeHtml(categoryCode || "-")}</b>`,
      `Area : <b>${escapeHtml(locationLabel)}</b>`,
      "",
      "Belum ada partner yang tersedia.",
    ].join("\n");
  }

  return [
    `📚 <b>Katalog ${escapeHtml(categoryCode || "-")}</b>`,
    "",
    "Belum ada partner yang tersedia.",
  ].join("\n");
}

async function loadCatalogBatch(env, filters = {}, options = {}) {
  const categoryCode = normalizeCategoryCode(filters?.categoryCode || filters?.category_code);
  const kota = normalizeKota(filters?.kota);
  const kecamatan = normalizeKecamatan(filters?.kecamatan);
  const pageSize = Math.max(
    1,
    Math.min(normalizePositiveInteger(options?.pageSize || DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE), 10)
  );

  if (!categoryCode) {
    return {
      total: 0,
      rows: [],
      offset: 0,
      pageSize,
      totalPages: 0,
      nextOffset: 0,
      prevOffset: 0,
    };
  }

  const total = await countCatalogPartners(env, { categoryCode, kota, kecamatan }).catch(() => 0);
  if (total <= 0) {
    return {
      total: 0,
      rows: [],
      offset: 0,
      pageSize,
      totalPages: 0,
      nextOffset: 0,
      prevOffset: 0,
    };
  }

  const offset = normalizePageOffset(options?.offset, total, pageSize);
  const rows = await listCatalogPartners(env, {
    categoryCode,
    kota,
    kecamatan,
    limit: pageSize,
    offset,
  }).catch(() => []);

  const totalPages = computeTotalPages(total, pageSize);
  const deliveredCount = rows.length;
  const nextOffset = offset + deliveredCount >= total ? 0 : offset + deliveredCount;
  const prevOffset = offset <= 0 ? computeLastOffset(total, pageSize) : Math.max(0, offset - pageSize);

  return {
    total,
    rows,
    offset,
    pageSize,
    totalPages,
    nextOffset,
    prevOffset,
  };
}

async function sendCatalogPartnerCard(env, chatId, target, row) {
  const summaryText = buildCatalogPartnerSummaryText(row);
  const replyMarkup = buildCatalogPartnerReplyMarkup(
    "summary",
    target?.category_code,
    row?.telegram_id
  );
  const sendExtra = {
    parse_mode: "HTML",
    reply_markup: replyMarkup,
    disable_web_page_preview: true,
    ...buildTargetSendExtra(target),
  };

  const photoFileId = pickCatalogPhotoFileId(row);

  if (photoFileId) {
    const photoRes = await sendPhoto(env, chatId, photoFileId, summaryText, {
      parse_mode: "HTML",
      reply_markup: replyMarkup,
      ...buildTargetSendExtra(target),
    });

    if (photoRes?.ok && photoRes?.result?.message_id) {
      return photoRes;
    }
  }

  return sendMessage(env, chatId, summaryText, sendExtra);
}

async function sendCatalogPagerFooter(env, chatId, target, batch) {
  const replyMarkup = buildCatalogPagerReplyMarkup(batch?.total, batch?.pageSize);
  if (!replyMarkup) return null;

  const res = await sendMessage(env, chatId, PAGER_PLACEHOLDER_TEXT, {
    reply_markup: replyMarkup,
    disable_web_page_preview: true,
    ...buildTargetSendExtra(target),
  });

  if (!res?.ok || !res?.result?.message_id) {
    return {
      ok: false,
      response: res || null,
    };
  }

  return {
    ok: true,
    message_id: Number(res.result.message_id),
    response: res,
  };
}

async function sendEmptyCatalogCard(env, chatId, target, categoryCode, filters = {}) {
  return sendMessage(env, chatId, buildEmptyCatalogText(categoryCode, filters), {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...buildTargetSendExtra(target),
  });
}

async function sendCatalogBatchMessages(env, target, batch) {
  const chatId = normalizeChatId(target?.chat_id);
  const sentMessageIds = [];

  for (const row of batch.rows || []) {
    const res = await sendCatalogPartnerCard(env, chatId, target, row);

    if (!res?.ok || !res?.result?.message_id) {
      return {
        ok: false,
        message_ids: sentMessageIds,
        response: res || null,
      };
    }

    sentMessageIds.push(Number(res.result.message_id));
  }

  const footer = await sendCatalogPagerFooter(env, chatId, target, batch);
  if (footer && !footer.ok) {
    return {
      ok: false,
      message_ids: sentMessageIds,
      response: footer.response || null,
    };
  }

  if (footer?.message_id) {
    sentMessageIds.push(footer.message_id);
  }

  return {
    ok: true,
    message_ids: sentMessageIds,
  };
}

async function persistCatalogBatchState(env, target, batch, messageIds, rotationCursor = 0) {
  await upsertCatalogPublishState(env, {
    chat_id: target?.chat_id,
    topic_id: target?.topic_id,
    category_code: target?.category_code,
    kota: target?.kota,
    kecamatan: target?.kecamatan,
    view_type: target?.view_type,
    message_ids: messageIds,
    partner_count: batch?.total || 0,
    page_count: batch?.totalPages || 0,
    rotation_cursor: rotationCursor,
    current_offset: batch?.offset || 0,
    page_size: batch?.pageSize || DEFAULT_PAGE_SIZE,
  });
}

async function cleanupCatalogStateMessages(env, state) {
  const normalizedState = normalizeCatalogTarget(state);
  const chatId = normalizedState.chat_id;

  if (!chatId) {
    return { ok: false, reason: "missing_chat_id", removed_count: 0, failed_message_ids: [] };
  }

  const failedMessageIds = [];
  let removedCount = 0;

  for (const messageId of state?.message_ids || []) {
    const res = await deleteMessage(env, chatId, messageId);
    if (res?.ok) {
      removedCount += 1;
      continue;
    }

    failedMessageIds.push(messageId);
  }

  await removeCatalogPublishState(env, {
    chat_id: normalizedState.chat_id,
    topic_id: normalizedState.topic_id,
    category_code: normalizedState.category_code,
    kota: normalizedState.kota,
    kecamatan: normalizedState.kecamatan,
    view_type: normalizedState.view_type,
  });

  return {
    ok: failedMessageIds.length === 0,
    removed_count: removedCount,
    failed_message_ids: failedMessageIds,
  };
}

export async function publishOnDemandCatalog(env, target = {}, options = {}) {
  const normalizedTarget = normalizeCatalogTarget({
    ...target,
    category_code: options?.categoryCode || options?.category_code || target?.category_code,
    kota: options?.kota || target?.kota,
    kecamatan: options?.kecamatan || target?.kecamatan,
    view_type: VIEW_TYPE_ON_DEMAND,
  });
  const pageSize = Math.max(
    1,
    Math.min(normalizePositiveInteger(options?.pageSize || DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE), 10)
  );

  if (!normalizedTarget.chat_id) {
    return { ok: false, reason: "missing_chat_id" };
  }

  if (!normalizedTarget.category_code) {
    return { ok: false, reason: "missing_category_code" };
  }

  const cleanup = await cleanupPublishedCatalogForTarget(env, normalizedTarget);
  const batch = await loadCatalogBatch(
    env,
    {
      categoryCode: normalizedTarget.category_code,
      kota: normalizedTarget.kota,
      kecamatan: normalizedTarget.kecamatan,
    },
    {
      pageSize,
      offset: 0,
    }
  );

  if (!batch.total || !batch.rows.length) {
    const emptyRes = await sendEmptyCatalogCard(
      env,
      normalizedTarget.chat_id,
      normalizedTarget,
      normalizedTarget.category_code,
      {
        kota: normalizedTarget.kota,
        kecamatan: normalizedTarget.kecamatan,
      }
    );

    const messageIds =
      emptyRes?.ok && emptyRes?.result?.message_id ? [Number(emptyRes.result.message_id)] : [];

    if (messageIds.length) {
      await persistCatalogBatchState(env, normalizedTarget, batch, messageIds, 0);
    }

    return {
      ok: Boolean(emptyRes?.ok),
      cleanup,
      category_code: normalizedTarget.category_code,
      kota: normalizedTarget.kota,
      kecamatan: normalizedTarget.kecamatan,
      partner_count: 0,
      visible_count: 0,
      page_count: 0,
      message_ids: messageIds,
      rotation_cursor: 0,
      current_offset: 0,
      response: emptyRes || null,
    };
  }

  const sendResult = await sendCatalogBatchMessages(env, normalizedTarget, batch);

  if (sendResult.message_ids.length) {
    await persistCatalogBatchState(env, normalizedTarget, batch, sendResult.message_ids, 0);
  }

  if (!sendResult.ok) {
    return {
      ok: false,
      reason: "telegram_send_failed",
      cleanup,
      category_code: normalizedTarget.category_code,
      kota: normalizedTarget.kota,
      kecamatan: normalizedTarget.kecamatan,
      partner_count: batch.total,
      visible_count: sendResult.message_ids.length,
      page_count: batch.totalPages,
      message_ids: sendResult.message_ids,
      rotation_cursor: 0,
      current_offset: batch.offset,
      response: sendResult.response || null,
    };
  }

  return {
    ok: true,
    cleanup,
    category_code: normalizedTarget.category_code,
    kota: normalizedTarget.kota,
    kecamatan: normalizedTarget.kecamatan,
    partner_count: batch.total,
    visible_count: batch.rows.length,
    page_count: batch.totalPages,
    message_ids: sendResult.message_ids,
    rotation_cursor: 0,
    current_offset: batch.offset,
  };
}

export async function cleanupPublishedCatalogForTarget(env, target = {}) {
  const normalizedTarget = normalizeCatalogTarget(target);

  if (!normalizedTarget.chat_id) {
    return { ok: false, reason: "missing_chat_id", removed_count: 0, failed_message_ids: [] };
  }

  const state = await getCatalogPublishState(env, normalizedTarget);

  if (!state) {
    return { ok: true, removed_count: 0, failed_message_ids: [] };
  }

  return cleanupCatalogStateMessages(env, state);
}

export async function publishCatalogToTarget(env, target = {}, options = {}) {
  const normalizedTarget = normalizeCatalogTarget({
    ...target,
    view_type: VIEW_TYPE_FEED,
  });
  const pageSize = Math.max(
    1,
    Math.min(normalizePositiveInteger(options?.pageSize || DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE), 10)
  );

  if (!normalizedTarget.chat_id) {
    return { ok: false, reason: "missing_chat_id" };
  }

  if (!normalizedTarget.category_code) {
    return { ok: false, reason: "missing_category_code" };
  }

  const previousState = await getCatalogPublishState(env, normalizedTarget).catch(() => null);
  const rotationCursor = normalizeNonNegativeInteger(previousState?.rotation_cursor, 0);
  const cleanup = previousState
    ? await cleanupCatalogStateMessages(env, previousState)
    : { ok: true, removed_count: 0, failed_message_ids: [] };

  const batch = await loadCatalogBatch(
    env,
    {
      categoryCode: normalizedTarget.category_code,
      kota: normalizedTarget.kota,
    },
    {
      pageSize,
      offset: rotationCursor,
    }
  );

  if (!batch.total || !batch.rows.length) {
    const emptyRes = await sendEmptyCatalogCard(
      env,
      normalizedTarget.chat_id,
      normalizedTarget,
      normalizedTarget.category_code,
      { kota: normalizedTarget.kota }
    );

    const messageIds =
      emptyRes?.ok && emptyRes?.result?.message_id ? [Number(emptyRes.result.message_id)] : [];

    if (messageIds.length) {
      await persistCatalogBatchState(env, normalizedTarget, batch, messageIds, 0);
    }

    return {
      ok: Boolean(emptyRes?.ok),
      cleanup,
      category_code: normalizedTarget.category_code,
      kota: normalizedTarget.kota,
      partner_count: 0,
      visible_count: 0,
      page_count: 0,
      message_ids: messageIds,
      rotation_cursor: 0,
      current_offset: 0,
      response: emptyRes || null,
    };
  }

  const sendResult = await sendCatalogBatchMessages(env, normalizedTarget, batch);

  if (sendResult.message_ids.length) {
    await persistCatalogBatchState(env, normalizedTarget, batch, sendResult.message_ids, batch.nextOffset);
  }

  if (!sendResult.ok) {
    return {
      ok: false,
      reason: "telegram_send_failed",
      cleanup,
      category_code: normalizedTarget.category_code,
      kota: normalizedTarget.kota,
      partner_count: batch.total,
      visible_count: sendResult.message_ids.length,
      page_count: batch.totalPages,
      message_ids: sendResult.message_ids,
      rotation_cursor: batch.nextOffset,
      current_offset: batch.offset,
      response: sendResult.response || null,
    };
  }

  return {
    ok: true,
    cleanup,
    category_code: normalizedTarget.category_code,
    kota: normalizedTarget.kota,
    partner_count: batch.total,
    visible_count: batch.rows.length,
    page_count: batch.totalPages,
    message_ids: sendResult.message_ids,
    rotation_cursor: batch.nextOffset,
    current_offset: batch.offset,
  };
}

export async function republishCatalogPageByMessage(env, target = {}, options = {}) {
  const chatId = normalizeChatId(target?.chat_id);
  const messageId = Number(target?.message_id);
  const direction = normalizeString(options?.direction).toLowerCase() === "prev" ? "prev" : "next";

  if (!chatId) {
    return { ok: false, reason: "missing_chat_id" };
  }

  if (!Number.isFinite(messageId) || messageId <= 0) {
    return { ok: false, reason: "missing_message_id" };
  }

  const currentState = await findCatalogPublishStateByMessageId(env, {
    chat_id: chatId,
    message_id: messageId,
  });

  if (!currentState) {
    return { ok: false, reason: "state_not_found" };
  }

  const pageSize = Math.max(
    1,
    Math.min(normalizePositiveInteger(currentState?.page_size || DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE), 10)
  );
  const total = normalizeNonNegativeInteger(currentState?.partner_count, 0);
  const totalPages = computeTotalPages(total, pageSize);

  if (totalPages <= 1) {
    return { ok: false, reason: "single_page", state: currentState };
  }

  const currentOffset = normalizePageOffset(currentState?.current_offset, total, pageSize);
  const nextOffset =
    direction === "prev"
      ? currentOffset <= 0
        ? computeLastOffset(total, pageSize)
        : Math.max(0, currentOffset - pageSize)
      : currentOffset + pageSize >= total
        ? 0
        : currentOffset + pageSize;

  const batch = await loadCatalogBatch(
    env,
    {
      categoryCode: currentState?.category_code,
      kota: currentState?.kota,
      kecamatan: currentState?.kecamatan,
    },
    {
      pageSize,
      offset: nextOffset,
    }
  );

  const cleanup = await cleanupCatalogStateMessages(env, currentState);

  if (!batch.total || !batch.rows.length) {
    const emptyRes = await sendEmptyCatalogCard(
      env,
      chatId,
      currentState,
      currentState?.category_code,
      {
        kota: currentState?.kota,
        kecamatan: currentState?.kecamatan,
      }
    );

    const messageIds =
      emptyRes?.ok && emptyRes?.result?.message_id ? [Number(emptyRes.result.message_id)] : [];

    if (messageIds.length) {
      await persistCatalogBatchState(
        env,
        {
          ...currentState,
          chat_id: chatId,
        },
        batch,
        messageIds,
        normalizeNonNegativeInteger(currentState?.rotation_cursor, 0)
      );
    }

    return {
      ok: Boolean(emptyRes?.ok),
      cleanup,
      state: currentState,
      category_code: currentState?.category_code || null,
      kota: currentState?.kota || null,
      kecamatan: currentState?.kecamatan || null,
      partner_count: 0,
      visible_count: 0,
      page_count: 0,
      message_ids: messageIds,
      rotation_cursor: normalizeNonNegativeInteger(currentState?.rotation_cursor, 0),
      current_offset: 0,
      response: emptyRes || null,
    };
  }

  const sendResult = await sendCatalogBatchMessages(env, currentState, batch);
  const preservedRotationCursor = normalizeNonNegativeInteger(currentState?.rotation_cursor, 0);

  if (sendResult.message_ids.length) {
    await persistCatalogBatchState(env, currentState, batch, sendResult.message_ids, preservedRotationCursor);
  }

  if (!sendResult.ok) {
    return {
      ok: false,
      reason: "telegram_send_failed",
      cleanup,
      state: currentState,
      category_code: currentState?.category_code || null,
      kota: currentState?.kota || null,
      kecamatan: currentState?.kecamatan || null,
      partner_count: batch.total,
      visible_count: sendResult.message_ids.length,
      page_count: batch.totalPages,
      message_ids: sendResult.message_ids,
      rotation_cursor: preservedRotationCursor,
      current_offset: batch.offset,
      response: sendResult.response || null,
    };
  }

  return {
    ok: true,
    cleanup,
    state: currentState,
    category_code: currentState?.category_code || null,
    kota: currentState?.kota || null,
    kecamatan: currentState?.kecamatan || null,
    partner_count: batch.total,
    visible_count: batch.rows.length,
    page_count: batch.totalPages,
    message_ids: sendResult.message_ids,
    rotation_cursor: preservedRotationCursor,
    current_offset: batch.offset,
  };
}

export async function publishCatalogToActiveTargets(env, options = {}) {
  const targets = await getCatalogTargets(env).catch(() => []);
  const activeTargets = (targets || []).filter(
    (item) => item?.is_active && normalizeCategoryCode(item?.category_code)
  );

  const results = [];

  for (const item of activeTargets) {
    const result = await publishCatalogToTarget(
      env,
      {
        chat_id: item.chat_id,
        topic_id: item.topic_id,
        category_code: item.category_code,
        kota: item.kota,
      },
      {
        pageSize: options?.pageSize || DEFAULT_PAGE_SIZE,
      }
    );

    results.push({
      chat_id: item.chat_id,
      topic_id: item.topic_id ?? null,
      category_code: item.category_code,
      kota: item.kota || null,
      ok: Boolean(result?.ok),
      result,
    });
  }

  return {
    ok: results.every((item) => item.ok),
    total_targets: activeTargets.length,
    success_targets: results.filter((item) => item.ok).length,
    failed_targets: results.filter((item) => !item.ok).length,
    results,
  };
}
