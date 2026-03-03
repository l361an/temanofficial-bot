// utils/parseTelegram.js
export function parseMessage(message) {
  const chatId = message.chat?.id;
  const telegramId = String(message.from?.id ?? "");
  const username = message.from?.username ?? "-";
  const text = message.text || message.caption || "";
  return { chatId, telegramId, username, text };
}
