// repositories/paymentWaitingRepo.js

function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "Rp 0";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export async function countWaitingConfirmationTickets(env) {
  const row = await env.DB.prepare(
    `
    SELECT COUNT(*) AS total
    FROM payment_tickets
    WHERE status = 'waiting_confirmation'
  `
  ).first();

  return Number(row?.total || 0);
}

export async function listWaitingConfirmationTickets(env, { page = 1, pageSize = 10 } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(20, Number(pageSize || 10)));
  const offset = (safePage - 1) * safePageSize;

  const res = await env.DB.prepare(
    `
    SELECT
      id,
      ticket_code,
      partner_id,
      class_id,
      duration_months,
      amount_base,
      unique_code,
      amount_final,
      provider,
      payer_name,
      payer_notes,
      proof_asset_id,
      proof_asset_url,
      proof_caption,
      proof_uploaded_at,
      expires_at,
      pricing_snapshot_json,
      metadata_json,
      status,
      confirmed_by,
      confirmed_at,
      rejected_by,
      rejected_at
    FROM payment_tickets
    WHERE status = 'waiting_confirmation'
    ORDER BY datetime(proof_uploaded_at) ASC, id ASC
    LIMIT ? OFFSET ?
  `
  )
    .bind(safePageSize, offset)
    .all();

  const rows = Array.isArray(res?.results) ? res.results : [];
  return rows.map((row) => ({
    ...row,
    amount_final_label: formatMoney(row.amount_final),
  }));
}

export async function getWaitingConfirmationTicketById(env, ticketId) {
  return await env.DB.prepare(
    `
    SELECT
      id,
      ticket_code,
      partner_id,
      class_id,
      duration_months,
      amount_base,
      unique_code,
      amount_final,
      provider,
      payer_name,
      payer_notes,
      proof_asset_id,
      proof_asset_url,
      proof_caption,
      proof_uploaded_at,
      expires_at,
      pricing_snapshot_json,
      metadata_json,
      status,
      confirmed_by,
      confirmed_at,
      rejected_by,
      rejected_at
    FROM payment_tickets
    WHERE id = ?
    LIMIT 1
  `
  )
    .bind(String(ticketId))
    .first();
}
