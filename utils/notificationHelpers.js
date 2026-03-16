// utils/notificationHelpers.js

function cleanUsername(username) {
  const u = String(username || "").trim().replace(/^@/, "");
  return u ? `@${u}` : "-";
}

export function buildPartnerApprovedMessage({ linkAturan }) {
  const safeLink = String(linkAturan || "").trim() || "-";

  return (
`✅ PENDAFTARAN PARTNER DISETUJUI

Selamat! Pendaftaran partner kamu telah disetujui dan akun kamu sekarang sudah aktif di TeMan.

Sebelum mulai menggunakan layanan partner, silakan baca dan pahami aturan partner berikut:

${safeLink}

Setelah itu kamu dapat melanjutkan menggunakan Menu TeMan untuk mengelola profil dan aktivitas partner.

Selamat bergabung di TeMan 🤝`
  );
}

export function buildOwnerApprovedMessage({
  nickname,
  username,
  telegramId,
  verificator,
}) {
  return (
`✅ PARTNER BERHASIL DI-APPROVE

Nickname    : ${String(nickname || "-")}
Username    : ${cleanUsername(username)}
Telegram ID : ${String(telegramId || "-")}
Verificator : ${String(verificator || "-")}

Status akhir: APPROVED

Notifikasi aktivasi telah dikirim ke partner dan officer terkait.`
  );
}

export function buildOfficerApprovedMessage({
  nickname,
  username,
  telegramId,
  verificator,
}) {
  return (
`📢 PARTNER BARU AKTIF

Nickname    : ${String(nickname || "-")}
Username    : ${cleanUsername(username)}
Telegram ID : ${String(telegramId || "-")}
Verificator : ${String(verificator || "-")}

Partner telah disetujui oleh owner dan sekarang resmi aktif sebagai partner TeMan.`
  );
}
