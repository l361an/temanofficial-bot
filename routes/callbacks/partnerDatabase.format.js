// routes/callbacks/partnerDatabase.format.js
import { escapeHtml } from "./shared.js";
import { cleanHandle, fmtClassId } from "../../utils/partnerHelpers.js";

export function partnerStatusLabel(status) {
  const raw = String(status || "").trim().toLowerCase();

  if (raw === "pending_approval") return "Pending";
  if (raw === "approved") return "Approved";
  if (raw === "suspended") return "Suspended";

  return raw ? raw.replaceAll("_", " ") : "-";
}

export function premiumAccessLabel(profile, subInfo) {
  const partnerStatus = String(profile?.status || "").trim().toLowerCase();
  const isManualSuspended = Number(profile?.is_manual_suspended || 0) === 1;

  if (partnerStatus === "suspended" || isManualSuspended) return "Non-aktif";
  if (subInfo?.is_active && subInfo?.row) return "Aktif";

  return "Non-aktif";
}

export function formatDateTime(value) {
  if (!value) return "-";

  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;

    return d.toLocaleString("id-ID", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

export function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "Rp 0";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function normalizeDurationCode(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "1d" || v === "3d" || v === "7d" || v === "1m") return v;
  return "";
}

export function resolveDurationCode(row) {
  const metaRaw = String(row?.metadata_json || "").trim();
  if (metaRaw) {
    try {
      const meta = JSON.parse(metaRaw);
      const code = normalizeDurationCode(meta?.duration_code);
      if (code) return code;
    } catch {}
  }

  const snapRaw = String(row?.pricing_snapshot_json || "").trim();
  if (snapRaw) {
    try {
      const snap = JSON.parse(snapRaw);
      const code = normalizeDurationCode(snap?.duration_code);
      if (code) return code;
    } catch {}
  }

  const months = Number(row?.duration_months || 0);
  if (months === 1) return "1m";

  return "";
}

export function formatDurationLabelFromRow(row) {
  const code = resolveDurationCode(row);

  if (code === "1d") return "1 Hari";
  if (code === "3d") return "3 Hari";
  if (code === "7d") return "7 Hari";
  if (code === "1m") return "1 Bulan";

  const months = Number(row?.duration_months || 0);
  if (Number.isFinite(months) && months > 0) return `${months} Bulan`;

  return "-";
}

export function buildPartnerViewPromptText() {
  return (
    "🔎 <b>View Partner</b>\n\n" +
    "Kirim <b>@username</b> atau <b>telegram_id</b> target.\n\n" +
    "Ketik <b>batal</b> untuk keluar."
  );
}

export function buildPartnerControlPanelText(context) {
  const { profile, subInfo } = context;
  const premiumAccess = premiumAccessLabel(profile, subInfo);
  const username = cleanHandle(profile?.username);
  const selectedLabel = username || profile?.telegram_id || "-";

  return [
    "🎛️ <b>Partner Control Panel</b>",
    "",
    `Target: <b>${escapeHtml(selectedLabel)}</b>`,
    `Nama: <b>${escapeHtml(profile?.nama_lengkap || "-")}</b>`,
    `Telegram ID: <code>${escapeHtml(profile?.telegram_id || "-")}</code>`,
    `Status Partner: <b>${escapeHtml(partnerStatusLabel(profile?.status))}</b>`,
    `Akses Premium: <b>${escapeHtml(premiumAccess)}</b>`,
    `Class Partner: <b>${escapeHtml(fmtClassId(profile?.class_id))}</b>`,
    "",
    "Pilih menu di bawah:",
  ].join("\n");
}

export function buildPartnerDetailsText(context) {
  const { profile, categories, verificatorDisplay } = context;
  const kategoriText = categories.length ? categories.join(", ") : "-";

  return [
    "👤 <b>Partner Details</b>",
    "",
    `Nama Lengkap: <b>${escapeHtml(profile?.nama_lengkap || "-")}</b>`,
    `Nickname: <b>${escapeHtml(profile?.nickname || "-")}</b>`,
    `Username: <b>${escapeHtml(cleanHandle(profile?.username) || "-")}</b>`,
    `Telegram ID: <code>${escapeHtml(profile?.telegram_id || "-")}</code>`,
    `NIK: <b>${escapeHtml(profile?.nik || "-")}</b>`,
    `No Whatsapp: <b>${escapeHtml(profile?.no_whatsapp || "-")}</b>`,
    `Kecamatan: <b>${escapeHtml(profile?.kecamatan || "-")}</b>`,
    `Kota: <b>${escapeHtml(profile?.kota || "-")}</b>`,
    `Kategori: <b>${escapeHtml(kategoriText)}</b>`,
    `Verificator: <b>${escapeHtml(verificatorDisplay || "-")}</b>`,
    `Approved At: <b>${escapeHtml(formatDateTime(profile?.approved_at))}</b>`,
  ].join("\n");
}

export function buildPartnerSubscriptionText(context) {
  const { profile, subInfo, latestPayment } = context;

  const premiumAccess = premiumAccessLabel(profile, subInfo);
  const row = subInfo?.row || null;
  const durationLabel = formatDurationLabelFromRow(row);

  const lines = [
    "📦 <b>Partner Subscription</b>",
    "",
    "💎 <b>Status Premium</b>",
    `${escapeHtml(premiumAccess)}`,
    "",
    "👤 <b>Class Partner</b>",
    `${escapeHtml(fmtClassId(profile?.class_id))}`,
    "",
    "⏱ <b>Durasi</b>",
    `${escapeHtml(durationLabel)}`,
    "",
    "📅 <b>Periode Aktif</b>",
    `${escapeHtml(formatDateTime(row?.start_at))}`,
    "s/d",
    `${escapeHtml(formatDateTime(row?.end_at))}`,
  ];

  if (latestPayment) {
    lines.push("");
    lines.push("💳 <b>Pembayaran Terakhir</b>");
    lines.push("");
    lines.push(`Kode Tiket`);
    lines.push(`<b>${escapeHtml(latestPayment.ticket_code || "-")}</b>`);
    lines.push("");
    lines.push(`Status`);
    lines.push(`<b>${escapeHtml(latestPayment.status || "-")}</b>`);
    lines.push("");
    lines.push(`Harga`);
    lines.push(`<b>${escapeHtml(formatMoney(latestPayment.amount_base))}</b>`);
    lines.push("");
    lines.push(`Kode Unik`);
    lines.push(`<b>${escapeHtml(latestPayment.unique_code ?? "0")}</b>`);
    lines.push("");
    lines.push(`Total Transfer`);
    lines.push(`<b>${escapeHtml(formatMoney(latestPayment.amount_final))}</b>`);
    lines.push("");
    lines.push(`Tanggal Bayar`);
    lines.push(`<b>${escapeHtml(formatDateTime(latestPayment.confirmed_at))}</b>`);
  }

  return lines.join("\n");
}
