// routes/telegram.flow.partnerView.js

import { clearSession } from "../utils/session.js";
import { sendMessage, sendPhoto, sendLongMessage } from "../services/telegramApi.js";
import { getAdminByTelegramId } from "../repositories/adminsRepo.js";
import { getProfileFullByTelegramId, listCategoryKodesByProfileId } from "../repositories/profilesRepo.js";
import { isSuperadminRole } from "../utils/roles.js";
import {
  buildPartnerDetailActionsKeyboard,
  buildBackToPartnerDatabaseViewKeyboard,
} from "./callbacks/keyboards.js";
import {
  cleanHandle,
  fmtClassId,
  fmtKV,
  resolveTelegramId,
} from "../utils/partnerHelpers.js";

export async function handlePartnerViewInput({ env, chatId, text, STATE_KEY, role }) {
  const raw = String(text || "").trim();

  if (/^(batal|cancel|keluar)$/i.test(raw)) {
    await clearSession(env, STATE_KEY);
    await sendMessage(env, chatId, "✅ Oke, sesi View Partner dibatalkan.", {
      reply_markup: buildBackToPartnerDatabaseViewKeyboard(),
    });
    return true;
  }

  const targetId = await resolveTelegramId(env, raw);
  if (!targetId) {
    await sendMessage(
      env,
      chatId,
      "⚠️ Target tidak valid / tidak ditemukan.\nKirim <b>@username</b> atau <b>telegram_id</b> ya.\n\nKetik <b>batal</b> untuk keluar.",
      { parse_mode: "HTML", reply_markup: buildBackToPartnerDatabaseViewKeyboard() }
    );
    return true;
  }

  const profile = await getProfileFullByTelegramId(env, targetId);
  if (!profile) {
    await sendMessage(env, chatId, "Data partner tidak ditemukan.", {
      parse_mode: "HTML",
      reply_markup: buildBackToPartnerDatabaseViewKeyboard(),
    });
    return true;
  }

  const categories = profile.id ? await listCategoryKodesByProfileId(env, profile.id) : [];
  const kategoriText = categories.length ? categories.join(", ") : "-";

  let verificatorDisplay = "-";
  if (profile.verificator_admin_id) {
    const vid = String(profile.verificator_admin_id);
    const vRow = await getAdminByTelegramId(env, vid).catch(() => null);
    const vUser = vRow?.username
      ? cleanHandle(vRow.username)
      : vRow?.label
      ? String(vRow.label)
      : "-";
    verificatorDisplay = `${vid} - ${vUser || "-"}`;
  }

  const textSummary =
    "🧾 <b>PARTNER</b>\n" +
    fmtKV("Telegram ID", profile.telegram_id) +
    "\n" +
    fmtKV("Username", cleanHandle(profile.username)) +
    "\n" +
    fmtKV("Class ID", fmtClassId(profile.class_id)) +
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
    fmtKV("Verificator", verificatorDisplay);

  let summarySent = false;

  try {
    await sendLongMessage(env, chatId, textSummary, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    summarySent = true;
  } catch (err) {
    console.error("VIEW PARTNER summary error:", err);

    // fallback tanpa HTML
    try {
      await sendMessage(env, chatId, textSummary.replace(/<[^>]+>/g, ""));
      summarySent = true;
    } catch (e) {
      console.error("VIEW PARTNER fallback error:", e);
    }
  }

  if (!summarySent) {
    await sendMessage(env, chatId, "⚠️ Gagal menampilkan data partner.");
    await clearSession(env, STATE_KEY);
    return true;
  }

  for (const [fileId, cap] of [
    [profile.foto_closeup_file_id, "📸 <b>Foto Closeup</b>"],
    [profile.foto_fullbody_file_id, "📸 <b>Foto Fullbody</b>"],
    [profile.foto_ktp_file_id, "🪪 <b>Foto KTP</b>"],
  ]) {
    if (fileId) {
      await sendPhoto(env, chatId, fileId, cap, { parse_mode: "HTML" });
    }
  }

  await clearSession(env, STATE_KEY);

  if (isSuperadminRole(role)) {
    await sendMessage(env, chatId, "⚙️ <b>Aksi Partner</b>", {
      parse_mode: "HTML",
      reply_markup: buildPartnerDetailActionsKeyboard(profile.telegram_id, role),
    });
    return true;
  }

  await sendMessage(env, chatId, "✅ Selesai.", {
    reply_markup: buildBackToPartnerDatabaseViewKeyboard(),
  });

  return true;
}
