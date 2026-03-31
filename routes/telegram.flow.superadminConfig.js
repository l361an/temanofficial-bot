// routes/telegram.flow.superadminConfig.js

import { clearSession } from "../utils/session.js";
import { sendMessage } from "../services/telegramApi.js";
import { getSetting, upsertSetting } from "../repositories/settingsRepo.js";
import {
  buildLinkAturanPreviewText,
  buildWelcomePreviewText,
} from "./telegram.messages.js";
import { CALLBACKS } from "./telegram.constants.js";
import { buildPartnerClassMenuKeyboard } from "./callbacks/keyboards.superadmin.js";
import {
  addPartnerClass,
  renamePartnerClassLabel,
} from "../repositories/partnerClassesRepo.js";

function buildConfigBackKeyboard() {
  return {
    inline_keyboard: [[{ text: "🧩 Config", callback_data: CALLBACKS.SUPERADMIN_CONFIG_MENU }]],
  };
}

function buildPartnerClassBackKeyboard() {
  return buildPartnerClassMenuKeyboard();
}

export async function handleSuperadminConfigInput({ env, chatId, telegramId, text, session, STATE_KEY }) {
  const raw = String(text || "").trim();
  const area = String(session?.area || "");
  const adminId = String(telegramId || "");

  if (/^(batal|cancel|keluar)$/i.test(raw)) {
    await clearSession(env, STATE_KEY);

    if (area.startsWith("partner_class")) {
      await sendMessage(env, chatId, "✅ Oke, input Partner Class dibatalkan.\nBalik ke menu:", {
        reply_markup: buildPartnerClassBackKeyboard(),
      });
      return true;
    }

    await sendMessage(env, chatId, "✅ Oke, edit dibatalkan.\nBalik ke menu:", {
      reply_markup: buildConfigBackKeyboard(),
    });
    return true;
  }

  if (area === "welcome") {
    const current = (await getSetting(env, "welcome_partner")) || "-";
    const draft = raw;

    await upsertSetting(env, `draft_welcome:${adminId}`, draft);
    await clearSession(env, STATE_KEY);

    await sendMessage(env, chatId, buildWelcomePreviewText(current, draft), {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Confirm", callback_data: `setwelcome_confirm:${adminId}` },
            { text: "❌ Cancel", callback_data: `setwelcome_cancel:${adminId}` },
          ],
          [{ text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_CONFIG_WELCOME }],
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

    await sendMessage(env, chatId, buildLinkAturanPreviewText(current, draftUrl), {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Confirm", callback_data: `setlink_confirm:${adminId}` },
            { text: "❌ Cancel", callback_data: `setlink_cancel:${adminId}` },
          ],
          [{ text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_CONFIG_ATURAN }],
        ],
      },
    });

    return true;
  }

  if (area === "partner_class_add") {
    const [rawClassId, ...labelParts] = raw.split("|");
    const classId = String(rawClassId || "").trim().toLowerCase();
    const label = labelParts.join("|").trim();

    if (!/^[a-z][a-z0-9_]{1,31}$/.test(classId) || !label) {
      await sendMessage(
        env,
        chatId,
        "⚠️ Format tidak valid.\n\nPakai format:\n<code>class_id|Label Class</code>\n\nContoh:\n<code>general|General</code>\n<code>vip_plus|VIP Plus</code>\n\nKetik <b>batal</b> untuk keluar.",
        { parse_mode: "HTML" }
      );
      return true;
    }

    const res = await addPartnerClass(env, { id: classId, label });
    if (!res?.ok) {
      const msg =
        res.reason === "class_id_exists"
          ? "⚠️ Class ID sudah ada."
          : res.reason === "invalid_class_id"
          ? "⚠️ Class ID tidak valid."
          : res.reason === "empty_label"
          ? "⚠️ Label class wajib diisi."
          : "⚠️ Gagal menambah class.";

      await sendMessage(env, chatId, msg, {
        reply_markup: buildPartnerClassBackKeyboard(),
      });
      return true;
    }

    await clearSession(env, STATE_KEY);
    await sendMessage(
      env,
      chatId,
      `✅ Class baru berhasil ditambahkan.\n\nID: <code>${classId}</code>\nLabel: <b>${label}</b>`,
      {
        parse_mode: "HTML",
        reply_markup: buildPartnerClassBackKeyboard(),
      }
    );
    return true;
  }

  if (area === "partner_class_rename") {
    const classId = String(session?.class_id || "").trim().toLowerCase();
    const label = raw;

    if (!classId || !label) {
      await sendMessage(env, chatId, "⚠️ Label class tidak valid.", {
        reply_markup: buildPartnerClassBackKeyboard(),
      });
      return true;
    }

    const res = await renamePartnerClassLabel(env, classId, label);
    if (!res?.ok) {
      await sendMessage(env, chatId, "⚠️ Gagal rename label class.", {
        reply_markup: buildPartnerClassBackKeyboard(),
      });
      return true;
    }

    await clearSession(env, STATE_KEY);
    await sendMessage(
      env,
      chatId,
      `✅ Label class berhasil diubah.\n\nID: <code>${classId}</code>\nLabel baru: <b>${label}</b>`,
      {
        parse_mode: "HTML",
        reply_markup: buildPartnerClassBackKeyboard(),
      }
    );
    return true;
  }

  await clearSession(env, STATE_KEY);
  await sendMessage(env, chatId, "⚠️ Mode Config tidak dikenal. Balik ke menu.", {
    reply_markup: buildConfigBackKeyboard(),
  });
  return true;
}
