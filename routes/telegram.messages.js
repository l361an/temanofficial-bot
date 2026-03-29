// routes/telegram.messages.js

import { isAdminRole } from "../utils/roles.js";

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function isOwnerRole(role) {
  return normalizeLower(role) === "owner";
}

export function buildOfficerHomeText() {
  return (
    "👮 <b>Officer Home</b>\n\n" +
    "Kelola admin, partner, dan pengaturan sistem lewat menu inline.\n" +
    "Gunakan <code>/temanku</code> untuk hub command bot ini."
  );
}

export function buildOfficerIdleText() {
  return "Halo Officer TeMan. Ketik /temanku untuk buka hub bot ini.";
}

export function buildTemankuHubText(role) {
  if (isAdminRole(role)) {
    return (
      "📌 <b>Temanku Hub</b>\n\n" +
      "On-demand katalog:\n" +
      "• <code>/{kategori}</code>\n" +
      "• <code>/{kategori} {kota}</code>\n" +
      "• <code>/{kategori} {kecamatan} - {kota}</code>\n\n" +
      "Feed katalog otomatis:\n" +
      "• <code>/katalog {kategori} on</code>\n" +
      "• <code>/katalog {kategori} off</code>\n" +
      "• <code>/katalog list</code>\n\n" +
      "Officer gunakan menu inline untuk pengelolaan admin dan partner."
    );
  }

  return (
    "📌 <b>Temanku Hub</b>\n\n" +
    "On-demand katalog:\n" +
    "• <code>/{kategori}</code>\n" +
    "• <code>/{kategori} {kota}</code>\n" +
    "• <code>/{kategori} {kecamatan} - {kota}</code>\n\n" +
    "Gunakan format lokasi aman: <code>Kecamatan - Kota</code>."
  );
}

export function buildHelpText(role) {
  if (isOwnerRole(role)) {
    return (
      "📌 <b>Owner Panel</b>\n\n" +
      "Gunakan <code>/temanku</code> untuk hub command bot ini.\n\n" +
      "Owner dan officer kelola sistem dari menu inline."
    );
  }

  if (isAdminRole(role)) {
    return (
      "📌 <b>Officer Panel</b>\n\n" +
      "Gunakan <code>/temanku</code> untuk hub command bot ini.\n\n" +
      "Officer kelola partner dan pengaturan dari menu inline."
    );
  }

  return buildTemankuHubText(role);
}

export function buildWelcomePreviewText(current, draft) {
  return (
    "🧾 *Preview Welcome Partner*\n\n" +
    "*Current:*\n" +
    (current || "-") +
    "\n\n" +
    "*New (draft):*\n" +
    draft +
    "\n\n" +
    "Klik tombol di bawah untuk *Confirm* atau *Cancel*."
  );
}

export function buildLinkAturanPreviewText(current, draftUrl) {
  return (
    "🧾 *Preview Link Aturan*\n\n" +
    "*Current (link_aturan):*\n" +
    (current || "-") +
    "\n\n" +
    "*New (draft):*\n" +
    draftUrl +
    "\n\n" +
    "Klik tombol di bawah untuk *Confirm* atau *Cancel*."
  );
}
