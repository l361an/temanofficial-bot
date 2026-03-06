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
import { listCategories } from "../repositories/categoriesRepo.js";
import { isAdminRole, isSuperadminRole } from "../utils/roles.js";

// user callback handler (teman:* + self:*)
import { handleSelfInlineCallback, buildTeManMenuKeyboard } from "./telegram.commands.user.js";

// moderation + view session
import { saveSession, clearSession } from "../utils/session.js";

// =========================
// Shared helpers
// =========================
async function deleteSetting(env, key) {
  await env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(key).run();
}

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

// =========================
// Keyboards (grouped)
// =========================

// Officer Home: Partner Tools + Superadmin Tools (superadmin only)
function buildOfficerHomeKeyboard(role) {
  const rows = [[{ text: "🧰 Partner Tools", callback_data: "pt:menu" }]];
  if (isSuperadminRole(role)) rows.push([{ text: "⚙️ Superadmin Tools", callback_data: "sa:tools:menu" }]);
  return { inline_keyboard: rows };
}

// Partner Tools menu
function buildPartnerToolsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🗃️ Partner Database", callback_data: "pm:menu" }],
      [{ text: "🛠️ Partner Moderation", callback_data: "mod:menu" }],
      [{ text: "⬅️ Back", callback_data: "officer:home" }],
    ],
  };
}

// Partner Database
function buildPartnerDatabaseKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🔎 View Partner", callback_data: "pm:view" }],
      [{ text: "👥 Partner", callback_data: "pm:list:all" }],
      [{ text: "🕒 Partner Pending", callback_data: "pm:list:pending" }],
      [{ text: "✅ Partner Approved", callback_data: "pm:list:approved" }],
      [{ text: "⛔ Partner Suspended", callback_data: "pm:list:suspended" }],
      [{ text: "🟢 Partner Active", callback_data: "pm:list:active" }],
      [{ text: "⬅️ Kembali", callback_data: "pt:menu" }],
    ],
  };
}

function buildBackToPartnerDatabaseKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "⬅️ Kembali", callback_data: "pm:menu" }],
      [{ text: "🧰 Partner Tools", callback_data: "pt:menu" }],
      [{ text: "🏠 Officer Home", callback_data: "officer:home" }],
    ],
  };
}

function buildBackToPartnerDatabaseViewKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "⬅️ Kembali ke Partner Database", callback_data: "pm:menu" }],
      [{ text: "🧰 Partner Tools", callback_data: "pt:menu" }],
      [{ text: "🏠 Officer Home", callback_data: "officer:home" }],
    ],
  };
}

// Partner Moderation (✅ Delete = superadmin only)
function buildPartnerModerationKeyboard(role) {
  const rows = [
    [{ text: "✅ Activate Partner", callback_data: "mod:activate" }],
    [{ text: "⛔ Suspend Partner", callback_data: "mod:suspend" }],
  ];

  if (isSuperadminRole(role)) {
    rows.push([{ text: "❌ Delete Partner", callback_data: "mod:delete" }]);
  }

  rows.push([{ text: "⬅️ Kembali", callback_data: "pt:menu" }]);

  return { inline_keyboard: rows };
}

function buildBackToPartnerModerationKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "⬅️ Kembali", callback_data: "mod:menu" }],
      [{ text: "🧰 Partner Tools", callback_data: "pt:menu" }],
      [{ text: "⬅️ Officer Home", callback_data: "officer:home" }],
    ],
  };
}

// Superadmin Tools (Option A)
function buildSuperadminToolsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🧩 Config", callback_data: "sa:cfg:menu" }],
      [{ text: "⚙️ Settings", callback_data: "sa:settings:menu" }],
      [{ text: "💰 Finance", callback_data: "sa:fin:menu" }],
      [{ text: "⬅️ Officer Home", callback_data: "officer:home" }],
    ],
  };
}

function buildConfigKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👋 Update Welcome Message", callback_data: "sa:cfg:welcome" }],
      [{ text: "🔗 Update Link Aturan", callback_data: "sa:cfg:aturan" }],
      [{ text: "⬅️ Back", callback_data: "sa:tools:menu" }],
    ],
  };
}

function buildConfigWelcomeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "✏️ Edit", callback_data: "sa:cfg:welcome_edit" }],
      [{ text: "⬅️ Back", callback_data: "sa:cfg:menu" }],
    ],
  };
}

function buildConfigAturanKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "✏️ Edit", callback_data: "sa:cfg:aturan_edit" }],
      [{ text: "⬅️ Back", callback_data: "sa:cfg:menu" }],
    ],
  };
}

function buildSettingsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🗂️ Category", callback_data: "sa:cat:menu" }],
      [{ text: "⬅️ Back", callback_data: "sa:tools:menu" }],
    ],
  };
}

function buildCategoryKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📚 Category List", callback_data: "sa:cat:list" }],
      [{ text: "➕ Add Category", callback_data: "sa:cat:add" }],
      [{ text: "➖ Delete Category", callback_data: "sa:cat:del" }],
      [{ text: "⬅️ Back", callback_data: "sa:settings:menu" }],
    ],
  };
}

// Finance placeholder (tombol = aksi)
function buildFinanceKeyboard(manualOn) {
  return {
    inline_keyboard: [
      [
        {
          text: manualOn ? "🛑 Set Manual Payment: OFF" : "✅ Set Manual Payment: ON",
          callback_data: "sa:fin:manual_toggle",
        },
      ],
      [{ text: "⬅️ Back", callback_data: "sa:tools:menu" }],
    ],
  };
}

// Verificator / Approve
function buildMainKeyboard(telegramId) {
  return { inline_keyboard: [[{ text: "👤 Pilih Verificator", callback_data: `pickver:${telegramId}` }]] };
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

// PM list rendering helper
function buildVerificatorLine(row, verificatorMap) {
  const vid = row?.verificator_admin_id ? String(row.verificator_admin_id) : "";
  if (!vid) return `Verificator: <b>-</b>`;
  const uname = verificatorMap?.get(vid) || "-";
  return `Verificator: <code>${escapeHtml(vid)}</code> - <b>${escapeHtml(uname)}</b>`;
}

function buildListMessageHtml(title, rows, verificatorMap, { showStatus = false } = {}) {
  const lines = [`📋 <b>${escapeHtml(title)}:</b>`, ""];
  rows.forEach((r) => {
    lines.push(`👤 <b>${escapeHtml(r?.nama_lengkap ? String(r.nama_lengkap) : "-")}</b>`);
    if (showStatus) lines.push(`Status: <b>${escapeHtml(r?.status ? String(r.status) : "-")}</b>`);
    lines.push(`ID: <code>${escapeHtml(r?.telegram_id ? String(r.telegram_id) : "-")}</code>`);
    lines.push(`Username: <b>${escapeHtml(r?.username ? fmtHandle(r.username) : "-")}</b>`);
    lines.push(`Nickname: <b>${escapeHtml(r?.nickname ? String(r.nickname) : "-")}</b>`);
    lines.push(buildVerificatorLine(r, verificatorMap));
    lines.push("");
  });
  return lines.join("\n");
}

async function buildVerificatorMap(env, rows) {
  const ids = [
    ...new Set((rows || []).map((r) => r?.verificator_admin_id).filter(Boolean).map((x) => String(x))),
  ];
  const map = new Map();
  if (!ids.length) return map;

  const placeholders = ids.map(() => "?").join(",");
  const q = `SELECT telegram_id, username FROM admins WHERE telegram_id IN (${placeholders})`;
  const stmt = env.DB.prepare(q).bind(...ids);
  const { results } = await stmt.all();

  (results || []).forEach((r) => {
    const tid = String(r.telegram_id);
    const u = String(r.username || "").trim().replace(/^@/, "");
    map.set(tid, u ? `@${u}` : "-");
  });

  ids.forEach((id) => {
    if (!map.has(id)) map.set(id, "-");
  });

  return map;
}

// =========================
// Dispatch maps (the “split” without files)
// =========================
function createHandlers() {
  /** @type {Record<string, Function>} */
  const EXACT = {};

  // officer
  EXACT["officer:home"] = async (ctx) => {
    const { env, role, adminId, msgChatId, msgId } = ctx;
    if (!isAdminRole(role)) return true;
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    const text = "Hallo Officer TeMan...\nSilahkan tekan tombol dibawah atau ketik /help untuk bantuan.";
    await sendMessage(env, adminId, text, { reply_markup: buildOfficerHomeKeyboard(role) });
    return true;
  };

  // Partner Tools menu
  EXACT["pt:menu"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(env, adminId, "🧰 <b>Partner Tools</b>\nPilih menu:", {
      parse_mode: "HTML",
      reply_markup: buildPartnerToolsKeyboard(),
    });
    return true;
  };

  // superadmin menus
  EXACT["sa:tools:menu"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(env, adminId, "⚙️ <b>Superadmin Tools</b>\nPilih menu:", {
      parse_mode: "HTML",
      reply_markup: buildSuperadminToolsKeyboard(),
    });
    return true;
  };

  EXACT["sa:cfg:menu"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(env, adminId, "🧩 <b>Config</b>\nPilih yang mau diupdate:", {
      parse_mode: "HTML",
      reply_markup: buildConfigKeyboard(),
    });
    return true;
  };

  EXACT["sa:cfg:welcome"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    const current = (await getSetting(env, "welcome_partner")) || "-";
    await sendMessage(
      env,
      adminId,
      "👋 <b>Welcome Message</b>\n\n<b>Current:</b>\n<pre>" + escapeHtml(current) + "</pre>",
      { parse_mode: "HTML", reply_markup: buildConfigWelcomeKeyboard() }
    );
    return true;
  };

  EXACT["sa:cfg:welcome_edit"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await saveSession(env, `state:${adminId}`, { mode: "sa_config", area: "welcome", step: "await_text" });
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(
      env,
      adminId,
      "✏️ <b>Edit Welcome Message</b>\n\nKirim teks welcome baru.\n\nKetik <b>batal</b> untuk keluar.",
      {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "sa:cfg:welcome" }]] },
      }
    );
    return true;
  };

  EXACT["sa:cfg:aturan"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    const current = (await getSetting(env, "link_aturan")) || "-";
    await sendMessage(
      env,
      adminId,
      "🔗 <b>Link Aturan</b>\n\n<b>Current:</b>\n<pre>" + escapeHtml(current) + "</pre>",
      { parse_mode: "HTML", disable_web_page_preview: true, reply_markup: buildConfigAturanKeyboard() }
    );
    return true;
  };

  EXACT["sa:cfg:aturan_edit"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await saveSession(env, `state:${adminId}`, { mode: "sa_config", area: "aturan", step: "await_text" });
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(
      env,
      adminId,
      "✏️ <b>Edit Link Aturan</b>\n\nKirim URL aturan baru (contoh: https://domain.com/aturan).\n\nKetik <b>batal</b> untuk keluar.",
      {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "sa:cfg:aturan" }]] },
      }
    );
    return true;
  };

  EXACT["sa:settings:menu"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(env, adminId, "⚙️ <b>Settings</b>\nPilih menu:", {
      parse_mode: "HTML",
      reply_markup: buildSettingsKeyboard(),
    });
    return true;
  };

  EXACT["sa:cat:menu"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(env, adminId, "🗂️ <b>Category</b>\nPilih aksi:", {
      parse_mode: "HTML",
      reply_markup: buildCategoryKeyboard(),
    });
    return true;
  };

  EXACT["sa:cat:list"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    const rows = await listCategories(env);
    if (!rows.length) {
      await sendMessage(env, adminId, "📚 <b>Category List</b>\n\nBelum ada kategori.", {
        parse_mode: "HTML",
        reply_markup: buildCategoryKeyboard(),
      });
      return true;
    }
    const lines = ["📚 <b>Category List</b>", ""];
    rows.forEach((r, i) => lines.push(`${i + 1}. ${escapeHtml(r.kode)}`));
    await sendMessage(env, adminId, lines.join("\n"), {
      parse_mode: "HTML",
      reply_markup: buildCategoryKeyboard(),
    });
    return true;
  };

  EXACT["sa:cat:add"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await saveSession(env, `state:${adminId}`, { mode: "sa_category", action: "add", step: "await_text" });
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(
      env,
      adminId,
      "➕ <b>Add Category</b>\n\nKirim <b>kode kategori</b> (contoh: Cuci Sofa).\n\nKetik <b>batal</b> untuk keluar.",
      { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "sa:cat:menu" }]] } }
    );
    return true;
  };

  EXACT["sa:cat:del"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await saveSession(env, `state:${adminId}`, { mode: "sa_category", action: "del", step: "await_text" });
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(
      env,
      adminId,
      "➖ <b>Delete Category</b>\n\nKirim <b>kode kategori</b> yang mau dihapus.\n\nKetik <b>batal</b> untuk keluar.",
      { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "sa:cat:menu" }]] } }
    );
    return true;
  };

  EXACT["sa:fin:menu"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    const raw = (await getSetting(env, "payment_manual_enabled")) ?? "1";
    const manualOn = String(raw) !== "0";
    const text =
      "💰 <b>Finance</b>\n\n" +
      `Manual payment: <b>${manualOn ? "ON" : "OFF"}</b>\n` +
      "Provider: <i>placeholder</i> (Xendit/Midtrans nanti)\n";
    await sendMessage(env, adminId, text, { parse_mode: "HTML", reply_markup: buildFinanceKeyboard(manualOn) });
    return true;
  };

  EXACT["sa:fin:manual_toggle"] = async (ctx) => {
    const { env, adminId } = ctx;
    const raw = (await getSetting(env, "payment_manual_enabled")) ?? "1";
    const manualOn = String(raw) !== "0";
    const next = manualOn ? "0" : "1";
    await upsertSetting(env, "payment_manual_enabled", next);
    const nowOn = next !== "0";
    await sendMessage(env, adminId, `✅ Manual payment sekarang: ${nowOn ? "ON" : "OFF"}`, {
      reply_markup: buildFinanceKeyboard(nowOn),
    });
    return true;
  };

  // Partner Database menu
  EXACT["pm:menu"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(env, adminId, "🗃️ <b>Partner Database</b>\nPilih menu di bawah:", {
      parse_mode: "HTML",
      reply_markup: buildPartnerDatabaseKeyboard(),
    });
    return true;
  };

  EXACT["pm:view"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId } = ctx;
    await saveSession(env, `state:${adminId}`, { mode: "partner_view", step: "await_target" });
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(
      env,
      adminId,
      "🔎 <b>View Partner</b>\n\nKirim <b>@username</b> atau <b>telegram_id</b> target.\n\nKetik <b>batal</b> untuk keluar.",
      { parse_mode: "HTML", reply_markup: buildBackToPartnerDatabaseViewKeyboard() }
    );
    return true;
  };

  // Partner Moderation menu (✅ role-aware keyboard)
  EXACT["mod:menu"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId, role } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(env, adminId, "🛠️ <b>Partner Moderation</b>\nPilih aksi di bawah:", {
      parse_mode: "HTML",
      reply_markup: buildPartnerModerationKeyboard(role),
    });
    return true;
  };

  // confirm/cancel
  const CONFIRM_PREFIX = [
    "setwelcome_confirm:",
    "setwelcome_cancel:",
    "setlink_confirm:",
    "setlink_cancel:",
  ];

  async function handleConfirm(ctx) {
    const { env, data, adminId, msgChatId, msgId } = ctx;
    const [action, ownerId] = data.split(":");
    if (String(ownerId) !== String(adminId)) {
      await sendMessage(env, adminId, "⚠️ Aksi ini bukan untuk akunmu.");
      return true;
    }
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});

    if (action === "setwelcome_confirm" || action === "setwelcome_cancel") {
      const draftKey = `draft_welcome:${adminId}`;
      const draftText = await getSetting(env, draftKey);
      if (!draftText) {
        await sendMessage(env, adminId, "⚠️ Draft welcome tidak ditemukan / sudah dibatalkan.");
        return true;
      }
      if (action === "setwelcome_cancel") {
        await deleteSetting(env, draftKey);
        await sendMessage(env, adminId, "❌ Draft welcome dibatalkan.", { reply_markup: buildSuperadminToolsKeyboard() });
        return true;
      }
      await upsertSetting(env, "welcome_partner", draftText);
      await deleteSetting(env, draftKey);
      await sendMessage(env, adminId, "✅ Welcome message berhasil diupdate.\n\n*Welcome baru:*\n" + draftText, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
        reply_markup: buildSuperadminToolsKeyboard(),
      });
      return true;
    }

    if (action === "setlink_confirm" || action === "setlink_cancel") {
      const draftKey = `draft_link_aturan:${adminId}`;
      const draftUrl = await getSetting(env, draftKey);
      if (!draftUrl) {
        await sendMessage(env, adminId, "⚠️ Draft link aturan tidak ditemukan / sudah dibatalkan.");
        return true;
      }
      if (action === "setlink_cancel") {
        await deleteSetting(env, draftKey);
        await sendMessage(env, adminId, "❌ Draft link aturan dibatalkan.", { reply_markup: buildSuperadminToolsKeyboard() });
        return true;
      }
      await upsertSetting(env, "link_aturan", draftUrl);
      await deleteSetting(env, draftKey);
      await sendMessage(env, adminId, `✅ Link aturan berhasil diupdate:\n${draftUrl}`, {
        disable_web_page_preview: true,
        reply_markup: buildSuperadminToolsKeyboard(),
      });
      return true;
    }

    return true;
  }

  // prefix handlers (data startsWith ...)
  const PREFIX = [
    // pm:list:*
    {
      match: (d) => d.startsWith("pm:list:"),
      run: async (ctx) => {
        const { env, data, adminId, msgChatId, msgId } = ctx;
        const key = String(data.split(":")[2] || "").trim();

        let rows = [];
        let title = "";
        let showStatus = false;

        if (key === "all") {
          rows = await listProfilesAll(env);
          title = "PARTNER (ALL)";
          showStatus = true;
        } else if (["pending", "approved", "suspended", "active"].includes(key)) {
          rows = await listProfilesByStatus(env, key);
          title = `PARTNER ${key.toUpperCase()}`;
        } else {
          if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
          await sendMessage(env, adminId, "Menu tidak dikenal. Balik ke Partner Database.", {
            reply_markup: buildPartnerDatabaseKeyboard(),
          });
          return true;
        }

        if (!rows.length) {
          if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
          await sendMessage(env, adminId, `Tidak ada data untuk: ${title}`, {
            reply_markup: buildBackToPartnerDatabaseKeyboard(),
          });
          return true;
        }

        const verificatorMap = await buildVerificatorMap(env, rows).catch(() => new Map());
        if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
        const text = buildListMessageHtml(title, rows, verificatorMap, { showStatus });

        await sendMessage(env, adminId, text, {
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: buildBackToPartnerDatabaseKeyboard(),
        });
        return true;
      },
    },

    // mod:activate|suspend|delete (✅ delete superadmin-only)
    {
      match: (d) => d.startsWith("mod:") && ["mod:activate", "mod:suspend", "mod:delete"].includes(d),
      run: async (ctx) => {
        const { env, data, adminId, msgChatId, msgId, role } = ctx;
        const action = data.split(":")[1];

        // ✅ hard-block delete for non-superadmin
        if (action === "delete" && !isSuperadminRole(role)) {
          await sendMessage(env, adminId, "⛔ Akses ditolak. Delete Partner hanya untuk Superadmin.");
          return true;
        }

        await saveSession(env, `state:${adminId}`, { mode: "partner_moderation", action, step: "await_target" });

        if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});

        const nice =
          action === "activate" ? "ACTIVATE (active)" :
          action === "suspend" ? "SUSPEND (suspended)" :
          "DELETE (hapus partner)";

        await sendMessage(
          env,
          adminId,
          `🛠️ <b>Partner Moderation</b>\nAksi: <b>${nice}</b>\n\nKirim <b>@username</b> atau <b>telegram_id</b> target.\n\nKetik <b>batal</b> untuk keluar.`,
          { parse_mode: "HTML", reply_markup: buildBackToPartnerModerationKeyboard() }
        );
        return true;
      },
    },

    // confirm/cancel
    {
      match: (d) => CONFIRM_PREFIX.some((p) => d.startsWith(p)),
      run: handleConfirm,
    },

    // pickver/setver/backver
    {
      match: (d) => d.startsWith("pickver:") || d.startsWith("setver:") || d.startsWith("backver:"),
      run: async (ctx) => {
        const { env, data, adminId, msgChatId, msgId, msg } = ctx;
        const parts = data.split(":");
        const action = parts[0];
        const telegramId = parts[1];
        if (!telegramId) return true;

        const status = await getProfileStatus(env, telegramId);
        if (!status) {
          if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
          await sendMessage(env, adminId, `⚠️ Data partner tidak ditemukan.\nTelegram ID: ${telegramId}`);
          return true;
        }
        if (status !== "pending") {
          if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
          await sendMessage(env, adminId, `⚠️ Tidak bisa diubah. Status saat ini: ${status}\nTelegram ID: ${telegramId}`);
          return true;
        }

        if (action === "pickver") {
          const list = await listActiveVerificators(env);
          if (!list.length) {
            await sendMessage(env, adminId, "⚠️ Tidak ada verificator aktif di tabel admins.");
            return true;
          }
          const reply_markup = buildVerificatorKeyboard(telegramId, list);
          if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, reply_markup).catch(() => {});
          else await sendMessage(env, adminId, `Pilih verificator untuk Telegram ID: ${telegramId}`, { reply_markup });
          return true;
        }

        if (action === "backver") {
          if (msgChatId && msgId) {
            await editMessageReplyMarkup(env, msgChatId, msgId, buildMainKeyboard(telegramId)).catch(() => {});
          }
          return true;
        }

        if (action === "setver") {
          const verificatorId = parts[2];
          if (!verificatorId) return true;

          const adminRow = await getAdminByTelegramId(env, verificatorId);
          if (!adminRow) {
            await sendMessage(env, adminId, "⚠️ Verificator tidak ditemukan di tabel admins.");
            return true;
          }
          if (!(adminRow.normRole === "admin" || adminRow.normRole === "superadmin")) {
            await sendMessage(env, adminId, "⚠️ Role ini tidak bisa jadi verificator.");
            return true;
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
          return true;
        }

        return true;
      },
    },

    // approve/reject
    {
      match: (d) => d.startsWith("approve:") || d.startsWith("reject:"),
      run: async (ctx) => {
        const { env, data, adminId, msgChatId, msgId, msg } = ctx;
        const [action, telegramId] = data.split(":");
        if (!telegramId) return true;

        const status = await getProfileStatus(env, telegramId);
        if (!status) {
          if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
          await sendMessage(env, adminId, `⚠️ Data partner tidak ditemukan.\nTelegram ID: ${telegramId}`);
          return true;
        }
        if (status !== "pending") {
          if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
          await sendMessage(env, adminId, `⚠️ Tidak bisa diproses. Status saat ini: ${status}\nTelegram ID: ${telegramId}`);
          return true;
        }

        if (action === "approve") {
          const verificatorId = await getProfileVerificatorId(env, telegramId);
          if (!verificatorId) {
            await sendMessage(env, adminId, "⚠️ Belum ada verificator.\nSilakan klik tombol 👤 Pilih Verificator dulu, lalu Approve.");
            return true;
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
            `✅ Permintaan Bergabung Disetujui!\n\nVerificator kamu adalah : ${vLabel}\n\nSilakan baca aturan TeMan:\n${link}`,
            { reply_markup: buildTeManMenuKeyboard(), disable_web_page_preview: true }
          );

          await sendMessage(env, adminId, `✅ APPROVED\nTelegram ID: ${telegramId}\nLink aturan: ${link}\nVerificator: ${vLabel}`);

          if (msgChatId && msgId) {
            await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
            const oldCaption = msg?.caption || "";
            await editMessageCaption(env, msgChatId, msgId, `${oldCaption}\n\n✅ APPROVED`).catch(() => {});
          }
          return true;
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
          return true;
        }

        return true;
      },
    },
  ];

  return { EXACT, PREFIX };
}

