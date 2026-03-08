// routes/telegram.flow.js

import { sendMessage } from "../services/telegramApi.js";
import { saveSession, clearSession } from "../utils/session.js";
import {
  insertPendingProfile,
  getProfileByTelegramId,
  setProfileCategoriesByProfileId,
} from "../repositories/profilesRepo.js";
import { notifySuperadmin } from "../services/notifyAdmin.js";

// ✅ Menu Utama harus muncul setelah registrasi selesai
import { buildTeManMenuKeyboard } from "./telegram.commands.user.js";

// ✅ Shared category flow
import {
  loadCategoriesForChoice,
  buildCategoryChoiceMessage,
  parseMultiIndexInputRequired,
  mapIndexesToCategoryIds,
} from "../utils/categoryFlow.js";

function statusMessage(status) {
  const raw = String(status || "").trim().toLowerCase();

  if (raw === "pending_approval") {
    return "⏳ Kamu sudah pernah daftar dan saat ini masih *menunggu review superadmin*.";
  }

  if (raw === "approved") {
    return "✅ Kamu sudah terdaftar dan status partner kamu *APPROVED*.\n\nKalau ingin akses Premium, silakan lanjut dari menu Payment.";
  }

  if (raw === "suspended") {
    return "⛔ Akun kamu saat ini *SUSPENDED*. Silakan hubungi admin.";
  }

  return "ℹ️ Kamu sudah pernah terdaftar.";
}

