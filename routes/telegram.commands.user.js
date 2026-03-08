// routes/telegram.commands.user.js

import { sendMessage, sendPhoto, sendLongMessage } from "../services/telegramApi.js";
import { getSetting } from "../repositories/settingsRepo.js";
import { saveSession, clearSession } from "../utils/session.js";
import { isAdminRole } from "../utils/roles.js";
import {
  getOpenPaymentTicketByPartnerId,
  createPaymentTicket,
} from "../repositories/paymentTicketsRepo.js";
import { fmtClassId } from "../utils/partnerHelpers.js";

import {
  getProfileFullByTelegramId,
  getProfileByTelegramId,
  updateEditableProfileFields,
  updateCloseupPhoto,
  setProfileCategoriesByProfileId,
  listCategoryKodesByProfileId,
} from "../repositories/profilesRepo.js";

// ✅ Shared category flow
import {
  loadCategoriesForChoice,
  buildCategoryChoiceMessage,
  parseMultiIndexInputRequired,
  mapIndexesToCategoryIds,
} from "../utils/categoryFlow.js";

// =====================
// Helpers
// =====================
const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const fmtKV = (label, value) => {
  const v = value === null || value === undefined || value === "" ? "-" : String(value);
  return `• <b>${escapeHtml(label)}:</b> ${escapeHtml(v)}`;
};

const cleanHandle = (username) => {
  const u = String(username || "").trim().replace(/^@/, "");
  return u ? `@${u}` : "-";
};

const normalizeStatus = (value) => String(value || "").trim().toLowerCase();
const normalizeClassId = (value) => String(value || "").trim().toLowerCase();

function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "Rp 0";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateTime(value) {
  if (!value) return "-";

  const raw = String(value).trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, yyyy, mm, dd, hh = "00", mi = "00"] = m;
    return `${dd}-${mm}-${yyyy} ${hh}:${mi}`;
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function makeSqlDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function addHours(baseDate, hours) {
  const d = new Date(baseDate);
  d.setHours(d.getHours() + Number(hours || 0));
  return d;
}

function randomInt(min, max) {
  const lo = Math.min(Number(min || 0), Number(max || 0));
  const hi = Math.max(Number(min || 0), Number(max || 0));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function makeTicketCode(telegramId) {
  const suffix = String(telegramId || "").slice(-4) || "0000";
  const stamp = Date.now().toString().slice(-8);
  return `TMN-${suffix}-${stamp}`;
}

async function getLatestPaymentTicket(env, partnerId) {
  const row = await env.DB.prepare(`
    SELECT *
    FROM payment_tickets
    WHERE partner_id = ?
    ORDER BY datetime(created_at) DESC, datetime(updated_at) DESC, id DESC
    LIMIT 1
  `)
    .bind(String(partnerId))
    .first();

  return row ?? null;
}

async function getPaymentExpiryHours(env) {
  const raw = await getSetting(env, "pp_ticket_expiry_hours");
  const hours = Number(raw || 24);
  return Number.isFinite(hours) && hours > 0 ? hours : 24;
}

async function getUniqueCodeRange(env) {
  const rawMin = await getSetting(env, "pp_unique_min");
  const rawMax = await getSetting(env, "pp_unique_max");

  const min = Number(rawMin || 500);
  const max = Number(rawMax || 999);

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 500, max: 999 };
  }

  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
  };
}

async function resolveBasePriceByClass(env, classId) {
  const keyCandidates = [
    `payment_price_${classId}_1m`,
    `payment_price_${classId}`,
    `payment_${classId}_1m`,
    `payment_${classId}`,
    `pp_price_${classId}_1m`,
    `pp_price_${classId}`,
    `${classId}_price_1m`,
    `${classId}_price`,
  ];

  for (const key of keyCandidates) {
    const raw = await getSetting(env, key);
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) {
      return { amount: num, key };
    }
  }

  return { amount: 0, key: null };
}

