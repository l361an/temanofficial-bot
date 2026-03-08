// routes/telegram.commands.admin.js
import { sendMessage } from "../services/telegramApi.js";
import {
  getProfileFullByTelegramId,
} from "../repositories/profilesRepo.js";
import { getSubscriptionInfoByTelegramId } from "../repositories/partnerSubscriptionsRepo.js";
import { listCategories, addCategory, delCategoryByKode } from "../repositories/categoriesRepo.js";
import { isAdminRole, isSuperadminRole } from "../utils/roles.js";
import { buildOfficerHomeKeyboard } from "./callbacks/keyboards.js";
import { resolveTelegramId, fmtClassId } from "../utils/partnerHelpers.js";
import {
  buildHelpText,
  buildOfficerHomeText,
} from "./telegram.messages.js";
import { OBSOLETE_ADMIN_COMMANDS } from "./telegram.constants.js";

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

function formatDateTime(v) {
  if (!v) return "-";
  return String(v);
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

  if (OBSOLETE_ADMIN_COMMANDS.has(command)) {
    await sendMessage(
      env,
      chatId,
      "⚠️ Command ini sudah tidak dipakai.\nGunakan /start untuk buka menu officer.",
      { reply_markup: buildOfficerHomeKeyboard(role) }
    );
    return true;
  }

  if (command === "/start") {
    await sendMessage(env, chatId, buildOfficerHomeText(), {
      reply_markup: buildOfficerHomeKeyboard(role),
    });
    return true;
  }

  if (command === "/help" || command === "/cmd") {
    await sendMessage(env, chatId, buildHelpText(role), { parse_mode: "HTML" });
    return true;
  }

  if (command === "/ceksub") {
    const raw = args[0];
    if (!raw) return needArg("Format:\n/ceksub @username\natau\n/ceksub telegram_id");

    const targetId = await resolveTelegramId(env, raw);
    if (!targetId) return badTarget();

    const profile = await getProfileFullByTelegramId(env, targetId);
    if (!profile) {
      await sendMessage(env, chatId, "Data partner tidak ditemukan.");
      return true;
    }

    const sub = await getSubscriptionInfoByTelegramId(env, targetId);
    const label = await getPartnerLabelByTelegramId(env, targetId);
    const classLabel = fmtClassId(profile.class_id);

    const lines = [];
    lines.push(`📦 Subscription Partner ${label}`);
    lines.push("");
    lines.push(`Status Partner: ${profile.status ?? "-"}`);
    lines.push(`Reason: ${profile.status_reason ?? "-"}`);
    lines.push(`Class ID: ${classLabel}`);
    lines.push(`Manual Suspended: ${Number(profile.is_manual_suspended || 0) === 1 ? "ya" : "tidak"}`);
    lines.push("");

    if (!sub.found || !sub.row) {
      lines.push("Subscription: belum ada");
    } else {
      lines.push(`Subscription Status: ${sub.row.status ?? "-"}`);
      lines.push(`Duration (bulan): ${sub.row.duration_months ?? "-"}`);
      lines.push(`Mulai: ${formatDateTime(sub.row.start_at)}`);
      lines.push(`Berakhir: ${formatDateTime(sub.row.end_at)}`);
      lines.push(`Activated At: ${formatDateTime(sub.row.activated_at)}`);
      lines.push(`Expired At: ${formatDateTime(sub.row.expired_at)}`);
      lines.push(`Source Type: ${sub.row.source_type ?? "-"}`);
      lines.push(`Source Ref ID: ${sub.row.source_ref_id ?? "-"}`);
    }

    if (profile.admin_note) {
      lines.push("");
      lines.push(`Admin Note: ${profile.admin_note}`);
    }

    await sendMessage(env, chatId, lines.join("\n"));
    return true;
  }

  if (command === "/listcategory") {
    if (!isSuperadminRole(role)) return deny();

    const rows = await listCategories(env);
    if (!rows.length) {
      await sendMessage(
        env,
        chatId,
        "Belum ada kategori. Gunakan menu:\n/start → Superadmin Tools → Settings → Category"
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
