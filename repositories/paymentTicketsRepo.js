// repositories/paymentTicketsRepo.js

import { nowJakartaSql } from "../utils/time.js";

export async function getOpenPaymentTicketByPartnerId(env, partnerId) {
  const row = await env.DB.prepare(
    `
    SELECT *
    FROM payment_tickets
    WHERE partner_id = ?
      AND status IN ('waiting_payment', 'waiting_confirmation')
    ORDER BY datetime(created_at) DESC, datetime(updated_at) DESC, id DESC
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
    .bind(ticketId)
    .first();

  return row ?? null;
}

export async function getPaymentTicketByCode(env, ticketCode) {
  const row = await env.DB.prepare(
    `
    SELECT *
    FROM payment_tickets
    WHERE ticket_code = ?
    LIMIT 1
  `
  )
    .bind(String(ticketCode))
    .first();

  return row ?? null;
}

export async function createPaymentTicket(env, payload) {
  const {
    ticketCode,
    partnerId,
    subscriptionId = null,
    classId,
    durationMonths,
    amountBase,
    uniqueCode,
    amountFinal,
    currency = "IDR",
    provider = "manual",
    status = "waiting_payment",
    expiresAt,
    pricingSnapshotJson,
    metadataJson = null,
  } = payload || {};

  const nowSql = nowJakartaSql();

  await env.DB.prepare(
    `
    INSERT INTO payment_tickets (
      ticket_code,
      partner_id,
      subscription_id,
      class_id,
      duration_months,
      amount_base,
      unique_code,
      amount_final,
      currency,
      provider,
      status,
      requested_at,
      expires_at,
      pricing_snapshot_json,
      metadata_json,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  )
    .bind(
      String(ticketCode),
      String(partnerId),
      subscriptionId == null ? null : String(subscriptionId),
      String(classId || "bronze").toLowerCase(),
      Number(durationMonths || 1),
      Number(amountBase || 0),
      Number(uniqueCode || 0),
      Number(amountFinal || 0),
      String(currency || "IDR").toUpperCase(),
      String(provider || "manual"),
      String(status || "waiting_payment"),
      nowSql,
      String(expiresAt),
      String(pricingSnapshotJson || "{}"),
      metadataJson == null ? null : String(metadataJson),
      nowSql,
      nowSql
    )
    .run();

  const row = await getPaymentTicketByCode(env, ticketCode);
  return row ?? null;
}

export async function markPaymentProofUploaded(
  env,
  ticketId,
  proofAssetId,
  proofCaption = null,
  payerName = null,
  payerNotes = null,
  proofAssetUrl = null
) {
  const nowSql = nowJakartaSql();

  await env.DB.prepare(
    `
    UPDATE payment_tickets
    SET proof_asset_id = ?,
        proof_asset_url = COALESCE(?, proof_asset_url),
        proof_caption = COALESCE(?, proof_caption),
        payer_name = COALESCE(?, payer_name),
        payer_notes = COALESCE(?, payer_notes),
        proof_uploaded_at = ?,
        status = 'waiting_confirmation',
        updated_at = ?
    WHERE id = ?
  `
  )
    .bind(
      String(proofAssetId),
      proofAssetUrl == null ? null : String(proofAssetUrl),
      proofCaption == null ? null : String(proofCaption),
      payerName == null ? null : String(payerName),
      payerNotes == null ? null : String(payerNotes),
      nowSql,
      nowSql,
      ticketId
    )
    .run();

  return { ok: true };
}

export async function confirmPaymentTicket(env, ticketId, actorId, payerNotes = null) {
  const nowSql = nowJakartaSql();

  await env.DB.prepare(
    `
    UPDATE payment_tickets
    SET status = 'confirmed',
        confirmed_at = ?,
        confirmed_by = ?,
        payer_notes = COALESCE(?, payer_notes),
        updated_at = ?
    WHERE id = ?
  `
  )
    .bind(
      nowSql,
      actorId == null ? null : String(actorId),
      payerNotes == null ? null : String(payerNotes),
      nowSql,
      ticketId
    )
    .run();

  return { ok: true };
}

export async function rejectPaymentTicket(env, ticketId, actorId, rejectionReason = null) {
  const nowSql = nowJakartaSql();

  await env.DB.prepare(
    `
    UPDATE payment_tickets
    SET status = 'rejected',
        rejected_at = ?,
        rejected_by = ?,
        rejection_reason = ?,
        updated_at = ?
    WHERE id = ?
  `
  )
    .bind(
      nowSql,
      actorId == null ? null : String(actorId),
      rejectionReason == null ? null : String(rejectionReason),
      nowSql,
      ticketId
    )
    .run();

  return { ok: true };
}

export async function expireDuePaymentTickets(env) {
  const nowSql = nowJakartaSql();

  const { results } = await env.DB.prepare(
    `
    SELECT id, partner_id, ticket_code
    FROM payment_tickets
    WHERE status IN ('waiting_payment')
      AND expires_at IS NOT NULL
      AND datetime(expires_at) <= datetime(?)
  `
  )
    .bind(nowSql)
    .all();

  await env.DB.prepare(
    `
    UPDATE payment_tickets
    SET status = 'expired',
        updated_at = ?
    WHERE status IN ('waiting_payment')
      AND expires_at IS NOT NULL
      AND datetime(expires_at) <= datetime(?)
  `
  )
    .bind(nowSql, nowSql)
    .run();

  return {
    ok: true,
    rows: (results || []).map((r) => ({
      id: Number(r.id),
      partner_id: String(r.partner_id),
      ticket_code: String(r.ticket_code || ""),
    })),
  };
}