function buildPaymentTicketSummary(ticket) {
  if (!ticket) {
    return "Belum ada tiket payment.";
  }

  const classLabel = fmtClassId(ticket.class_id);
  const lines = [
    "💳 <b>Payment Ticket</b>",
    "",
    `Kode Tiket: <code>${escapeHtml(String(ticket.ticket_code || "-"))}</code>`,
    `Status: <b>${escapeHtml(String(ticket.status || "-"))}</b>`,
    `Class ID: <b>${escapeHtml(classLabel)}</b>`,
    `Durasi: <b>${escapeHtml(String(ticket.duration_months || "-"))}</b> bulan`,
    `Nominal: <b>${escapeHtml(formatMoney(ticket.amount_final))}</b>`,
    `Expired: <b>${escapeHtml(formatDateTime(ticket.expires_at))}</b>`,
  ];

  return lines.join("\n");
}

function buildPaymentInstructionMessage(ticket) {
  const classLabel = fmtClassId(ticket?.class_id);
  const lines = [
    "💳 <b>Tiket Payment Berhasil Dibuat</b>",
    "",
    `Kode Tiket: <code>${escapeHtml(String(ticket?.ticket_code || "-"))}</code>`,
    `Class ID: <b>${escapeHtml(classLabel)}</b>`,
    `Durasi: <b>${escapeHtml(String(ticket?.duration_months || "-"))}</b> bulan`,
    `Total Bayar: <b>${escapeHtml(formatMoney(ticket?.amount_final))}</b>`,
    `Batas Waktu: <b>${escapeHtml(formatDateTime(ticket?.expires_at))}</b>`,
    "",
    "Silakan transfer sesuai nominal di atas.",
    "Setelah transfer, kirim <b>foto bukti transfer</b> langsung di chat ini.",
    "",
    "Catatan:",
    "• 1 partner hanya boleh punya 1 tiket aktif",
    "• upload bukti hanya saat status waiting_payment",
    "• setelah upload, status jadi waiting_confirmation",
    "• jika tiket expired dan transfer sudah terlanjur dilakukan, hubungi Superadmin untuk manual check",
  ];

  return lines.join("\n");
}

function buildPaymentUploadInfoMessage(ticket = null) {
  const lines = [
    "📤 <b>Upload Bukti Payment</b>",
    "",
    "Kirim <b>foto bukti transfer</b> langsung di chat ini.",
    "Bukan file, bukan dokumen.",
    "",
    "Rule:",
    "• upload bukti hanya saat tiket status <b>waiting_payment</b>",
    "• setelah upload, tiket jadi <b>waiting_confirmation</b>",
    "• kalau tiket sudah expired, sistem tidak proses otomatis",
  ];

  if (ticket) {
    lines.push("");
    lines.push(`Tiket aktif: <code>${escapeHtml(String(ticket.ticket_code || "-"))}</code>`);
    lines.push(`Status: <b>${escapeHtml(String(ticket.status || "-"))}</b>`);
    lines.push(`Nominal: <b>${escapeHtml(formatMoney(ticket.amount_final))}</b>`);
    lines.push(`Expired: <b>${escapeHtml(formatDateTime(ticket.expires_at))}</b>`);
  }

  return lines.join("\n");
}

// NOTE: update profile sekarang boleh untuk semua partner yang sudah terdaftar (status apapun)

const getPhotoFileId = (update) => {
  const msg = update?.message;
  return Array.isArray(msg?.photo) && msg.photo.length ? msg.photo[msg.photo.length - 1]?.file_id ?? null : null;
};

const sendHtml = (env, chatId, text, extra = {}) =>
  sendMessage(env, chatId, text, { parse_mode: "HTML", disable_web_page_preview: true, ...extra });

// =====================
// Keyboards
// =====================

// ✅ MENU UTAMA (selalu tampil)
export const buildTeManMenuKeyboard = () => ({
  inline_keyboard: [[{ text: "📋 Menu TeMan", callback_data: "teman:menu" }]],
});

