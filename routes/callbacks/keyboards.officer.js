// routes/callbacks/keyboards.officer.js
import { isSuperadminRole } from "../../utils/roles.js";
import { CALLBACKS } from "../telegram.constants.js";

export function buildOfficerHomeKeyboard(role) {
  const rows = [];

  if (isSuperadminRole(role)) {
    rows.push([
      { text: "👮 Admin Management", callback_data: CALLBACKS.SUPERADMIN_ADMIN_MENU },
      { text: "👥 Partner Management", callback_data: CALLBACKS.PARTNER_TOOLS_MENU },
    ]);
    rows.push([
      { text: "⚙️ System Settings", callback_data: CALLBACKS.SUPERADMIN_TOOLS_MENU },
    ]);
  } else {
    rows.push([{ text: "👥 Partner Management", callback_data: CALLBACKS.PARTNER_TOOLS_MENU }]);
  }

  return { inline_keyboard: rows };
}
