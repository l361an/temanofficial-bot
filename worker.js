// worker.js

import telegramRoutes from "./routes/telegram.js";
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

    // NeoBank notif from MacroDroid
    if (method === "POST" && pathname === "/neobank-notif") {
      const contentType = request.headers.get("content-type") || "";

      let payload = {};

      try {
        if (contentType.includes("application/json")) {
          payload = await request.json();
        } else if (contentType.includes("application/x-www-form-urlencoded")) {
          const form = await request.formData();
          payload = Object.fromEntries(form.entries());
        } else {
          const text = await request.text();
          payload = { raw: text };
        }

        return json({
          ok: true,
          message: "NeoBank notif diterima",
          path: pathname,
          method,
          received: payload,
        });
      } catch (error) {
        return json(
          {
            ok: false,
            message: "Gagal membaca payload NeoBank notif",
            error: String(error?.message || error),
            path: pathname,
            method,
          },
          400
        );
      }
    }

    // Telegram webhook:
    // support both "/" and "/webhook" supaya tidak mati kalau setWebhook salah path.
    if (method === "POST" && (pathname === "/" || pathname === "/webhook")) {
      return telegramRoutes.handleTelegramWebhook(request, env);
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
