// services/ktpR2.js
import { telegramGetFile, telegramDownloadFile } from "./telegramApi.js";

function safeSegment(input, fallback = "-") {
  const s = String(input || "").trim();
  if (!s) return fallback;
  return s
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function extFromTelegramPath(filePath) {
  const m = String(filePath || "").match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "jpg";
}

export async function uploadKtpToR2OnApprove(env, telegramId) {
  const tid = String(telegramId || "").trim();
  if (!tid) throw new Error("Missing telegramId");

  const p = await env.DB.prepare(
    `
    SELECT telegram_id, nama_lengkap, nickname, username, foto_ktp_file_id, foto_ktp_r2_key
    FROM profiles
    WHERE telegram_id = ?
    LIMIT 1
  `
  )
    .bind(tid)
    .first();

  if (!p) throw new Error(`Profile not found: ${tid}`);

  if (p.foto_ktp_r2_key) return { skipped: true, key: String(p.foto_ktp_r2_key) };

  const fileId = String(p.foto_ktp_file_id || "").trim();
  if (!fileId) throw new Error("Missing foto_ktp_file_id");

  const fileInfo = await telegramGetFile(env, fileId);
  const res = await telegramDownloadFile(env, fileInfo.file_path);

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const ext = extFromTelegramPath(fileInfo.file_path);

  const nama = safeSegment(p.nama_lengkap, "Tanpa Nama");
  const nick = safeSegment(p.nickname, "Tanpa Nickname");
  const key = `${nama}/${nick} - ${tid}.${ext}`;

  await env.KTP_BUCKET.put(key, res.body, {
    httpMetadata: { contentType },
    customMetadata: { telegram_id: tid, username: String(p.username || "") },
  });

  await env.DB.prepare(
    `
    UPDATE profiles
    SET foto_ktp_r2_key = ?
    WHERE telegram_id = ?
  `
  )
    .bind(key, tid)
    .run();

  return { skipped: false, key };
}
