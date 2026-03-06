// routes/telegram.messages.js

import { isAdminRole, isSuperadminRole } from "../utils/roles.js";

export function buildOfficerHomeText() {
  return "Hallo Officer TeMan...\nSilahkan tekan tombol dibawah atau ketik /help untuk bantuan.";
}

export function buildOfficerIdleText() {
  return "Halo Officer TeMan. Ketik /start untuk menu, atau /help untuk daftar command.";
}

export function buildHelpText(role) {
  if (isSuperadminRole(role)) {
    return (
      "📌 <b>Daftar Command (Officer Panel)</b>\n\n" +
      "<b>Admin + Superadmin:</b>\n" +
      "• <code>/start</code> — Buka <b>Officer Home</b> (inline menu)\n" +
      "• <code>/ceksub @username|telegram_id</code> — Cek subscription partner\n\n" +
      "<b>Superadmin only:</b>\n" +
      "• Buka <b>⚙️ Superadmin Tools</b> dari Officer Home untuk Config/Settings/Finance\n\n" +
      "ℹ️ <b>Catatan:</b>\n" +
      "Fitur <b>Partner Database</b> & <b>Partner Moderation</b> sekarang <b>inline-only</b>.\n" +
      "Gunakan <code>/start</code> lalu pilih menu."
    );
  }

  if (isAdminRole(role)) {
    return (
      "📌 <b>Daftar Command (Officer Panel)</b>\n\n" +
      "<b>Admin + Superadmin:</b>\n" +
      "• <code>/start</code> — Buka <b>Officer Home</b> (inline menu)\n" +
      "• <code>/ceksub @username|telegram_id</code> — Cek subscription partner\n\n" +
      "ℹ️ <b>Catatan:</b>\n" +
      "Fitur <b>Partner Database</b> & <b>Partner Moderation</b> sekarang <b>inline-only</b>.\n" +
      "Gunakan <code>/start</code> lalu pilih menu."
    );
  }

  return (
    "ℹ️ <b>Bantuan</b>\n\n" +
    "• <code>/start</code> — Tampilkan Menu TeMan\n" +
    "• <code>/me</code> — Cek role (debug)"
  );
}

export function buildLegacyInlineRedirectText() {
  return "ℹ️ Command ini sudah dipindah ke inline menu.\n\nBuka:\n/start → ⚙️ Superadmin Tools → 🧩 Config";
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
