// routes/telegram.constants.js

export const SESSION_MODES = {
  EDIT_PROFILE: "edit_profile",
  PARTNER_MODERATION: "partner_moderation",
  PARTNER_VIEW: "partner_view",
  SA_CONFIG: "sa_config",
  SA_CATEGORY: "sa_category",
};

export const CALLBACKS = {
  OFFICER_HOME: "officer:home",

  PARTNER_TOOLS_MENU: "pt:menu",

  PARTNER_DATABASE_MENU: "pm:menu",
  PARTNER_MODERATION_MENU: "mod:menu",

  SUPERADMIN_TOOLS_MENU: "sa:tools:menu",
  SUPERADMIN_CONFIG_MENU: "sa:cfg:menu",
  SUPERADMIN_CONFIG_WELCOME: "sa:cfg:welcome",
  SUPERADMIN_CONFIG_ATURAN: "sa:cfg:aturan",

  SUPERADMIN_CATEGORY_MENU: "sa:cat:menu",
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
