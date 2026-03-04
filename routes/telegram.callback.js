// routes/telegram.callback.js
import {
  sendMessage,
  answerCallbackQuery,
  editMessageReplyMarkup,
  editMessageCaption,
} from "../services/telegramApi.js";

import { uploadKtpToR2OnApprove } from "../services/ktpR2.js";
import { getSetting, upsertSetting } from "../repositories/settingsRepo.js";
import {
  getProfileStatus,
  approveProfile,
  rejectProfile,
  listProfilesByStatus,
  listProfilesAll,
} from "../repositories/profilesRepo.js";
import { json } from "../utils/response.js";

import {
  getAdminRole,
  listActiveVerificators,
  getAdminByTelegramId,
} from "../repositories/adminsRepo.js";
import { isAdminRole, isSuperadminRole } from "../utils/roles.js";

// user callback handler (teman:* + self:*)
import {
  handleSelfInlineCallback,
  buildTeManMenuKeyboard,
} from "./telegram.commands.user.js";

// moderation session
import { saveSession, clearSession } from "../utils/session.js";

async function deleteSetting(env, key) {
  await env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(key).run();
}

// =========================
// Officer / Partner Database helpers
// =========================
const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const fmtHandle = (username) => {
  const u = String(username || "").trim();
  if (!u) return "-";
  return u.startsWith("@") ? u : `@${u}`;
};

function buildOfficerHomeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🗃️ Partner Database", callback_data: "pm:menu" }],
      [{ text: "🛠️ Partner Moderation", callback_data: "mod:menu" }],
    ],
  };
}

function buildPartnerDatabaseKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👥 Partner", callback_data: "pm:list:all" }],
      [{ text: "🕒 Partner Pending", callback_data: "pm:list:pending" }],
      [{ text: "✅ Partner Approved", callback_data: "pm:list:approved" }],
      [{ text: "⛔ Partner Suspended", callback_data: "pm:list:suspended" }],
      [{ text: "🟢 Partner Active", callback_data: "pm:list:active" }],
      [{ text: "⬅️ Kembali", callback_data: "officer:home" }],
    ],
  };
}

// ✅ FIX: hasil list sekarang ada Officer Home juga
function buildBackToPartnerDatabaseKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "⬅️ Kembali", callback_data: "pm:menu" }],
      [{ text: "🏠 Officer Home", callback_data: "officer:home" }],
    ],
  };
}

// =========================
// Partner Moderation helpers
// =========================
function buildPartnerModerationKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "✅ Activate Partner", callback_data: "mod:activate" }],
      [{ text: "⛔ Suspend Partner", callback_data: "mod:suspend" }],
      [{ text: "❌ Delete Partner", callback_data: "mod:delete" }],
      [{ text: "⬅️ Kembali", callback_data: "officer:home" }],
    ],
  };
}

function buildBackToPartnerModerationKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "⬅️ Kembali", callback_data: "mod:menu" }],
      [{ text: "⬅️ Officer Home", callback_data: "officer:home" }],
    ],
  };
}

function buildListMessageHtml(title, rows, { showStatus = false } = {}) {
  const lines = [`📋 <b>${escapeHtml(title)}:</b>`, ""];
  rows.forEach((r) => {
    lines.push(`👤 <b>${escapeHtml(r?.nama_lengkap ? String(r.nama_lengkap) : "-")}</b>`);
    if (showStatus)
      lines.push(`Status: <b>${escapeHtml(r?.status ? String(r.status) : "-")}</b>`);
    lines.push(`ID: <code>${escapeHtml(r?.telegram_id ? String(r.telegram_id) : "-")}</code>`);
    lines.push(`Username: <b>${escapeHtml(r?.username ? fmtHandle(r.username) : "-")}</b>`);
    lines.push(`Nickname: <b>${escapeHtml(r?.nickname ? String(r.nickname) : "-")}</b>`);
    lines.push("");
  });
  return lines.join("\n");
}

// =========================
// Verificator helpers
// =========================
function buildMainKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [{ text: "👤 Pilih Verificator", callback_data: `pickver:${telegramId}` }],
    ],
  };
}

function buildApproveRejectKeyboard(telegramId) {
  return {
    inline_keyboard: [[
      { text: "✅ Approve", callback_data: `approve:${telegramId}` },
      { text: "❌ Reject", callback_data: `reject:${telegramId}` },
    ]],
  };
}

