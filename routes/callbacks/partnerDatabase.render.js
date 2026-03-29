// routes/callbacks/partnerDatabase.render.js

import {
  sendMessage,
  sendPhoto,
  upsertCallbackMessage,
  editMessageReplyMarkup,
} from "../../services/telegramApi.js";
import {
  getProfileFullByTelegramId,
  listCategoryKodesByProfileId,
} from "../../repositories/profilesRepo.js";
import { getAdminByTelegramId } from "../../repositories/adminsRepo.js";
import { getSubscriptionInfoByTelegramId } from "../../repositories/partnerSubscriptionsRepo.js";

import {
  buildBackToPartnerDatabaseKeyboard,
  buildPartnerControlPanelKeyboard,
  buildPartnerDetailsKeyboard,
  buildPartnerSubscriptionKeyboard,
} from "./keyboards.partner.js";

import { cleanHandle } from "../../utils/partnerHelpers.js";

import {
  readSourceMessage,
  persistPartnerViewSession,
} from "./partnerDatabase.session.js";

import {
  buildPartnerViewPromptText,
  buildPartnerControlPanelText,
  buildPartnerDetailsText,
  buildPartnerSubscriptionText,
} from "./partnerDatabase.format.js";

export { buildPartnerViewPromptText } from "./partnerDatabase.format.js";

function logRenderWarning(tag, meta = {}) {
  console.error(tag, meta);
}

function buildAnchorResult(baseChatId, baseMessageId, apiRes = null) {
  const resolvedChatId =
    apiRes?.chat_id ?? apiRes?.result?.chat?.id ?? baseChatId ?? null;

  const resolvedMessageId =
    apiRes?.message_id ?? apiRes?.result?.message_id ?? baseMessageId ?? null;

  return {
    ok: Boolean(apiRes?.ok),
    anchor_chat_id: resolvedChatId,
    anchor_message_id: resolvedMessageId,
    mode: apiRes?.mode ?? null,
    strategy: apiRes?.strategy ?? null,
    response: apiRes ?? null,
  };
}

async function safeInvalidateSourcePanel(env, sourceMessage, context = {}) {
  const chatId = sourceMessage?.chat?.id ?? null;
  const messageId = sourceMessage?.message_id ?? null;

  if (!chatId || !messageId) {
    return {
      ok: false,
      skipped: true,
      description: "source_message_not_found",
      chat_id: chatId,
      message_id: messageId,
    };
  }

  try {
    const res = await editMessageReplyMarkup(env, chatId, messageId, null);
    if (res?.ok) {
      return {
        ok: true,
        skipped: false,
        chat_id: chatId,
        message_id: messageId,
        response: res,
      };
    }

    logRenderWarning("[partnerDatabase.render.invalidate_source_panel_failed]", {
      chatId,
      messageId,
      description: res?.description || null,
      ...context,
    });

    return {
      ok: false,
      skipped: false,
      description: res?.description || "failed_to_invalidate_source_panel",
      chat_id: chatId,
      message_id: messageId,
      response: res || null,
    };
  } catch (err) {
    logRenderWarning("[partnerDatabase.render.invalidate_source_panel_exception]", {
      chatId,
      messageId,
      err: err?.message || String(err || ""),
      ...context,
    });

    return {
      ok: false,
      skipped: false,
      description: err?.message || "exception_invalidating_source_panel",
      chat_id: chatId,
      message_id: messageId,
      response: null,
    };
  }
}

async function getLatestPaymentTicket(env, partnerId) {
  const row = await env.DB.prepare(
    `
    SELECT *
    FROM payment_tickets
    WHERE partner_id = ?
    ORDER BY datetime(created_at) DESC, datetime(updated_at) DESC, id DESC
    LIMIT 1
  `
  )
    .bind(String(partnerId))
    .first();

  return row ?? null;
}

async function loadPartnerContext(env, telegramId) {
  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile) return null;

  const categories = profile.id
    ? await listCategoryKodesByProfileId(env, profile.id).catch((err) => {
        logRenderWarning("[partnerDatabase.render.load_context.categories_failed]", {
          telegramId,
          profileId: profile.id,
          err: err?.message || String(err || ""),
        });
        return [];
      })
    : [];

  let verificatorDisplay = "-";
  if (profile.verificator_admin_id) {
    const vid = String(profile.verificator_admin_id);
    const vRow = await getAdminByTelegramId(env, vid).catch((err) => {
      logRenderWarning("[partnerDatabase.render.load_context.verificator_lookup_failed]", {
        telegramId,
        verificatorAdminId: vid,
        err: err?.message || String(err || ""),
      });
      return null;
    });

    const vUser = vRow?.username
      ? cleanHandle(vRow.username)
      : vRow?.label
        ? String(vRow.label)
        : "-";

    verificatorDisplay = `${vid} - ${vUser || "-"}`;
  }

  const subInfo = await getSubscriptionInfoByTelegramId(env, telegramId).catch((err) => {
    logRenderWarning("[partnerDatabase.render.load_context.subscription_lookup_failed]", {
      telegramId,
      err: err?.message || String(err || ""),
    });

    return {
      found: false,
      is_active: false,
      row: null,
    };
  });

  const latestPayment = await getLatestPaymentTicket(env, telegramId).catch((err) => {
    logRenderWarning("[partnerDatabase.render.load_context.latest_payment_lookup_failed]", {
      telegramId,
      err: err?.message || String(err || ""),
    });
    return null;
  });

  return {
    profile,
    categories,
    subInfo,
    latestPayment,
    verificatorDisplay,
  };
}

