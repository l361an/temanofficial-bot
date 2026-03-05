// routes/telegram.commands.admin.js
import { sendMessage, sendPhoto, sendLongMessage } from "../services/telegramApi.js";
import { upsertSetting, getSetting } from "../repositories/settingsRepo.js";
import {
  getSubscriptionInfo,
  getProfileFullByTelegramId,
  listCategoryKodesByProfileId,
} from "../repositories/profilesRepo.js";
import { listCategories, addCategory, delCategoryByKode } from "../repositories/categoriesRepo.js";
import { isAdminRole, isSuperadminRole } from "../utils/roles.js";

// =============================
// Helpers
// =============================
const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const fmtKV = (label, value) => {
  const v = value === null || value === undefined || value === "" ? "-" : String(value);
  return `• <b>${escapeHtml(label)}:</b> ${escapeHtml(v)}`;
};

const cleanHandle = (username) => {
  const u = String(username || "").trim().replace(/^@/, "");
  return u ? `@${u}` : "-";
};

// Officer Home keyboard (Partner Database + Partner Moderation)
function buildOfficerStartKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🗃️ Partner Database", callback_data: "pm:menu" }],
      [{ text: "🛠️ Partner Moderation", callback_data: "mod:menu" }],
    ],
  };
}

// @username => cari profiles.username, balikin telegram_id
async function findTelegramIdByUsername(env, username) {
  const clean = String(username || "").trim().replace(/^@/, "");
  if (!clean) return null;
  const row = await env.DB.prepare(`SELECT telegram_id FROM profiles WHERE username = ? LIMIT 1`)
    .bind(clean)
    .first();
  return row?.telegram_id ?? null;
}

// Digunakan untuk output yang enak dibaca
async function getPartnerLabelByTelegramId(env, telegramId) {
  const tid = String(telegramId || "").trim();
  if (!tid) return "-";
  const profile = await getProfileFullByTelegramId(env, tid);
  const u = String(profile?.username || "").trim().replace(/^@/, "");
  return u ? `@${u}` : tid;
}

// Support target: @username atau telegram_id
async function resolveTelegramId(env, rawTarget) {
  const target = String(rawTarget || "").trim();
  if (!target) return null;
  if (target.startsWith("@")) return (await findTelegramIdByUsername(env, target)) || null;
  if (/^\d+$/.test(target)) return target;
  return null;
}

function buildHelpMessage(role) {
  const isSuper = isSuperadminRole(role);

  // /approve removed (inline-only)
  const adminCmds = [
    ["`/start`", "Menu Officer (inline: Partner Database + Partner Moderation)"],
    ["`/ceksub @username|telegram_id`", "Cek subscription partner"],
  ];

  const superCmds = [
    ["`/setlink aturan <url>`", "Set link (aturan, dll)"],
    ["`/setwelcome <text>`", "Ubah welcome text user (pakai confirm button)"],
    ["`/listcategory`", "List kategori"],
    ["`/addcategory <kode>`", "Tambah kategori"],
    ["`/delcategory <kode>`", "Hapus kategori"],
  ];

  let msg =
    "📌 *Daftar Command (Officer Panel)*\n\n" +
    "*Admin + Superadmin:*\n" +
    adminCmds.map(([cmd, desc]) => `• ${cmd} — ${desc}`).join("\n") +
    "\n\n" +
    "ℹ️ *Catatan:* Partner Database & Partner Moderation lewat `/start` (inline menu).\n";

  if (isSuper) {
    msg += "\n*Superadmin only:*\n" + superCmds.map(([cmd, desc]) => `• ${cmd} — ${desc}`).join("\n") + "\n";
  }

  return msg;
}

// =============================
// Category command configs
// =============================
const CATEGORY_CMDS = {
  "/addcategory": {
    fmt: "Format:\n/addcategory <kode>\nContoh:\n/addcategory Cuci Sofa",
    action: addCategory,
    ok: (kode) => `✅ Kategori ditambahkan: ${kode}`,
    errs: (kode, reason) =>
      reason === "exists"
        ? `⚠️ Kategori \"${kode}\" sudah ada.`
        : reason === "empty"
        ? "⚠️ Kode kategori kosong."
        : "⚠️ Gagal menambah kategori.",
  },
  "/delcategory": {
    fmt: "Format:\n/delcategory <kode>\nContoh:\n/delcategory Cuci Sofa",
    action: delCategoryByKode,
    ok: (kode) => `✅ Kategori dihapus: ${kode}`,
    errs: (kode, reason) =>
      reason === "not_found"
        ? `⚠️ Kategori \"${kode}\" tidak ditemukan.`
        : reason === "empty"
        ? "⚠️ Kode kategori kosong."
        : "⚠️ Gagal menghapus kategori.",
  },
};

// Command legacy yang udah dibuang: redirect balik ke Officer Home
const DEAD_CMDS = new Set(["/list", "/activate", "/suspend", "/delpartner", "/viewpartner"]);

