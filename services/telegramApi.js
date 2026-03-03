// services/telegramApi.js
function apiUrl(env, method) {
  return `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
}

async function post(env, method, payload) {
  const res = await fetch(apiUrl(env, method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!data.ok) console.error(`Telegram API error (${method}):`, data);
  return data;
}

export async function sendMessage(env, chatId, text, extra = {}) {
  return post(env, "sendMessage", { chat_id: chatId, text, ...extra });
}

export async function sendPhoto(env, chatId, fileId, caption, extra = {}) {
  return post(env, "sendPhoto", { chat_id: chatId, photo: fileId, caption, ...extra });
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
  return post(env, "answerCallbackQuery", { callback_query_id: callbackQueryId, ...extra });
}

export async function editMessageReplyMarkup(env, chatId, messageId, replyMarkup = null) {
  return post(env, "editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup, // null => remove
  });
}

export async function editMessageCaption(env, chatId, messageId, caption, extra = {}) {
  return post(env, "editMessageCaption", {
    chat_id: chatId,
    message_id: messageId,
    caption,
    ...extra,
  });
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