// ✅ MENU SELF (kalau sudah terdaftar)
export function buildSelfMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👤 Lihat Profile", callback_data: "self:view" }],
      [{ text: "📝 Update Profile", callback_data: "self:update" }],
      [{ text: "💳 Payment", callback_data: "self:payment" }],
    ],
  };
}

function buildPaymentMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🧾 Ajukan Tiket Payment", callback_data: "self:payment:create" }],
      [{ text: "📄 Status Tiket Payment", callback_data: "self:payment:status" }],
      [{ text: "📤 Upload Bukti Transfer", callback_data: "self:payment:upload_info" }],
      [{ text: "⬅️ Kembali", callback_data: "teman:menu" }],
      [{ text: "📋 Menu TeMan", callback_data: "teman:menu" }],
    ],
  };
}

// UPDATE MENU
const buildUpdateKeyboard = () => ({
  inline_keyboard: [
    [{ text: "✏️ Ubah Nickname", callback_data: "self:edit:nickname" }],
    [{ text: "📞 Ubah No. Whatsapp", callback_data: "self:edit:no_whatsapp" }],
    [{ text: "📍 Ubah Kecamatan", callback_data: "self:edit:kecamatan" }],
    [{ text: "🏙️ Ubah Kota", callback_data: "self:edit:kota" }],
    [{ text: "🗂️ Ubah Kategori", callback_data: "self:edit:kategori" }],
    [{ text: "📸 Ubah Foto Closeup", callback_data: "self:edit:closeup" }],
    [{ text: "⬅️ Kembali", callback_data: "teman:menu" }],
    [{ text: "📋 Menu TeMan", callback_data: "teman:menu" }],
  ],
});

const EDIT_TEXT_FIELDS = {
  nickname: { field: "nickname", prompt: "Ketik <b>nickname</b> baru:" },
  no_whatsapp: { field: "no_whatsapp", prompt: "Ketik <b>No. Whatsapp</b> baru:" },
  kecamatan: { field: "kecamatan", prompt: "Ketik <b>kecamatan</b> baru:" },
  kota: { field: "kota", prompt: "Ketik <b>kota</b> baru:" },
};

// =====================
// Messages
// =====================
export function buildSelfMenuMessage(profile) {
  const nick = profile?.nickname
    ? String(profile.nickname)
    : profile?.nama_lengkap
    ? String(profile.nama_lengkap)
    : "Partner";
  const status = profile?.status ? String(profile.status) : "-";
  return `Halo ${escapeHtml(nick)} !\nStatus Partner kamu saat ini <b>${escapeHtml(status)}</b>, apa yang bisa aku bantu ?`;
}

// buang kalimat ajakan /mulai dari welcome setting (biar gak dobel)
function sanitizeWelcome(text) {
  const raw = String(text || "").trim();
  if (!raw) return raw;

  const lines = raw
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => !/\/mulai/i.test(l));

  const joined = lines.join("\n").replace(/langsung aja ketik\s+\*?\/?mulai\*?.*$/gim, "").trim();

  return joined || raw;
}

const buildTeManWelcome = async (env) => {
  const fromSetting = await getSetting(env, "welcome_partner");
  const fallback = "👋 Selamat datang Partner Mandiri\n\nKlik <b>Menu TeMan</b> di bawah ya.";
  return sanitizeWelcome(fromSetting || fallback);
};

