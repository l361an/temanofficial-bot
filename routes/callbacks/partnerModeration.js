// routes/callbacks/partnerModeration.js
import { sendMessage, editMessageReplyMarkup } from "../../services/telegramApi.js";
import { saveSession, clearSession } from "../../utils/session.js";
import { isSuperadminRole } from "../../utils/roles.js";
import { buildPartnerModerationKeyboard, buildBackToPartnerModerationKeyboard } from "./keyboards.js";

export function buildPartnerModerationHandlers() {
  const EXACT = {};
  const PREFIX = [];

  EXACT["mod:menu"] = async (ctx) => {
    const { env, adminId, msgChatId, msgId, role } = ctx;
    await clearSession(env, `state:${adminId}`).catch(() => {});
    if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});
    await sendMessage(env, adminId, "🛠️ <b>Partner Moderation</b>\nPilih aksi di bawah:", {
      parse_mode: "HTML",
      reply_markup: buildPartnerModerationKeyboard(role),
    });
    return true;
  };

  PREFIX.push({
    match: (d) => d.startsWith("mod:") && ["mod:activate", "mod:suspend", "mod:delete"].includes(d),
    run: async (ctx) => {
      const { env, data, adminId, msgChatId, msgId, role } = ctx;
      const action = data.split(":")[1];

      if (action === "delete" && !isSuperadminRole(role)) {
        await sendMessage(env, adminId, "⛔ Akses ditolak. Delete Partner hanya untuk Superadmin.");
        return true;
      }

      await saveSession(env, `state:${adminId}`, { mode: "partner_moderation", action, step: "await_target" });

      if (msgChatId && msgId) await editMessageReplyMarkup(env, msgChatId, msgId, null).catch(() => {});

      const nice =
        action === "activate"
          ? "ACTIVATE (active)"
          : action === "suspend"
            ? "SUSPEND (suspended)"
            : "DELETE (hapus partner)";

      await sendMessage(
        env,
        adminId,
        `🛠️ <b>Partner Moderation</b>\nAksi: <b>${nice}</b>\n\nKirim <b>@username</b> atau <b>telegram_id</b> target.\n\nKetik <b>batal</b> untuk keluar.`,
        { parse_mode: "HTML", reply_markup: buildBackToPartnerModerationKeyboard() }
      );
      return true;
    },
  });

  return { EXACT, PREFIX };
}
