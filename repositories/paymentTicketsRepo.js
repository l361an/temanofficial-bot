// repositories/paymentTicketsRepo.js

export async function getOpenPaymentTicketByPartnerId(env, partnerId) {
  const row = await env.DB.prepare(
    `
    SELECT *
    FROM payment_tickets
    WHERE partner_id = ?
      AND status IN ('draft', 'waiting_payment', 'waiting_confirmation')
    ORDER BY datetime(created_at) DESC, datetime(updated_at) DESC
    LIMIT 1
  `
  )
    .bind(String(partnerId))
    .first();

  return row ?? null;
}

export async function getPaymentTicketById(env, ticketId) {
  const row = await env.DB.prepare(
    `
    SELECT *
    FROM payment_tickets
    WHERE id = ?
    LIMIT 1
  `
  )
    .bind(String(ticketId))
    .first();

  return row ?? null;
}

export async function createPaymentTicket(env, payload) {
  const {
    id,
    partnerId,
    profileId = null,
    classId,
    durationMonths,
    baseAmount,
    uniqueAmount,
    finalAmount,
    provider = "manual",
    status = "waiting_payment",
    expiresAt = null,
    notes = null,
    metadataJson = null,
  } = payload || {};

  await env.DB.prepare(
    `
    INSERT INTO payment_tickets (
      id,
      partner_id,
      profile_id,
      class_id,
      duration_months,
      base_amount,
      unique_amount,
      final_amount,
      provider,
      status,
      expires_at,
      notes,
      metadata_json,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `
  )
    .bind(
      String(id),
      String(partnerId),
      profileId == null ? null : String(profileId),
      String(classId || "bronze").toLowerCase(),
      Number(durationMonths || 1),
      Number(baseAmount || 0),
      Number(uniqueAmount || 0),
      Number(finalAmount || 0),
      String(provider || "manual"),
      String(status || "waiting_payment"),
      expiresAt == null ? null : String(expiresAt),
      notes == null ? null : String(notes),
      metadataJson == null ? null : String(metadataJson)
    )
    .run();

  return { ok: true };
}

export async function markPaymentProofUploaded(env, ticketId, proofFileId) {
  await env.DB.prepare(
    `
    UPDATE payment_tickets
    SET proof_file_id = ?,
        proof_uploaded_at = datetime('now'),
        status = 'waiting_confirmation',
        updated_at = datetime('now')
    WHERE id = ?
  `
  )
    .bind(String(proofFileId), String(ticketId))
    .run();

  return { ok: true };
}

export async function confirmPaymentTicket(env, ticketId, actorId, notes = null) {
  await env.DB.prepare(
    `
    UPDATE payment_tickets
    SET status = 'confirmed',
        confirmed_at = datetime('now'),
        confirmed_by = ?,
        notes = COALESCE(?, notes),
        updated_at = datetime('now')
    WHERE id = ?
  `
  )
    .bind(
      actorId == null ? null : String(actorId),
      notes == null ? null : String(notes),
      String(ticketId)
    )
    .run();

  return { ok: true };
}

export async function rejectPaymentTicket(env, ticketId, actorId, rejectionReason = null) {
  await env.DB.prepare(
    `
    UPDATE payment_tickets
    SET status = 'rejected',
        rejected_at = datetime('now'),
        rejected_by = ?,
        rejection_reason = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `
  )
    .bind(
      actorId == null ? null : String(actorId),
      rejectionReason == null ? null : String(rejectionReason),
      String(ticketId)
    )
    .run();

  return { ok: true };
}

export async function expireDuePaymentTickets(env) {
  const { results } = await env.DB.prepare(
    `
    SELECT id, partner_id
    FROM payment_tickets
    WHERE status IN ('draft', 'waiting_payment')
      AND expires_at IS NOT NULL
      AND datetime(expires_at) <= datetime('now')
  `
  ).all();

  await env.DB.prepare(
    `
    UPDATE payment_tickets
    SET status = 'expired',
        updated_at = datetime('now')
    WHERE status IN ('draft', 'waiting_payment')
      AND expires_at IS NOT NULL
      AND datetime(expires_at) <= datetime('now')
  `
  ).run();

  return {
    ok: true,
    rows: (results || []).map((r) => ({
      id: String(r.id),
      partner_id: String(r.partner_id),
    })),
  };
}