// =====================
// Profile view
// =====================
async function sendSelfProfile(env, chatId, telegramId) {
  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile)
    return void (await sendHtml(env, chatId, "Data partner tidak ditemukan.", { reply_markup: buildTeManMenuKeyboard() }));

  const categories = profile.id ? await listCategoryKodesByProfileId(env, profile.id) : [];
  const kategoriText = categories.length ? categories.join(", ") : "-";

  const textSummary =
    "🧾 <b>PROFILE</b>\n" +
    fmtKV("Telegram ID", profile.telegram_id) +
    "\n" +
    fmtKV("Username", cleanHandle(profile.username)) +
    "\n" +
    fmtKV("Nama Lengkap", profile.nama_lengkap) +
    "\n" +
    fmtKV("Nickname", profile.nickname) +
    "\n" +
    fmtKV("NIK", profile.nik) +
    "\n" +
    fmtKV("Kategori", kategoriText) +
    "\n" +
    fmtKV("No. Whatsapp", profile.no_whatsapp) +
    "\n" +
    fmtKV("Kecamatan", profile.kecamatan) +
    "\n" +
    fmtKV("Kota", profile.kota) +
    "\n" +
    fmtKV("Status", profile.status);

  await sendLongMessage(env, chatId, textSummary, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: buildTeManMenuKeyboard(),
  });

  if (profile.foto_closeup_file_id) {
    await sendPhoto(env, chatId, profile.foto_closeup_file_id, "📸 <b>Foto Closeup</b>", {
      parse_mode: "HTML",
      reply_markup: buildTeManMenuKeyboard(),
    });
  }
}

async function sendPaymentMenu(env, chatId, telegramId) {
  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile) {
    await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  const latestTicket = await getLatestPaymentTicket(env, telegramId);
  const lines = [
    "💳 <b>Payment Menu</b>",
    "",
    `Status Partner: <b>${escapeHtml(String(profile.status || "-"))}</b>`,
    `Class ID: <b>${escapeHtml(fmtClassId(profile.class_id))}</b>`,
  ];

  if (latestTicket) {
    lines.push(`Tiket Terakhir: <code>${escapeHtml(String(latestTicket.ticket_code || "-"))}</code>`);
    lines.push(`Status Tiket: <b>${escapeHtml(String(latestTicket.status || "-"))}</b>`);
  } else {
    lines.push("Tiket Terakhir: <b>-</b>");
  }

  await sendMessage(env, chatId, lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: buildPaymentMenuKeyboard(),
    disable_web_page_preview: true,
  });
}

