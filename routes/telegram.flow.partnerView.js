// routes/telegram.flow.partnerView.js
import { handlePartnerViewSearchInput } from "./callbacks/partnerDatabase.js";

export async function handlePartnerViewInput({
  env,
  chatId,
  text,
  session,
  STATE_KEY,
  role,
}) {
  return handlePartnerViewSearchInput({
    env,
    chatId,
    adminId: chatId,
    text,
    role,
    session,
    STATE_KEY,
  });
}
