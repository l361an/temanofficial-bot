// routes/callbacks/keyboards.shared.js
import { CALLBACKS } from "../telegram.constants.js";

export const HOME_LABEL = "🏠 Officer Home";

export function officerHomeButton() {
  return { text: HOME_LABEL, callback_data: CALLBACKS.OFFICER_HOME };
}

export function backButton(callbackData, text = "⬅️ Back") {
  return { text, callback_data: callbackData };
}

export function backAndHomeRow(backCallbackData, backText = "⬅️ Back") {
  return [backButton(backCallbackData, backText), officerHomeButton()];
}
