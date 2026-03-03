// repositories/categoriesRepo.js

export async function listCategories(env) {
  const res = await env.DB.prepare(
    "SELECT id, kode FROM categories ORDER BY kode ASC"
  ).all();
  return res?.results || [];
}

export async function addCategory(env, kode) {
  const clean = String(kode || "").trim();
  if (!clean) return { ok: false, reason: "empty" };

  const exists = await env.DB.prepare(
    "SELECT id FROM categories WHERE LOWER(kode) = LOWER(?) LIMIT 1"
  )
    .bind(clean)
    .first();

  if (exists?.id) return { ok: false, reason: "exists" };

  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO categories (id, kode) VALUES (?, ?)")
    .bind(id, clean)
    .run();

  return { ok: true, id, kode: clean };
}

export async function delCategoryByKode(env, kode) {
  const clean = String(kode || "").trim();
  if (!clean) return { ok: false, reason: "empty" };

  const row = await env.DB.prepare(
    "SELECT id, kode FROM categories WHERE LOWER(kode) = LOWER(?) LIMIT 1"
  )
    .bind(clean)
    .first();

  if (!row?.id) return { ok: false, reason: "not_found" };

  // hapus relasi dulu
  await env.DB.prepare("DELETE FROM profile_categories WHERE category_id = ?")
    .bind(row.id)
    .run();

  // hapus category
  await env.DB.prepare("DELETE FROM categories WHERE id = ?")
    .bind(row.id)
    .run();

  return { ok: true, id: row.id, kode: row.kode };
}