function buildVerificatorKeyboard(telegramId, verificators) {
  const rows = [];
  const max = Math.min(verificators.length, 20);

  for (let i = 0; i < max; i += 2) {
    const a = verificators[i];
    const b = verificators[i + 1];

    const row = [{ text: a.label, callback_data: `setver:${telegramId}:${a.telegram_id}` }];
    if (b) row.push({ text: b.label, callback_data: `setver:${telegramId}:${b.telegram_id}` });
    rows.push(row);
  }

  rows.push([{ text: "⬅️ Kembali", callback_data: `backver:${telegramId}` }]);
  return { inline_keyboard: rows };
}

function upsertVerificatorLine(caption, label) {
  const raw = String(caption || "");
  const line = `Verificator: ${label}`;
  const replaced = raw.replace(/^Verificator\s*:\s*.*$/im, line);
  if (replaced !== raw) return replaced;
  if (!raw.trim()) return line;
  return `${raw}\n\n${line}`;
}

async function setProfileVerificator(env, telegramId, verificatorAdminId) {
  await env.DB.prepare(`
    UPDATE profiles
    SET verificator_admin_id = ?
    WHERE telegram_id = ?
  `)
    .bind(String(verificatorAdminId), String(telegramId))
    .run();
}

async function getProfileVerificatorId(env, telegramId) {
  const row = await env.DB.prepare(`
    SELECT verificator_admin_id
    FROM profiles
    WHERE telegram_id = ?
    LIMIT 1
  `)
    .bind(String(telegramId))
    .first();

  const v = row?.verificator_admin_id;
  return v ? String(v) : null;
}