async function createPartnerPaymentTicket(env, chatId, telegramId) {
  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile) {
    await sendHtml(env, chatId, "Data partner tidak ditemukan.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  const partnerStatus = normalizeStatus(profile.status);
  if (partnerStatus === "pending_approval") {
    await sendHtml(
      env,
      chatId,
      "⚠️ Akun kamu masih <b>pending_approval</b>.\nTiket payment baru bisa diajukan setelah registrasi disetujui.",
      { reply_markup: buildPaymentMenuKeyboard() }
    );
    return;
  }

  const paymentEnabled = (await getSetting(env, "payment_manual_enabled")) ?? "1";
  if (String(paymentEnabled) === "0") {
    await sendHtml(
      env,
      chatId,
      "⚠️ Payment manual sedang dinonaktifkan oleh Superadmin.",
      { reply_markup: buildPaymentMenuKeyboard() }
    );
    return;
  }

  const openTicket = await getOpenPaymentTicketByPartnerId(env, telegramId);
  if (openTicket) {
    await sendMessage(
      env,
      chatId,
      buildPaymentTicketSummary(openTicket),
      {
        parse_mode: "HTML",
        reply_markup: buildPaymentMenuKeyboard(),
        disable_web_page_preview: true,
      }
    );
    return;
  }

  const classId = normalizeClassId(profile.class_id || "bronze");
  const price = await resolveBasePriceByClass(env, classId);
  if (!Number(price.amount)) {
    await sendHtml(
      env,
      chatId,
      `⚠️ Harga untuk class <b>${escapeHtml(fmtClassId(classId))}</b> belum diset di settings.`,
      { reply_markup: buildPaymentMenuKeyboard() }
    );
    return;
  }

  const uniqueRange = await getUniqueCodeRange(env);
  const uniqueCode = randomInt(uniqueRange.min, uniqueRange.max);
  const amountBase = Number(price.amount);
  const amountFinal = amountBase + uniqueCode;

  const now = new Date();
  const expiryHours = await getPaymentExpiryHours(env);
  const expiresAt = makeSqlDate(addHours(now, expiryHours));

  const created = await createPaymentTicket(env, {
    ticketCode: makeTicketCode(telegramId),
    partnerId: telegramId,
    subscriptionId: null,
    classId,
    durationMonths: 1,
    amountBase,
    uniqueCode,
    amountFinal,
    currency: "IDR",
    provider: "manual",
    status: "waiting_payment",
    expiresAt,
    pricingSnapshotJson: JSON.stringify({
      class_id: classId,
      class_label: fmtClassId(classId),
      duration_months: 1,
      amount_base: amountBase,
      unique_code: uniqueCode,
      amount_final: amountFinal,
      price_setting_key: price.key,
    }),
    metadataJson: JSON.stringify({
      source: "partner_self_menu",
    }),
  });

  await sendMessage(
    env,
    chatId,
    buildPaymentInstructionMessage(created),
    {
      parse_mode: "HTML",
      reply_markup: buildPaymentMenuKeyboard(),
      disable_web_page_preview: true,
    }
  );
}

async function sendPaymentTicketStatus(env, chatId, telegramId) {
  const openTicket = await getOpenPaymentTicketByPartnerId(env, telegramId);
  if (openTicket) {
    await sendMessage(env, chatId, buildPaymentTicketSummary(openTicket), {
      parse_mode: "HTML",
      reply_markup: buildPaymentMenuKeyboard(),
      disable_web_page_preview: true,
    });
    return;
  }

  const latestTicket = await getLatestPaymentTicket(env, telegramId);
  if (!latestTicket) {
    await sendHtml(env, chatId, "Belum ada tiket payment.", {
      reply_markup: buildPaymentMenuKeyboard(),
    });
    return;
  }

  await sendMessage(env, chatId, buildPaymentTicketSummary(latestTicket), {
    parse_mode: "HTML",
    reply_markup: buildPaymentMenuKeyboard(),
    disable_web_page_preview: true,
  });
}

// =====================
// Edit flow helpers
// =====================
async function askTextInput(env, chatId, STATE_KEY, field, prompt) {
  await saveSession(env, STATE_KEY, { mode: "edit_profile", step: "await_text", field });
  await sendHtml(env, chatId, prompt, { reply_markup: buildTeManMenuKeyboard() });
}

async function askCloseupPhoto(env, chatId, STATE_KEY) {
  await saveSession(env, STATE_KEY, { mode: "edit_profile", step: "await_closeup_photo" });
  await sendHtml(env, chatId, "Silakan kirim <b>foto CLOSEUP</b> terbaru (sebagai foto, bukan file).", {
    reply_markup: buildTeManMenuKeyboard(),
  });
}

async function askKategori(env, chatId, STATE_KEY) {
  const cats = await loadCategoriesForChoice(env);

  if (!cats.length) {
    await saveSession(env, STATE_KEY, { mode: "edit_profile", step: "await_kategori_select", data: { _category_list: [] } });
    await sendHtml(env, chatId, "⚠️ Belum ada kategori yang tersedia. Hubungi admin ya.", {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return;
  }

  await saveSession(env, STATE_KEY, {
    mode: "edit_profile",
    step: "await_kategori_select",
    data: { _category_list: cats },
  });

  await sendMessage(env, chatId, buildCategoryChoiceMessage(cats), {
    parse_mode: "Markdown",
    reply_markup: buildTeManMenuKeyboard(),
  });
}

async function stopEdit(env, chatId, STATE_KEY, msg) {
  await clearSession(env, STATE_KEY);
  await sendHtml(env, chatId, msg, { reply_markup: buildTeManMenuKeyboard() });
}

async function sendSelfMenu(env, chatId, telegramId) {
  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile)
    return void (await sendHtml(env, chatId, "Data partner tidak ditemukan.", { reply_markup: buildTeManMenuKeyboard() }));

  await sendMessage(env, chatId, buildSelfMenuMessage(profile), {
    parse_mode: "HTML",
    reply_markup: buildSelfMenuKeyboard(),
    disable_web_page_preview: true,
  });
}

// =====================
// Commands
// =====================
export async function handleUserCommand({ env, chatId, telegramId, role, text }) {
  if (text === "/me") {
    await sendMessage(env, chatId, `🧾 DEBUG ROLE\n\ntelegramId: ${telegramId}\nrole: ${role ?? "-"}`, {
      reply_markup: buildTeManMenuKeyboard(),
    });
    return true;
  }

  if (text === "/help") {
    await sendHtml(
      env,
      chatId,
      "ℹ️ <b>Help</b>\n\n• <code>/start</code> — Menu\n• <code>/cmd</code> — Menu",
      { reply_markup: buildTeManMenuKeyboard() }
    );
    return true;
  }

  if (text === "/start" || text === "/cmd") {
    if (isAdminRole(role)) {
      await sendMessage(env, chatId, "Halo Officer, ketik /help untuk daftar command.");
      return true;
    }

    const welcome = await buildTeManWelcome(env);
    await sendMessage(env, chatId, welcome, {
      parse_mode: "HTML",
      reply_markup: buildTeManMenuKeyboard(),
      disable_web_page_preview: true,
    });
    return true;
  }

  if (text === "/mulai") {
    if (isAdminRole(role)) {
      await sendMessage(env, chatId, "Halo Officer, ketik /help untuk daftar command.");
      return true;
    }
    await sendMessage(env, chatId, "Klik <b>Menu TeMan</b> untuk mulai ya.", {
      parse_mode: "HTML",
      reply_markup: buildTeManMenuKeyboard(),
    });
    return true;
  }

  return false;
}

// =====================
// Callback handler
// =====================
export async function handleSelfInlineCallback(update, env) {
  const data = update?.callback_query?.data || "";
  const msg = update?.callback_query?.message;
  const chatId = msg?.chat?.id;
  const telegramId = String(update?.callback_query?.from?.id || "");
  const STATE_KEY = `state:${telegramId}`;
  if (!chatId || !telegramId) return true;

  if (data.startsWith("teman:")) {
    if (data === "teman:menu") {
      const existing = await getProfileByTelegramId(env, telegramId).catch(() => null);

      if (existing?.telegram_id) {
        await sendSelfMenu(env, chatId, telegramId);
        return true;
      }

      await saveSession(env, STATE_KEY, { step: "input_nama", data: {} });
      await sendMessage(env, chatId, "Masukkan Nama Lengkap:");
      return true;
    }

    return true;
  }

  if (!data.startsWith("self:")) return false;

  const loadProfile = async () => getProfileFullByTelegramId(env, telegramId);

  const ensureRegistered = async () => {
    const p = await loadProfile();
    if (!p)
      return void (await sendHtml(env, chatId, "Data partner tidak ditemukan.", { reply_markup: buildTeManMenuKeyboard() })), null;
    return p;
  };

  if (data === "self:view") return (await sendSelfProfile(env, chatId, telegramId)), true;

  if (data === "self:update") {
    const p = await ensureRegistered();
    if (!p) return true;

    await sendMessage(env, chatId, "Pilih data yang mau kamu update:", {
      parse_mode: "HTML",
      reply_markup: buildUpdateKeyboard(),
      disable_web_page_preview: true,
    });
    return true;
  }

  if (data === "self:payment") {
    const p = await ensureRegistered();
    if (!p) return true;

    await sendPaymentMenu(env, chatId, telegramId);
    return true;
  }

  if (data === "self:payment:create") {
    const p = await ensureRegistered();
    if (!p) return true;

    await createPartnerPaymentTicket(env, chatId, telegramId);
    return true;
  }

  if (data === "self:payment:status") {
    const p = await ensureRegistered();
    if (!p) return true;

    await sendPaymentTicketStatus(env, chatId, telegramId);
    return true;
  }

  if (data === "self:payment:upload_info") {
    const p = await ensureRegistered();
    if (!p) return true;

    const openTicket = await getOpenPaymentTicketByPartnerId(env, telegramId);
    await sendMessage(env, chatId, buildPaymentUploadInfoMessage(openTicket), {
      parse_mode: "HTML",
      reply_markup: buildPaymentMenuKeyboard(),
      disable_web_page_preview: true,
    });
    return true;
  }

  if (data.startsWith("self:edit:")) {
    const key = data.split(":")[2] || "";
    const p = await ensureRegistered();
    if (!p) return true;

    if (EDIT_TEXT_FIELDS[key]) {
      await askTextInput(env, chatId, STATE_KEY, EDIT_TEXT_FIELDS[key].field, EDIT_TEXT_FIELDS[key].prompt);
      return true;
    }

    if (key === "kategori") {
      await askKategori(env, chatId, STATE_KEY);
      return true;
    }

    if (key === "closeup") {
      await askCloseupPhoto(env, chatId, STATE_KEY);
      return true;
    }

    await sendHtml(env, chatId, "Pilihan tidak valid.", { reply_markup: buildTeManMenuKeyboard() });
    return true;
  }

  return true;
}

// =====================
// Text/Photo flow untuk update profile
// =====================
export async function handleUserEditFlow({ env, chatId, telegramId, text, session, STATE_KEY, update }) {
  const profile = await getProfileFullByTelegramId(env, telegramId);
  if (!profile) return void (await stopEdit(env, chatId, STATE_KEY, "Data partner tidak ditemukan."));

  const photoFileId = getPhotoFileId(update);

  if (session?.step === "await_text") {
    const field = session?.field;
    const value = String(text || "").trim();

    if (!value)
      return void (await sendHtml(env, chatId, "⚠️ Input kosong. Coba lagi ya.", { reply_markup: buildTeManMenuKeyboard() }));
    if (!["nickname", "no_whatsapp", "kecamatan", "kota"].includes(field))
      return void (await stopEdit(env, chatId, STATE_KEY, "⚠️ Field tidak valid."));

    await updateEditableProfileFields(env, telegramId, { [field]: value });

    await clearSession(env, STATE_KEY);
    await sendHtml(env, chatId, "✅ Data berhasil diupdate.", { reply_markup: buildTeManMenuKeyboard() });

    return;
  }

  if (session?.step === "await_kategori_select") {
    const categories = Array.isArray(session?.data?._category_list) ? session.data._category_list : [];

    if (!categories.length) {
      await stopEdit(env, chatId, STATE_KEY, "⚠️ Belum ada kategori yang tersedia. Hubungi admin ya.");
      return;
    }

    const parsed = parseMultiIndexInputRequired(text, categories.length);
    if (!parsed.ok) {
      await sendMessage(env, chatId, `Input tidak valid. Pilih minimal 1.\nKetik nomor dipisah koma.\nContoh: 1,3`, {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return;
    }

    const categoryIds = mapIndexesToCategoryIds(parsed.indexes, categories);
    if (!categoryIds.length) {
      await sendMessage(env, chatId, "Pilihan kategori tidak valid. Coba lagi ya.", {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return;
    }

    const res = await setProfileCategoriesByProfileId(env, profile.id, categoryIds);
    if (!res?.ok) {
      await sendHtml(env, chatId, "⚠️ Gagal update kategori. Coba lagi ya.", {
        reply_markup: buildTeManMenuKeyboard(),
      });
      return;
    }

    await clearSession(env, STATE_KEY);
    await sendHtml(env, chatId, "✅ Kategori berhasil diupdate.", { reply_markup: buildTeManMenuKeyboard() });
    return;
  }

  if (session?.step === "await_closeup_photo") {
    if (!photoFileId)
      return void (
        await sendHtml(env, chatId, "⚠️ Belum ada foto. Kirim foto closeup ya (bukan file).", { reply_markup: buildTeManMenuKeyboard() })
      );

    await updateCloseupPhoto(env, telegramId, photoFileId);

    await clearSession(env, STATE_KEY);
    await sendHtml(env, chatId, "✅ Foto closeup berhasil diupdate.", { reply_markup: buildTeManMenuKeyboard() });
    return;
  }

  await stopEdit(env, chatId, STATE_KEY, "⚠️ Sesi update berakhir. Klik Menu TeMan untuk lanjut.");
}
