// worker.js

import { handleTelegramWebhook } from "./routes/telegram.js";
import { handleAdmin } from "./routes/admin.js";
import { handleProfile } from "./routes/profile.js";
import { json } from "./utils/response.js";
import { runMaintenanceCron } from "./services/cronMaintenanceService.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Normalize: kalau ada //webhook jadi /webhook
    const pathname = url.pathname.replace(/\/{2,}/g, "/");

    if (pathname === "/webhook") {
      return handleTelegramWebhook(request, env, ctx);
    }

    if (pathname.startsWith("/admin")) {
      return handleAdmin(request, env, url, ctx);
    }

    if (pathname.startsWith("/profiles")) {
      return handleProfile(request, env, url, ctx);
    }

    if (pathname === "/cron/run-maintenance") {
      const result = await runMaintenanceCron(env);
      return json(result);
    }

    return json({ message: "Worker hidup bro 🚀", path: url.pathname });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runMaintenanceCron(env));
  },
};
