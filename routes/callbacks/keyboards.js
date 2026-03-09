// routes/callbacks/keyboards.js
import { isSuperadminRole } from "../../utils/roles.js";
import { CALLBACKS, cb } from "../telegram.constants.js";

// Officer Home
export function buildOfficerHomeKeyboard(role) {
  const rows = [];

  if (isSuperadminRole(role)) {
    rows.push([
      { text: "🧰 Partner Tools", callback_data: CALLBACKS.PARTNER_TOOLS_MENU },
      { text: "⚙️ Superadmin Tools", callback_data: CALLBACKS.SUPERADMIN_TOOLS_MENU },
    ]);
  } else {
    rows.push([{ text: "🧰 Partner Tools", callback_data: CALLBACKS.PARTNER_TOOLS_MENU }]);
  }

  return { inline_keyboard: rows };
}

// Partner Tools
export function buildPartnerToolsKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🗃️ Partner Database", callback_data: CALLBACKS.PARTNER_DATABASE_MENU },
        { text: "🛠️ Partner Moderation", callback_data: CALLBACKS.PARTNER_MODERATION_MENU },
      ],
      [
        { text: "⬅️ Back", callback_data: CALLBACKS.OFFICER_HOME },
        { text: "🏠 Officer Home", callback_data: CALLBACKS.OFFICER_HOME },
      ],
    ],
  };
}

// Partner Database
export function buildPartnerDatabaseKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🔎 View Partner Details", callback_data: CALLBACKS.PARTNER_DATABASE_VIEW }],
      [
        { text: "👥 All Partner", callback_data: cb.pmList("all") },
        { text: "🕒 Pending", callback_data: cb.pmList("pending_approval") },
      ],
      [
        { text: "✅ Approved", callback_data: cb.pmList("approved") },
        { text: "⛔ Suspended", callback_data: cb.pmList("suspended") },
      ],
      [
        { text: "⬅️ Back", callback_data: CALLBACKS.PARTNER_TOOLS_MENU },
        { text: "🏠 Home", callback_data: CALLBACKS.OFFICER_HOME },
      ],
    ],
  };
}

export function buildBackToPartnerDatabaseKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "⬅️ Back", callback_data: CALLBACKS.PARTNER_DATABASE_MENU },
        { text: "🏠 Home", callback_data: CALLBACKS.OFFICER_HOME },
      ],
      [{ text: "🧰 Partner Tools", callback_data: CALLBACKS.PARTNER_TOOLS_MENU }],
    ],
  };
}

export function buildBackToPartnerDatabaseViewKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "⬅️ Back", callback_data: CALLBACKS.PARTNER_DATABASE_MENU },
        { text: "🏠 Home", callback_data: CALLBACKS.OFFICER_HOME },
      ],
      [{ text: "🧰 Partner Tools", callback_data: CALLBACKS.PARTNER_TOOLS_MENU }],
    ],
  };
}

export function buildPartnerDetailActionsKeyboard(telegramId, role) {
  const rows = [];

  if (isSuperadminRole(role)) {
    rows.push([
      { text: "🏷️ Class", callback_data: cb.pmClassStart(telegramId) },
      { text: "👤 Verificator", callback_data: cb.pmVerStart(telegramId) },
    ]);
    rows.push([
      { text: "📸 Foto", callback_data: cb.pmPhotoStart(telegramId) },
      { text: "🗃️ Database", callback_data: CALLBACKS.PARTNER_DATABASE_MENU },
    ]);
  }

  rows.push([{ text: "🏠 Officer Home", callback_data: CALLBACKS.OFFICER_HOME }]);

  return { inline_keyboard: rows };
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
        { text: "🏠 Home", callback_data: CALLBACKS.OFFICER_HOME },
      ],
      [
        { text: "🗃️ Partner Database", callback_data: CALLBACKS.PARTNER_DATABASE_MENU },
        { text: "🧰 Partner Tools", callback_data: CALLBACKS.PARTNER_TOOLS_MENU },
      ],
    ],
  };
}

