// routes/telegram.flow.selfProfile.view.js

import { sendMessage, sendPhoto, sendLongMessage } from "../services/telegramApi.js";
import {
  getProfileFullByTelegramId,
  listCategoryKodesByProfileId,
} from "../repositories/profilesRepo.js";
import { getSubscriptionInfoByTelegramId } from "../repositories/partnerSubscriptionsRepo.js";

import {
  fmtKV,
  cleanHandle,
  sendHtml,
  buildTeManMenuKeyboard,
  formatDateTime,
} from "./telegram.user.shared.js";

function buildPartnerStatusText(profile) {
  const raw = String(profile?.status || "").trim().toLowerCase();

  if (raw === "pending_approval") return "Pending";
  if (raw === "approved") return "Approved";
  if (raw === "suspended") return "Suspended";

  return raw ? raw.replaceAll("_", " ") : "-";
}

function buildMasaAktifText(subInfo) {
  if (!subInfo?.found || !subInfo?.row) return "-";

  const startAt = formatDateTime(subInfo.row.start_at);
  const endAt = formatDateTime(subInfo.row.end_at);

  if (!subInfo.row.start_at && !subInfo.row.end_at) return "-";
  return `${startAt} s.d ${endAt}`;
}

export function hasPremiumAccess(profile, subInfo) {
  const partnerStatus = String(profile?.status || "").trim().toLowerCase();
  const isManualSuspended = Number(profile?.is_manual_suspended || 0) === 1;

  if (partnerStatus === "suspended" || isManualSuspended) return false;
  if (subInfo?.is_active && subInfo?.row) return true;
  return false;
}

function buildPremiumStatusText(profile, subInfo) {
  return hasPremiumAccess(profile, subInfo) ? "Aktif" : "Non-aktif";
}

function formatMoney(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return "-";

  try {
    return new Intl.NumberFormat("id-ID").format(num);
  } catch {
    return String(Math.floor(num));
  }
}

function buildStartPriceText(profile) {
  const num = Number(profile?.start_price || 0);
  if (!Number.isFinite(num) || num <= 0) return "-";
  return `Rp ${formatMoney(num)}`;
}

function resolveCatalogState(profile, subInfo) {
  const partnerStatus = String(profile?.status || "").trim().toLowerCase();
  const isManualSuspended = Number(profile?.is_manual_suspended || 0) === 1;
  const isCatalogVisible = Number(profile?.is_catalog_visible || 0) === 1;
  const hasStartPrice = Number(profile?.start_price || 0) > 0;
  const premiumActive = hasPremiumAccess(profile, subInfo);

  if (partnerStatus !== "approved") {
    return {
      statusText: "Belum Tampil",
      noteText: "Partner belum approved.",
    };
  }

  if (isManualSuspended) {
    return {
      statusText: "Belum Tampil",
      noteText: "Partner sedang suspended.",
    };
  }

  if (!premiumActive) {
    return {
      statusText: "Belum Tampil",
      noteText: "Premium belum aktif.",
    };
  }

  if (!hasStartPrice) {
    return {
      statusText: "Belum Tampil",
      noteText: "Tarif minimum belum diisi.",
    };
  }

  if (!isCatalogVisible) {
    return {
      statusText: "Disembunyikan",
      noteText: "Visibilitas katalog sedang off.",
    };
  }

  return {
    statusText: "Tampil",
    noteText: "Profile siap tampil di katalog.",
  };
}

function buildProfileSummaryText(
  profile,
  kategoriText,
  premiumStatusText,
  masaAktifText,
  catalogState
) {
  return [
    "👤 <b>PROFILE PARTNER</b>",
    "",
    fmtKV("Nama Lengkap", profile.nama_lengkap),
    fmtKV("Nickname", profile.nickname),
    fmtKV("Username", cleanHandle(profile.username)),
    fmtKV("Telegram ID", profile.telegram_id),
    fmtKV("NIK", profile.nik),
    fmtKV("Kategori", kategoriText),
    fmtKV("No. Whatsapp", profile.no_whatsapp),
    fmtKV("Kecamatan", profile.kecamatan),
    fmtKV("Kota", profile.kota),
    fmtKV("Tarif Minimum", buildStartPriceText(profile)),
    fmtKV("Status Partner", buildPartnerStatusText(profile)),
    "",
    "💎 <b>PREMIUM PARTNER</b>",
    fmtKV("Akses Premium", premiumStatusText),
    fmtKV("Masa Aktif", masaAktifText),
    "",
    "📢 <b>KATALOG PARTNER</b>",
    fmtKV("Status Katalog", catalogState.statusText),
    fmtKV("Catatan", catalogState.noteText),
  ].join("\n");
}

export async function sendSelfProfile(env, chatId, telegramId) {
  const profile = await getProfileFullByTelegramId(env, telegramId);

  if (!profile) {
    await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  const subInfo = await getSubscriptionInfoByTelegramId(env, telegramId);
  const masaAktifText = buildMasaAktifText(subInfo);
  const premiumStatusText = buildPremiumStatusText(profile, subInfo);
  const catalogState = resolveCatalogState(profile, subInfo);

  const categories = profile.id
    ? await listCategoryKodesByProfileId(env, profile.id)
    : [];

  const kategoriText = categories.length ? categories.join(", ") : "-";

  const textSummary = buildProfileSummaryText(
    profile,
    kategoriText,
    premiumStatusText,
    masaAktifText,
    catalogState
  );

  await sendLongMessage(env, chatId, textSummary, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });

  if (profile.foto_closeup_file_id) {
    await sendPhoto(env, chatId, profile.foto_closeup_file_id, "📸 <b>Foto Closeup</b>", {
      parse_mode: "HTML",
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  await sendMessage(env, chatId, "📋 Menu TeMan", {
    reply_markup: buildTeManMenuKeyboard(),
  });
}
