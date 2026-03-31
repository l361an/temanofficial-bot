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
  getPartnerClassById,
} from "../repositories/partnerClassesRepo.js";

function buildConfigBackKeyboard() {
  return {
    inline_keyboard: [[{ text: "🧩 Config", callback_data: CALLBACKS.SUPERADMIN_CONFIG_MENU }]],
  };
}

function buildPartnerClassBackKeyboard() {
  return buildPartnerClassMenuKeyboard();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugifyClassId(label) {
  const normalized = String(label || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  let out = normalized;

  if (!out) out = "class_baru";
  if (!/^[a-z]/.test(out)) out = `class_${out}`;
  out = out.replace(/_+/g, "_").replace(/^_+|_+$/g, "");

  if (out.length > 32) {
    out = out.slice(0, 32).replace(/_+$/g, "");
  }

  if (!/^[a-z][a-z0-9_]{1,31}$/.test(out)) {
    out = "class_baru";
  }

  return out;
}

async function suggestAvailableClassId(env, label) {
  const base = slugifyClassId(label);

  const direct = await getPartnerClassById(env, base).catch(() => null);
  if (!direct) return base;

  for (let i = 2; i <= 999; i += 1) {
    const suffix = `_${i}`;
    const stem = base.slice(0, Math.max(1, 32 - suffix.length)).replace(/_+$/g, "");
    const candidate = `${stem}${suffix}`;

    if (!/^[a-z][a-z0-9_]{1,31}$/.test(candidate)) continue;

    const exists = await getPartnerClassById(env, candidate).catch(() => null);
    if (!exists) return candidate;
  }

  return base;
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

  if (area === "partner_class_add_label") {
    const label = raw;

    if (!label) {
      await sendMessage(
        env,
        chatId,
        "⚠️ Label class wajib diisi.\n\nContoh:\n• <b>VIP Plus</b>\n• <b>Corporate A</b>\n\nKetik <b>batal</b> untuk keluar.",
        { parse_mode: "HTML" }
      );
      return true;
    }

    const classId = await suggestAvailableClassId(env, label);
    const res = await addPartnerClass(env, { id: classId, label });

    if (!res?.ok) {
      const msg =
        res.reason === "class_id_exists"
          ? "⚠️ Class ID bentrok saat simpan. Coba kirim label lagi."
          : res.reason === "invalid_class_id"
          ? "⚠️ Class ID hasil generate tidak valid."
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
      `✅ Class baru berhasil ditambahkan.\n\nID: <code>${escapeHtml(classId)}</code>\nLabel: <b>${escapeHtml(label)}</b>`,
      {
        parse_mode: "HTML",
        reply_markup: buildPartnerClassBackKeyboard(),
      }
    );
    return true;
  }

  if (area === "partner_class_add") {
    await sendMessage(
      env,
      chatId,
      "⚠️ Format lama sudah tidak dipakai.\n\nSekarang cukup ketik <b>label class</b> saja.\nContoh:\n• <b>VIP Plus</b>\n• <b>Corporate A</b>\n\nBot akan buatkan <code>class_id</code> otomatis dan langsung simpan.",
      { parse_mode: "HTML" }
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
      `✅ Label class berhasil diubah.\n\nID: <code>${classId}</code>\nLabel baru: <b>${escapeHtml(label)}</b>`,
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
