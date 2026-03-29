// services/catalogPublisher.js

import { sendMessage, sendPhoto, deleteMessage } from "./telegramApi.js";
import { listCatalogPartners, countCatalogPartners } from "../repositories/catalogRepo.js";
import { getCatalogTargets } from "../repositories/catalogTargetsRepo.js";
import {
  getCatalogPublishState,
  upsertCatalogPublishState,
  removeCatalogPublishState,
} from "../repositories/catalogPublishStateRepo.js";

const DEFAULT_PAGE_SIZE = 3;
const DETAILS_PREFIX = "catalog:details:";
const DETAILS_CLOSE_PREFIX = "catalog:details:close:";
const BOOK_PREFIX = "catalog:book:";

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
  const raw = normalizeLower(value);
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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

export function buildCatalogPartnerReplyMarkup(mode, telegramId) {
  const normalizedMode = normalizeString(mode).toLowerCase() === "details" ? "details" : "summary";
  const normalizedTelegramId = normalizeString(telegramId);

  if (!normalizedTelegramId) {
    return undefined;
  }

  const detailButton =
    normalizedMode === "details"
      ? {
          text: "Tutup",
          callback_data: `${DETAILS_CLOSE_PREFIX}${normalizedTelegramId}`,
        }
      : {
          text: "Details",
          callback_data: `${DETAILS_PREFIX}${normalizedTelegramId}`,
        };

  return {
    inline_keyboard: [
      [
        detailButton,
        {
          text: "Safety Booking",
          callback_data: `${BOOK_PREFIX}${normalizedTelegramId}`,
        },
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

function computeNextCursor(total, offset, deliveredCount) {
  const safeTotal = normalizeNonNegativeInteger(total, 0);
  const safeOffset = normalizeNonNegativeInteger(offset, 0);
  const safeDeliveredCount = normalizeNonNegativeInteger(deliveredCount, 0);

  if (safeTotal <= 0) return 0;
  if (safeDeliveredCount <= 0) return safeOffset >= safeTotal ? 0 : safeOffset;
  if (safeDeliveredCount >= safeTotal) return 0;

  return (safeOffset + safeDeliveredCount) % safeTotal;
}

async function loadPartnerBatchForTarget(env, target = {}, pageSize = DEFAULT_PAGE_SIZE) {
  const categoryCode = normalizeCategoryCode(target?.category_code);
  const safePageSize = Math.max(1, Math.min(normalizePositiveInteger(pageSize, DEFAULT_PAGE_SIZE), 10));

  if (!categoryCode) {
    return {
      total: 0,
      rows: [],
      offset: 0,
      nextCursor: 0,
    };
  }

  const total = await countCatalogPartners(env, { categoryCode }).catch(() => 0);

  if (total <= 0) {
    return {
      total: 0,
      rows: [],
      offset: 0,
      nextCursor: 0,
    };
  }

  const previousState = await getCatalogPublishState(env, {
    chat_id: target?.chat_id,
    topic_id: target?.topic_id,
    category_code: categoryCode,
  }).catch(() => null);

  let offset = normalizeNonNegativeInteger(previousState?.rotation_cursor, 0);
  if (offset >= total) offset = 0;

  let rows = await listCatalogPartners(env, {
    categoryCode,
    limit: safePageSize,
    offset,
  }).catch(() => []);

  const expectedVisibleCount = Math.min(total, safePageSize);

  if (rows.length < expectedVisibleCount && total > rows.length && offset > 0) {
    const remaining = expectedVisibleCount - rows.length;

    if (remaining > 0) {
      const wrapRows = await listCatalogPartners(env, {
        categoryCode,
        limit: remaining,
        offset: 0,
      }).catch(() => []);

      const seen = new Set(rows.map((item) => normalizeString(item?.telegram_id)));

      for (const row of wrapRows) {
        const telegramId = normalizeString(row?.telegram_id);
        if (!telegramId || seen.has(telegramId)) continue;
        seen.add(telegramId);
        rows.push(row);
      }
    }
  }

  rows = rows.slice(0, safePageSize);

  return {
    total,
    rows,
    offset,
    nextCursor: computeNextCursor(total, offset, rows.length),
  };
}

async function sendCatalogPartnerCard(env, chatId, target, row) {
  const summaryText = buildCatalogPartnerSummaryText(row);
  const replyMarkup = buildCatalogPartnerReplyMarkup("summary", row?.telegram_id);
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

async function sendEmptyCatalogCard(env, chatId, target, categoryCode, filters = {}) {
  return sendMessage(env, chatId, buildEmptyCatalogText(categoryCode, filters), {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...buildTargetSendExtra(target),
  });
}

export async function publishOnDemandCatalog(env, target = {}, options = {}) {
  const chatId = normalizeChatId(target?.chat_id);
  const topicId = normalizeTopicId(target?.topic_id);
  const categoryCode = normalizeCategoryCode(
    options?.categoryCode || options?.category_code || target?.category_code
  );
  const pageSize = Math.max(
    1,
    Math.min(normalizePositiveInteger(options?.pageSize || DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE), 10)
  );
  const kota = normalizeString(options?.kota || target?.kota);
  const kecamatan = normalizeString(options?.kecamatan || target?.kecamatan);

  if (!chatId) {
    return { ok: false, reason: "missing_chat_id" };
  }

  if (!categoryCode) {
    return { ok: false, reason: "missing_category_code" };
  }

  const rows = await listCatalogPartners(env, {
    categoryCode,
    kota,
    kecamatan,
    limit: pageSize,
    offset: 0,
  }).catch(() => []);

  if (!rows.length) {
    const emptyRes = await sendEmptyCatalogCard(
      env,
      chatId,
      { topic_id: topicId },
      categoryCode,
      { kota, kecamatan }
    );

    return {
      ok: Boolean(emptyRes?.ok),
      category_code: categoryCode,
      visible_count: 0,
      response: emptyRes || null,
    };
  }

  const messageIds = [];

  for (const row of rows) {
    const res = await sendCatalogPartnerCard(
      env,
      chatId,
      { topic_id: topicId },
      row
    );

    if (!res?.ok || !res?.result?.message_id) {
      return {
        ok: false,
        reason: "telegram_send_failed",
        category_code: categoryCode,
        visible_count: messageIds.length,
        message_ids: messageIds,
        response: res || null,
      };
    }

    messageIds.push(Number(res.result.message_id));
  }

  return {
    ok: true,
    category_code: categoryCode,
    visible_count: rows.length,
    message_ids: messageIds,
  };
}

export async function cleanupPublishedCatalogForTarget(env, target = {}) {
  const chatId = normalizeChatId(target?.chat_id);
  const topicId = normalizeTopicId(target?.topic_id);
  const categoryCode = normalizeCategoryCode(target?.category_code);

  if (!chatId) {
    return { ok: false, reason: "missing_chat_id", removed_count: 0, failed_message_ids: [] };
  }

  const state = await getCatalogPublishState(env, {
    chat_id: chatId,
    topic_id: topicId,
    category_code: categoryCode,
  });

  if (!state) {
    return { ok: true, removed_count: 0, failed_message_ids: [] };
  }

  const failedMessageIds = [];
  let removedCount = 0;

  for (const messageId of state.message_ids || []) {
    const res = await deleteMessage(env, chatId, messageId);
    if (res?.ok) {
      removedCount += 1;
      continue;
    }

    failedMessageIds.push(messageId);
  }

  await removeCatalogPublishState(env, {
    chat_id: chatId,
    topic_id: topicId,
    category_code: categoryCode,
  });

  return {
    ok: failedMessageIds.length === 0,
    removed_count: removedCount,
    failed_message_ids: failedMessageIds,
  };
}

export async function publishCatalogToTarget(env, target = {}, options = {}) {
  const chatId = normalizeChatId(target?.chat_id);
  const topicId = normalizeTopicId(target?.topic_id);
  const categoryCode = normalizeCategoryCode(target?.category_code);
  const pageSize = Math.max(
    1,
    Math.min(normalizePositiveInteger(options?.pageSize || DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE), 10)
  );

  if (!chatId) {
    return { ok: false, reason: "missing_chat_id" };
  }

  if (!categoryCode) {
    return { ok: false, reason: "missing_category_code" };
  }

  const cleanup = await cleanupPublishedCatalogForTarget(env, {
    chat_id: chatId,
    topic_id: topicId,
    category_code: categoryCode,
  });

  const batch = await loadPartnerBatchForTarget(
    env,
    {
      chat_id: chatId,
      topic_id: topicId,
      category_code: categoryCode,
    },
    pageSize
  );

  const sentMessageIds = [];

  if (!batch.total || !batch.rows.length) {
    const emptyRes = await sendEmptyCatalogCard(
      env,
      chatId,
      { topic_id: topicId },
      categoryCode
    );

    if (!emptyRes?.ok || !emptyRes?.result?.message_id) {
      return {
        ok: false,
        reason: "telegram_send_failed",
        response: emptyRes || null,
        cleanup,
        category_code: categoryCode,
        partner_count: 0,
        visible_count: 0,
        page_count: 0,
        message_ids: [],
        rotation_cursor: 0,
      };
    }

    sentMessageIds.push(Number(emptyRes.result.message_id));

    await upsertCatalogPublishState(env, {
      chat_id: chatId,
      topic_id: topicId,
      category_code: categoryCode,
      message_ids: sentMessageIds,
      partner_count: 0,
      page_count: sentMessageIds.length,
      rotation_cursor: 0,
    });

    return {
      ok: true,
      cleanup,
      category_code: categoryCode,
      partner_count: 0,
      visible_count: 0,
      page_count: sentMessageIds.length,
      message_ids: sentMessageIds,
      rotation_cursor: 0,
    };
  }

  for (const row of batch.rows) {
    const res = await sendCatalogPartnerCard(
      env,
      chatId,
      { topic_id: topicId },
      row
    );

    if (!res?.ok || !res?.result?.message_id) {
      if (sentMessageIds.length) {
        await upsertCatalogPublishState(env, {
          chat_id: chatId,
          topic_id: topicId,
          category_code: categoryCode,
          message_ids: sentMessageIds,
          partner_count: batch.total,
          page_count: sentMessageIds.length,
          rotation_cursor: batch.nextCursor,
        });
      }

      return {
        ok: false,
        reason: "telegram_send_failed",
        response: res || null,
        cleanup,
        category_code: categoryCode,
        partner_count: batch.total,
        visible_count: sentMessageIds.length,
        page_count: sentMessageIds.length,
        message_ids: sentMessageIds,
        rotation_cursor: batch.nextCursor,
      };
    }

    sentMessageIds.push(Number(res.result.message_id));
  }

  await upsertCatalogPublishState(env, {
    chat_id: chatId,
    topic_id: topicId,
    category_code: categoryCode,
    message_ids: sentMessageIds,
    partner_count: batch.total,
    page_count: sentMessageIds.length,
    rotation_cursor: batch.nextCursor,
  });

  return {
    ok: true,
    cleanup,
    category_code: categoryCode,
    partner_count: batch.total,
    visible_count: batch.rows.length,
    page_count: sentMessageIds.length,
    message_ids: sentMessageIds,
    rotation_cursor: batch.nextCursor,
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
      },
      {
        pageSize: options?.pageSize || DEFAULT_PAGE_SIZE,
      }
    );

    results.push({
      chat_id: item.chat_id,
      topic_id: item.topic_id ?? null,
      category_code: item.category_code,
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