// =============================
// Main
// =============================
export async function handleAdminCommand({ env, chatId, text, role, telegramId }) {
  if (!isAdminRole(role)) return false;

  const rawText = String(text || "").trim();
  if (!rawText.startsWith("/")) return false;

  const parts = rawText.split(/\s+/);
  const command = (parts[0] || "").split("@")[0];
  const args = parts.slice(1);

  const deny = async () => (await sendMessage(env, chatId, "⛔ Command ini hanya untuk Superadmin."), true);
  const needArg = async (msg) => (await sendMessage(env, chatId, msg), true);
  const badTarget = async () => (await sendMessage(env, chatId, "Target tidak ditemukan / format tidak valid."), true);

  // ✅ Legacy commands: jangan nyasar ke UX user — redirect ke Officer Home
  if (DEAD_CMDS.has(command)) {
    const msg = "Hallo Officer TeMan...\nSilahkan tekan tombol dibawah atau ketik /help untuk bantuan.";
    await sendMessage(env, chatId, msg, { reply_markup: buildOfficerStartKeyboard() });
    return true;
  }

  // /start (Officer)
  if (command === "/start") {
    const msg = "Hallo Officer TeMan...\nSilahkan tekan tombol dibawah atau ketik /help untuk bantuan.";
    await sendMessage(env, chatId, msg, { reply_markup: buildOfficerStartKeyboard() });
    return true;
  }

  // HELP
  if (command === "/help" || command === "/cmd") {
    await sendMessage(env, chatId, buildHelpMessage(role), { parse_mode: "Markdown" });
    return true;
  }

  // /ceksub
  if (command === "/ceksub") {
    const raw = args[0];
    if (!raw) return needArg("Format:\n/ceksub @username\natau\n/ceksub telegram_id");

    const targetId = await resolveTelegramId(env, raw);
    if (!targetId) return badTarget();

    const info = await getSubscriptionInfo(env, targetId);
    if (!info.supported) {
      await sendMessage(
        env,
        chatId,
        "⚠️ Fitur cek subscription belum siap.\nKolom `subscription_status` dan `subscription_end_at` belum ada di tabel `profiles`."
      );
      return true;
    }

    if (!info.found) {
      await sendMessage(env, chatId, "Data partner tidak ditemukan.");
      return true;
    }

    const label = await getPartnerLabelByTelegramId(env, targetId);
    await sendMessage(
      env,
      chatId,
      `📦 Subscription Partner ${label}\n\nStatus: ${info.subscription_status ?? "-"}\nBerakhir: ${info.subscription_end_at ?? "-"}`
    );
    return true;
  }

  // SUPERADMIN ONLY
  if (command === "/listcategory") {
    if (!isSuperadminRole(role)) return deny();

    const rows = await listCategories(env);
    if (!rows.length) {
      await sendMessage(env, chatId, "Belum ada kategori. Tambah dengan:\n/addcategory <kode>");
      return true;
    }

    let msg = "📚 LIST CATEGORY:\n\n";
    rows.forEach((r, i) => (msg += `${i + 1}. ${r.kode}\n`));
    await sendMessage(env, chatId, msg);
    return true;
  }

  // /addcategory + /delcategory
  if (CATEGORY_CMDS[command]) {
    if (!isSuperadminRole(role)) return deny();

    const flow = CATEGORY_CMDS[command];
    const kode = args.join(" ").trim();
    if (!kode) return needArg(flow.fmt);

    const res = await flow.action(env, kode);
    if (!res.ok) {
      await sendMessage(env, chatId, flow.errs(kode, res.reason));
      return true;
    }

    await sendMessage(env, chatId, flow.ok(res.kode));
    return true;
  }

  // SUPERADMIN: /setwelcome
  if (command === "/setwelcome") {
    if (!isSuperadminRole(role)) return deny();

    const newText = rawText.slice(command.length).trim();
    const current = (await getSetting(env, "welcome_partner")) || "-";

    if (!newText) {
      await sendMessage(env, chatId, "Format:\n`/setwelcome <text>`\n\n*Welcome saat ini:*\n" + current, {
        parse_mode: "Markdown",
      });
      return true;
    }

    const adminId = String(telegramId || "");
    await upsertSetting(env, `draft_welcome:${adminId}`, newText);

    const msg =
      "🧾 *Preview Welcome Partner*\n\n" +
      "*Current:*\n" +
      current +
      "\n\n" +
      "*New (draft):*\n" +
      newText +
      "\n\n" +
      "Klik tombol di bawah untuk *Confirm* atau *Cancel*.";

    await sendMessage(env, chatId, msg, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Confirm", callback_data: `setwelcome_confirm:${adminId}` },
            { text: "❌ Cancel", callback_data: `setwelcome_cancel:${adminId}` },
          ],
        ],
      },
      disable_web_page_preview: true,
    });

    return true;
  }

  // SUPERADMIN: /setlink
  if (command === "/setlink") {
    if (!isSuperadminRole(role)) return deny();
    if (args.length < 2) return needArg("Format:\n/setlink aturan https://domain.com/aturan");

    const keyName = String(args[0] || "").toLowerCase();
    const url = String(args[1] || "").trim();
    await upsertSetting(env, `link_${keyName}`, url);
    await sendMessage(env, chatId, `✅ Link ${keyName} berhasil disimpan:\n${url}`);
    return true;
  }

  return false;
}