function collectDetailPhotos(profile) {
  return [
    { fileId: profile?.foto_closeup_file_id, label: "📸 <b>Foto Closeup</b>" },
    { fileId: profile?.foto_fullbody_file_id, label: "📸 <b>Foto Fullbody</b>" },
    { fileId: profile?.foto_ktp_file_id, label: "🪪 <b>Foto KTP</b>" },
  ].filter((item) => item.fileId);
}

export async function renderPartnerDatabaseMessage(
  env,
  adminId,
  text,
  replyMarkup,
  {
    session = null,
    fallbackMessage = null,
    parseMode = "HTML",
    disableWebPreview = true,
    forceNewMessage = false,
  } = {}
) {
  const sourceMessage = forceNewMessage
    ? null
    : readSourceMessage(session, fallbackMessage, adminId);

  const extra = {
    parse_mode: parseMode,
    reply_markup: replyMarkup,
    disable_web_page_preview: disableWebPreview,
  };

  if (sourceMessage) {
    const res = await upsertCallbackMessage(env, sourceMessage, text, extra).catch((err) => {
      logRenderWarning("[partnerDatabase.render.upsert_callback_message_exception]", {
        adminId,
        sourceChatId: sourceMessage?.chat?.id ?? null,
        sourceMessageId: sourceMessage?.message_id ?? null,
        err: err?.message || String(err || ""),
      });

      return {
        ok: false,
        mode: "failed",
        strategy: "upsert_exception",
        description: err?.message || "upsert_callback_message_exception",
      };
    });

    return buildAnchorResult(
      sourceMessage?.chat?.id ?? adminId,
      sourceMessage?.message_id ?? null,
      res
    );
  }

  const sent = await sendMessage(env, adminId, text, extra).catch((err) => {
    logRenderWarning("[partnerDatabase.render.send_message_exception]", {
      adminId,
      err: err?.message || String(err || ""),
    });

    return {
      ok: false,
      mode: "failed",
      strategy: "send_exception",
      description: err?.message || "send_message_exception",
    };
  });

  return buildAnchorResult(adminId, null, sent);
}

async function sendDetailsFlowMessages(
  env,
  adminId,
  profile,
  detailsText,
  replyMarkup,
  { sourceMessage = null } = {}
) {
  const invalidation = await safeInvalidateSourcePanel(env, sourceMessage, {
    adminId,
    telegramId: profile?.telegram_id ?? null,
    flow: "partner_details",
  });

  const detailsRes = await sendMessage(env, adminId, detailsText, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });

  const photos = collectDetailPhotos(profile);
  for (const item of photos) {
    await sendPhoto(env, adminId, item.fileId, item.label, {
      parse_mode: "HTML",
    }).catch((err) => {
      logRenderWarning("[partnerDatabase.render.send_detail_photo_failed]", {
        adminId,
        telegramId: profile?.telegram_id ?? null,
        fileId: item.fileId,
        label: item.label,
        err: err?.message || String(err || ""),
      });
    });
  }

  const navRes = await sendMessage(env, adminId, "Pilih aksi di bawah:", {
    parse_mode: "HTML",
    reply_markup: replyMarkup,
    disable_web_page_preview: true,
  });

  return {
    ok: Boolean(navRes?.ok),
    anchor_chat_id: navRes?.result?.chat?.id ?? adminId,
    anchor_message_id: navRes?.result?.message_id ?? null,
    details_message_id: detailsRes?.result?.message_id ?? null,
    old_panel_invalidated: Boolean(invalidation?.ok),
    old_panel_invalidation_response: invalidation || null,
    nav_response: navRes || null,
    details_response: detailsRes || null,
  };
}

