// services/notifyAdmin.js
import { sendMessage, sendPhoto } from "./telegramApi.js";
import { getFirstActiveSuperadminId } from "../repositories/adminsRepo.js";

async function dbGetCategoryCodes(env, ids) {
  const cleanIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!cleanIds.length) return [];

  const placeholders = cleanIds.map(() => "?").join(",");
  const stmt = env.DB.prepare(
    `SELECT kode FROM categories WHERE id IN (${placeholders}) ORDER BY kode ASC`
  );

  const res = await stmt.bind(...cleanIds).all();
  return (res?.results || []).map((r) => r.kode).filter(Boolean);
}

// ✅ Keyboard awal hanya Pick Verificator
function buildPickVerKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [{ text: "👤 Pilih Verificator", callback_data: `pickver:${telegramId}` }],
    ],
  };
}

export async function notifySuperadmin(env, data) {
  const adminId = await getFirstActiveSuperadminId(env);

  if (!adminId) {
    console.warn("No active superadmin found in admins table. Skipping notify.");
    return;
  }

  const nickname = data.nickname ? String(data.nickname) : "-";
  const tgUsername = data.username
    ? `@${String(data.username).replace(/^@/, "")}`
    : "-";

  // kategori: resolve category_ids -> kode
  const categoryIds = Array.isArray(data.category_ids) ? data.category_ids : [];
  let categoryCodes = [];
  try {
    categoryCodes = await dbGetCategoryCodes(env, categoryIds);
  } catch (e) {
    console.error("LOAD CATEGORY CODES ERROR:", e);
    categoryCodes = [];
  }
  const categoryText = categoryCodes.length ? categoryCodes.join(", ") : "-";

  // ✅ 1) DATA PARTNER
  const text =
`📥 PARTNER BARU MENDAFTAR

Nama: ${data.nama_lengkap}
Nickname: ${nickname}
Telegram Username: ${tgUsername}
Telegram ID: ${data.telegram_id}
NIK: ${data.nik}
WhatsApp: ${data.no_whatsapp}
Kota: ${data.kota}
Kecamatan: ${data.kecamatan}
Kategori: ${categoryText}

⚠️ Alur: pilih verificator dulu → baru Approve.`;

  await sendMessage(env, adminId, text);

  // ✅ 2) Foto closeup
  if (data.foto_closeup_file_id) {
    await sendPhoto(env, adminId, data.foto_closeup_file_id, "📸 Foto Closeup");
  }

  // ✅ 3) Foto fullbody
  if (data.foto_fullbody_file_id) {
    await sendPhoto(env, adminId, data.foto_fullbody_file_id, "📸 Foto Full Body");
  }

  // ✅ 4) Foto KTP (hanya tombol Pick Verificator)
  await sendPhoto(
    env,
    adminId,
    data.foto_ktp_file_id,
    "🪪 Foto KTP\nVerificator: -",
    {
      reply_markup: buildPickVerKeyboard(data.telegram_id),
    }
  );
}
