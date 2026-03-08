// routes/callbacks/partnerDetail.js

import { sendMessage } from "../../services/telegramApi.js";
import { getProfileFullByTelegramId } from "../../repositories/profilesRepo.js";
import { getSubscriptionInfoByTelegramId } from "../../repositories/partnerSubscriptionsRepo.js";

import {
  buildPartnerDetailActionsKeyboard,
  buildBackToPartnerDatabaseKeyboard,
} from "./keyboards.js";

function partnerStatusLabel(status) {
  const raw = String(status || "").trim().toLowerCase();

  if (raw === "pending_approval") return "Pending";
  if (raw === "approved") return "Approved";
  if (raw === "suspended") return "Suspended";

  return raw || "-";
}

function premiumAccessLabel(profile, subInfo) {
  const partnerStatus = String(profile?.status || "").toLowerCase();
  const manualSuspended = Number(profile?.is_manual_suspended || 0) === 1;

  if (partnerStatus === "suspended" || manualSuspended) return "Non-aktif";
  if (subInfo?.is_active) return "Aktif";

  return "Non-aktif";
}

function formatDate(v) {
  if (!v) return "-";

  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;

  return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
}

export async function sendPartnerDetail(env, adminId, telegramId, role) {
  const profile = await getProfileFullByTelegramId(env, telegramId);

  if (!profile) {
    await sendMessage(env, adminId, "⚠️ Data partner tidak ditemukan.", {
      reply_markup: buildBackToPartnerDatabaseKeyboard(),
    });
    return;
  }

  const subInfo = await getSubscriptionInfoByTelegramId(env, telegramId);

  const premiumAccess = premiumAccessLabel(profile, subInfo);

  let masaAktif = "-";

  if (subInfo?.row) {
    masaAktif = `${formatDate(subInfo.row.start_at)} s.d ${formatDate(
      subInfo.row.end_at
    )}`;
  }

  const lines = [
    "👤 <b>DETAIL PARTNER</b>",
    "",
    `Nickname : <b>${profile.nickname || "-"}</b>`,
    `Username : <b>${profile.username ? `@${profile.username}` : "-"}</b>`,
    `Telegram ID : <code>${profile.telegram_id}</code>`,
    "",
    `Class ID : <b>${profile.class_id || "-"}</b>`,
    `Status Partner : <b>${partnerStatusLabel(profile.status)}</b>`,
    "",
    "💎 <b>PREMIUM PARTNER</b>",
    `Akses Premium : <b>${premiumAccess}</b>`,
    `Masa Aktif : <b>${masaAktif}</b>`,
  ];

  await sendMessage(env, adminId, lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: buildPartnerDetailActionsKeyboard(profile.telegram_id, role),
  });
}
