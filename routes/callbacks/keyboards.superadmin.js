// routes/callbacks/keyboards.superadmin.js
import { CALLBACKS, cb } from "../telegram.constants.js";
import { officerHomeButton, backAndHomeRow } from "./keyboards.shared.js";

export function buildSuperadminToolsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🧩 Config", callback_data: CALLBACKS.SUPERADMIN_CONFIG_MENU }],
      [{ text: "🗂️ Category", callback_data: CALLBACKS.SUPERADMIN_CATEGORY_MENU }],
      [{ text: "💰 Finance", callback_data: CALLBACKS.SUPERADMIN_FINANCE_MENU }],
      [officerHomeButton()],
    ],
  };
}

export function buildAdminManagerKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👤 Admin List", callback_data: CALLBACKS.SUPERADMIN_ADMIN_LIST }],
      [{ text: "🔗 Invite Admin", callback_data: CALLBACKS.SUPERADMIN_ADMIN_ADD }],
      backAndHomeRow(CALLBACKS.SUPERADMIN_TOOLS_MENU),
    ],
  };
}

export function buildAdminListKeyboard(admins = []) {
  const rows = [];
  const max = Math.min(admins.length, 40);

  for (let i = 0; i < max; i += 2) {
    const a = admins[i];
    const b = admins[i + 1];

    const row = [{ text: a.label, callback_data: cb.saAdminOpen(a.telegram_id) }];
    if (b) row.push({ text: b.label, callback_data: cb.saAdminOpen(b.telegram_id) });
    rows.push(row);
  }

  rows.push(backAndHomeRow(CALLBACKS.SUPERADMIN_ADMIN_MENU));
  return { inline_keyboard: rows };
}

export function buildAdminControlPanelKeyboard(telegramId, row, actorRole = "admin") {
  const isOwnerActor = String(actorRole || "").trim().toLowerCase() === "owner";
  const targetRole = String(row?.normRole || "").trim().toLowerCase();

  const rows = [];

  if (isOwnerActor) {
    rows.push([
      { text: "✏️ Username", callback_data: cb.saAdminEditUsername(telegramId) },
      { text: "✏️ Nama", callback_data: cb.saAdminEditNama(telegramId) },
    ]);
    rows.push([
      { text: "✏️ Kota", callback_data: cb.saAdminEditKota(telegramId) },
      { text: "✏️ Role", callback_data: cb.saAdminEditRole(telegramId) },
    ]);
    rows.push([
      { text: "✏️ Status", callback_data: cb.saAdminEditStatus(telegramId) },
    ]);

    if (row?.normStatus === "active") {
      rows.push([{ text: "⛔ Nonaktifkan", callback_data: cb.saAdminDeactivate(telegramId) }]);
    } else {
      rows.push([{ text: "✅ Aktifkan", callback_data: cb.saAdminActivate(telegramId) }]);
    }

    if (targetRole === "admin" || targetRole === "superadmin") {
      rows.push([{ text: "🗑️ Delete Admin", callback_data: cb.saAdminDelete(telegramId) }]);
    }
  }

  rows.push(backAndHomeRow(CALLBACKS.SUPERADMIN_ADMIN_LIST));
  return { inline_keyboard: rows };
}

export function buildAdminRolePickerKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [
        { text: "superadmin", callback_data: cb.saAdminRoleSet(telegramId, "superadmin") },
        { text: "admin", callback_data: cb.saAdminRoleSet(telegramId, "admin") },
      ],
      backAndHomeRow(cb.saAdminOpen(telegramId)),
    ],
  };
}

export function buildAdminStatusPickerKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [
        { text: "active", callback_data: cb.saAdminStatusSet(telegramId, "active") },
        { text: "inactive", callback_data: cb.saAdminStatusSet(telegramId, "inactive") },
      ],
      backAndHomeRow(cb.saAdminOpen(telegramId)),
    ],
  };
}

export function buildConfigKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👋 Welcome Message", callback_data: CALLBACKS.SUPERADMIN_CONFIG_WELCOME }],
      [{ text: "🔗 Link Aturan", callback_data: CALLBACKS.SUPERADMIN_CONFIG_ATURAN }],
      backAndHomeRow(CALLBACKS.SUPERADMIN_TOOLS_MENU),
    ],
  };
}

export function buildConfigWelcomeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "✏️ Edit", callback_data: CALLBACKS.SUPERADMIN_CONFIG_WELCOME_EDIT }],
      backAndHomeRow(CALLBACKS.SUPERADMIN_CONFIG_MENU),
    ],
  };
}

export function buildConfigAturanKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "✏️ Edit", callback_data: CALLBACKS.SUPERADMIN_CONFIG_ATURAN_EDIT }],
      backAndHomeRow(CALLBACKS.SUPERADMIN_CONFIG_MENU),
    ],
  };
}

export function buildSettingsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🧩 Config", callback_data: CALLBACKS.SUPERADMIN_CONFIG_MENU }],
      [{ text: "🗂️ Category", callback_data: CALLBACKS.SUPERADMIN_CATEGORY_MENU }],
      [{ text: "💰 Finance", callback_data: CALLBACKS.SUPERADMIN_FINANCE_MENU }],
      backAndHomeRow(CALLBACKS.SUPERADMIN_TOOLS_MENU),
    ],
  };
}

export function buildCategoryKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📚 Category List", callback_data: CALLBACKS.SUPERADMIN_CATEGORY_LIST }],
      [
        { text: "➕ Add Category", callback_data: CALLBACKS.SUPERADMIN_CATEGORY_ADD },
        { text: "➖ Delete Category", callback_data: CALLBACKS.SUPERADMIN_CATEGORY_DEL },
      ],
      backAndHomeRow(CALLBACKS.SUPERADMIN_TOOLS_MENU),
    ],
  };
}
