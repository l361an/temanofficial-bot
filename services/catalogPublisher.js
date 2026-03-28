// services/catalogPublisher.js

import { sendMessage, deleteMessage } from "./telegramApi.js";
import { listCatalogPartners } from "../repositories/catalogRepo.js";
import { getCatalogTargets } from "../repositories/catalogTargetsRepo.js";
import {
  getCatalogPublishState,
  upsertCatalogPublishState,
  removeCatalogPublishState,
} from "../repositories/catalogPublishStateRepo.js";

const TELEGRAM_TEXT_LIMIT = 3900;

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeChatId(value) {
  return normalizeString(value);
}

function normalizeTopicId(value) {
  const raw = normalizeString(value);
  return raw || null;
}

function normalizeThreadId(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
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

function formatJakartaDateTime(value = new Date()) {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    }).format(value);
  } catch {
    return new Date(value).toISOString();
  }
}

function titleCase(value) {
  const raw = normalizeString(value).toLowerCase();
  if (!raw) return "-";

  return raw
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildTargetSendExtra(target = {}) {
  const threadId = normalizeThreadId(target?.topic_id);
  if (!threadId) return {};
  return { message_thread_id: threadId };
}

function buildCatalogHeader(total, pageNumber) {
  const lines = [
    "📚 <b>Katalog Partner TeMan</b>",
    `🕒 Update: <b>${escapeHtml(formatJakartaDateTime(new Date()))}</b>`,
    `👥 Total partner tampil: <b>${total}</b>`,
  ];

  if (Number(pageNumber || 1) > 1) {
    lines.push(`📄 Bagian: <b>${pageNumber}</b>`);
  }

  return lines.join("\n");
}

function buildLocationText(row) {
  const parts = [normalizeString(row?.kecamatan), normalizeString(row?.kota)].filter(Boolean);
  return parts.length ? parts.join(", ") : "-";
}

function buildPartnerName(row, index) {
  const nickname = normalizeString(row?.nickname);
  const namaLengkap = normalizeString(row?.nama_lengkap);

  if (nickname && namaLengkap && normalizeString(nickname) !== normalizeString(namaLengkap)) {
    return `${nickname} (${namaLengkap})`;
  }

  if (nickname) return nickname;
  if (namaLengkap) return namaLengkap;
  return `Partner ${index}`;
}

function buildPartnerEntry(row, index) {
  const name = escapeHtml(buildPartnerName(row, index));
  const classId = escapeHtml(titleCase(row?.class_id || row?.active_subscription_class_id));
  const categories = Array.isArray(row?.category_codes) && row.category_codes.length
    ? row.category_codes.map((item) => escapeHtml(item)).join(", ")
    : "-";
  const location = escapeHtml(buildLocationText(row));
  const startPrice = escapeHtml(
    Number(row?.start_price || 0) > 0 ? `Rp ${formatMoney(row.start_price)}` : "-"
  );
  const username = normalizeString(row?.username);
  const usernameText = username ? `@${escapeHtml(username)}` : "-";

  return [
    `${index}. <b>${name}</b>`,
    `   Class    : <b>${classId}</b>`,
    `   Kategori : ${categories}`,
    `   Lokasi   : ${location}`,
    `   Mulai    : <b>${startPrice}</b>`,
    `   Telegram : ${usernameText}`,
  ].join("\n");
}

function buildCatalogMessages(rows = []) {
  const total = Array.isArray(rows) ? rows.length : 0;

  if (!total) {
    return [
      [
        buildCatalogHeader(0, 1),
        "",
        "Belum ada partner yang siap tampil di katalog saat ini.",
      ].join("\n"),
    ];
  }

  const pages = [];
  let pageNumber = 1;
  let current = buildCatalogHeader(total, pageNumber);

  for (let i = 0; i < rows.length; i += 1) {
    const entry = buildPartnerEntry(rows[i], i + 1);
    const candidate = `${current}\n\n${entry}`;

    if (candidate.length > TELEGRAM_TEXT_LIMIT && current !== buildCatalogHeader(total, pageNumber)) {
      pages.push(current);
      pageNumber += 1;
      current = `${buildCatalogHeader(total, pageNumber)}\n\n${entry}`;
      continue;
    }

    if (candidate.length > TELEGRAM_TEXT_LIMIT) {
      const nextHeader = buildCatalogHeader(total, pageNumber);
      const budget = Math.max(500, TELEGRAM_TEXT_LIMIT - nextHeader.length - 5);
      const trimmedEntry =
        entry.length > budget ? `${entry.slice(0, budget - 1)}…` : entry;
      current = `${nextHeader}\n\n${trimmedEntry}`;
      continue;
    }

    current = candidate;
  }

  if (current) {
    pages.push(current);
  }

  return pages;
}

export async function cleanupPublishedCatalogForTarget(env, target = {}) {
  const chatId = normalizeChatId(target?.chat_id);
  const topicId = normalizeTopicId(target?.topic_id);

  if (!chatId) {
    return { ok: false, reason: "missing_chat_id", removed_count: 0, failed_message_ids: [] };
  }

  const state = await getCatalogPublishState(env, {
    chat_id: chatId,
    topic_id: topicId,
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

  if (!chatId) {
    return { ok: false, reason: "missing_chat_id" };
  }

  const cleanup = await cleanupPublishedCatalogForTarget(env, {
    chat_id: chatId,
    topic_id: topicId,
  });

  const partners = await listCatalogPartners(env, {
    limit: Number(options?.limit || 500),
    offset: 0,
  });

  const messages = buildCatalogMessages(partners);
  const sendExtra = {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...buildTargetSendExtra({ topic_id: topicId }),
  };

  const sentMessageIds = [];

  for (const text of messages) {
    const res = await sendMessage(env, chatId, text, sendExtra);

    if (!res?.ok || !res?.result?.message_id) {
      if (sentMessageIds.length) {
        await upsertCatalogPublishState(env, {
          chat_id: chatId,
          topic_id: topicId,
          message_ids: sentMessageIds,
          partner_count: partners.length,
          page_count: sentMessageIds.length,
        });
      }

      return {
        ok: false,
        reason: "telegram_send_failed",
        response: res || null,
        cleanup,
        partner_count: partners.length,
        page_count: sentMessageIds.length,
        message_ids: sentMessageIds,
      };
    }

    sentMessageIds.push(Number(res.result.message_id));
  }

  await upsertCatalogPublishState(env, {
    chat_id: chatId,
    topic_id: topicId,
    message_ids: sentMessageIds,
    partner_count: partners.length,
    page_count: sentMessageIds.length,
  });

  return {
    ok: true,
    cleanup,
    partner_count: partners.length,
    page_count: sentMessageIds.length,
    message_ids: sentMessageIds,
  };
}

export async function publishCatalogToActiveTargets(env, options = {}) {
  const targets = await getCatalogTargets(env).catch(() => []);
  const activeTargets = (targets || []).filter((item) => item?.is_active);

  const results = [];

  for (const item of activeTargets) {
    const result = await publishCatalogToTarget(
      env,
      {
        chat_id: item.chat_id,
        topic_id: item.topic_id,
      },
      options
    );

    results.push({
      chat_id: item.chat_id,
      topic_id: item.topic_id ?? null,
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
