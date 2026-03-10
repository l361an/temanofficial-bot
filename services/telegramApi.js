// services/telegramApi.js

function apiUrl(env, method) {
  return `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
}

function cleanPayload(payload = {}) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function isNotModifiedResponse(data) {
  return String(data?.description || "")
    .toLowerCase()
    .includes("message is not modified");
}

function hasCaptionMedia(message) {
  return Boolean(
    (Array.isArray(message?.photo) && message.photo.length) ||
      message?.video ||
      message?.animation ||
      message?.document ||
      message?.audio
  );
}

function pickTextEditExtra(extra = {}) {
  const {
    parse_mode,
    entities,
    link_preview_options,
    reply_markup,
    disable_web_page_preview,
  } = extra;

  return cleanPayload({
    parse_mode,
    entities,
    link_preview_options,
    reply_markup,
    disable_web_page_preview,
  });
}

function pickCaptionEditExtra(extra = {}) {
  const {
    parse_mode,
    caption_entities,
    reply_markup,
    show_caption_above_media,
  } = extra;

  return cleanPayload({
    parse_mode,
    caption_entities,
    reply_markup,
    show_caption_above_media,
  });
}

async function post(env, method, payload) {
  const res = await fetch(apiUrl(env, method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!data.ok && !isNotModifiedResponse(data)) {
    console.error(`Telegram API error (${method}):`, data);
  }
  return data;
}

function buildMutedPermissions() {
  return {
    can_send_messages: false,
    can_send_audios: false,
    can_send_documents: false,
    can_send_photos: false,
    can_send_videos: false,
    can_send_video_notes: false,
    can_send_voice_notes: false,
    can_send_polls: false,
    can_send_other_messages: false,
    can_add_web_page_previews: false,
    can_change_info: false,
    can_invite_users: false,
    can_pin_messages: false,
    can_manage_topics: false,
  };
}

function buildMemberPermissions() {
  return {
    can_send_messages: true,
    can_send_audios: true,
    can_send_documents: true,
    can_send_photos: true,
    can_send_videos: true,
    can_send_video_notes: true,
    can_send_voice_notes: true,
    can_send_polls: true,
    can_send_other_messages: true,
    can_add_web_page_previews: true,
    can_change_info: false,
    can_invite_users: false,
    can_pin_messages: false,
    can_manage_topics: false,
  };
}

function buildDemoteRights() {
  return {
    is_anonymous: false,
    can_manage_chat: false,
    can_delete_messages: false,
    can_manage_video_chats: false,
    can_restrict_members: false,
    can_promote_members: false,
    can_change_info: false,
    can_invite_users: false,
    can_post_messages: false,
    can_edit_messages: false,
    can_pin_messages: false,
    can_manage_topics: false,
  };
}

function buildPremiumPartnerAdminRights() {
  return {
    is_anonymous: false,
    can_manage_chat: false,
    can_delete_messages: false,
    can_manage_video_chats: false,
    can_restrict_members: false,
    can_promote_members: false,
    can_change_info: false,
    can_invite_users: true,
    can_post_messages: false,
    can_edit_messages: false,
    can_pin_messages: false,
    can_manage_topics: true,
  };
}

export async function sendMessage(env, chatId, text, extra = {}) {
  return post(env, "sendMessage", {
    chat_id: chatId,
    text,
    ...cleanPayload(extra),
  });
}

export async function sendPhoto(env, chatId, fileId, caption, extra = {}) {
  return post(env, "sendPhoto", {
    chat_id: chatId,
    photo: fileId,
    caption,
    ...cleanPayload(extra),
  });
}

export async function sendLongMessage(env, chatId, text, extra = {}) {
  const raw = String(text ?? "");
  const limit = 3900;

  if (raw.length <= limit) return sendMessage(env, chatId, raw, extra);

  let i = 0;
  while (i < raw.length) {
    let chunk = raw.slice(i, i + limit);
    const lastNl = chunk.lastIndexOf("\n");
    if (lastNl > 500 && i + limit < raw.length) chunk = chunk.slice(0, lastNl);

    await sendMessage(env, chatId, chunk, extra);
    i += chunk.length;
  }
}

export async function answerCallbackQuery(env, callbackQueryId, extra = {}) {
  return post(env, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...cleanPayload(extra),
  });
}

export async function editMessageText(env, chatId, messageId, text, extra = {}) {
  return post(env, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    ...pickTextEditExtra(extra),
  });
}

export async function editMessageReplyMarkup(env, chatId, messageId, replyMarkup = null) {
  return post(env, "editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup,
  });
}

export async function editMessageCaption(env, chatId, messageId, caption, extra = {}) {
  return post(env, "editMessageCaption", {
    chat_id: chatId,
    message_id: messageId,
    caption,
    ...pickCaptionEditExtra(extra),
  });
}

export async function editCallbackMessage(env, message, text, extra = {}) {
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;

  if (!chatId || !messageId) {
    return { ok: false, description: "message target not found" };
  }

  const preferCaption = hasCaptionMedia(message) && !message?.text;

  const primary = preferCaption
    ? await editMessageCaption(env, chatId, messageId, text, extra)
    : await editMessageText(env, chatId, messageId, text, extra);

  if (primary?.ok || isNotModifiedResponse(primary)) {
    return { ok: true, result: primary?.result ?? null };
  }

  const fallback = preferCaption
    ? await editMessageText(env, chatId, messageId, text, extra)
    : await editMessageCaption(env, chatId, messageId, text, extra);

  if (fallback?.ok || isNotModifiedResponse(fallback)) {
    return { ok: true, result: fallback?.result ?? null };
  }

  return fallback?.ok ? fallback : primary;
}

export async function upsertCallbackMessage(env, message, text, extra = {}) {
  const edited = await editCallbackMessage(env, message, text, extra).catch(() => null);
  if (edited?.ok) return edited;

  const chatId = message?.chat?.id;
  if (!chatId) {
    return { ok: false, description: "chat target not found" };
  }

  return sendMessage(env, chatId, text, extra);
}

export async function telegramGetFile(env, fileId) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(
    fileId
  )}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));

  if (!data.ok) {
    console.error("Telegram API error (getFile):", data);
    throw new Error(`getFile failed: ${data.description || "unknown"}`);
  }
  return data.result;
}

export async function telegramDownloadFile(env, filePath) {
  const url = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`downloadFile failed: ${res.status}`);
  return res;
}

export async function getChatMember(env, chatId, userId) {
  return post(env, "getChatMember", {
    chat_id: chatId,
    user_id: userId,
  });
}

export async function promoteChatMember(env, chatId, userId, rights = {}) {
  return post(env, "promoteChatMember", {
    chat_id: chatId,
    user_id: userId,
    ...buildDemoteRights(),
    ...cleanPayload(rights),
  });
}

export async function demoteChatMember(env, chatId, userId) {
  return promoteChatMember(env, chatId, userId, buildDemoteRights());
}

export async function restrictChatMember(env, chatId, userId, permissions, untilDate) {
  return post(env, "restrictChatMember", {
    chat_id: chatId,
    user_id: userId,
    permissions,
    until_date: untilDate,
    use_independent_chat_permissions: true,
  });
}

export async function muteChatMember(env, chatId, userId, untilDate = 0) {
  return restrictChatMember(env, chatId, userId, buildMutedPermissions(), untilDate);
}

export async function unmuteChatMember(env, chatId, userId) {
  return restrictChatMember(env, chatId, userId, buildMemberPermissions(), 0);
}

export async function setChatAdministratorCustomTitle(env, chatId, userId, customTitle) {
  return post(env, "setChatAdministratorCustomTitle", {
    chat_id: chatId,
    user_id: userId,
    custom_title: customTitle,
  });
}

export async function promotePremiumPartnerAdmin(env, chatId, userId) {
  const promoteRes = await promoteChatMember(env, chatId, userId, buildPremiumPartnerAdminRights());
  if (!promoteRes?.ok) return promoteRes;

  const titleRes = await setChatAdministratorCustomTitle(env, chatId, userId, "Premium Partner");
  if (!titleRes?.ok) {
    return {
      ok: false,
      description: titleRes?.description || "failed_set_custom_title",
      promote_response: promoteRes,
      title_response: titleRes,
    };
  }

  return {
    ok: true,
    promote_response: promoteRes,
    title_response: titleRes,
  };
}
