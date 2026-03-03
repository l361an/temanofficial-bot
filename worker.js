// worker.js

import { handleTelegramWebhook } from "./routes/telegram.js";
import { handleAdmin } from "./routes/admin.js";
import { handleProfile } from "./routes/profile.js";
import { json } from "./utils/response.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Normalize: kalau ada //webhook jadi /webhook
    const pathname = url.pathname.replace(/\/{2,}/g, "/");

    if (pathname === "/webhook") {
      return handleTelegramWebhook(request, env);
    }

    if (pathname.startsWith("/admin")) {
      return handleAdmin(request, env, url);
    }

    if (pathname.startsWith("/profiles")) {
      return handleProfile(request, env, url);
    }

    return json({ message: "Worker hidup bro 🚀", path: url.pathname });
  },
};
