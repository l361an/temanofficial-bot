// routes/callbacks/booking.render.js

function normalizeString(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function shortYear(value) {
  return String(value || "").slice(-2);
}

export function formatBookingDateTime(value) {
  const raw = normalizeString(value);
  if (!raw) return "-";

  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [, yyyy, mm, dd, hh, mi] = m;
    return `${dd}-${mm}-${shortYear(yyyy)} ${hh}:${mi}`;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${shortYear(date.getFullYear())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatStatusLabel(status) {
  const raw = normalizeString(status).toLowerCase();
  if (raw === "negotiating") return "Sedang Nego";
  if (raw === "agreed") return "Sudah Sepakat";
  if (raw === "awaiting_dp") return "Menunggu DP";
  if (raw === "dp_review") return "Review DP";
  if (raw === "secured") return "Aman / Hold";
  if (raw === "completed") return "Selesai";
  if (raw === "cancelled") return "Dibatalkan";
  if (raw === "expired") return "Expired";
  if (raw === "partner_terlambat") return "Partner Terlambat";
  if (raw === "user_terlambat") return "User Terlambat";
  if (raw === "menunggu_bantuan_admin") return "Menunggu Bantuan Admin";
  return raw ? raw.replaceAll("_", " ") : "-";
}

function formatActorLabel(side) {
  return normalizeString(side).toLowerCase() === "partner" ? "Partner" : "User";
}

function formatPartnerLabel(profile, booking) {
  const nickname = normalizeString(profile?.nickname);
  const fullname = normalizeString(profile?.nama_lengkap);
  const username = normalizeString(profile?.username).replace(/^@+/, "");
  const telegramId = normalizeString(booking?.partner_telegram_id) || "-";

  const name = nickname || fullname || `Partner ${telegramId}`;
  if (!username) return `<b>${escapeHtml(name)}</b>`;
  return `<b>${escapeHtml(name)}</b> - <b>@${escapeHtml(username)}</b>`;
}

function buildLastProposalText(booking) {
  const kind = normalizeString(booking?.last_proposal_kind).toLowerCase();
  const by = normalizeString(booking?.last_proposed_by).toLowerCase();
  const actorLabel = by === "partner" ? "Partner" : by === "user" ? "User" : "-";

  if (kind === "exact" && booking?.last_proposed_exact_at) {
    return `Waktu Pas : <b>${escapeHtml(formatBookingDateTime(booking.last_proposed_exact_at))}</b> (${escapeHtml(actorLabel)})`;
  }

  if (kind === "window" && booking?.last_proposed_window_start_at && booking?.last_proposed_window_end_at) {
    return `Rentang Waktu : <b>${escapeHtml(formatBookingDateTime(booking.last_proposed_window_start_at))}</b> s/d <b>${escapeHtml(formatBookingDateTime(booking.last_proposed_window_end_at))}</b> (${escapeHtml(actorLabel)})`;
  }

  return "Belum ada usulan waktu.";
}

export function buildBookingPanelText({ booking, actorSide, partnerProfile, noticeText = "" }) {
  const lines = ["🛡️ <b>Safety Booking</b>"];

  if (noticeText) {
    lines.push("");
    lines.push(noticeText);
  }

  lines.push("");
  lines.push(`Posisi Kamu : <b>${escapeHtml(formatActorLabel(actorSide))}</b>`);
  lines.push(`Status : <b>${escapeHtml(formatStatusLabel(booking?.status))}</b>`);

  if (normalizeString(actorSide).toLowerCase() === "partner") {
    lines.push(`Pemesan : <code>${escapeHtml(booking?.user_telegram_id || "-")}</code>`);
  } else {
    lines.push(`Partner : ${formatPartnerLabel(partnerProfile, booking)}`);
  }

  lines.push(`Usulan Terakhir : ${buildLastProposalText(booking)}`);

  if (booking?.agreed_exact_at) {
    lines.push(`Waktu Fix : <b>${escapeHtml(formatBookingDateTime(booking.agreed_exact_at))}</b>`);
  }

  lines.push("");

  if (normalizeString(booking?.status).toLowerCase() === "agreed") {
    lines.push("Waktu sudah fix. Jalur DP disiapkan terpisah dari patch ini.");
  } else if (normalizeString(booking?.status).toLowerCase() === "cancelled") {
    lines.push("Booking ini sudah dibatalkan.");
  } else {
    lines.push("Pilih aksi di bawah untuk lanjut atur waktu.");
  }

  return lines.join("\n");
}

export function buildBookingExactInputPromptText({ booking, actorSide }) {
  const sideLabel = formatActorLabel(actorSide);

  return [
    "🕒 <b>Ajukan Waktu Pas</b>",
    "",
    `Posisi Kamu : <b>${escapeHtml(sideLabel)}</b>`,
    `Booking ID : <code>${escapeHtml(booking?.id || "-")}</code>`,
    "",
    "Kirim 1 baris dengan format:",
    "<code>05-04-26 18:30</code>",
    "",
    "Tanggal: <code>dd-mm-yy</code>",
    "Jam: <code>hh:mm</code>",
    "",
    "Ketik <b>batal</b> untuk kembali ke ringkasan.",
  ].join("\n");
}

export function buildBookingWindowInputPromptText({ booking, actorSide }) {
  const sideLabel = formatActorLabel(actorSide);

  return [
    "🪟 <b>Ajukan Rentang Waktu</b>",
    "",
    `Posisi Kamu : <b>${escapeHtml(sideLabel)}</b>`,
    `Booking ID : <code>${escapeHtml(booking?.id || "-")}</code>`,
    "",
    "Kirim 1 baris dengan format:",
    "<code>05-04-26 18:00 - 20:00</code>",
    "",
    "Tanggal: <code>dd-mm-yy</code>",
    "Jam: <code>hh:mm</code>",
    "",
    "Final booking tetap harus turun ke waktu pas.",
    "Ketik <b>batal</b> untuk kembali ke ringkasan.",
  ].join("\n");
}