export function buildPartnerVerificatorPickerKeyboard(telegramId, verificators) {
  const rows = [];
  const max = Math.min(verificators.length, 20);

  for (let i = 0; i < max; i += 2) {
    const a = verificators[i];
    const b = verificators[i + 1];

    const row = [{ text: a.label, callback_data: cb.pmVerSet(telegramId, a.telegram_id) }];
    if (b) row.push({ text: b.label, callback_data: cb.pmVerSet(telegramId, b.telegram_id) });

    rows.push(row);
  }

  rows.push([
    { text: "⬅️ Back", callback_data: cb.pmVerBack(telegramId) },
    { text: "🏠 Home", callback_data: CALLBACKS.OFFICER_HOME },
  ]);
  rows.push([
    { text: "🗃️ Partner Database", callback_data: CALLBACKS.PARTNER_DATABASE_MENU },
    { text: "🧰 Partner Tools", callback_data: CALLBACKS.PARTNER_TOOLS_MENU },
  ]);

  return { inline_keyboard: rows };
}

// Partner Moderation
export function buildPartnerModerationKeyboard(role) {
  const rows = [[
    { text: "✅ Restore", callback_data: CALLBACKS.PARTNER_MOD_RESTORE },
    { text: "⛔ Suspend", callback_data: CALLBACKS.PARTNER_MOD_SUSPEND },
  ]];

  if (isSuperadminRole(role)) {
    rows.push([{ text: "❌ Delete", callback_data: CALLBACKS.PARTNER_MOD_DELETE }]);
  }

  rows.push([
    { text: "⬅️ Back", callback_data: CALLBACKS.PARTNER_TOOLS_MENU },
    { text: "🏠 Home", callback_data: CALLBACKS.OFFICER_HOME },
  ]);

  return { inline_keyboard: rows };
}

export function buildBackToPartnerModerationKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "⬅️ Back", callback_data: CALLBACKS.PARTNER_MODERATION_MENU },
        { text: "🏠 Home", callback_data: CALLBACKS.OFFICER_HOME },
      ],
      [{ text: "🧰 Partner Tools", callback_data: CALLBACKS.PARTNER_TOOLS_MENU }],
    ],
  };
}

// Superadmin Tools
export function buildSuperadminToolsKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🧩 Config", callback_data: CALLBACKS.SUPERADMIN_CONFIG_MENU },
        { text: "⚙️ Settings", callback_data: CALLBACKS.SUPERADMIN_SETTINGS_MENU },
      ],
      [{ text: "🏠 Officer Home", callback_data: CALLBACKS.OFFICER_HOME }],
    ],
  };
}

export function buildConfigKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👋 Update Welcome Message", callback_data: CALLBACKS.SUPERADMIN_CONFIG_WELCOME }],
      [{ text: "🔗 Update Link Aturan", callback_data: CALLBACKS.SUPERADMIN_CONFIG_ATURAN }],
      [
        { text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_TOOLS_MENU },
        { text: "🏠 Officer Home", callback_data: CALLBACKS.OFFICER_HOME },
      ],
    ],
  };
}

export function buildConfigWelcomeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "✏️ Edit", callback_data: CALLBACKS.SUPERADMIN_CONFIG_WELCOME_EDIT }],
      [
        { text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_CONFIG_MENU },
        { text: "🏠 Officer Home", callback_data: CALLBACKS.OFFICER_HOME },
      ],
    ],
  };
}

export function buildConfigAturanKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "✏️ Edit", callback_data: CALLBACKS.SUPERADMIN_CONFIG_ATURAN_EDIT }],
      [
        { text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_CONFIG_MENU },
        { text: "🏠 Officer Home", callback_data: CALLBACKS.OFFICER_HOME },
      ],
    ],
  };
}

export function buildSettingsKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🗂️ Category", callback_data: CALLBACKS.SUPERADMIN_CATEGORY_MENU },
        { text: "💰 Finance", callback_data: CALLBACKS.SUPERADMIN_FINANCE_MENU },
      ],
      [
        { text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_TOOLS_MENU },
        { text: "🏠 Home", callback_data: CALLBACKS.OFFICER_HOME },
      ],
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
      [
        { text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_SETTINGS_MENU },
        { text: "🏠 Home", callback_data: CALLBACKS.OFFICER_HOME },
      ],
    ],
  };
}

