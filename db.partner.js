// db.partner.js
//
// Repo-derived schema map untuk partner DB TeMan Official.
// BUKAN migrator runtime.
// Tujuan:
// - jadi peta cepat tabel/kolom/relasi
// - mempersingkat kerja query & migration
// - jadi referensi bersama saat nambah fitur
//
// Cara pakai:
// import {
//   PARTNER_DB_SCHEMA,
//   PARTNER_DB_TABLE_NAMES,
//   listPartnerDbTables,
//   getPartnerDbTable,
//   listPartnerDbSettingsKeys,
// } from "./db.partner.js";

const REPO_SHA_REF = "main";

function deepFreeze(value) {
  if (!value || typeof value !== "object") return value;
  Object.freeze(value);

  for (const key of Object.keys(value)) {
    const child = value[key];
    if (child && typeof child === "object" && !Object.isFrozen(child)) {
      deepFreeze(child);
    }
  }

  return value;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

const PARTNER_DB_SCHEMA = deepFreeze({
  meta: {
    name: "temanofficial-partner-db",
    version: 2,
    kind: "repo-derived-schema-map",
    source_ref: REPO_SHA_REF,
    generated_from: [
      "repositories/settingsRepo.js",
      "repositories/catalogTargetsRepo.js",
      "routes/telegram.guard.js",
      "repositories/adminsRepo.js",
      "repositories/profiles.readRepo.js",
      "repositories/profiles.editRepo.js",
      "repositories/profiles.statusRepo.js",
      "repositories/profiles.categoryRepo.js",
      "repositories/partnerSubscriptionsRepo.js",
      "repositories/partnerSubscriptions.readRepo.js",
      "repositories/partnerSubscriptions.writeRepo.js",
      "repositories/partnerSubscriptions.reminderRepo.js",
      "repositories/paymentTicketsRepo.js",
      "repositories/adminInviteTokensRepo.js",
      "repositories/bookingsRepo.js",
      "repositories/bookingEventsRepo.js",
      "routes/callbacks/catalog.js",
      "routes/callbacks/booking.js",
      "routes/telegram.flow.booking.js",
      "migrations/000_booking_safety_v1.sql",
    ],
    notes: [
      "Ini peta schema yang diturunkan dari query-layer repo, bukan hasil introspeksi langsung dari D1.",
      "Kolom yang ditandai legacy/compat berarti terlihat dipakai baca, tapi belum tentu jalur utama saat ini.",
      "Kalau nanti ada migration baru, file ini ikut diupdate supaya tetap jadi source of truth kerja bareng.",
      "Versi ini sudah mencakup domain Safety Booking yang dipisahkan dari premium/payment lama.",
    ],
  },

  tables: {
    settings: {
      type: "kv",
      primary_key: ["key"],
      columns: {
        key: {
          type: "TEXT",
          nullable: false,
          role: "primary_key",
        },
        value: {
          type: "TEXT",
          nullable: true,
        },
      },
      known_keys: [
        {
          key: "catalog_targets",
          shape: "JSON array",
          owner: "catalog",
          notes: [
            "Menyimpan target katalog aktif/nonaktif per chat_id + topic_id.",
            "Shape item: chat_id, chat_title, topic_id, is_active, added_by, added_at, updated_at.",
          ],
        },
        {
          key: "feature_scope_mode",
          shape: "TEXT",
          owner: "telegram.guard",
          notes: ["Mode scope group/topic bot."],
        },
        {
          key: "allowed_group_chat_ids",
          shape: "JSON array atau CSV/text list",
          owner: "telegram.guard",
          notes: ["Whitelist chat group untuk mode selected_scopes."],
        },
        {
          key: "allowed_group_topic_keys",
          shape: "JSON array atau CSV/text list",
          owner: "telegram.guard",
          notes: ["Whitelist topic key dengan format <chat_id>:<thread_id>."],
        },
        {
          key: "allowed_bot_usernames",
          shape: "JSON array atau CSV/text list",
          owner: "telegram.guard",
          notes: ["Whitelist username bot yang diizinkan untuk scope tertentu."],
        },
        {
          key: "welcome_partner",
          shape: "TEXT",
          owner: "welcome",
          notes: ["Teks welcome partner di private chat."],
        },
      ],
      repository_usage: [
        "repositories/settingsRepo.js",
        "repositories/catalogTargetsRepo.js",
        "routes/telegram.guard.js",
      ],
    },

    admins: {
      type: "entity",
      primary_key: ["telegram_id"],
      columns: {
        telegram_id: { type: "TEXT", nullable: false, role: "primary_key" },
        username: { type: "TEXT", nullable: true },
        nama: { type: "TEXT", nullable: true },
        kota: { type: "TEXT", nullable: true },
        role: {
          type: "TEXT",
          nullable: true,
          known_values: ["owner", "superadmin", "admin"],
        },
        status: {
          type: "TEXT",
          nullable: true,
          known_values: ["active", "inactive"],
        },
        dibuat_pada: { type: "TEXT", nullable: true },
      },
      repository_usage: ["repositories/adminsRepo.js"],
      business_notes: [
        "Role runtime di-normalize menjadi owner/superadmin/admin/user.",
        "Insert/update repo saat ini hanya mengizinkan writable role: admin dan superadmin.",
        "Owner tetap dikenali di runtime, kemungkinan seed/manual data.",
      ],
    },

    profiles: {
      type: "entity",
      primary_key: ["id"],
      unique_candidates: ["telegram_id"],
      columns: {
        id: { type: "TEXT", nullable: false, role: "primary_key" },
        telegram_id: { type: "TEXT", nullable: false, role: "unique_candidate" },

        nama_lengkap: { type: "TEXT", nullable: true },
        nik: { type: "TEXT", nullable: true },
        nickname: { type: "TEXT", nullable: true },
        username: { type: "TEXT", nullable: true },

        no_whatsapp: { type: "TEXT", nullable: true },
        kecamatan: { type: "TEXT", nullable: true },
        kota: { type: "TEXT", nullable: true },
        channel_url: { type: "TEXT", nullable: true },

        foto_ktp_file_id: { type: "TEXT", nullable: true },
        foto_closeup_file_id: { type: "TEXT", nullable: true },
        foto_fullbody_file_id: { type: "TEXT", nullable: true },

        start_price: { type: "NUMERIC", nullable: true },
        class_id: {
          type: "TEXT",
          nullable: true,
          known_values: ["bronze", "gold", "platinum"],
        },

        status: {
          type: "TEXT",
          nullable: true,
          known_values: ["pending_approval", "approved", "suspended"],
        },
        is_catalog_visible: { type: "INTEGER", nullable: true, notes: ["0/1"] },

        verificator_admin_id: { type: "TEXT", nullable: true },
        approved_at: { type: "TEXT", nullable: true },
        approved_by: { type: "TEXT", nullable: true },

        status_reason: { type: "TEXT", nullable: true },
        status_changed_at: { type: "TEXT", nullable: true },
        status_changed_by: { type: "TEXT", nullable: true },
        admin_note: { type: "TEXT", nullable: true },

        is_manual_suspended: { type: "INTEGER", nullable: true, notes: ["0/1"] },
        suspended_at: { type: "TEXT", nullable: true },
        suspended_by: { type: "TEXT", nullable: true },
        suspend_reason: { type: "TEXT", nullable: true },

        dibuat_pada: { type: "TEXT", nullable: true },
        diupdate_pada: { type: "TEXT", nullable: true },

        subscription_status: {
          type: "TEXT",
          nullable: true,
          status: "legacy_or_compat",
        },
        subscription_end_at: {
          type: "TEXT",
          nullable: true,
          status: "legacy_or_compat",
        },
      },
      repository_usage: [
        "repositories/profiles.readRepo.js",
        "repositories/profiles.editRepo.js",
        "repositories/profiles.statusRepo.js",
        "repositories/profiles.categoryRepo.js",
      ],
      business_notes: [
        "Tabel partner utama.",
        "Visibilitas katalog partner dikontrol lewat is_catalog_visible.",
        "Akses premium aktif sekarang dominan dibaca dari partner_subscriptions, bukan langsung dari profiles.",
        "Di entry Safety Booking, keberadaan telegram_id di profiles dipakai untuk membedakan partner-side vs non-partner-side.",
      ],
    },

    categories: {
      type: "master",
      primary_key: ["id"],
      columns: {
        id: { type: "TEXT", nullable: false, role: "primary_key" },
        kode: { type: "TEXT", nullable: true, role: "business_key" },
      },
      repository_usage: ["repositories/profiles.categoryRepo.js"],
      business_notes: ["Master kategori partner."],
    },

    profile_categories: {
      type: "junction",
      primary_key: ["profile_id", "category_id"],
      columns: {
        profile_id: { type: "TEXT", nullable: false },
        category_id: { type: "TEXT", nullable: false },
      },
      repository_usage: ["repositories/profiles.categoryRepo.js"],
      business_notes: ["Pivot many-to-many antara profiles dan categories."],
    },

    partner_subscriptions: {
      type: "entity",
      primary_key: ["id"],
      columns: {
        id: { type: "TEXT", nullable: false, role: "primary_key" },
        partner_id: { type: "TEXT", nullable: false },
        payment_ticket_id: { type: "INTEGER", nullable: true },

        class_id: {
          type: "TEXT",
          nullable: true,
          known_values: ["bronze", "gold", "platinum"],
        },
        duration_months: { type: "INTEGER", nullable: true },

        status: {
          type: "TEXT",
          nullable: true,
          known_values: ["active", "cancelled", "expired"],
        },

        start_at: { type: "TEXT", nullable: true },
        end_at: { type: "TEXT", nullable: true },

        activated_at: { type: "TEXT", nullable: true },
        expired_at: { type: "TEXT", nullable: true },

        cancelled_at: { type: "TEXT", nullable: true },
        cancelled_by: { type: "TEXT", nullable: true },
        cancel_reason: { type: "TEXT", nullable: true },

        reminder_h3d_sent_at: { type: "TEXT", nullable: true },
        reminder_h2d_sent_at: { type: "TEXT", nullable: true },
        reminder_h1d_sent_at: { type: "TEXT", nullable: true },
        reminder_h3h_sent_at: { type: "TEXT", nullable: true },

        source_type: { type: "TEXT", nullable: true },
        source_ref_id: { type: "TEXT", nullable: true },

        notes: { type: "TEXT", nullable: true },
        metadata_json: { type: "TEXT", nullable: true },

        created_at: { type: "TEXT", nullable: true },
        updated_at: { type: "TEXT", nullable: true },
      },
      repository_usage: [
        "repositories/partnerSubscriptions.readRepo.js",
        "repositories/partnerSubscriptions.writeRepo.js",
        "repositories/partnerSubscriptions.reminderRepo.js",
      ],
      business_notes: [
        "Jalur utama premium partner.",
        "Partner di repo sekarang di-bind menggunakan partner_id = telegram_id.",
        "Reminder expiry disimpan per kolom marker.",
      ],
    },

    payment_tickets: {
      type: "entity",
      primary_key: ["id"],
      unique_candidates: ["ticket_code"],
      columns: {
        id: { type: "INTEGER", nullable: false, role: "primary_key" },
        ticket_code: { type: "TEXT", nullable: false, role: "unique_candidate" },

        partner_id: { type: "TEXT", nullable: false },
        subscription_id: { type: "TEXT", nullable: true },

        class_id: {
          type: "TEXT",
          nullable: true,
          known_values: ["bronze", "gold", "platinum"],
        },
        duration_months: { type: "INTEGER", nullable: true },

        amount_base: { type: "NUMERIC", nullable: true },
        unique_code: { type: "NUMERIC", nullable: true },
        amount_final: { type: "NUMERIC", nullable: true },
        currency: { type: "TEXT", nullable: true },
        provider: { type: "TEXT", nullable: true },

        status: {
          type: "TEXT",
          nullable: true,
          known_values: [
            "waiting_payment",
            "waiting_confirmation",
            "confirmed",
            "rejected",
            "expired",
          ],
        },

        requested_at: { type: "TEXT", nullable: true },
        expires_at: { type: "TEXT", nullable: true },

        pricing_snapshot_json: { type: "TEXT", nullable: true },
        metadata_json: { type: "TEXT", nullable: true },

        proof_asset_id: { type: "TEXT", nullable: true },
        proof_asset_url: { type: "TEXT", nullable: true },
        proof_caption: { type: "TEXT", nullable: true },

        payer_name: { type: "TEXT", nullable: true },
        payer_notes: { type: "TEXT", nullable: true },

        proof_uploaded_at: { type: "TEXT", nullable: true },

        confirmed_at: { type: "TEXT", nullable: true },
        confirmed_by: { type: "TEXT", nullable: true },

        rejected_at: { type: "TEXT", nullable: true },
        rejected_by: { type: "TEXT", nullable: true },
        rejection_reason: { type: "TEXT", nullable: true },

        created_at: { type: "TEXT", nullable: true },
        updated_at: { type: "TEXT", nullable: true },
      },
      repository_usage: ["repositories/paymentTicketsRepo.js"],
      business_notes: [
        "Tiket pembayaran manual partner.",
        "Proof upload menggeser status ke waiting_confirmation.",
        "Domain ini dipertahankan terpisah dari booking_dp_tickets.",
      ],
    },

    admin_invite_tokens: {
      type: "entity",
      primary_key: ["id"],
      unique_candidates: ["token"],
      columns: {
        id: { type: "INTEGER", nullable: false, role: "primary_key" },
        token: { type: "TEXT", nullable: false, role: "unique_candidate" },
        role: {
          type: "TEXT",
          nullable: true,
          known_values: ["admin", "superadmin"],
        },
        status: {
          type: "TEXT",
          nullable: true,
          known_values: ["active", "used", "expired", "revoked"],
        },
        created_by: { type: "TEXT", nullable: true },
        used_by: { type: "TEXT", nullable: true },
        used_at: { type: "TEXT", nullable: true },
        expires_at: { type: "TEXT", nullable: true },
        created_at: { type: "TEXT", nullable: true },
        updated_at: { type: "TEXT", nullable: true },
      },
      repository_usage: ["repositories/adminInviteTokensRepo.js"],
      business_notes: [
        "Token invite admin dipakai via /start param.",
        "Consume token sudah dibuat atomik di repo.",
      ],
    },

    bookings: {
      type: "entity",
      primary_key: ["id"],
      columns: {
        id: { type: "TEXT", nullable: false, role: "primary_key" },
        user_telegram_id: { type: "TEXT", nullable: false },
        partner_telegram_id: { type: "TEXT", nullable: false },
        source_category_code: { type: "TEXT", nullable: true },

        status: {
          type: "TEXT",
          nullable: false,
          known_values: [
            "negotiating",
            "agreed",
            "awaiting_dp",
            "dp_review",
            "secured",
            "completed",
            "cancelled",
            "expired",
            "partner_terlambat",
            "user_terlambat",
            "menunggu_bantuan_admin",
          ],
        },

        negotiation_round_count: { type: "INTEGER", nullable: false },
        last_proposal_kind: {
          type: "TEXT",
          nullable: true,
          known_values: ["exact", "window"],
        },
        last_proposed_exact_at: { type: "TEXT", nullable: true },
        last_proposed_window_start_at: { type: "TEXT", nullable: true },
        last_proposed_window_end_at: { type: "TEXT", nullable: true },
        last_proposed_by: {
          type: "TEXT",
          nullable: true,
          known_values: ["user", "partner"],
        },
        last_proposed_by_telegram_id: { type: "TEXT", nullable: true },
        last_proposed_at: { type: "TEXT", nullable: true },

        agreed_exact_at: { type: "TEXT", nullable: true },
        late_tolerance_minutes: { type: "INTEGER", nullable: false },

        dp_amount: { type: "NUMERIC", nullable: false },
        admin_share_percent: { type: "NUMERIC", nullable: false },
        extra_charge_mode: {
          type: "TEXT",
          nullable: false,
          known_values: ["none"],
        },
        extra_charge_amount: { type: "NUMERIC", nullable: false },
        dukungan_teman_amount: { type: "NUMERIC", nullable: false },
        unique_code: { type: "INTEGER", nullable: false },
        total_transfer: { type: "NUMERIC", nullable: false },

        secured_at: { type: "TEXT", nullable: true },
        completed_at: { type: "TEXT", nullable: true },
        cancelled_at: { type: "TEXT", nullable: true },
        expired_at: { type: "TEXT", nullable: true },
        admin_help_requested_at: { type: "TEXT", nullable: true },

        created_at: { type: "TEXT", nullable: false },
        updated_at: { type: "TEXT", nullable: false },
      },
      repository_usage: [
        "repositories/bookingsRepo.js",
        "routes/callbacks/catalog.js",
        "routes/callbacks/booking.js",
        "routes/telegram.flow.booking.js",
      ],
      business_notes: [
        "Source of truth untuk Safety Booking.",
        "Entry booking dibuka dari katalog, tetapi sesi lanjutannya berjalan di private chat.",
        "Partner dan non-partner dibedakan di runtime dengan cek ke profiles.",
        "Hasil akhir negosiasi harus turun ke agreed_exact_at; rentang waktu hanya alat negosiasi.",
      ],
    },

    booking_events: {
      type: "append_only_log",
      primary_key: ["id"],
      columns: {
        id: { type: "TEXT", nullable: false, role: "primary_key" },
        booking_id: { type: "TEXT", nullable: false },
        actor_telegram_id: { type: "TEXT", nullable: true },
        actor_type: {
          type: "TEXT",
          nullable: true,
          known_values: ["user", "partner", "admin", "owner", "system"],
        },
        event_type: { type: "TEXT", nullable: false },
        from_status: { type: "TEXT", nullable: true },
        to_status: { type: "TEXT", nullable: true },
        payload_json: { type: "TEXT", nullable: true },
        created_at: { type: "TEXT", nullable: false },
      },
      repository_usage: ["repositories/bookingEventsRepo.js"],
      business_notes: [
        "Audit trail append-only untuk semua aksi booking penting.",
        "Tidak dipakai sebagai source of truth utama status, tetapi wajib sinkron dengan transisi status di bookings.",
      ],
    },

    booking_dp_tickets: {
      type: "entity",
      primary_key: ["id"],
      unique_candidates: ["ticket_code"],
      columns: {
        id: { type: "TEXT", nullable: false, role: "primary_key" },
        booking_id: { type: "TEXT", nullable: false },
        ticket_code: { type: "TEXT", nullable: false, role: "unique_candidate" },

        status: {
          type: "TEXT",
          nullable: false,
          known_values: [
            "awaiting_payment",
            "dp_review",
            "confirmed",
            "rejected",
            "expired",
            "cancelled",
          ],
        },

        dp_amount: { type: "NUMERIC", nullable: false },
        extra_charge_mode: {
          type: "TEXT",
          nullable: false,
          known_values: ["none"],
        },
        extra_charge_amount: { type: "NUMERIC", nullable: false },
        dukungan_teman_amount: { type: "NUMERIC", nullable: false },
        unique_code: { type: "INTEGER", nullable: false },
        total_transfer: { type: "NUMERIC", nullable: false },

        proof_file_id: { type: "TEXT", nullable: true },
        proof_uploaded_at: { type: "TEXT", nullable: true },

        confirmed_at: { type: "TEXT", nullable: true },
        confirmed_by: { type: "TEXT", nullable: true },

        rejected_at: { type: "TEXT", nullable: true },
        rejected_by: { type: "TEXT", nullable: true },
        rejection_reason: { type: "TEXT", nullable: true },

        expires_at: { type: "TEXT", nullable: true },
        created_at: { type: "TEXT", nullable: false },
        updated_at: { type: "TEXT", nullable: false },
      },
      repository_usage: [],
      business_notes: [
        "Tiket DP khusus domain booking.",
        "Dipisah dari payment_tickets agar tidak bentrok dengan premium/payment lama.",
      ],
    },

    booking_ledger_entries: {
      type: "ledger",
      primary_key: ["id"],
      columns: {
        id: { type: "TEXT", nullable: false, role: "primary_key" },
        booking_id: { type: "TEXT", nullable: false },
        entry_type: { type: "TEXT", nullable: false },
        amount: { type: "NUMERIC", nullable: false },
        currency: { type: "TEXT", nullable: false },
        bucket: { type: "TEXT", nullable: true },
        direction: { type: "TEXT", nullable: true },
        notes: { type: "TEXT", nullable: true },
        metadata_json: { type: "TEXT", nullable: true },
        created_at: { type: "TEXT", nullable: false },
      },
      repository_usage: [],
      business_notes: [
        "Ledger untuk uang booking: hold, release, fee, admin share, forfeit, dsb.",
      ],
    },

    partner_balance_ledger: {
      type: "ledger",
      primary_key: ["id"],
      columns: {
        id: { type: "TEXT", nullable: false, role: "primary_key" },
        partner_telegram_id: { type: "TEXT", nullable: false },
        booking_id: { type: "TEXT", nullable: true },
        entry_type: { type: "TEXT", nullable: false },
        amount: { type: "NUMERIC", nullable: false },
        balance_bucket: {
          type: "TEXT",
          nullable: false,
          known_values: ["pending", "available", "withdrawn"],
        },
        reference_type: { type: "TEXT", nullable: true },
        reference_id: { type: "TEXT", nullable: true },
        notes: { type: "TEXT", nullable: true },
        created_at: { type: "TEXT", nullable: false },
      },
      repository_usage: [],
      business_notes: [
        "Ledger saldo partner yang diturunkan dari hasil booking.",
        "Dipisah dari bookings agar histori mutasi saldo tetap audit-friendly.",
      ],
    },

    booking_ratings: {
      type: "entity",
      primary_key: ["id"],
      columns: {
        id: { type: "TEXT", nullable: false, role: "primary_key" },
        booking_id: { type: "TEXT", nullable: false },
        from_telegram_id: { type: "TEXT", nullable: false },
        to_telegram_id: { type: "TEXT", nullable: false },
        rating: { type: "INTEGER", nullable: false },
        created_at: { type: "TEXT", nullable: false },
      },
      repository_usage: [],
      business_notes: [
        "Rating pasca-booking. Sekarang baru schema-level, runtime flow-nya bisa dilanjut belakangan.",
      ],
    },
  },

  relations: [
    {
      from: "profile_categories.profile_id",
      to: "profiles.id",
      type: "many_to_one",
    },
    {
      from: "profile_categories.category_id",
      to: "categories.id",
      type: "many_to_one",
    },
    {
      from: "profiles.verificator_admin_id",
      to: "admins.telegram_id",
      type: "many_to_one",
      confidence: "logical_repo_usage",
    },
    {
      from: "profiles.approved_by",
      to: "admins.telegram_id",
      type: "many_to_one",
      confidence: "logical_repo_usage",
    },
    {
      from: "profiles.status_changed_by",
      to: "admins.telegram_id",
      type: "many_to_one",
      confidence: "logical_repo_usage",
    },
    {
      from: "profiles.suspended_by",
      to: "admins.telegram_id",
      type: "many_to_one",
      confidence: "logical_repo_usage",
    },
    {
      from: "partner_subscriptions.partner_id",
      to: "profiles.telegram_id",
      type: "many_to_one",
      confidence: "repo_usage_confirmed",
      notes: ["Di repo saat ini partner_id di-bind pakai telegram_id partner."],
    },
    {
      from: "payment_tickets.partner_id",
      to: "profiles.telegram_id",
      type: "many_to_one",
      confidence: "repo_usage_confirmed",
      notes: ["Di repo saat ini partner_id di-bind pakai identifier partner yang sama dengan flow partner."],
    },
    {
      from: "partner_subscriptions.payment_ticket_id",
      to: "payment_tickets.id",
      type: "many_to_one",
    },
    {
      from: "payment_tickets.subscription_id",
      to: "partner_subscriptions.id",
      type: "many_to_one",
      confidence: "nullable_bidirectional_link",
    },

    {
      from: "bookings.partner_telegram_id",
      to: "profiles.telegram_id",
      type: "many_to_one",
      confidence: "runtime_usage_confirmed",
      notes: ["Partner booking dirujuk langsung ke telegram_id partner."],
    },
    {
      from: "booking_events.booking_id",
      to: "bookings.id",
      type: "many_to_one",
    },
    {
      from: "booking_dp_tickets.booking_id",
      to: "bookings.id",
      type: "many_to_one",
    },
    {
      from: "booking_ledger_entries.booking_id",
      to: "bookings.id",
      type: "many_to_one",
    },
    {
      from: "partner_balance_ledger.booking_id",
      to: "bookings.id",
      type: "many_to_one",
      confidence: "nullable_logical_repo_usage",
    },
    {
      from: "partner_balance_ledger.partner_telegram_id",
      to: "profiles.telegram_id",
      type: "many_to_one",
      confidence: "logical_repo_usage",
    },
    {
      from: "booking_ratings.booking_id",
      to: "bookings.id",
      type: "many_to_one",
    },
  ],

  derived_views: {
    catalog_targets_setting_item: {
      source: "settings.value where key = 'catalog_targets'",
      shape: {
        chat_id: "TEXT",
        chat_title: "TEXT",
        topic_id: "TEXT|null",
        is_active: "BOOLEAN",
        added_by: "TEXT",
        added_at: "ISO DATETIME",
        updated_at: "ISO DATETIME",
      },
      uniqueness: "chat_id + topic_id",
      notes: ["Diserialisasi sebagai JSON array di settings."],
    },

    allowed_group_topic_key: {
      shape: "<chat_id>:<thread_id>",
      source: "settings.value where key = 'allowed_group_topic_keys'",
    },
  },

  query_guides: {
    catalog_visible_partner_minimum_rules: [
      "profiles.status = 'approved'",
      "profiles.is_manual_suspended != 1",
      "profiles.is_catalog_visible = 1",
      "profiles.start_price > 0",
      "partner harus punya subscription aktif di partner_subscriptions",
    ],

    active_subscription_minimum_rules: [
      "partner_subscriptions.status = 'active'",
      "start_at IS NOT NULL",
      "end_at IS NOT NULL",
      "datetime(start_at) <= datetime('now')",
      "datetime(end_at) > datetime('now')",
    ],

    open_payment_ticket_rules: [
      "payment_tickets.status IN ('waiting_payment', 'waiting_confirmation')",
    ],

    open_booking_rules: [
      "bookings.status IN ('negotiating', 'agreed', 'awaiting_dp', 'dp_review', 'secured', 'partner_terlambat', 'user_terlambat', 'menunggu_bantuan_admin')",
    ],

    booking_negotiation_rules: [
      "last_proposal_kind = 'exact' atau 'window'",
      "agreed_exact_at wajib terisi saat status turun ke 'agreed'",
      "rentang waktu hanya alat negosiasi, bukan hasil akhir booking",
    ],

    booking_actor_routing_rules: [
      "Kalau actor telegram_id ada di profiles, actor diperlakukan sebagai partner-side.",
      "Kalau actor telegram_id tidak ada di profiles, actor diperlakukan sebagai non-partner/user-side.",
    ],
  },
});

const PARTNER_DB_TABLE_NAMES = deepFreeze(Object.keys(PARTNER_DB_SCHEMA.tables).sort());

export function listPartnerDbTables() {
  return [...PARTNER_DB_TABLE_NAMES];
}

export function getPartnerDbTable(tableName) {
  const key = String(tableName || "").trim();
  if (!key) return null;

  const table = PARTNER_DB_SCHEMA.tables[key];
  return table ? cloneJson(table) : null;
}

export function listPartnerDbSettingsKeys() {
  return cloneJson(PARTNER_DB_SCHEMA.tables.settings.known_keys);
}

export function listPartnerDbRelations() {
  return cloneJson(PARTNER_DB_SCHEMA.relations);
}

export function getPartnerDbSchema() {
  return cloneJson(PARTNER_DB_SCHEMA);
}

export function hasPartnerDbTable(tableName) {
  return PARTNER_DB_TABLE_NAMES.includes(String(tableName || "").trim());
}

export function findPartnerDbColumns(tableName) {
  const table = PARTNER_DB_SCHEMA.tables[String(tableName || "").trim()];
  if (!table?.columns) return [];
  return Object.keys(table.columns);
}

export function summarizePartnerDb() {
  return {
    meta: cloneJson(PARTNER_DB_SCHEMA.meta),
    table_count: PARTNER_DB_TABLE_NAMES.length,
    tables: listPartnerDbTables(),
    relation_count: PARTNER_DB_SCHEMA.relations.length,
    settings_keys: listPartnerDbSettingsKeys().map((item) => item.key),
  };
}

export {
  PARTNER_DB_SCHEMA,
  PARTNER_DB_TABLE_NAMES,
};