// =========================
// Handler
// =========================
export async function handleCallback(update, env) {
  const data = update?.callback_query?.data;
  const adminId = String(update?.callback_query?.from?.id || "");
  const callbackQueryId = update?.callback_query?.id;

  if (!data || !adminId) return json({ ok: true });

  await answerCallbackQuery(env, callbackQueryId).catch(() => {});

  // USER callback first: self:* / teman:*
  try {
    const handled = await handleSelfInlineCallback(update, env);
    if (handled) return json({ ok: true });
  } catch (e) {
    console.error("USER CALLBACK ERROR:", e);
  }

  const msg = update?.callback_query?.message;
  const msgChatId = msg?.chat?.id;
  const msgId = msg?.message_id;

  const role = await getAdminRole(env, adminId);

  // =========================
  // OFFICER HOME (admin + superadmin)
  // =========================
  if (data === "officer:home") {
    if (!isAdminRole(role)) return json({ ok: true });

    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});

    const text =
      "Hallo Officer TeMan...\n" +
      "Silahkan tekan tombol dibawah atau ketik /help untuk bantuan.";

    await sendMessage(env, adminId, text, { reply_markup: buildOfficerHomeKeyboard() });
    return json({ ok: true });
  }

  // =========================
  // PARTNER DATABASE (admin + superadmin)
  // =========================
  if (data.startsWith("pm:")) {
    if (!isAdminRole(role)) return json({ ok: true });

    // pm:menu
    if (data === "pm:menu") {
      if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});

      await sendMessage(env, adminId, "🗃️ <b>Partner Database</b>\nPilih menu di bawah:", {
        parse_mode: "HTML",
        reply_markup: buildPartnerDatabaseKeyboard(),
      });

      return json({ ok: true });
    }

    // pm:list:<key>
    if (data.startsWith("pm:list:")) {
      const key = String(data.split(":")[2] || "").trim();

      let rows = [];
      let title = "";
      let showStatus = false;

      if (key === "all") {
        rows = await listProfilesAll(env);
        title = "PARTNER (ALL)";
        showStatus = true;
      } else if (key === "pending" || key === "approved" || key === "suspended" || key === "active") {
        rows = await listProfilesByStatus(env, key);
        title = `PARTNER ${key.toUpperCase()}`;
      } else {
        if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
        await sendMessage(env, adminId, "Menu tidak dikenal. Balik ke Partner Database.", {
          reply_markup: buildPartnerDatabaseKeyboard(),
        });
        return json({ ok: true });
      }

      if (!rows.length) {
        if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
        await sendMessage(env, adminId, `Tidak ada data untuk: ${title}`, {
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return json({ ok: true });
      }

      if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});

      const text = buildListMessageHtml(title, rows, { showStatus });
      await sendMessage(env, adminId, text, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: buildBackToPartnerDatabaseKeyboard(),
      });

      return json({ ok: true });
    }

    return json({ ok: true });
  }

  // =========================
  // PARTNER MODERATION (admin + superadmin) - inline-only
  // =========================
  if (data.startsWith("mod:")) {
    if (!isAdminRole(role)) return json({ ok: true });

    // mod:menu
    if (data === "mod:menu") {
      // stop any pending moderation session
      await clearSession(env, `state:${adminId}`).catch(() => {});
      if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      await sendMessage(env, adminId, "🛠️ <b>Partner Moderation</b>\nPilih aksi di bawah:", {
        parse_mode: "HTML",
        reply_markup: buildPartnerModerationKeyboard(),
      });
      return json({ ok: true });
    }

    const action = data.split(":")[1]; // activate|suspend|delete
    if (["activate", "suspend", "delete"].includes(action)) {
      // set session for next text input
      await saveSession(env, `state:${adminId}`, {
        mode: "partner_moderation",
        action,
        step: "await_target",
      });

      if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});

      const nice =
        action === "activate"
          ? "ACTIVATE (active)"
          : action === "suspend"
          ? "SUSPEND (suspended)"
          : "DELETE (hapus partner)";

      await sendMessage(
        env,
        adminId,
        `🛠️ <b>Partner Moderation</b>\nAksi: <b>${nice}</b>\n\nKirim <b>@username</b> atau <b>telegram_id</b> target.\n\nKetik <b>batal</b> untuk keluar.`,
        { parse_mode: "HTML", reply_markup: buildBackToPartnerModerationKeyboard() }
      );
      return json({ ok: true });
    }

    return json({ ok: true });
  }

  // =========================
  // SUPERADMIN ONLY (existing behavior)
  // =========================
  if (!isSuperadminRole(role)) return json({ ok: true });

  // SETWELCOME CONFIRM/CANCEL
  if (data.startsWith("setwelcome_confirm:") || data.startsWith("setwelcome_cancel:")) {
    const [action, ownerId] = data.split(":");

    if (String(ownerId) !== String(adminId)) {
      await sendMessage(env, adminId, "⚠️ Aksi ini bukan untuk akunmu.");
      return json({ ok: true });
    }

    const draftKey = `draft_welcome:${adminId}`;
    const draftText = await getSetting(env, draftKey);

    if (!draftText) {
      await sendMessage(env, adminId, "⚠️ Draft welcome tidak ditemukan / sudah dibatalkan.");
      return json({ ok: true });
    }

    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});

    if (action === "setwelcome_cancel") {
      await deleteSetting(env, draftKey);
      await sendMessage(env, adminId, "❌ Draft welcome dibatalkan.");
      return json({ ok: true });
    }

    await upsertSetting(env, "welcome_partner", draftText);
    await deleteSetting(env, draftKey);

    await sendMessage(env, adminId, "✅ Welcome message berhasil diupdate.\n\n*Welcome baru:*\n" + draftText, {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    });

    return json({ ok: true });
  }

  // PICK / SET VERIFICATOR
  if (data.startsWith("pickver:") || data.startsWith("setver:") || data.startsWith("backver:")) {
    const parts = data.split(":");
    const action = parts[0];
    const telegramId = parts[1];
    if (!telegramId) return json({ ok: true });

    const status = await getProfileStatus(env, telegramId);
    if (!status) {
      if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      await sendMessage(env, adminId, `⚠️ Data partner tidak ditemukan.\nTelegram ID: ${telegramId}`);
      return json({ ok: true });
    }

    if (status !== "pending") {
      if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      await sendMessage(env, adminId, `⚠️ Tidak bisa diubah. Status saat ini: ${status}\nTelegram ID: ${telegramId}`);
      return json({ ok: true });
    }

    if (action === "pickver") {
      const list = await listActiveVerificators(env);
      if (!list.length) {
        await sendMessage(env, adminId, "⚠️ Tidak ada verificator aktif di tabel admins.");
        return json({ ok: true });
      }

      const reply_markup = buildVerificatorKeyboard(telegramId, list);
      if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, reply_markup).catch(() => {});
      else await sendMessage(env, adminId, `Pilih verificator untuk Telegram ID: ${telegramId}`, { reply_markup });

      return json({ ok: true });
    }

    if (action === "backver") {
      if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, buildMainKeyboard(telegramId)).catch(() => {});
      return json({ ok: true });
    }

    if (action === "setver") {
      const verificatorId = parts[2];
      if (!verificatorId) return json({ ok: true });

      const adminRow = await getAdminByTelegramId(env, verificatorId);
      if (!adminRow) {
        await sendMessage(env, adminId, "⚠️ Verificator tidak ditemukan di tabel admins.");
        return json({ ok: true });
      }

      if (!(adminRow.normRole === "admin" || adminRow.normRole === "superadmin")) {
        await sendMessage(env, adminId, "⚠️ Role ini tidak bisa jadi verificator.");
        return json({ ok: true });
      }

      await setProfileVerificator(env, telegramId, verificatorId);

      if (msgChatId && msgId) {
        const oldCaption = msg?.caption || "";
        const newCaption = upsertVerificatorLine(oldCaption, adminRow.label);
        await editMessageCaption(env, msgChatId, msgId, newCaption).catch(() => {});
        await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      }

      await sendMessage(env, adminId, `✅ Verificator diset: ${adminRow.label}\nTelegram ID partner: ${telegramId}`, {
        reply_markup: buildApproveRejectKeyboard(telegramId),
      });

      return json({ ok: true });
    }

    return json({ ok: true });
  }

  // APPROVE / REJECT PARTNER
  const [action, telegramId] = data.split(":");
  if (action !== "approve" && action !== "reject") return json({ ok: true });

  const status = await getProfileStatus(env, telegramId);
  if (!status) {
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(env, adminId, `⚠️ Data partner tidak ditemukan.\nTelegram ID: ${telegramId}`);
    return json({ ok: true });
  }

  if (status !== "pending") {
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(env, adminId, `⚠️ Tidak bisa diproses. Status saat ini: ${status}\nTelegram ID: ${telegramId}`);
    return json({ ok: true });
  }

  if (action === "approve") {
    const verificatorId = await getProfileVerificatorId(env, telegramId);
    if (!verificatorId) {
      await sendMessage(env, adminId, "⚠️ Belum ada verificator.\nSilakan klik tombol 👤 Pilih Verificator dulu, lalu Approve.");
      return json({ ok: true });
    }

    await approveProfile(env, telegramId, verificatorId);

    try {
      const up = await uploadKtpToR2OnApprove(env, telegramId);
      await sendMessage(env, adminId, `☁️ Backup KTP ke R2: ${up.skipped ? "SKIP" : "OK"}\nKey: ${up.key}`);
    } catch (e) {
      await sendMessage(env, adminId, `⚠️ Backup KTP ke R2 GAGAL\nTelegram ID: ${telegramId}`);
    }

    const link = (await getSetting(env, "link_aturan")) ?? "-";
    const vRow = await getAdminByTelegramId(env, verificatorId);
    const vLabel = vRow?.label || "-";

    await sendMessage(
      env,
      telegramId,
      `✅ Permintaan Bergabung Disetujui!

Verificator kamu adalah : ${vLabel}

Silakan baca aturan TeMan:
${link}`,
      {
        reply_markup: buildTeManMenuKeyboard(),
        disable_web_page_preview: true,
      }
    );

    await sendMessage(env, adminId, `✅ APPROVED
Telegram ID: ${telegramId}
Link aturan: ${link}
Verificator: ${vLabel}`);

    if (msgChatId && msgId) {
      await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      const oldCaption = msg?.caption || "";
      await editMessageCaption(env, msgChatId, msgId, `${oldCaption}\n\n✅ APPROVED`).catch(() => {});
    }

    return json({ ok: true });
  }

  if (action === "reject") {
    await rejectProfile(env, telegramId);

    await sendMessage(env, telegramId, "❌ Permintaan Bergabung Ditolak.\nSilakan hubungi admin.", {
      reply_markup: buildTeManMenuKeyboard(),
    });

    await sendMessage(env, adminId, `❌ REJECTED\nTelegram ID: ${telegramId}`);

    if (msgChatId && msgId) {
      await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
      const oldCaption = msg?.caption || "";
      await editMessageCaption(env, msgChatId, msgId, `${oldCaption}\n\n❌ REJECTED`).catch(() => {});
    }

    return json({ ok: true });
  }

  return json({ ok: true });
}
