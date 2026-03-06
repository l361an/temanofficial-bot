// routes/callbacks/keyboards.js
import { isSuperadminRole } from "../../utils/roles.js";

// Officer Home: Partner Tools + Superadmin Tools (superadmin only)
export function buildOfficerHomeKeyboard(role) {
  const rows = [[{ text: "🧰 Partner Tools", callback_data: "pt:menu" }]];
  if (isSuperadminRole(role)) rows.push([{ text: "⚙️ Superadmin Tools", callback_data: "sa:tools:menu" }]);
  return { inline_keyboard: rows };
}

// Partner Tools menu
export function buildPartnerToolsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🗃️ Partner Database", callback_data: "pm:menu" }],
      [{ text: "🛠️ Partner Moderation", callback_data: "mod:menu" }],
      [{ text: "⬅️ Back", callback_data: "officer:home" }],
    ],
  };
}

// Partner Database
export function buildPartnerDatabaseKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🔎 View Partner", callback_data: "pm:view" }],
      [{ text: "👥 Partner", callback_data: "pm:list:all" }],
      [{ text: "🕒 Partner Pending", callback_data: "pm:list:pending" }],
      [{ text: "✅ Partner Approved", callback_data: "pm:list:approved" }],
      [{ text: "⛔ Partner Suspended", callback_data: "pm:list:suspended" }],
      [{ text: "🟢 Partner Active", callback_data: "pm:list:active" }],
      [{ text: "⬅️ Kembali", callback_data: "pt:menu" }],
    ],
  };
}

export function buildBackToPartnerDatabaseKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "⬅️ Kembali", callback_data: "pm:menu" }],
      [{ text: "🧰 Partner Tools", callback_data: "pt:menu" }],
      [{ text: "🏠 Officer Home", callback_data: "officer:home" }],
    ],
  };
}

export function buildBackToPartnerDatabaseViewKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "⬅️ Kembali ke Partner Database", callback_data: "pm:menu" }],
      [{ text: "🧰 Partner Tools", callback_data: "pt:menu" }],
      [{ text: "🏠 Officer Home", callback_data: "officer:home" }],
    ],
  };
}

export function buildPartnerDetailActionsKeyboard(telegramId, role) {
  const rows = [];

  if (isSuperadminRole(role)) {
    rows.push([{ text: "🏷️ Ubah Class", callback_data: `pmclass:start:${telegramId}` }]);
  }

  rows.push([{ text: "⬅️ Kembali ke Partner Database", callback_data: "pm:menu" }]);
  rows.push([{ text: "🧰 Partner Tools", callback_data: "pt:menu" }]);
  rows.push([{ text: "🏠 Officer Home", callback_data: "officer:home" }]);

  return { inline_keyboard: rows };
}

export function buildPartnerClassPickerKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [{ text: "Bronze", callback_data: `pmclass:set:${telegramId}:bronze` }],
      [{ text: "Gold", callback_data: `pmclass:set:${telegramId}:gold` }],
      [{ text: "Platinum", callback_data: `pmclass:set:${telegramId}:platinum` }],
      [{ text: "⬅️ Kembali ke Detail Partner", callback_data: `pmclass:back:${telegramId}` }],
      [{ text: "🗃️ Partner Database", callback_data: "pm:menu" }],
    ],
  };
}

// Partner Moderation (✅ Delete = superadmin only)
export function buildPartnerModerationKeyboard(role) {
  const rows = [
    [{ text: "✅ Activate Partner", callback_data: "mod:activate" }],
    [{ text: "⛔ Suspend Partner", callback_data: "mod:suspend" }],
  ];

  if (isSuperadminRole(role)) rows.push([{ text: "❌ Delete Partner", callback_data: "mod:delete" }]);
  rows.push([{ text: "⬅️ Kembali", callback_data: "pt:menu" }]);

  return { inline_keyboard: rows };
}

export function buildBackToPartnerModerationKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "⬅️ Kembali", callback_data: "mod:menu" }],
      [{ text: "🧰 Partner Tools", callback_data: "pt:menu" }],
      [{ text: "⬅️ Officer Home", callback_data: "officer:home" }],
    ],
  };
}

// Superadmin Tools
export function buildSuperadminToolsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🧩 Config", callback_data: "sa:cfg:menu" }],
      [{ text: "⚙️ Settings", callback_data: "sa:settings:menu" }],
      [{ text: "💰 Finance", callback_data: "sa:fin:menu" }],
      [{ text: "⬅️ Officer Home", callback_data: "officer:home" }],
    ],
  };
}

export function buildConfigKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👋 Update Welcome Message", callback_data: "sa:cfg:welcome" }],
      [{ text: "🔗 Update Link Aturan", callback_data: "sa:cfg:aturan" }],
      [{ text: "⬅️ Back", callback_data: "sa:tools:menu" }],
    ],
  };
}

export function buildConfigWelcomeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "✏️ Edit", callback_data: "sa:cfg:welcome_edit" }],
      [{ text: "⬅️ Back", callback_data: "sa:cfg:menu" }],
    ],
  };
}

export function buildConfigAturanKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "✏️ Edit", callback_data: "sa:cfg:aturan_edit" }],
      [{ text: "⬅️ Back", callback_data: "sa:cfg:menu" }],
    ],
  };
}

export function buildSettingsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🗂️ Category", callback_data: "sa:cat:menu" }],
      [{ text: "⬅️ Back", callback_data: "sa:tools:menu" }],
    ],
  };
}

export function buildCategoryKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📚 Category List", callback_data: "sa:cat:list" }],
      [{ text: "➕ Add Category", callback_data: "sa:cat:add" }],
      [{ text: "➖ Delete Category", callback_data: "sa:cat:del" }],
      [{ text: "⬅️ Back", callback_data: "sa:settings:menu" }],
    ],
  };
}

export function buildFinanceKeyboard(manualOn) {
  return {
    inline_keyboard: [
      [
        {
          text: manualOn ? "🛑 Set Manual Payment: OFF" : "✅ Set Manual Payment: ON",
          callback_data: "sa:fin:manual_toggle",
        },
      ],
      [{ text: "⬅️ Back", callback_data: "sa:tools:menu" }],
    ],
  };
}

// Verificator / Approve
export function buildMainKeyboard(telegramId) {
  return { inline_keyboard: [[{ text: "👤 Pilih Verificator", callback_data: `pickver:${telegramId}` }]] };
}

export function buildApproveRejectKeyboard(telegramId) {
  return {
    inline_keyboard: [[
      { text: "✅ Approve", callback_data: `approve:${telegramId}` },
      { text: "❌ Reject", callback_data: `reject:${telegramId}` },
    ]],
  };
}

export function buildVerificatorKeyboard(telegramId, verificators) {
  const rows = [];
  const max = Math.min(verificators.length, 20);

  for (let i = 0; i < max; i += 2) {
    const a = verificators[i];
    const b = verificators[i + 1];
    const row = [{ text: a.label, callback_data: `setver:${telegramId}:${a.telegram_id}` }];
    if (b) row.push({ text: b.label, callback_data: `setver:${telegramId}:${b.telegram_id}` });
    rows.push(row);
  }
  rows.push([{ text: "⬅️ Kembali", callback_data: `backver:${telegramId}` }]);
  return { inline_keyboard: rows };
}
