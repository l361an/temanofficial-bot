// services/paymentReviewMessage.js

import { buildPaymentReviewKeyboard } from "../routes/callbacks/keyboards.finance.js";
import { getPaymentTicketById } from "../repositories/paymentTicketsRepo.js";
import {
  buildPartnerIdentity,
  listActivePaymentReviewerIds,
} from "./paymentReviewHelpers.js";
import { buildPaymentReviewText } from "./paymentReviewRenderer.js";

export function buildPaymentReviewPayload(ticket, profile = null) {
  return {
    text: buildPaymentReviewText(ticket, profile),
    options: {
      parse_mode: "HTML",
      reply_markup: buildPaymentReviewKeyboard(ticket.id),
    },
  };
}

export async function buildPaymentReviewMessage(env, ticketId) {
  const ticket = await getPaymentTicketById(env, ticketId);
  if (!ticket) return null;

  const { profile } = await buildPartnerIdentity(env, ticket.partner_id);
  const reviewerIds = await listActivePaymentReviewerIds(env);

  return {
    ticket,
    profile,
    caption: buildPaymentReviewText(ticket, profile),
    keyboard: buildPaymentReviewKeyboard(ticket.id),
    superadmin_ids: reviewerIds,
  };
}
