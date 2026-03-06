// routes/telegram.flow.superadminConfig.js

import { clearSession } from "../utils/session.js";
import { sendMessage } from "../services/telegramApi.js";
import { getSetting, upsertSetting } from "../repositories/settingsRepo.js";

export async function handleSuperadminConfigInput({ env, chatId, telegramId, text, session, STATE_KEY }) {
  const raw = String(text || "").trim();

  if (/^(batal|cancel|keluar)$/i.test(raw)) {
    await clearSession(env, STATE_KEY);
    await sendMessage(env, chatId, "✅ Oke, edit dibatalkan.\nBalik ke menu:", {
      reply_markup: { inline_keyboard: [[{ text: "🧩 Config", callback_data: "sa:cfg:menu" }]] },
    });
    return true;
  }

  const area = String(session?.area || "");
  const adminId = String(telegramId || "");

  if (area === "welcome") {
    const current = (await getSetting(env, "welcome_partner")) || "-";
    const draft = raw;

    await upsertSetting(env, `draft_welcome:${adminId}`, draft);
    await clearSession(env, STATE_KEY);

    const msg =
      "🧾 *Preview Welcome Partner*\n\n" +
      "*Current:*\n" +
      current +
      "\n\n" +
      "*New (draft):*\n" +
      draft +
      "\n\n" +
      "Klik tombol di bawah untuk *Confirm* atau *Cancel*.";

    await sendMessage(env, chatId, msg, {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Confirm", callback_data: `setwelcome_confirm:${adminId}` },
            { text: "❌ Cancel", callback_data: `setwelcome_cancel:${adminId}` },
          ],
          [{ text: "⬅️ Back", callback_data: "sa:cfg:welcome" }],
        ],
      },
    });

    return true;
  }

  if (area === "aturan") {
    const current = (await getSetting(env, "link_aturan")) || "-";
    const draftUrl = raw;

    if (!/^https?:\/\/\S+/i.test(draftUrl)) {
      await sendMessage(
        env,
        chatId,
        "⚠️ URL tidak valid.\nContoh format: https://domain.com/aturan\n\nKirim ulang URL, atau ketik <b>batal</b> untuk keluar.",
        { parse_mode: "HTML" }
      );
      return true;
    }

    await upsertSetting(env, `draft_link_aturan:${adminId}`, draftUrl);
    await clearSession(env, STATE_KEY);

    const msg =
      "🧾 *Preview Link Aturan*\n\n" +
      "*Current (link_aturan):*\n" +
      current +
      "\n\n" +
      "*New (draft):*\n" +
      draftUrl +
      "\n\n" +
      "Klik tombol di bawah untuk *Confirm* atau *Cancel*.";

    await sendMessage(env, chatId, msg, {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Confirm", callback_data: `setlink_confirm:${adminId}` },
            { text: "❌ Cancel", callback_data: `setlink_cancel:${adminId}` },
          ],
          [{ text: "⬅️ Back", callback_data: "sa:cfg:aturan" }],
        ],
      },
    });

    return true;
  }

  await clearSession(env, STATE_KEY);
  await sendMessage(env, chatId, "⚠️ Mode Config tidak dikenal. Balik ke menu.", {
    reply_markup: { inline_keyboard: [[{ text: "🧩 Config", callback_data: "sa:cfg:menu" }]] },
  });
  return true;
}