export async function renderPartnerControlPanel(
  env,
  adminId,
  telegramId,
  role,
  {
    session = null,
    fallbackMessage = null,
    selectedInput = null,
    forceNewMessage = false,
  } = {}
) {
  const context = await loadPartnerContext(env, telegramId);

  if (!context?.profile) {
    const missingAnchor = await renderPartnerDatabaseMessage(
      env,
      adminId,
      "⚠️ Data partner tidak ditemukan.",
      buildBackToPartnerDatabaseKeyboard(),
      { session, fallbackMessage, forceNewMessage }
    );

    await persistPartnerViewSession(
      env,
      adminId,
      session,
      {
        step: "await_target",
        data: {
          source_chat_id: missingAnchor?.anchor_chat_id ?? adminId,
          source_message_id: missingAnchor?.anchor_message_id ?? null,
          selected_partner_id: null,
          selected_input: selectedInput ?? session?.data?.selected_input ?? null,
          details_anchor_chat_id: null,
          details_anchor_message_id: null,
          subscription_adjust_action: null,
        },
      },
      fallbackMessage
    );

    return false;
  }

  const panelAnchor = await renderPartnerDatabaseMessage(
    env,
    adminId,
    buildPartnerControlPanelText(context),
    buildPartnerControlPanelKeyboard(context.profile.telegram_id),
    { session, fallbackMessage, forceNewMessage }
  );

  await persistPartnerViewSession(
    env,
    adminId,
    session,
    {
      step: "selected",
      data: {
        source_chat_id: panelAnchor?.anchor_chat_id ?? adminId,
        source_message_id: panelAnchor?.anchor_message_id ?? null,
        selected_partner_id: String(context.profile.telegram_id),
        selected_input: selectedInput ?? session?.data?.selected_input ?? null,
        details_anchor_chat_id: null,
        details_anchor_message_id: null,
        subscription_adjust_action: null,
      },
    },
    fallbackMessage
  );

  return Boolean(panelAnchor?.ok);
}

export async function renderPartnerDetailsPage(
  env,
  adminId,
  telegramId,
  role,
  { session = null, fallbackMessage = null } = {}
) {
  const context = await loadPartnerContext(env, telegramId);

  if (!context?.profile) {
    await renderPartnerDatabaseMessage(
      env,
      adminId,
      "⚠️ Data partner tidak ditemukan.",
      buildBackToPartnerDatabaseKeyboard(),
      { session, fallbackMessage }
    );
    return false;
  }

  const sourceMessage = readSourceMessage(session, fallbackMessage, adminId);
  const replyMarkup = buildPartnerDetailsKeyboard(context.profile.telegram_id, role);
  const detailsText = buildPartnerDetailsText(context);

  const anchor = await sendDetailsFlowMessages(
    env,
    adminId,
    context.profile,
    detailsText,
    replyMarkup,
    { sourceMessage }
  );

  await persistPartnerViewSession(
    env,
    adminId,
    session,
    {
      step: "selected",
      data: {
        selected_partner_id: String(context.profile.telegram_id),
        source_chat_id: anchor?.anchor_chat_id ?? adminId,
        source_message_id: anchor?.anchor_message_id ?? null,
        details_anchor_chat_id: anchor?.anchor_chat_id ?? null,
        details_anchor_message_id: anchor?.anchor_message_id ?? null,
        subscription_adjust_action: null,
      },
    },
    fallbackMessage
  );

  return Boolean(anchor?.ok);
}

export async function renderPartnerSubscriptionPage(
  env,
  adminId,
  telegramId,
  role,
  { session = null, fallbackMessage = null, noticeText = "" } = {}
) {
  const context = await loadPartnerContext(env, telegramId);

  if (!context?.profile) {
    await renderPartnerDatabaseMessage(
      env,
      adminId,
      "⚠️ Data partner tidak ditemukan.",
      buildBackToPartnerDatabaseKeyboard(),
      { session, fallbackMessage }
    );
    return false;
  }

  const bodyText = buildPartnerSubscriptionText(context);
  const finalText = String(noticeText || "").trim()
    ? `${String(noticeText).trim()}\n\n${bodyText}`
    : bodyText;

  const panelAnchor = await renderPartnerDatabaseMessage(
    env,
    adminId,
    finalText,
    buildPartnerSubscriptionKeyboard(context.profile.telegram_id, role),
    { session, fallbackMessage }
  );

  await persistPartnerViewSession(
    env,
    adminId,
    session,
    {
      step: "selected",
      data: {
        source_chat_id: panelAnchor?.anchor_chat_id ?? adminId,
        source_message_id: panelAnchor?.anchor_message_id ?? null,
        selected_partner_id: String(context.profile.telegram_id),
        details_anchor_chat_id: null,
        details_anchor_message_id: null,
        subscription_adjust_action: null,
      },
    },
    fallbackMessage
  );

  return Boolean(panelAnchor?.ok);
}
