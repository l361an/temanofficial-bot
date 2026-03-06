// routes/telegram.commands.admin.js
import { sendMessage } from "../services/telegramApi.js";
import {
  getSubscriptionInfo,
  getProfileFullByTelegramId,
} from "../repositories/profilesRepo.js";
import { listCategories, addCategory, delCategoryByKode } from "../repositories/categoriesRepo.js";
import { isAdminRole, isSuperadminRole } from "../utils/roles.js";
import { buildOfficerHomeKeyboard } from "./callbacks/keyboards.js";
import { resolveTelegramId } from "../utils/partnerHelpers.js";

// =============================
// Helpers
// =============================
async function getPartnerLabelByTelegramId(env, telegramId) {
  const tid = String(telegramId || "").trim();
  if (!tid) return "-";

  const profile = await getProfileFullByTelegramId(env, tid);
  const u = String(profile?.username || "").trim().replace(/^@/, "");
  return u ? `@${u}` : tid;
}

function buildHelpMessage(role) {
  const isSuper = isSuperadminRole(role);

  const adminCmds = [
    ["`/start`", "Menu Officer (inline)"],
    ["`/ceksub @username|telegram_id`", "Cek subscription partner"],
  ];

  let msg =
    "📌 *Daftar Command (Officer Panel)*\n\n" +
    "*Admin + Superadmin:*\n" +
    adminCmds.map(([cmd, desc]) => `• ${cmd} — ${desc}`).join("\n") +
    "\n\n" +
    "ℹ️ *Catatan:* Partner Database & Partner Moderation lewat `/start` (inline menu).\n";

  if (isSuper) {
    msg += "\n*Superadmin only:*\n• Buka *⚙️ Superadmin Tools* dari Officer Home untuk Config/Settings/Finance.\n";
  }

  return msg;
}

// =============================
// Category command configs
// =============================
const CATEGORY_CMDS = {
  "/addcategory": {
    fmt: "Format:\n/addcategory <kode>\nContoh:\n/addcategory TeManMakan",
    action: addCategory,
    ok: (kode) => `✅ Kategori ditambahkan: ${kode}`,
    errs: (kode, reason) =>
      reason === "exists"
        ? `⚠️ Kategori "${kode}" sudah ada.`
        : reason === "empty"
          ? "⚠️ Kode kategori kosong."
          : "⚠️ Gagal menambah kategori.",
  },
  "/delcategory": {
    fmt: "Format:\n/delcategory <kode>\nContoh:\n/delcategory TeManMakan",
    action: delCategoryByKode,
    ok: (kode) => `✅ Kategori dihapus: ${kode}`,
    errs: (kode, reason) =>
      reason === "not_found"
        ? `⚠️ Kategori "${kode}" tidak ditemukan.`
        : reason === "empty"
          ? "⚠️ Kode kategori kosong."
          : "⚠️ Gagal menghapus kategori.",
  },
};

const DEAD_CMDS = new Set(["/list", "/activate", "/suspend", "/delpartner", "/viewpartner"]);

// =============================
// Main
// =============================
export async function handleAdminCommand({ env, chatId, text, role }) {
  if (!isAdminRole(role)) return false;

  const rawText = String(text || "").trim();
  if (!rawText.startsWith("/")) return false;

  const parts = rawText.split(/\s+/);
  const command = (parts[0] || "").split("@")[0];
  const args = parts.slice(1);

  const deny = async () => (await sendMessage(env, chatId, "⛔ Command ini hanya untuk Superadmin."), true);
  const needArg = async (msg) => (await sendMessage(env, chatId, msg), true);
  const badTarget = async () => (await sendMessage(env, chatId, "Target tidak ditemukan / format tidak valid."), true);

  if (DEAD_CMDS.has(command)) {
    const msg = "Hallo Officer TeMan...\nSilahkan tekan tombol dibawah atau ketik /help untuk bantuan.";
    await sendMessage(env, chatId, msg, { reply_markup: buildOfficerHomeKeyboard(role) });
    return true;
  }

  if (command === "/start") {
    const msg = "Hallo Officer TeMan...\nSilahkan tekan tombol dibawah atau ketik /help untuk bantuan.";
    await sendMessage(env, chatId, msg, { reply_markup: buildOfficerHomeKeyboard(role) });
    return true;
  }

  if (command === "/help" || command === "/cmd") {
    await sendMessage(env, chatId, buildHelpMessage(role), { parse_mode: "Markdown" });
    return true;
  }

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

  if (command === "/setwelcome" || command === "/setlink") {
    if (!isSuperadminRole(role)) return deny();

    await sendMessage(
      env,
      chatId,
      "ℹ️ Command ini sudah dipindah ke inline menu.\n\nBuka:\n/start → ⚙️ Superadmin Tools → 🧩 Config",
      { reply_markup: buildOfficerHomeKeyboard(role) }
    );
    return true;
  }

  if (command === "/listcategory") {
    if (!isSuperadminRole(role)) return deny();

    const rows = await listCategories(env);
    if (!rows.length) {
      await sendMessage(
        env,
        chatId,
        "Belum ada kategori. (Disarankan pakai inline)\n/start → ⚙️ Superadmin Tools → ⚙️ Settings → 🗂️ Category"
      );
      return true;
    }

    let msg = "📚 LIST CATEGORY:\n\n";
    rows.forEach((r, i) => {
      msg += `${i + 1}. ${r.kode}\n`;
    });

    await sendMessage(env, chatId, msg);
    return true;
  }

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

  return false;
}
