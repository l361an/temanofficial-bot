// services/notifyAdmin.js

import { sendMessage, sendPhoto } from "./telegramApi.js";
import { listAdmins } from "../repositories/adminsRepo.js";

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

function buildPickVerKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [{ text: "👤 Pilih Verificator", callback_data: `pickver:${telegramId}` }],
    ],
  };
}

async function getOwners(env) {
  const rows = await listAdmins(env, { activeOnly: true }).catch(() => []);
  return rows.filter((r) => r.normRole === "owner");
}

export async function notifySuperadmin(env, data) {
  const owners = await getOwners(env);

  if (!owners.length) {
    console.warn("No active owner found. Skipping registration notify.");
    return;
  }

  const nickname = data.nickname ? String(data.nickname) : "-";
  const tgUsername = data.username
    ? `@${String(data.username).replace(/^@/, "")}`
    : "-";

  const categoryIds = Array.isArray(data.category_ids) ? data.category_ids : [];
  let categoryCodes = [];

  try {
    categoryCodes = await dbGetCategoryCodes(env, categoryIds);
  } catch (e) {
    console.error("LOAD CATEGORY CODES ERROR:", e);
  }

  const categoryText = categoryCodes.length ? categoryCodes.join(", ") : "-";

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
Tarif Minimum: IDR ${Number(data.start_price || 0).toLocaleString("id-ID")}
Kategori: ${categoryText}

⚠️ Owner harus memilih verificator lalu approve.`;

  for (const owner of owners) {
    const ownerId = String(owner.telegram_id);

    await sendMessage(env, ownerId, text);

    if (data.foto_closeup_file_id) {
      await sendPhoto(env, ownerId, data.foto_closeup_file_id, "📸 Foto Closeup");
    }

    if (data.foto_fullbody_file_id) {
      await sendPhoto(env, ownerId, data.foto_fullbody_file_id, "📸 Foto Full Body");
    }

    await sendPhoto(
      env,
      ownerId,
      data.foto_ktp_file_id,
      "🪪 Foto KTP\nVerificator: -",
      {
        reply_markup: buildPickVerKeyboard(data.telegram_id),
      }
    );
  }
}
