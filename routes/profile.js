// routes/profile.js

import { json, error } from "../utils/response.js";

export async function handleProfile(request, env, url) {
  // =========================
  // GET ALL / FILTER
  // =========================
  if (request.method === "GET" && url.pathname === "/profiles") {
    const status = url.searchParams.get("status");

    let query = `
      SELECT id, telegram_id, nama_lengkap, nickname, kota, status, class_id
      FROM profiles
    `;

    if (status) {
      query += " WHERE status = ?";
      const { results } = await env.DB.prepare(query).bind(status).all();
      return json(results);
    }

    const { results } = await env.DB.prepare(query).all();
    return json(results);
  }

  // =========================
  // CREATE PROFILE (BOT/API)
  // =========================
  if (request.method === "POST" && url.pathname === "/profiles") {
    try {
      const body = await request.json();

      const {
        telegram_id,
        nama_lengkap,
        nik,
        foto_ktp_file_id,
        nickname,
        username,
        no_whatsapp,
        kecamatan,
        kota,
        foto_closeup_file_id,
        foto_fullbody_file_id,
        class_id,
      } = body;

      if (
        !telegram_id ||
        !nama_lengkap ||
        !nik ||
        !foto_ktp_file_id ||
        !nickname ||
        !no_whatsapp ||
        !kecamatan ||
        !kota ||
        !foto_closeup_file_id ||
        !foto_fullbody_file_id
      ) {
        return error("Data tidak lengkap", 400);
      }

      const { results: existing } = await env.DB
        .prepare("SELECT id FROM profiles WHERE telegram_id = ?")
        .bind(telegram_id)
        .all();

      if (existing.length > 0) {
        return error("Profile sudah terdaftar", 409);
      }

      const id = crypto.randomUUID();
      const classId = String(class_id || "bronze").trim().toLowerCase() || "bronze";

      await env.DB.prepare(`
        INSERT INTO profiles (
          id,
          telegram_id,
          nama_lengkap,
          nik,
          foto_ktp_file_id,
          nickname,
          username,
          no_whatsapp,
          kecamatan,
          kota,
          foto_closeup_file_id,
          foto_fullbody_file_id,
          class_id,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `)
        .bind(
          id,
          telegram_id,
          nama_lengkap,
          nik,
          foto_ktp_file_id,
          nickname,
          username || null,
          no_whatsapp,
          kecamatan,
          kota,
          foto_closeup_file_id,
          foto_fullbody_file_id,
          classId
        )
        .run();

      return json({
        message: "Profile berhasil dibuat",
        profile_id: id,
        status: "pending",
        class_id: classId,
      });
    } catch (err) {
      return error("Invalid JSON body", 400);
    }
  }
}
