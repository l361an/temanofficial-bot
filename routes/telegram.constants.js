// routes/telegram.constants.js

export const SESSION_MODES = {
  EDIT_PROFILE: "edit_profile",
  PARTNER_MODERATION: "partner_moderation",
  PARTNER_VIEW: "partner_view",
  PARTNER_EDIT_CLOSEUP: "partner_edit_closeup",
  PARTNER_EDIT_TEXT: "partner_edit_text",
  SA_CONFIG: "sa_config",
  SA_CATEGORY: "sa_category",
  SA_FINANCE: "sa_finance",
  SA_ADMIN_MANAGER: "sa_admin_manager",
};

export const CALLBACKS = {
  OFFICER_HOME: "officer:home",

  PARTNER_TOOLS_MENU: "pt:menu",

  PARTNER_DATABASE_MENU: "pm:menu",
  PARTNER_DATABASE_VIEW: "pm:view",

  PARTNER_MODERATION_MENU: "mod:menu",
  PARTNER_MOD_RESTORE: "mod:restore",
  PARTNER_MOD_SUSPEND: "mod:suspend",
  PARTNER_MOD_DELETE: "mod:delete",

  SUPERADMIN_TOOLS_MENU: "sa:tools:menu",
  SUPERADMIN_CONFIG_MENU: "sa:cfg:menu",
  SUPERADMIN_CONFIG_WELCOME: "sa:cfg:welcome",
  SUPERADMIN_CONFIG_WELCOME_EDIT: "sa:cfg:welcome_edit",
  SUPERADMIN_CONFIG_ATURAN: "sa:cfg:aturan",
  SUPERADMIN_CONFIG_ATURAN_EDIT: "sa:cfg:aturan_edit",

  SUPERADMIN_SETTINGS_MENU: "sa:settings:menu",

  SUPERADMIN_CATEGORY_MENU: "sa:cat:menu",
  SUPERADMIN_CATEGORY_LIST: "sa:cat:list",
  SUPERADMIN_CATEGORY_ADD: "sa:cat:add",
  SUPERADMIN_CATEGORY_DEL: "sa:cat:del",

  SUPERADMIN_FINANCE_MENU: "sa:fin:menu",
  SUPERADMIN_FINANCE_MANUAL_TOGGLE: "sa:fin:manual_toggle",
  SUPERADMIN_FINANCE_PRICING_MENU: "sa:fin:pricing:menu",
  SUPERADMIN_FINANCE_QRIS_MENU: "sa:fin:qris:menu",
  SUPERADMIN_FINANCE_QRIS_SET: "sa:fin:qris:set",
  SUPERADMIN_FINANCE_QRIS_VIEW: "sa:fin:qris:view",

  SUPERADMIN_FINANCE_PRICING_BRONZE_MENU: "sa:fin:pricing:bronze",
  SUPERADMIN_FINANCE_PRICING_GOLD_MENU: "sa:fin:pricing:gold",
  SUPERADMIN_FINANCE_PRICING_PLATINUM_MENU: "sa:fin:pricing:platinum",

  SUPERADMIN_FINANCE_PRICE_BRONZE_1D: "sa:fin:price:bronze:1d",
  SUPERADMIN_FINANCE_PRICE_BRONZE_3D: "sa:fin:price:bronze:3d",
  SUPERADMIN_FINANCE_PRICE_BRONZE_7D: "sa:fin:price:bronze:7d",
  SUPERADMIN_FINANCE_PRICE_BRONZE_1M: "sa:fin:price:bronze:1m",

  SUPERADMIN_FINANCE_PRICE_GOLD_1D: "sa:fin:price:gold:1d",
  SUPERADMIN_FINANCE_PRICE_GOLD_3D: "sa:fin:price:gold:3d",
  SUPERADMIN_FINANCE_PRICE_GOLD_7D: "sa:fin:price:gold:7d",
  SUPERADMIN_FINANCE_PRICE_GOLD_1M: "sa:fin:price:gold:1m",

  SUPERADMIN_FINANCE_PRICE_PLATINUM_1D: "sa:fin:price:platinum:1d",
  SUPERADMIN_FINANCE_PRICE_PLATINUM_3D: "sa:fin:price:platinum:3d",
  SUPERADMIN_FINANCE_PRICE_PLATINUM_7D: "sa:fin:price:platinum:7d",
  SUPERADMIN_FINANCE_PRICE_PLATINUM_1M: "sa:fin:price:platinum:1m",

  SUPERADMIN_ADMIN_MENU: "sa:admin:menu",
  SUPERADMIN_ADMIN_LIST: "sa:admin:list",
  SUPERADMIN_ADMIN_ADD: "sa:admin:add",
  SUPERADMIN_ADMIN_BACK: "sa:admin:back",
};

