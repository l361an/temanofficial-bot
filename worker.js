// worker.js

import { handleTelegramWebhook } from "./routes/telegram.js";
import { handleAdmin } from "./routes/admin.js";
import { handleProfile } from "./routes/profile.js";
import { json } from "./utils/response.js";
import { runMaintenanceCron } from "./services/cronMaintenanceService.js";

function normalizePathname(pathname) {
  const raw = String(pathname || "/").replace(/\/{2,}/g, "/");
  if (raw.length > 1 && raw.endsWith("/")) return raw.slice(0, -1);
  return raw || "/";
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = normalizePathname(url.pathname);
    const method = String(request.method || "GET").toUpperCase();

    // Telegram webhook:
    // support both "/" and "/webhook" supaya tidak mati kalau setWebhook salah path.
    if (method === "POST" && (pathname === "/" || pathname === "/webhook")) {
      return handleTelegramWebhook(request, env);
    }

    if (pathname === "/webhook") {
      return json({
        ok: true,
        message: "Telegram webhook endpoint ready",
        method,
        path: pathname,
      });
    }

    if (pathname.startsWith("/admin")) {
      return handleAdmin(request, env, url);
    }

    if (pathname.startsWith("/profiles")) {
      return handleProfile(request, env, url);
    }

    if (pathname === "/cron/run-maintenance") {
      const result = await runMaintenanceCron(env);
      return json(result);
    }

    return json({
      ok: true,
      message: "Worker hidup bro 🚀",
      path: pathname,
      method,
    });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runMaintenanceCron(env));
  },
};
