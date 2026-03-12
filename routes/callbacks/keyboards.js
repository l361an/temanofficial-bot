// routes/callbacks/keyboards.js
import { isSuperadminRole } from "../../utils/roles.js";
import { CALLBACKS, cb } from "../telegram.constants.js";

const HOME_LABEL = "🏠 Officer Home";

function officerHomeButton() {
  return { text: HOME_LABEL, callback_data: CALLBACKS.OFFICER_HOME };
}

function backButton(callbackData, text = "⬅️ Back") {
  return { text, callback_data: callbackData };
}

function backAndHomeRow(backCallbackData, backText = "⬅️ Back") {
  return [backButton(backCallbackData, backText), officerHomeButton()];
}

export function buildOfficerHomeKeyboard(role) {
  const rows = [];

  if (isSuperadminRole(role)) {
    rows.push([
      { text: "👮 Admin Management", callback_data: CALLBACKS.SUPERADMIN_ADMIN_MENU },
      { text: "🤝 Partner Management", callback_data: CALLBACKS.PARTNER_TOOLS_MENU },
    ]);
    rows.push([{ text: "⚙️ System Settings", callback_data: CALLBACKS.SUPERADMIN_TOOLS_MENU }]);
  } else {
    rows.push([{ text: "🤝 Partner Management", callback_data: CALLBACKS.PARTNER_TOOLS_MENU }]);
  }

  return { inline_keyboard: rows };
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
    inline_keyboard: [backAndHomeRow(CALLBACKS.PARTNER_DATABASE_MENU)],
  };
}

export function buildBackToPartnerDatabaseViewKeyboard() {
  return {
    inline_keyboard: [backAndHomeRow(CALLBACKS.PARTNER_DATABASE_MENU)],
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

  if (isSuperadminRole(role)) {
    rows.push([
      { text: "🏷️ Class", callback_data: cb.pmClassStart(telegramId) },
      { text: "👤 Verificator", callback_data: cb.pmVerStart(telegramId) },
    ]);
    rows.push([
      { text: "📸 Foto", callback_data: cb.pmPhotoStart(telegramId) },
      { text: "📝 Nickname", callback_data: cb.pmEditStart(telegramId, "nickname") },
    ]);
    rows.push([
      { text: "📱 Whatsapp", callback_data: cb.pmEditStart(telegramId, "no_whatsapp") },
      { text: "📍 Kecamatan", callback_data: cb.pmEditStart(telegramId, "kecamatan") },
    ]);
    rows.push([
      { text: "🏙️ Kota", callback_data: cb.pmEditStart(telegramId, "kota") },
      { text: "📢 Channel", callback_data: cb.pmEditStart(telegramId, "channel_url") },
    ]);
  }

  rows.push([
    { text: "⬅️ Back to Panel", callback_data: cb.pmPanelBack(telegramId) },
    officerHomeButton(),
  ]);

  return { inline_keyboard: rows };
}

export function buildPartnerSubscriptionKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [{ text: "⬅️ Back to Panel", callback_data: cb.pmPanelBack(telegramId) }],
      [officerHomeButton()],
    ],
  };
}

export function buildPartnerDetailActionsKeyboard(telegramId, role) {
  return buildPartnerDetailsKeyboard(telegramId, role);
}

export function buildPartnerClassPickerKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [
        { text: "Bronze", callback_data: cb.pmClassSet(telegramId, "bronze") },
        { text: "Gold", callback_data: cb.pmClassSet(telegramId, "gold") },
      ],
      [{ text: "Platinum", callback_data: cb.pmClassSet(telegramId, "platinum") }],
      backAndHomeRow(cb.pmClassBack(telegramId)),
      [
        { text: "🗃️ Partner Database", callback_data: CALLBACKS.PARTNER_DATABASE_MENU },
        { text: "🤝 Partner Management", callback_data: CALLBACKS.PARTNER_TOOLS_MENU },
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

  rows.push(backAndHomeRow(cb.pmVerBack(telegramId)));
  rows.push([
    { text: "🗃️ Partner Database", callback_data: CALLBACKS.PARTNER_DATABASE_MENU },
    { text: "🤝 Partner Management", callback_data: CALLBACKS.PARTNER_TOOLS_MENU },
  ]);

  return { inline_keyboard: rows };
}

