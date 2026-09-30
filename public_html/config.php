<?php
/**
 * FaizanEdits Pro — configuration.
 *
 * This is the ONLY file you need to edit to install the application:
 *   1. Fill in the database details you created in cPanel (MySQL Databases).
 *   2. Set 'app_url' to your website address (no trailing slash).
 *   3. Leave everything else as it is until you need it (email, payments, storage).
 *
 * Keep this file private. It is protected from web access by .htaccess.
 */
return [
    // ── Database (cPanel → MySQL® Databases) ─────────────────────────────────────────────────────────────
    'db' => [
        'host'     => 'localhost',
        'port'     => 3306,
        'name'     => 'cpaneluser_faizanedits',   // cPanel adds your account name as a prefix
        'user'     => 'cpaneluser_faizan',
        'password' => 'CHANGE-ME',
    ],

    // ── Website ────────────────────────────────────────────────────────────────────────────────────────
    // Your public address, e.g. 'https://www.example.com'. Used in emails, canonical links and the sitemap.
    // If you leave it empty the address of the current request is used.
    'app_url' => '',

    // A long random string used to sign links and protect forms. Change it once, before the first visit.
    // (Any 40+ random characters will do, e.g. from https://www.random.org/strings/ )
    'secret' => 'CHANGE-ME-TO-A-LONG-RANDOM-STRING-OF-AT-LEAST-40-CHARACTERS',

    // 'demo' shows one-click demo logins and simulated payments. Use 'live' for a real website.
    'mode' => 'live',

    // Turn on only while fixing a problem: shows errors on screen. Keep false on a real website.
    'debug' => false,

    // How many web servers/proxies sit in front of PHP (Cloudflare counts as 1). 0 = none (most shared hosting).
    // Used to find the visitor's real IP address for rate limiting and audit logs.
    'trusted_proxy_hops' => 0,

    // Optional: run the background jobs (emails, reminders) from a cPanel Cron Job instead of during page visits.
    // Cron command:   wget -q -O - "https://YOUR-SITE/cron.php?key=THIS-VALUE" >/dev/null 2>&1
    'cron_key' => '',

    // ── Email ──────────────────────────────────────────────────────────────────────────────────────────
    // 'log'      only records emails in Admin → Emails (nothing is sent) — good for a trial
    // 'mail'     PHP's built-in mail() — works on most shared hosting with no setup
    // 'smtp'     your mailbox from cPanel (recommended for reliable delivery)
    // 'resend' | 'postmark' | 'sendgrid'   provider APIs (set 'api_key')
    'email' => [
        'driver'   => 'log',
        'from'     => 'Studio <hello@example.com>',
        'api_key'  => '',
        'smtp'     => ['host' => 'localhost', 'port' => 465, 'encryption' => 'ssl', 'user' => '', 'password' => ''],
    ],

    // ── Payments ───────────────────────────────────────────────────────────────────────────────────────
    // 'demo' = no real charge (a "Simulate payment" button appears in demo mode) · 'stripe' = Stripe Checkout
    'payments' => [
        'provider'       => 'demo',
        'secret_key'     => '',   // Stripe secret key (sk_live_… / sk_test_…)
        'webhook_secret' => '',   // Stripe webhook signing secret (whsec_…) for {app_url}/api/webhooks/payments
    ],

    // ── Files ──────────────────────────────────────────────────────────────────────────────────────────
    'storage' => [
        // Uploaded files live here. It is closed to web access; files are only handed out to people allowed to see them.
        'dir'             => __DIR__ . '/storage/uploads',
        'max_upload_mb'   => 2048,      // largest single file (your hosting plan may impose a lower limit)
        'chunk_mb'        => 4,         // uploads are sent in pieces of this size, so big files work on small hosting plans
    ],

    // ── Optional integrations ──────────────────────────────────────────────────────────────────────────
    'google'    => ['client_id' => '', 'client_secret' => ''],          // "Sign in with Google"
    'turnstile' => ['site_key' => '', 'secret_key' => ''],              // Cloudflare Turnstile spam check (both or none)
    'calendar'  => ['meeting_url_template' => 'https://meet.example.com/{{code}}'],
];