export function buildFinanceKeyboard(manualOn) {
  return {
    inline_keyboard: [
      [
        {
          text: manualOn ? "🛑 Manual Payment : OFF" : "✅ Manual Payment : ON",
          callback_data: CALLBACKS.SUPERADMIN_FINANCE_MANUAL_TOGGLE,
        },
      ],
      [{ text: "🏷️ Set Pricing", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICING_MENU }],
      [
        { text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_SETTINGS_MENU },
        { text: "🏠 Home", callback_data: CALLBACKS.OFFICER_HOME },
      ],
    ],
  };
}

export function buildFinancePricingKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🥉 Bronze 1 Hari", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICE_BRONZE_1D },
        { text: "🥉 Bronze 3 Hari", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICE_BRONZE_3D },
      ],
      [
        { text: "🥉 Bronze 7 Hari", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICE_BRONZE_7D },
        { text: "🥉 Bronze 1 Bulan", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICE_BRONZE_1M },
      ],
      [
        { text: "🥇 Gold 1 Hari", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICE_GOLD_1D },
        { text: "🥇 Gold 3 Hari", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICE_GOLD_3D },
      ],
      [
        { text: "🥇 Gold 7 Hari", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICE_GOLD_7D },
        { text: "🥇 Gold 1 Bulan", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICE_GOLD_1M },
      ],
      [
        { text: "💠 Platinum 1 Hari", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICE_PLATINUM_1D },
        { text: "💠 Platinum 3 Hari", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICE_PLATINUM_3D },
      ],
      [
        { text: "💠 Platinum 7 Hari", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICE_PLATINUM_7D },
        { text: "💠 Platinum 1 Bulan", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICE_PLATINUM_1M },
      ],
      [
        { text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_FINANCE_MENU },
        { text: "🏠 Home", callback_data: CALLBACKS.OFFICER_HOME },
      ],
    ],
  };
}

export function buildFinanceClassPricingKeyboard(classId) {
  return {
    inline_keyboard: [
      [
        { text: "1 Hari", callback_data: `sa:fin:price:${classId}:1d` },
        { text: "3 Hari", callback_data: `sa:fin:price:${classId}:3d` },
      ],
      [
        { text: "7 Hari", callback_data: `sa:fin:price:${classId}:7d` },
        { text: "1 Bulan", callback_data: `sa:fin:price:${classId}:1m` },
      ],
      [
        { text: "⬅️ Back", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICING_MENU },
        { text: "🏠 Home", callback_data: CALLBACKS.OFFICER_HOME },
      ],
    ],
  };
}

export function buildPaymentReviewKeyboard(ticketId) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Confirm Payment", callback_data: cb.payConfirmOk(ticketId) },
        { text: "❌ Reject Payment", callback_data: cb.payConfirmReject(ticketId) },
      ],
      [
        { text: "⬅️ Finance", callback_data: CALLBACKS.SUPERADMIN_FINANCE_MENU },
        { text: "🏠 Officer Home", callback_data: CALLBACKS.OFFICER_HOME },
      ],
    ],
  };
}

// Verificator / Approve
export function buildMainKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [{ text: "👤 Pilih Verificator", callback_data: cb.pickVer(telegramId) }],
      [{ text: "🏠 Officer Home", callback_data: CALLBACKS.OFFICER_HOME }],
    ],
  };
}

export function buildApproveRejectKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: cb.approve(telegramId) },
        { text: "❌ Reject", callback_data: cb.reject(telegramId) },
      ],
      [{ text: "🏠 Officer Home", callback_data: CALLBACKS.OFFICER_HOME }],
    ],
  };
}

export function buildVerificatorKeyboard(telegramId, verificators) {
  const rows = [];
  const max = Math.min(verificators.length, 20);

  for (let i = 0; i < max; i += 2) {
    const a = verificators[i];
    const b = verificators[i + 1];
    const row = [{ text: a.label, callback_data: cb.setVer(telegramId, a.telegram_id) }];
    if (b) row.push({ text: b.label, callback_data: cb.setVer(telegramId, b.telegram_id) });
    rows.push(row);
  }

  rows.push([
    { text: "⬅️ Kembali", callback_data: cb.backVer(telegramId) },
    { text: "🏠 Officer Home", callback_data: CALLBACKS.OFFICER_HOME },
  ]);
  return { inline_keyboard: rows };
}