export const CALLBACK_PREFIX = {
  PM_LIST: "pm:list:",

  PM_PANEL_OPEN: "pm:panel:",
  PM_DETAILS_OPEN: "pm:details:",
  PM_SUBSCRIPTION_OPEN: "pm:subscription:",
  PM_PANEL_BACK: "pm:panel:back:",

  PM_CLASS_START: "pmclass:start:",
  PM_CLASS_SET: "pmclass:set:",
  PM_CLASS_BACK: "pmclass:back:",

  PM_VER_START: "pmver:start:",
  PM_VER_SET: "pmver:set:",
  PM_VER_BACK: "pmver:back:",

  PM_PHOTO_START: "pmphoto:start:",
  PM_EDIT_START: "pmedit:start:",
  PM_EDIT_BACK: "pmedit:back:",

  PICK_VER: "pickver:",
  SET_VER: "setver:",
  BACK_VER: "backver:",
  APPROVE: "approve:",
  REJECT: "reject:",

  SETWELCOME_CONFIRM: "setwelcome_confirm:",
  SETWELCOME_CANCEL: "setwelcome_cancel:",
  SETLINK_CONFIRM: "setlink_confirm:",
  SETLINK_CANCEL: "setlink_cancel:",

  PAYCONFIRM_OK: "payconfirm_ok:",
  PAYCONFIRM_REJECT: "payconfirm_reject:",

  SA_ADMIN_OPEN: "saadmin:open:",
  SA_ADMIN_EDIT_USERNAME: "saadmin:edit:username:",
  SA_ADMIN_EDIT_NAMA: "saadmin:edit:nama:",
  SA_ADMIN_EDIT_KOTA: "saadmin:edit:kota:",
  SA_ADMIN_EDIT_ROLE: "saadmin:edit:role:",
  SA_ADMIN_EDIT_STATUS: "saadmin:edit:status:",
  SA_ADMIN_ROLE_SET: "saadmin:role:set:",
  SA_ADMIN_STATUS_SET: "saadmin:status:set:",
  SA_ADMIN_DEACTIVATE: "saadmin:deactivate:",
  SA_ADMIN_ACTIVATE: "saadmin:activate:",
  SA_ADMIN_DELETE: "saadmin:delete:",
};

export const OBSOLETE_ADMIN_COMMANDS = new Set([
  "/list",
  "/restore",
  "/suspend",
  "/delpartner",
  "/viewpartner",
  "/setwelcome",
  "/setlink",
]);

