// routes/callbacks/keyboards.partner.js

import { CALLBACKS, cb } from "../telegram.constants.js";
import { officerHomeButton, backAndHomeRow } from "./keyboards.shared.js";

function normalizeRole(role) {// routes/callbacks/keyboards.partner.js

import { CALLBACKS, cb } from "../telegram.constants.js";
import { officerHomeButton, backAndHomeRow } from "./keyboards.shared.js";
import { listActivePartnerClasses } from "../../repositories/partnerClassesRepo.js";

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function isOwnerRole(role) {
  return normalizeRole(role) === "owner";
}

function canManagePartnerDetails(role) {
  const currentRole = normalizeRole(role);
  return currentRole === "owner" || currentRole === "superadmin";
}

function buildPartnerDatabaseBackRow() {
  return backAndHomeRow(CALLBACKS.PARTNER_DATABASE_MENU);
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function buildPartnerToolsKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🗃️ Partner Database", callback_data: CALLBACKS.PARTNER_DATABASE_MENU },
        { text: "🛠️ Partner Moderation", callback_data: CALLBACKS.PARTNER_MODERATION_MENU },
      ],
      [officerHomeButton()],
    ],
  };
}

export function buildPartnerDatabaseKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🔎 View Partner", callback_data: CALLBACKS.PARTNER_DATABASE_VIEW }],
      [
        { text: "👥 All Partner", callback_data: cb.pmList("all") },
        { text: "🕒 Pending", callback_data: cb.pmList("pending_approval") },
      ],
      [
        { text: "✅ Approved", callback_data: cb.pmList("approved") },
        { text: "⛔ Suspended", callback_data: cb.pmList("suspended") },
      ],
      backAndHomeRow(CALLBACKS.PARTNER_TOOLS_MENU),
    ],
  };
}

export function buildBackToPartnerDatabaseKeyboard() {
  return {
    inline_keyboard: [buildPartnerDatabaseBackRow()],
  };
}

export function buildPartnerControlPanelKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [
        { text: "👤 Details", callback_data: cb.pmDetailsOpen(telegramId) },
        { text: "💳 Subscription", callback_data: cb.pmSubscriptionOpen(telegramId) },
      ],
      [
        { text: "⬅️ Back", callback_data: CALLBACKS.PARTNER_DATABASE_MENU },
        officerHomeButton(),
      ],
    ],
  };
}

export function buildPartnerDetailsKeyboard(telegramId, role) {
  const rows = [];

  if (canManagePartnerDetails(role)) {
    rows.push([
      { text: "👤 Nama Lengkap", callback_data: cb.pmEditStart(telegramId, "nama_lengkap") },
      { text: "📝 Nickname", callback_data: cb.pmEditStart(telegramId, "nickname") },
    ]);

    rows.push([
      { text: "📱 Whatsapp", callback_data: cb.pmEditStart(telegramId, "no_whatsapp") },
      { text: "🆔 NIK", callback_data: cb.pmEditStart(telegramId, "nik") },
    ]);

    rows.push([
      { text: "🏙️ Kota", callback_data: cb.pmEditStart(telegramId, "kota") },
      { text: "📍 Kecamatan", callback_data: cb.pmEditStart(telegramId, "kecamatan") },
    ]);

    rows.push([
      { text: "🏷️ Class", callback_data: cb.pmClassStart(telegramId) },
      { text: "👤 Verificator", callback_data: cb.pmVerStart(telegramId) },
    ]);

    rows.push([
      { text: "🗂️ Category", callback_data: cb.pmEditStart(telegramId, "category") },
      { text: "🔗 Channel", callback_data: cb.pmEditStart(telegramId, "channel_url") },
    ]);

    rows.push([
      { text: "📸 Edit Foto Closeup", callback_data: cb.pmPhotoStart(telegramId) },
    ]);
  }

  rows.push([
    { text: "⬅️ Back to Panel", callback_data: cb.pmPanelBack(telegramId) },
    officerHomeButton(),
  ]);

  return { inline_keyboard: rows };
}

export function buildPartnerSubscriptionKeyboard(telegramId, role) {
  const rows = [];

  if (isOwnerRole(role)) {
    rows.push([
      { text: "➕ Tambah Masa Aktif", callback_data: cb.pmSubscriptionAddStart(telegramId) },
      { text: "➖ Kurangi Masa Aktif", callback_data: cb.pmSubscriptionReduceStart(telegramId) },
    ]);
  }

  rows.push([{ text: "⬅️ Back to Panel", callback_data: cb.pmPanelBack(telegramId) }]);
  rows.push([officerHomeButton()]);

  return { inline_keyboard: rows };
}

export function buildPartnerSubscriptionAdjustInputKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [{ text: "⬅️ Back to Subscription", callback_data: cb.pmSubscriptionOpen(telegramId) }],
      [officerHomeButton()],
    ],
  };
}

export async function buildPartnerClassPickerKeyboard(env, telegramId) {
  const activeClasses = await listActivePartnerClasses(env).catch(() => []);
  const rows = [];
  const buttons = (activeClasses.length ? activeClasses : [{ id: "general", label: "General" }]).map((item) => ({
    text: String(item.label || item.id),
    callback_data: cb.pmClassSet(telegramId, item.id),
  }));

  rows.push(...chunk(buttons, 2));
  rows.push([
    { text: "⬅️ Back", callback_data: cb.pmClassBack(telegramId) },
    officerHomeButton(),
  ]);

  return { inline_keyboard: rows };
}

export function buildPartnerVerificatorPickerKeyboard(telegramId, verificators = []) {
  const rows = [];
  const max = Math.min(verificators.length, 20);

  for (let i = 0; i < max; i += 2) {
    const a = verificators[i];
    const b = verificators[i + 1];
    const row = [{ text: a.label, callback_data: cb.pmVerSet(telegramId, a.telegram_id) }];

    if (b) {
      row.push({ text: b.label, callback_data: cb.pmVerSet(telegramId, b.telegram_id) });
    }

    rows.push(row);
  }

  rows.push([
    { text: "⬅️ Back", callback_data: cb.pmVerBack(telegramId) },
    officerHomeButton(),
  ]);

  return { inline_keyboard: rows };
}

export function buildPartnerModerationKeyboard(role) {
  const rows = [
    [
      { text: "✅ Restore", callback_data: CALLBACKS.PARTNER_MOD_RESTORE },
      { text: "⛔ Suspend", callback_data: CALLBACKS.PARTNER_MOD_SUSPEND },
    ],
  ];

  if (canManagePartnerDetails(role)) {
    rows.push([{ text: "❌ Delete", callback_data: CALLBACKS.PARTNER_MOD_DELETE }]);
  }

  rows.push(backAndHomeRow(CALLBACKS.PARTNER_TOOLS_MENU));
  return { inline_keyboard: rows };
}

export function buildBackToPartnerModerationKeyboard() {
  return {
    inline_keyboard: [backAndHomeRow(CALLBACKS.PARTNER_MODERATION_MENU)],
  };
}
  return String(role || "").trim().toLowerCase();
}

function isOwnerRole(role) {
  return normalizeRole(role) === "owner";
}

function canManagePartnerDetails(role) {
  const currentRole = normalizeRole(role);
  return currentRole === "owner" || currentRole === "superadmin";
}

function buildPartnerDatabaseBackRow() {
  return backAndHomeRow(CALLBACKS.PARTNER_DATABASE_MENU);
}

export function buildPartnerToolsKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🗃️ Partner Database", callback_data: CALLBACKS.PARTNER_DATABASE_MENU },
        { text: "🛠️ Partner Moderation", callback_data: CALLBACKS.PARTNER_MODERATION_MENU },
      ],
      [officerHomeButton()],
    ],
  };
}

export function buildPartnerDatabaseKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🔎 View Partner", callback_data: CALLBACKS.PARTNER_DATABASE_VIEW }],
      [
        { text: "👥 All Partner", callback_data: cb.pmList("all") },
        { text: "🕒 Pending", callback_data: cb.pmList("pending_approval") },
      ],
      [
        { text: "✅ Approved", callback_data: cb.pmList("approved") },
        { text: "⛔ Suspended", callback_data: cb.pmList("suspended") },
      ],
      backAndHomeRow(CALLBACKS.PARTNER_TOOLS_MENU),
    ],
  };
}

export function buildBackToPartnerDatabaseKeyboard() {
  return {
    inline_keyboard: [buildPartnerDatabaseBackRow()],
  };
}

export function buildPartnerControlPanelKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [
        { text: "👤 Details", callback_data: cb.pmDetailsOpen(telegramId) },
        { text: "💳 Subscription", callback_data: cb.pmSubscriptionOpen(telegramId) },
      ],
      [
        { text: "⬅️ Back", callback_data: CALLBACKS.PARTNER_DATABASE_MENU },
        officerHomeButton(),
      ],
    ],
  };
}

