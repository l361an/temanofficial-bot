// routes/callbacks/partnerDatabase.render.js
import { sendMessage, upsertCallbackMessage } from "../../services/telegramApi.js";
import {
  getProfileFullByTelegramId,
  listCategoryKodesByProfileId,
} from "../../repositories/profilesRepo.js";
import { getAdminByTelegramId } from "../../repositories/adminsRepo.js";
import { getSubscriptionInfoByTelegramId } from "../../repositories/partnerSubscriptionsRepo.js";

import {
  buildBackToPartnerDatabaseKeyboard,
  buildBackToPartnerDatabaseViewKeyboard,
  buildPartnerControlPanelKeyboard,
  buildPartnerDetailsKeyboard,
  buildPartnerSubscriptionKeyboard,
} from "./keyboards.js";

import { cleanHandle } from "../../utils/partnerHelpers.js";

import {
  readSourceMessage,
  persistPartnerViewSession,
} from "./partnerDatabase.session.js";

import {
  buildPartnerViewPromptText,
  buildPartnerControlPanelText,
  buildPartnerDetailsText,
  buildPartnerSubscriptionText,
} from "./partnerDatabase.format.js";

import { sendPartnerDetailsMediaAnchor } from "./partnerDatabase.media.js";

export { buildPartnerViewPromptText } from "./partnerDatabase.format.js";

export async function renderPartnerDatabaseMessage(
  env,
  adminId,
  text,
  replyMarkup,
  {
    session = null,
    fallbackMessage = null,
    parseMode = "HTML",
    disableWebPreview = true,
  } = {}
) {
  const sourceMessage = readSourceMessage(session, fallbackMessage, adminId);
  const extra = {
    parse_mode: parseMode,
    reply_markup: replyMarkup,
    disable_web_page_preview: disableWebPreview,
  };

  if (sourceMessage) {
    await upsertCallbackMessage(env, sourceMessage, text, extra).catch(async () => {
      await sendMessage(env, adminId, text, extra);
    });
    return true;
  }

  await sendMessage(env, adminId, text, extra);
  return true;
}

async function getLatestPaymentTicket(env, partnerId) {
  const row = await env.DB.prepare(
    `
    SELECT *
    FROM payment_tickets
    WHERE partner_id = ?
    ORDER BY datetime(created_at) DESC, datetime(updated_at) DESC, id DESC
    LIMIT 1
  `
  )
    .bind(String(partnerId))
    .first();

  return row ?? null;
}

async function loadPartnerContext(env, telegramId) {
  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile) return null;

  const categories = profile.id
    ? await listCategoryKodesByProfileId(env, profile.id).catch(() => [])
    : [];

  let verificatorDisplay = "-";
  if (profile.verificator_admin_id) {
    const vid = String(profile.verificator_admin_id);
    const vRow = await getAdminByTelegramId(env, vid).catch(() => null);
    const vUser = vRow?.username
      ? cleanHandle(vRow.username)
      : vRow?.label
        ? String(vRow.label)
        : "-";
    verificatorDisplay = `${vid} - ${vUser || "-"}`;
  }

  const subInfo = await getSubscriptionInfoByTelegramId(env, telegramId).catch(() => ({
    found: false,
    is_active: false,
    row: null,
  }));

  const latestPayment = await getLatestPaymentTicket(env, telegramId).catch(() => null);

  return {
    profile,
    categories,
    subInfo,
    latestPayment,
    verificatorDisplay,
  };
}

export async function renderPartnerControlPanel(
  env,
  adminId,
  telegramId,
  role,
  { session = null, fallbackMessage = null, selectedInput = null } = {}
) {
  const context = await loadPartnerContext(env, telegramId);

  if (!context?.profile) {
    await renderPartnerDatabaseMessage(
      env,
      adminId,
      "⚠️ Data partner tidak ditemukan.",
      buildBackToPartnerDatabaseViewKeyboard(role),
      { session, fallbackMessage }
    );
    return false;
  }

  await persistPartnerViewSession(
    env,
    adminId,
    session,
    {
      step: "selected",
      data: {
        selected_partner_id: String(context.profile.telegram_id),
        selected_input: selectedInput ?? session?.data?.selected_input ?? null,
        details_anchor_chat_id: null,
        details_anchor_message_id: null,
      },
    },
    fallbackMessage
  );

  await renderPartnerDatabaseMessage(
    env,
    adminId,
    buildPartnerControlPanelText(context),
    buildPartnerControlPanelKeyboard(context.profile.telegram_id, role),
    { session, fallbackMessage }
  );

  return true;
}

export async function renderPartnerDetailsPage(
  env,
  adminId,
  telegramId,
  role,
  { session = null, fallbackMessage = null } = {}
) {
  const context = await loadPartnerContext(env, telegramId);

  if (!context?.profile) {
    await renderPartnerDatabaseMessage(
      env,
      adminId,
      "⚠️ Data partner tidak ditemukan.",
      buildBackToPartnerDatabaseKeyboard(role),
      { session, fallbackMessage }
    );
    return false;
  }

  const replyMarkup = buildPartnerDetailsKeyboard(context.profile.telegram_id, role);
  const detailsText = buildPartnerDetailsText(context);

  const anchor = await sendPartnerDetailsMediaAnchor(
    env,
    adminId,
    context.profile,
    detailsText,
    replyMarkup
  );

  await persistPartnerViewSession(
    env,
    adminId,
    session,
    {
      step: "selected",
      data: {
        selected_partner_id: String(context.profile.telegram_id),
        details_anchor_chat_id: anchor?.anchor_chat_id ?? null,
        details_anchor_message_id: anchor?.anchor_message_id ?? null,
      },
    },
    fallbackMessage
  );

  return true;
}

export async function renderPartnerSubscriptionPage(
  env,
  adminId,
  telegramId,
  role,
  { session = null, fallbackMessage = null } = {}
) {
  const context = await loadPartnerContext(env, telegramId);

  if (!context?.profile) {
    await renderPartnerDatabaseMessage(
      env,
      adminId,
      "⚠️ Data partner tidak ditemukan.",
      buildBackToPartnerDatabaseKeyboard(role),
      { session, fallbackMessage }
    );
    return false;
  }

  await persistPartnerViewSession(
    env,
    adminId,
    session,
    {
      step: "selected",
      data: {
        selected_partner_id: String(context.profile.telegram_id),
        details_anchor_chat_id: null,
        details_anchor_message_id: null,
      },
    },
    fallbackMessage
  );

  await renderPartnerDatabaseMessage(
    env,
    adminId,
    buildPartnerSubscriptionText(context),
    buildPartnerSubscriptionKeyboard(context.profile.telegram_id, role),
    { session, fallbackMessage }
  );

  return true;
}
