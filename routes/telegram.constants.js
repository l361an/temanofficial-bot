// routes/telegram.constants.js

export const SESSION_MODES = {
  EDIT_PROFILE: "edit_profile",
  PARTNER_MODERATION: "partner_moderation",
  PARTNER_VIEW: "partner_view",
  PARTNER_EDIT_CLOSEUP: "partner_edit_closeup",
  SA_CONFIG: "sa_config",
  SA_CATEGORY: "sa_category",
};

export const CALLBACKS = {
  OFFICER_HOME: "officer:home",

  PARTNER_TOOLS_MENU: "pt:menu",

  PARTNER_DATABASE_MENU: "pm:menu",
  PARTNER_DATABASE_VIEW: "pm:view",

  PARTNER_MODERATION_MENU: "mod:menu",
  PARTNER_MOD_ACTIVATE: "mod:activate",
  PARTNER_MOD_SUSPEND: "mod:suspend",
  PARTNER_MOD_DELETE: "mod:delete",

  SUPERADMIN_TOOLS_MENU: "sa:tools:menu",
  SUPERADMIN_CONFIG_MENU: "sa:cfg:menu",
  SUPERADMIN_CONFIG_WELCOME: "sa:cfg:welcome",
  SUPERADMIN_CONFIG_ATURAN: "sa:cfg:aturan",
  SUPERADMIN_SETTINGS_MENU: "sa:settings:menu",
  SUPERADMIN_CATEGORY_MENU: "sa:cat:menu",
  SUPERADMIN_FINANCE_MENU: "sa:fin:menu",
};

export const CALLBACK_PREFIX = {
  PM_LIST: "pm:list:",

  PM_CLASS_START: "pmclass:start:",
  PM_CLASS_SET: "pmclass:set:",
  PM_CLASS_BACK: "pmclass:back:",

  PM_VER_START: "pmver:start:",
  PM_VER_SET: "pmver:set:",
  PM_VER_BACK: "pmver:back:",

  PM_PHOTO_START: "pmphoto:start:",

  PICK_VER: "pickver:",
  SET_VER: "setver:",
  BACK_VER: "backver:",
  APPROVE: "approve:",
  REJECT: "reject:",

  SETWELCOME_CONFIRM: "setwelcome_confirm:",
  SETWELCOME_CANCEL: "setwelcome_cancel:",
  SETLINK_CONFIRM: "setlink_confirm:",
  SETLINK_CANCEL: "setlink_cancel:",
};

export const OBSOLETE_ADMIN_COMMANDS = new Set([
  "/list",
  "/activate",
  "/suspend",
  "/delpartner",
  "/viewpartner",
  "/setwelcome",
  "/setlink",
]);

export const cb = {
  pmList: (status) => `${CALLBACK_PREFIX.PM_LIST}${status}`,

  pmClassStart: (telegramId) => `${CALLBACK_PREFIX.PM_CLASS_START}${telegramId}`,
  pmClassSet: (telegramId, classId) => `${CALLBACK_PREFIX.PM_CLASS_SET}${telegramId}:${classId}`,
  pmClassBack: (telegramId) => `${CALLBACK_PREFIX.PM_CLASS_BACK}${telegramId}`,

  pmVerStart: (telegramId) => `${CALLBACK_PREFIX.PM_VER_START}${telegramId}`,
  pmVerSet: (telegramId, verificatorId) => `${CALLBACK_PREFIX.PM_VER_SET}${telegramId}:${verificatorId}`,
  pmVerBack: (telegramId) => `${CALLBACK_PREFIX.PM_VER_BACK}${telegramId}`,

  pmPhotoStart: (telegramId) => `${CALLBACK_PREFIX.PM_PHOTO_START}${telegramId}`,

  pickVer: (telegramId) => `${CALLBACK_PREFIX.PICK_VER}${telegramId}`,
  setVer: (telegramId, verificatorId) => `${CALLBACK_PREFIX.SET_VER}${telegramId}:${verificatorId}`,
  backVer: (telegramId) => `${CALLBACK_PREFIX.BACK_VER}${telegramId}`,
  approve: (telegramId) => `${CALLBACK_PREFIX.APPROVE}${telegramId}`,
  reject: (telegramId) => `${CALLBACK_PREFIX.REJECT}${telegramId}`,

  setWelcomeConfirm: (adminId) => `${CALLBACK_PREFIX.SETWELCOME_CONFIRM}${adminId}`,
  setWelcomeCancel: (adminId) => `${CALLBACK_PREFIX.SETWELCOME_CANCEL}${adminId}`,
  setLinkConfirm: (adminId) => `${CALLBACK_PREFIX.SETLINK_CONFIRM}${adminId}`,
  setLinkCancel: (adminId) => `${CALLBACK_PREFIX.SETLINK_CANCEL}${adminId}`,
};
