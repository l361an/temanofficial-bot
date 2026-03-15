// utils/parseTelegram.js
export function parseMessage(message) {
  const chatId = message?.chat?.id ?? null;
  const telegramId = String(message?.from?.id ?? "");
  const username = message?.from?.username ?? "-";
  const text = message?.text || message?.caption || "";
  const messageThreadId = message?.message_thread_id ?? null;

  return {
    chatId,
    telegramId,
    username,
    text,
    messageThreadId,
  };
}