export function buildPartnerModerationKeyboard(role) {
  const rows = [[
    { text: "✅ Restore", callback_data: CALLBACKS.PARTNER_MOD_RESTORE },
    { text: "⛔ Suspend", callback_data: CALLBACKS.PARTNER_MOD_SUSPEND },
  ]];

  if (isSuperadminRole(role)) {
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

export function buildSuperadminToolsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👮 Admin Management", callback_data: CALLBACKS.SUPERADMIN_ADMIN_MENU }],
      [{ text: "👋 Welcome Message", callback_data: CALLBACKS.SUPERADMIN_CONFIG_WELCOME }],
      [{ text: "🔗 Link Aturan", callback_data: CALLBACKS.SUPERADMIN_CONFIG_ATURAN }],
      [
        { text: "🗂️ Category", callback_data: CALLBACKS.SUPERADMIN_CATEGORY_MENU },
        { text: "💰 Finance", callback_data: CALLBACKS.SUPERADMIN_FINANCE_MENU },
      ],
      [officerHomeButton()],
    ],
  };
}

export function buildAdminManagerKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📋 List Admin", callback_data: CALLBACKS.SUPERADMIN_ADMIN_LIST }],
      [{ text: "➕ Add Admin", callback_data: CALLBACKS.SUPERADMIN_ADMIN_ADD }],
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

export function buildAdminControlPanelKeyboard(telegramId, row) {
  const rows = [
    [
      { text: "✏️ Username", callback_data: cb.saAdminEditUsername(telegramId) },
      { text: "✏️ Nama", callback_data: cb.saAdminEditNama(telegramId) },
    ],
    [
      { text: "✏️ Kota", callback_data: cb.saAdminEditKota(telegramId) },
      { text: "✏️ Role", callback_data: cb.saAdminEditRole(telegramId) },
    ],
    [
      { text: "✏️ Status", callback_data: cb.saAdminEditStatus(telegramId) },
    ],
  ];

  if (row?.normStatus === "active") {
    rows.push([{ text: "⛔ Nonaktifkan", callback_data: cb.saAdminDeactivate(telegramId) }]);
  } else {
    rows.push([{ text: "✅ Aktifkan", callback_data: cb.saAdminActivate(telegramId) }]);
  }

  rows.push(backAndHomeRow(CALLBACKS.SUPERADMIN_ADMIN_LIST));
  return { inline_keyboard: rows };
}

export function buildAdminRolePickerKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [
        { text: "admin", callback_data: cb.saAdminRoleSet(telegramId, "admin") },
        { text: "superadmin", callback_data: cb.saAdminRoleSet(telegramId, "superadmin") },
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
      backAndHomeRow(CALLBACKS.SUPERADMIN_TOOLS_MENU),
    ],
  };
}

export function buildConfigAturanKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "✏️ Edit", callback_data: CALLBACKS.SUPERADMIN_CONFIG_ATURAN_EDIT }],
      backAndHomeRow(CALLBACKS.SUPERADMIN_TOOLS_MENU),
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
      backAndHomeRow(CALLBACKS.SUPERADMIN_TOOLS_MENU),
    ],
  };
}

export function buildFinanceQrisKeyboard(hasQris = false) {
  const rows = [];

  if (hasQris) {
    rows.push([{ text: "👁️ Lihat QRIS", callback_data: CALLBACKS.SUPERADMIN_FINANCE_QRIS_VIEW }]);
  }

  rows.push([
    {
      text: hasQris ? "♻️ Ganti Foto QRIS" : "📸 Set Foto QRIS",
      callback_data: CALLBACKS.SUPERADMIN_FINANCE_QRIS_SET,
    },
  ]);
  rows.push(backAndHomeRow(CALLBACKS.SUPERADMIN_FINANCE_MENU));

  return { inline_keyboard: rows };
}

export function buildFinancePricingKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🥉 Bronze", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICING_BRONZE_MENU },
        { text: "🥇 Gold", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICING_GOLD_MENU },
      ],
      [{ text: "💠 Platinum", callback_data: CALLBACKS.SUPERADMIN_FINANCE_PRICING_PLATINUM_MENU }],
      backAndHomeRow(CALLBACKS.SUPERADMIN_FINANCE_MENU),
    ],
  };
}

export function buildFinanceClassPricingKeyboard(classId) {
  return {
    inline_keyboard: [
      [
        { text: "1 Hari", callback_data: `sa:fin:price:${classId}:1d` },
        { text: "1 Bulan", callback_data: `sa:fin:price:${classId}:1m` },
      ],
      backAndHomeRow(CALLBACKS.SUPERADMIN_FINANCE_PRICING_MENU),
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
        officerHomeButton(),
      ],
    ],
  };
}

export function buildMainKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [{ text: "👤 Pilih Verificator", callback_data: cb.pickVer(telegramId) }],
      [officerHomeButton()],
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
      [officerHomeButton()],
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

  rows.push(backAndHomeRow(cb.backVer(telegramId)));
  return { inline_keyboard: rows };
}