export const cb = {
  pmList: (status) => `${CALLBACK_PREFIX.PM_LIST}${status}`,

  pmPanelOpen: (telegramId) => `${CALLBACK_PREFIX.PM_PANEL_OPEN}${telegramId}`,
  pmDetailsOpen: (telegramId) => `${CALLBACK_PREFIX.PM_DETAILS_OPEN}${telegramId}`,
  pmSubscriptionOpen: (telegramId) => `${CALLBACK_PREFIX.PM_SUBSCRIPTION_OPEN}${telegramId}`,
  pmPanelBack: (telegramId) => `${CALLBACK_PREFIX.PM_PANEL_BACK}${telegramId}`,

  pmClassStart: (telegramId) => `${CALLBACK_PREFIX.PM_CLASS_START}${telegramId}`,
  pmClassSet: (telegramId, classId) => `${CALLBACK_PREFIX.PM_CLASS_SET}${telegramId}:${classId}`,
  pmClassBack: (telegramId) => `${CALLBACK_PREFIX.PM_CLASS_BACK}${telegramId}`,

  pmVerStart: (telegramId) => `${CALLBACK_PREFIX.PM_VER_START}${telegramId}`,
  pmVerSet: (telegramId, verificatorId) => `${CALLBACK_PREFIX.PM_VER_SET}${telegramId}:${verificatorId}`,
  pmVerBack: (telegramId) => `${CALLBACK_PREFIX.PM_VER_BACK}${telegramId}`,

  pmPhotoStart: (telegramId) => `${CALLBACK_PREFIX.PM_PHOTO_START}${telegramId}`,
  pmEditStart: (telegramId, field) => `${CALLBACK_PREFIX.PM_EDIT_START}${telegramId}:${field}`,
  pmEditBack: (telegramId) => `${CALLBACK_PREFIX.PM_EDIT_BACK}${telegramId}`,

  pickVer: (telegramId) => `${CALLBACK_PREFIX.PICK_VER}${telegramId}`,
  setVer: (telegramId, verificatorId) => `${CALLBACK_PREFIX.SET_VER}${telegramId}:${verificatorId}`,
  backVer: (telegramId) => `${CALLBACK_PREFIX.BACK_VER}${telegramId}`,
  approve: (telegramId) => `${CALLBACK_PREFIX.APPROVE}${telegramId}`,
  reject: (telegramId) => `${CALLBACK_PREFIX.REJECT}${telegramId}`,

  setWelcomeConfirm: (ownerId) => `${CALLBACK_PREFIX.SETWELCOME_CONFIRM}${ownerId}`,
  setWelcomeCancel: (ownerId) => `${CALLBACK_PREFIX.SETWELCOME_CANCEL}${ownerId}`,
  setLinkConfirm: (ownerId) => `${CALLBACK_PREFIX.SETLINK_CONFIRM}${ownerId}`,
  setLinkCancel: (ownerId) => `${CALLBACK_PREFIX.SETLINK_CANCEL}${ownerId}`,

  payConfirmOk: (ticketId) => `${CALLBACK_PREFIX.PAYCONFIRM_OK}${ticketId}`,
  payConfirmReject: (ticketId) => `${CALLBACK_PREFIX.PAYCONFIRM_REJECT}${ticketId}`,

  saAdminOpen: (telegramId) => `${CALLBACK_PREFIX.SA_ADMIN_OPEN}${telegramId}`,
  saAdminEditUsername: (telegramId) => `${CALLBACK_PREFIX.SA_ADMIN_EDIT_USERNAME}${telegramId}`,
  saAdminEditNama: (telegramId) => `${CALLBACK_PREFIX.SA_ADMIN_EDIT_NAMA}${telegramId}`,
  saAdminEditKota: (telegramId) => `${CALLBACK_PREFIX.SA_ADMIN_EDIT_KOTA}${telegramId}`,
  saAdminEditRole: (telegramId) => `${CALLBACK_PREFIX.SA_ADMIN_EDIT_ROLE}${telegramId}`,
  saAdminEditStatus: (telegramId) => `${CALLBACK_PREFIX.SA_ADMIN_EDIT_STATUS}${telegramId}`,
  saAdminRoleSet: (telegramId, role) => `${CALLBACK_PREFIX.SA_ADMIN_ROLE_SET}${telegramId}:${role}`,
  saAdminStatusSet: (telegramId, status) => `${CALLBACK_PREFIX.SA_ADMIN_STATUS_SET}${telegramId}:${status}`,
  saAdminDeactivate: (telegramId) => `${CALLBACK_PREFIX.SA_ADMIN_DEACTIVATE}${telegramId}`,
  saAdminActivate: (telegramId) => `${CALLBACK_PREFIX.SA_ADMIN_ACTIVATE}${telegramId}`,
  saAdminDelete: (telegramId) => `${CALLBACK_PREFIX.SA_ADMIN_DELETE}${telegramId}`,
};
