// routes/telegram.messages.js

import { isAdminRole, isSuperadminRole } from "../utils/roles.js";

export function buildOfficerHomeText() {
  return (
    "👮 <b>Officer Home</b>\n\n" +
    "Pilih menu di bawah untuk kelola admin, partner, dan pengaturan sistem TeMan.\n" +
    "Ketik <code>/help</code> untuk bantuan."
  );
}

export function buildOfficerIdleText() {
  return "Halo Officer TeMan. Ketik /start untuk buka Officer Home.";
}

export function buildHelpText(role) {
  if (isSuperadminRole(role)) {
    return (
      "📌 <b>Officer Panel</b>\n\n" +
      "Perintah utama:\n" +
      "• <code>/start</code> — buka Officer Home\n" +
      "• <code>/help</code> / <code>/cmd</code> — lihat bantuan\n" +
      "• <code>/ceksub @username|telegram_id</code> — cek subscription partner\n\n" +
      "Menu utama:\n" +
      "• <b>Admin Management</b> — list admin, add admin, update role/status admin\n" +
      "• <b>Partner Management</b> — Partner Database & Partner Moderation\n" +
      "• <b>System Settings</b> — Welcome Message, Link Aturan, Category, Finance"
    );
  }

  if (isAdminRole(role)) {
    return (
      "📌 <b>Officer Panel</b>\n\n" +
      "Perintah utama:\n" +
      "• <code>/start</code> — buka Officer Home\n" +
      "• <code>/help</code> / <code>/cmd</code> — lihat bantuan\n" +
      "• <code>/ceksub @username|telegram_id</code> — cek subscription partner\n\n" +
      "Menu utama:\n" +
      "• <b>Partner Management</b> — Partner Database & Partner Moderation"
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