const { EXACT: EXACT_HANDLERS, PREFIX: PREFIX_HANDLERS } = createHandlers();

// =========================
// Main callback entry
// =========================
export async function handleCallback(update, env) {
  const data = update?.callback_query?.data;
  const adminId = String(update?.callback_query?.from?.id || "");
  const callbackQueryId = update?.callback_query?.id;

  if (!data || !adminId) return json({ ok: true });
  await answerCallbackQuery(env, callbackQueryId).catch(() => {});

  // user callbacks first
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

  // role gating centralized
  const isOfficerAction =
    data === "officer:home" ||
    data.startsWith("pt:") ||
    data.startsWith("pm:") ||
    data.startsWith("mod:") ||
    data.startsWith("pickver:") ||
    data.startsWith("setver:") ||
    data.startsWith("backver:") ||
    data.startsWith("approve:") ||
    data.startsWith("reject:");

  const isSAAction =
    data.startsWith("sa:") ||
    data.startsWith("setwelcome_confirm:") ||
    data.startsWith("setwelcome_cancel:") ||
    data.startsWith("setlink_confirm:") ||
    data.startsWith("setlink_cancel:");

  if (isOfficerAction && !isAdminRole(role)) return json({ ok: true });
  if (isSAAction && !isSuperadminRole(role)) return json({ ok: true });

  // ✅ extra hard gate: mod:delete only superadmin
  if (data === "mod:delete" && !isSuperadminRole(role)) return json({ ok: true });

  const ctx = { env, update, data, adminId, role, msg, msgChatId, msgId };

  try {
    const fn = EXACT_HANDLERS[data];
    if (fn) {
      await fn(ctx);
      return json({ ok: true });
    }

    for (const h of PREFIX_HANDLERS) {
      if (h.match(data)) {
        await h.run(ctx);
        return json({ ok: true });
      }
    }
  } catch (e) {
    console.error("CALLBACK ERROR:", e);
  }

  return json({ ok: true });
}
