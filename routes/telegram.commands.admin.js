// routes/telegram.commands.admin.js
import { sendMessage, sendPhoto, sendLongMessage } from "../services/telegramApi.js";
import { upsertSetting, getSetting } from "../repositories/settingsRepo.js";
import {
  deleteProfileByTelegramId,
  listProfilesByStatus,
  setProfileStatus,
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

const fmtHandle = (username) => {
  const u = String(username || "").trim();
  if (!u) return "-";
  return u.startsWith("@") ? u : `@${u}`;
};

const cleanHandle = (username) => {
  const u = String(username || "").trim().replace(/^@/, "");
  return u ? `@${u}` : "-";
};

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
// ✅ Perbaikan: kalau bukan @... dan bukan digit => return null
async function resolveTelegramId(env, rawTarget) {
  const target = String(rawTarget || "").trim();
  if (!target) return null;
  if (target.startsWith("@")) return (await findTelegramIdByUsername(env, target)) || null;
  if (/^\d+$/.test(target)) return target;
  return null;
}

function parseTarget(rawTarget) {
  const raw = String(rawTarget || "").trim();
  if (!raw) return { type: "empty" };
  if (raw.startsWith("@")) return { type: "username", value: raw.replace(/^@/, "").trim() };
  if (/^\d+$/.test(raw)) return { type: "telegram_id", value: raw };
  return { type: "invalid", value: raw };
}

function buildHelpMessage(role) {
  const isSuper = isSuperadminRole(role);
  const adminCmds = [
    ["`/list pending|approved|active|rejected|suspended`", "List partner per status"],
    ["`/approve @username|telegram_id`", "Setujui partner (approved)"],
    ["`/activate @username|telegram_id`", "Aktifkan partner (active)"],
    ["`/suspend @username|telegram_id`", "Suspend partner (suspended)"],
    ["`/ceksub @username|telegram_id`", "Cek subscription partner"],
    ["`/viewpartner @username|telegram_id`", "Lihat data lengkap partner"],
  ];
  const superCmds = [
    ["`/setlink aturan <url>`", "Set link (aturan, dll)"],
    ["`/setwelcome <text>`", "Ubah welcome text user (pakai confirm button)"],
    ["`/delpartner @username|telegram_id`", "Hapus partner"],
    ["`/listcategory`", "List kategori"],
    ["`/addcategory <kode>`", "Tambah kategori"],
    ["`/delcategory <kode>`", "Hapus kategori"],
  ];

  let msg = "📌 *Daftar Command (Admin Panel)*\n\n*Admin + Superadmin:*\n";
  for (const [cmd, desc] of adminCmds) msg += `• ${cmd} — ${desc}\n`;
  if (isSuper) {
    msg += "\n*Superadmin only:*\n";
    for (const [cmd, desc] of superCmds) msg += `• ${cmd} — ${desc}\n`;
  }
  return msg;
}

function buildListMessageHtml(status, rows) {
  const lines = [`📋 <b>LIST ${escapeHtml(String(status).toUpperCase())}:</b>`, ""];
  rows.forEach((r) => {
    lines.push(`👤 <b>${escapeHtml(r?.nama_lengkap ? String(r.nama_lengkap) : "-")}</b>`);
    lines.push(`ID: <code>${escapeHtml(r?.telegram_id ? String(r.telegram_id) : "-")}</code>`);
    lines.push(`Username: <b>${escapeHtml(r?.username ? fmtHandle(r.username) : "-")}</b>`);
    lines.push(`Nickname: <b>${escapeHtml(r?.nickname ? String(r.nickname) : "-")}</b>`);
    lines.push("");
  });
  return lines.join("\n");
}

// =============================
// Command configs
// =============================
const STATUS_CMDS = {
  "/approve": {
    status: "approved",
    fmt: "Format:\n/approve @username\natau\n/approve telegram_id",
    ok: (label) => `✅ Partner ${label} berhasil di-approve (approved).`,
    dm: "✅ Verifikasi kamu sudah *DISETUJUI* (APPROVED).\n\nAkun kamu belum tampil di grup.\nTunggu admin melakukan *ACTIVATE* untuk mengaktifkan tampilannya.",
    dmOpts: { parse_mode: "Markdown" },
  },
  "/suspend": {
    status: "suspended",
    fmt: "Format:\n/suspend @username\natau\n/suspend telegram_id",
    ok: (label) => `✅ Partner ${label} berhasil di-suspend (suspended).`,
    dm: "⛔ Akun kamu saat ini *SUSPENDED*.\nKamu tidak akan tampil di grup.\nSilakan hubungi admin.",
    dmOpts: { parse_mode: "Markdown" },
  },
  "/activate": {
    status: "active",
    fmt: "Format:\n/activate @username\natau\n/activate telegram_id",
    ok: (label) => `✅ Partner ${label} berhasil di-activate (active).`,
    dm: async (env) => {
      const link = (await getSetting(env, "link_aturan")) ?? "-";
      return `✅ Status akun kamu sekarang *AKTIF* (ACTIVE).\n\nSilakan baca aturan dulu:\n${link}`;
    },
    dmOpts: { parse_mode: "Markdown", disable_web_page_preview: true },
  },
};

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
  const needTarget = async (msg) => (await sendMessage(env, chatId, msg), true);
  const badTarget = async () => (await sendMessage(env, chatId, "Target tidak ditemukan / format tidak valid."), true);

  // HELP
  if (command === "/help" || command === "/cmd") {
    await sendMessage(env, chatId, buildHelpMessage(role), { parse_mode: "Markdown" });
    return true;
  }

  // /viewpartner
  if (command === "/viewpartner") {
    const rawTarget = args[0];
    if (!rawTarget)
      return needTarget(
        "Format:\n<code>/viewpartner @username</code>\natau\n<code>/viewpartner telegram_id</code>"
      );

    const t = parseTarget(rawTarget);
    if (t.type === "invalid")
      return needTarget(
        "Target tidak valid.\nGunakan:\n<code>/viewpartner @username</code>\natau\n<code>/viewpartner telegram_id</code>"
      );

    const tid = t.type === "telegram_id" ? t.value : await findTelegramIdByUsername(env, t.value);

    const profile = tid ? await getProfileFullByTelegramId(env, tid) : null;
    if (!profile) {
      await sendMessage(env, chatId, "Data partner tidak ditemukan.", { parse_mode: "HTML" });
      return true;
    }

    const categories = profile.id ? await listCategoryKodesByProfileId(env, profile.id) : [];
    const kategoriText = categories.length ? categories.join(", ") : "-";

    const textSummary =
      "🧾 <b>PARTNER</b>\n" +
      fmtKV("Telegram ID", profile.telegram_id) +
      "\n" +
      fmtKV("Username", cleanHandle(profile.username)) +
      "\n" +
      fmtKV("Nama Lengkap", profile.nama_lengkap) +
      "\n" +
      fmtKV("Nickname", profile.nickname) +
      "\n" +
      fmtKV("NIK", profile.nik) +
      "\n" +
      fmtKV("Kategori", kategoriText) +
      "\n" +
      fmtKV("No. Whatsapp", profile.no_whatsapp) +
      "\n" +
      fmtKV("Kecamatan", profile.kecamatan) +
      "\n" +
      fmtKV("Kota", profile.kota) +
      "\n" +
      fmtKV("Verificator", profile.verificator_admin_id);

    await sendLongMessage(env, chatId, textSummary, { parse_mode: "HTML", disable_web_page_preview: true });

    for (const [fileId, cap] of [
      [profile.foto_closeup_file_id, "📸 <b>Foto Closeup</b>"],
      [profile.foto_fullbody_file_id, "📸 <b>Foto Fullbody</b>"],
      [profile.foto_ktp_file_id, "🪪 <b>Foto KTP</b>"],
    ]) {
      if (fileId) await sendPhoto(env, chatId, fileId, cap, { parse_mode: "HTML" });
    }
    return true;
  }

  // SUPERADMIN: /setwelcome
  if (command === "/setwelcome") {
    if (!isSuperadminRole(role)) return deny();

    // ✅ preserve newline dari input user (tanpa args.join)
    const newText = rawText.slice(command.length).trim();
    const current = (await getSetting(env, "welcome_partner")) || "-";

    if (!newText) {
      await sendMessage(
        env,
        chatId,
        "Format:\n`/setwelcome <text>`\n\n*Welcome saat ini:*\n" + current,
        { parse_mode: "Markdown" }
      );
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

  // /list
  if (command === "/list") {
    const status = String(args[0] || "").trim().toLowerCase();
    const valid = ["pending", "approved", "active", "rejected", "suspended"];
    if (!valid.includes(status))
      return needArg("Format:\n/list pending\n/list approved\n/list active\n/list rejected\n/list suspended");

    const rows = await listProfilesByStatus(env, status);
    if (!rows.length) return (await sendMessage(env, chatId, `Tidak ada data ${status}`), true);

    await sendLongMessage(env, chatId, buildListMessageHtml(status, rows), {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return true;
  }

  // /approve /suspend /activate (1 handler)
  if (STATUS_CMDS[command]) {
    const flow = STATUS_CMDS[command];
    const raw = args[0];
    if (!raw) return needArg(flow.fmt);

    const targetId = await resolveTelegramId(env, raw);
    if (!targetId) return badTarget();

    await setProfileStatus(env, targetId, flow.status);

    const label = await getPartnerLabelByTelegramId(env, targetId);
    await sendMessage(env, chatId, flow.ok(label));

    const dmText = typeof flow.dm === "function" ? await flow.dm(env) : flow.dm;
    await sendMessage(env, targetId, dmText, flow.dmOpts).catch(() => {});
    return true;
  }

  // /ceksub
  if (command === "/ceksub") {
    const raw = args[0];
    if (!raw) return needArg("Format:\n/ceksub @username\natau\n/ceksub telegram_id");

    const targetId = await resolveTelegramId(env, raw);
    if (!targetId) return badTarget();

    const info = await getSubscriptionInfo(env, targetId);
    if (!info.supported)
      return (
        await sendMessage(
          env,
          chatId,
          "⚠️ Fitur cek subscription belum siap.\nKolom `subscription_status` dan `subscription_end_at` belum ada di tabel `profiles`."
        ),
        true
      );

    if (!info.found) return (await sendMessage(env, chatId, "Data partner tidak ditemukan."), true);

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
    if (!rows.length)
      return (
        await sendMessage(env, chatId, "Belum ada kategori. Tambah dengan:\n/addcategory <kode>"),
        true
      );

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
    if (!res.ok) return (await sendMessage(env, chatId, flow.errs(kode, res.reason)), true);

    await sendMessage(env, chatId, flow.ok(res.kode));
    return true;
  }

  // /setlink
  if (command === "/setlink") {
    if (!isSuperadminRole(role)) return deny();
    if (args.length < 2) return needArg("Format:\n/setlink aturan https://domain.com/aturan");

    const keyName = String(args[0] || "").toLowerCase();
    const url = String(args[1] || "").trim();
    await upsertSetting(env, `link_${keyName}`, url);
    await sendMessage(env, chatId, `✅ Link ${keyName} berhasil disimpan:\n${url}`);
    return true;
  }

  // /delpartner
  if (command === "/delpartner") {
    if (!isSuperadminRole(role)) return deny();

    const raw = args[0];
    if (!raw) return needArg("Format:\n/delpartner @username\natau\n/delpartner telegram_id");

    const targetId = await resolveTelegramId(env, raw);
    if (!targetId) return badTarget();

    const label = await getPartnerLabelByTelegramId(env, targetId);
    await deleteProfileByTelegramId(env, targetId);
    await sendMessage(env, chatId, `Partner ${label} berhasil dihapus ❌`);
    return true;
  }

  return false;
}