export async function handleRegistrationFlow({
  update,
  env,
  chatId,
  telegramId,
  username,
  text,
  session,
  STATE_KEY,
}) {
  // 1. NAMA
  if (session.step === "input_nama") {
    session.data.nama_lengkap = text.trim();
    session.step = "input_nickname";
    await saveSession(env, STATE_KEY, session);
    await sendMessage(env, chatId, "Masukkan Nickname (tanpa spasi):");
    return true;
  }

  // 2. NICKNAME
  if (session.step === "input_nickname") {
    const nickname = text.trim().replace(/\s+/g, "");

    if (nickname.length < 3) {
      await sendMessage(env, chatId, "Nickname minimal 3 karakter.");
      return true;
    }

    session.data.nickname_input = nickname;
    session.step = "input_nik";
    await saveSession(env, STATE_KEY, session);
    await sendMessage(env, chatId, "Masukkan NIK (16 digit):");
    return true;
  }

  // 3. NIK
  if (session.step === "input_nik") {
    session.data.nik = text;
    session.step = "input_whatsapp";
    await saveSession(env, STATE_KEY, session);
    await sendMessage(env, chatId, "Masukkan No WhatsApp:");
    return true;
  }

  // 4. WHATSAPP
  if (session.step === "input_whatsapp") {
    session.data.no_whatsapp = text.replace(/\D/g, "");

    try {
      const categories = await loadCategoriesForChoice(env);

      // kalau belum ada kategori di DB, lanjut tanpa pilih
      if (!categories.length) {
        session.step = "input_kecamatan";
        await saveSession(env, STATE_KEY, session);
        await sendMessage(env, chatId, "Masukkan Kecamatan:");
        return true;
      }

      // ada kategori -> wajib pilih minimal 1
      session.data._category_list = categories;
      session.step = "select_categories";
      await saveSession(env, STATE_KEY, session);

      await sendMessage(env, chatId, buildCategoryChoiceMessage(categories), {
        parse_mode: "Markdown",
      });
      return true;
    } catch (e) {
      console.error("LOAD CATEGORIES ERROR:", e);
      session.step = "input_kecamatan";
      await saveSession(env, STATE_KEY, session);
      await sendMessage(env, chatId, "Masukkan Kecamatan:");
      return true;
    }
  }

  // 4b. SELECT CATEGORIES (required)
  if (session.step === "select_categories") {
    const categories = Array.isArray(session.data._category_list)
      ? session.data._category_list
      : [];

    // fallback: kalau somehow kosong, lanjut
    if (!categories.length) {
      delete session.data._category_list;
      session.step = "input_kecamatan";
      await saveSession(env, STATE_KEY, session);
      await sendMessage(env, chatId, "Masukkan Kecamatan:");
      return true;
    }

    const parsed = parseMultiIndexInputRequired(text, categories.length);
    if (!parsed.ok) {
      await sendMessage(
        env,
        chatId,
        "Input tidak valid. Pilih minimal 1.\nKetik nomor dipisah koma.\nContoh: 1,3"
      );
      return true;
    }

    const categoryIds = mapIndexesToCategoryIds(parsed.indexes, categories);
    if (!categoryIds.length) {
      await sendMessage(env, chatId, "Pilihan kategori tidak valid. Coba lagi ya.");
      return true;
    }

    session.data.category_ids = categoryIds;
    delete session.data._category_list;

    session.step = "input_kecamatan";
    await saveSession(env, STATE_KEY, session);
    await sendMessage(env, chatId, "Masukkan Kecamatan:");
    return true;
  }

  // 5. KECAMATAN
  if (session.step === "input_kecamatan") {
    session.data.kecamatan = text.trim();
    session.step = "input_kota";
    await saveSession(env, STATE_KEY, session);
    await sendMessage(env, chatId, "Masukkan Kota:");
    return true;
  }

  // 6. KOTA
  if (session.step === "input_kota") {
    session.data.kota = text.trim();
    session.step = "upload_closeup";
    await saveSession(env, STATE_KEY, session);
    await sendMessage(env, chatId, "📸 Upload FOTO CLOSEUP:");
    return true;
  }

  // 7. FOTO CLOSEUP
  if (session.step === "upload_closeup") {
    if (!update.message.photo) {
      await sendMessage(env, chatId, "Kirim foto closeup.");
      return true;
    }

    session.data.foto_closeup_file_id =
      update.message.photo[update.message.photo.length - 1].file_id;

    session.step = "upload_fullbody";
    await saveSession(env, STATE_KEY, session);
    await sendMessage(env, chatId, "📸 Upload FOTO FULL BODY:");
    return true;
  }

  // 8. FOTO FULL BODY
  if (session.step === "upload_fullbody") {
    if (!update.message.photo) {
      await sendMessage(env, chatId, "Kirim foto full body.");
      return true;
    }

    session.data.foto_fullbody_file_id =
      update.message.photo[update.message.photo.length - 1].file_id;

    session.step = "upload_ktp";
    await saveSession(env, STATE_KEY, session);
    await sendMessage(env, chatId, "📸 Upload FOTO KTP:");
    return true;
  }

  // 9. FOTO KTP + FINALIZE
  if (session.step === "upload_ktp") {
    if (!update.message.photo) {
      await sendMessage(env, chatId, "Kirim foto KTP.");
      return true;
    }

    try {
      const existing = await getProfileByTelegramId(env, telegramId);

      if (existing?.telegram_id) {
        await clearSession(env, STATE_KEY);
        await sendMessage(
          env,
          chatId,
          `${statusMessage(existing.status)}\n\nJika butuh bantuan, hubungi admin.`,
          { parse_mode: "Markdown", reply_markup: buildTeManMenuKeyboard() }
        );
        return true;
      }

      // simpan foto KTP file_id
      session.data.foto_ktp_file_id =
        update.message.photo[update.message.photo.length - 1].file_id;

      const d = session.data;
      const id = crypto.randomUUID();

      await insertPendingProfile(env, {
        id,
        telegram_id: telegramId,
        nama_lengkap: d.nama_lengkap,
        nik: d.nik,
        foto_ktp_file_id: d.foto_ktp_file_id,
        nickname: d.nickname_input,
        username: username,
        no_whatsapp: d.no_whatsapp,
        kecamatan: d.kecamatan,
        kota: d.kota,
        foto_closeup_file_id: d.foto_closeup_file_id,
        foto_fullbody_file_id: d.foto_fullbody_file_id,
      });

      // ✅ set kategori (wajib kalau kategori tersedia)
      const categoryIds = Array.isArray(d.category_ids) ? d.category_ids : [];
      if (categoryIds.length) {
        await setProfileCategoriesByProfileId(env, id, categoryIds);
      }

      await notifySuperadmin(env, {
        telegram_id: telegramId,
        nama_lengkap: d.nama_lengkap,
        nik: d.nik,
        nickname: d.nickname_input,
        username: username,
        no_whatsapp: d.no_whatsapp,
        kota: d.kota,
        kecamatan: d.kecamatan,
        foto_ktp_file_id: d.foto_ktp_file_id,
        foto_closeup_file_id: d.foto_closeup_file_id,
        foto_fullbody_file_id: d.foto_fullbody_file_id,
        category_ids: categoryIds,
      });

      await clearSession(env, STATE_KEY);

      await sendMessage(
        env,
        chatId,
        "✅ Pendaftaran selesai!\nMenunggu review superadmin.",
        { reply_markup: buildTeManMenuKeyboard() }
      );

      return true;
    } catch (err) {
      console.error("FINALIZE ERROR:", err);

      const msg = String(err?.message || "");
      if (msg.includes("UNIQUE") && msg.includes("profiles.telegram_id")) {
        await clearSession(env, STATE_KEY);
        await sendMessage(
          env,
          chatId,
          "⏳ Data kamu sudah tersimpan. Silakan tunggu review superadmin.",
          { reply_markup: buildTeManMenuKeyboard() }
        );
        return true;
      }

      await sendMessage(
        env,
        chatId,
        "⚠️ Terjadi kesalahan saat menyimpan data.\nSilakan kirim ulang FOTO KTP atau klik Menu TeMan untuk ulang.",
        { reply_markup: buildTeManMenuKeyboard() }
      );

      return true;
    }
  }

  return false;
}
