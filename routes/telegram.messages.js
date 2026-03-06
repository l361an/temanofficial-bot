// routes/telegram.messages.js

import { isAdminRole, isSuperadminRole } from "../utils/roles.js";

export function buildOfficerHomeText() {
  return "Hallo Officer TeMan...\nSilahkan tekan tombol dibawah atau ketik /help untuk bantuan.";
}

export function buildOfficerIdleText() {
  return "Halo Officer TeMan. Ketik /start untuk buka menu.";
}

export function buildHelpText(role) {
  if (isSuperadminRole(role)) {
    return (
      "📌 <b>Officer Panel</b>\n\n" +
      "Perintah utama:\n" +
      "• <code>/start</code> — buka menu officer\n" +
      "• <code>/ceksub @username|telegram_id</code> — cek subscription partner\n\n" +
      "Akses lain:\n" +
      "• <b>Partner Tools</b> — Partner Database & Partner Moderation\n" +
      "• <b>Superadmin Tools</b> — Config, Settings, Finance"
    );
  }

  if (isAdminRole(role)) {
    return (
      "📌 <b>Officer Panel</b>\n\n" +
      "Perintah utama:\n" +
      "• <code>/start</code> — buka menu officer\n" +
      "• <code>/ceksub @username|telegram_id</code> — cek subscription partner\n\n" +
      "Akses lain:\n" +
      "• <b>Partner Tools</b> — Partner Database & Partner Moderation"
    );
  }

  return (
    "ℹ️ <b>Bantuan</b>\n\n" +
    "• <code>/start</code> — tampilkan Menu TeMan\n" +
    "• <code>/me</code> — cek role"
  );
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
