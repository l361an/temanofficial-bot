// services/partnerGroupRoleService.js

import { getProfileFullByTelegramId } from "../repositories/profilesRepo.js";
import { getActiveSubscriptionByTelegramId } from "../repositories/partnerSubscriptionsRepo.js";
import {
  demoteChatMember,
  muteChatMember,
  promotePremiumPartnerAdmin,
  unmuteChatMember,
} from "./telegramApi.js";

export const PARTNER_GROUP_ROLE_STATE = {
  PREMIUM_ADMIN: "premium_admin",
  MEMBER: "member",
  MUTED: "muted",
};

function readPartnerGroupIds(env) {
  return String(env.PARTNER_GROUP_IDS || "")
    .split(",")
    .map((v) => String(v || "").trim())
    .filter(Boolean);
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeTelegramActionResult(result) {
  return {
    ok: Boolean(result?.ok),
    description: result?.description || null,
    raw: result || null,
  };
}

export async function derivePartnerGroupRoleState(env, telegramId) {
  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile) {
    return {
      ok: false,
      reason: "profile_not_found",
      profile: null,
      activeSubscription: null,
      targetState: null,
    };
  }

  const status = normalizeStatus(profile?.status);
  const isManualSuspended = Number(profile?.is_manual_suspended || 0) === 1;
  const activeSubscription = await getActiveSubscriptionByTelegramId(env, telegramId).catch(() => null);
  const hasPremiumActive = Boolean(activeSubscription);

  if (status === "pending_approval") {
    return {
      ok: true,
      profile,
      activeSubscription,
      targetState: PARTNER_GROUP_ROLE_STATE.MEMBER,
      reason: "pending_approval",
    };
  }

  if (isManualSuspended || status === "suspended") {
    return {
      ok: true,
      profile,
      activeSubscription: null,
      targetState: PARTNER_GROUP_ROLE_STATE.MUTED,
      reason: isManualSuspended ? "manual_suspended" : "status_suspended",
    };
  }

  if (status === "approved" && hasPremiumActive) {
    return {
      ok: true,
      profile,
      activeSubscription,
      targetState: PARTNER_GROUP_ROLE_STATE.PREMIUM_ADMIN,
      reason: "approved_with_active_subscription",
    };
  }

  return {
    ok: true,
    profile,
    activeSubscription,
    targetState: PARTNER_GROUP_ROLE_STATE.MEMBER,
    reason: "approved_without_premium",
  };
}

export async function syncPartnerGroupRole(env, telegramId, forcedState = null) {
  const derived = forcedState
    ? {
        ok: true,
        profile: await getProfileFullByTelegramId(env, telegramId),
        activeSubscription: null,
        targetState: forcedState,
        reason: "forced_state",
      }
    : await derivePartnerGroupRoleState(env, telegramId);

  if (!derived?.ok) return derived;

  const groupIds = readPartnerGroupIds(env);
  const actions = [];

  for (const groupId of groupIds) {
    const action = {
      chat_id: String(groupId),
      target_state: derived.targetState,
      demote: null,
      unmute: null,
      promote: null,
      mute: null,
    };

    try {
      if (derived.targetState === PARTNER_GROUP_ROLE_STATE.PREMIUM_ADMIN) {
        const unmuteRes = await unmuteChatMember(env, groupId, telegramId).catch((error) => ({
          ok: false,
          description: error?.message || String(error),
        }));
        action.unmute = normalizeTelegramActionResult(unmuteRes);

        const promoteRes = await promotePremiumPartnerAdmin(env, groupId, telegramId).catch((error) => ({
          ok: false,
          description: error?.message || String(error),
        }));
        action.promote = normalizeTelegramActionResult(promoteRes);
      } else if (derived.targetState === PARTNER_GROUP_ROLE_STATE.MUTED) {
        const demoteRes = await demoteChatMember(env, groupId, telegramId).catch((error) => ({
          ok: false,
          description: error?.message || String(error),
        }));
        action.demote = normalizeTelegramActionResult(demoteRes);

        const muteRes = await muteChatMember(env, groupId, telegramId, 0).catch((error) => ({
          ok: false,
          description: error?.message || String(error),
        }));
        action.mute = normalizeTelegramActionResult(muteRes);
      } else {
        const demoteRes = await demoteChatMember(env, groupId, telegramId).catch((error) => ({
          ok: false,
          description: error?.message || String(error),
        }));
        action.demote = normalizeTelegramActionResult(demoteRes);

        const unmuteRes = await unmuteChatMember(env, groupId, telegramId).catch((error) => ({
          ok: false,
          description: error?.message || String(error),
        }));
        action.unmute = normalizeTelegramActionResult(unmuteRes);
      }
    } catch (error) {
      action.error = error?.message || String(error);
    }

    actions.push(action);
  }

  return {
    ok: true,
    telegram_id: String(telegramId),
    target_state: derived.targetState,
    reason: derived.reason,
    group_ids: groupIds,
    actions,
    profile: derived.profile,
    activeSubscription: derived.activeSubscription,
  };
}