export function buildPartnerDetailsKeyboard(telegramId, role) {
  const rows = [];

  if (canManagePartnerDetails(role)) {
    rows.push([
      { text: "👤 Nama Lengkap", callback_data: cb.pmEditStart(telegramId, "nama_lengkap") },
      { text: "📝 Nickname", callback_data: cb.pmEditStart(telegramId, "nickname") },
    ]);

    rows.push([
      { text: "📱 Whatsapp", callback_data: cb.pmEditStart(telegramId, "no_whatsapp") },
      { text: "🆔 NIK", callback_data: cb.pmEditStart(telegramId, "nik") },
    ]);

    rows.push([
      { text: "🏙️ Kota", callback_data: cb.pmEditStart(telegramId, "kota") },
      { text: "📍 Kecamatan", callback_data: cb.pmEditStart(telegramId, "kecamatan") },
    ]);

    rows.push([
      { text: "🏷️ Class", callback_data: cb.pmClassStart(telegramId) },
      { text: "👤 Verificator", callback_data: cb.pmVerStart(telegramId) },
    ]);

    rows.push([
      { text: "🗂️ Category", callback_data: cb.pmEditStart(telegramId, "category") },
      { text: "🔗 Channel", callback_data: cb.pmEditStart(telegramId, "channel_url") },
    ]);

    rows.push([
      { text: "📸 Edit Foto Closeup", callback_data: cb.pmPhotoStart(telegramId) },
    ]);
  }

  rows.push([
    { text: "⬅️ Back to Panel", callback_data: cb.pmPanelBack(telegramId) },
    officerHomeButton(),
  ]);

  return { inline_keyboard: rows };
}

export function buildPartnerSubscriptionKeyboard(telegramId, role) {
  const rows = [];

  if (isOwnerRole(role)) {
    rows.push([
      { text: "➕ Tambah Masa Aktif", callback_data: cb.pmSubscriptionAddStart(telegramId) },
      { text: "➖ Kurangi Masa Aktif", callback_data: cb.pmSubscriptionReduceStart(telegramId) },
    ]);
  }

  rows.push([{ text: "⬅️ Back to Panel", callback_data: cb.pmPanelBack(telegramId) }]);
  rows.push([officerHomeButton()]);

  return { inline_keyboard: rows };
}

export function buildPartnerSubscriptionAdjustInputKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [{ text: "⬅️ Back to Subscription", callback_data: cb.pmSubscriptionOpen(telegramId) }],
      [officerHomeButton()],
    ],
  };
}

export function buildPartnerClassPickerKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [
        { text: "Bronze", callback_data: cb.pmClassSet(telegramId, "bronze") },
        { text: "Gold", callback_data: cb.pmClassSet(telegramId, "gold") },
      ],
      [{ text: "Platinum", callback_data: cb.pmClassSet(telegramId, "platinum") }],
      [
        { text: "⬅️ Back", callback_data: cb.pmClassBack(telegramId) },
        officerHomeButton(),
      ],
    ],
  };
}

export function buildPartnerVerificatorPickerKeyboard(telegramId, verificators = []) {
  const rows = [];
  const max = Math.min(verificators.length, 20);

  for (let i = 0; i < max; i += 2) {
    const a = verificators[i];
    const b = verificators[i + 1];
    const row = [{ text: a.label, callback_data: cb.pmVerSet(telegramId, a.telegram_id) }];

    if (b) {
      row.push({ text: b.label, callback_data: cb.pmVerSet(telegramId, b.telegram_id) });
    }

    rows.push(row);
  }

  rows.push([
    { text: "⬅️ Back", callback_data: cb.pmVerBack(telegramId) },
    officerHomeButton(),
  ]);

  return { inline_keyboard: rows };
}

export function buildPartnerModerationKeyboard(role) {
  const rows = [
    [
      { text: "✅ Restore", callback_data: CALLBACKS.PARTNER_MOD_RESTORE },
      { text: "⛔ Suspend", callback_data: CALLBACKS.PARTNER_MOD_SUSPEND },
    ],
  ];

  if (canManagePartnerDetails(role)) {
    rows.push([{ text: "❌ Delete", callback_data: CALLBACKS.PARTNER_MOD_DELETE }]);
  }

  rows.push(backAndHomeRow(CALLBACKS.PARTNER_TOOLS_MENU));
  return { inline_keyboard: rows };
}

export function buildBackToPartnerModerationKeyboard() {
  return {
    inline_keyboard: [backAndHomeRow(CALLBACKS.PARTNER_MODERATION_MENU)],
  };
}
