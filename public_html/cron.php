<?php
/**
 * Optional scheduled run (cPanel → Cron Jobs). Sends queued emails and reminders, expires quotes, marks overdue invoices and tidies temporary files.
 * The site also does this by itself while people visit it, so a cron job is only needed for very quiet sites or faster reminders.
 *
 *   Every 5 minutes (cPanel "Cron Jobs"):   php /home/ACCOUNT/public_html/cron.php
 *   or, if only URLs are allowed:           wget -q -O - "https://YOUR-SITE/cron.php?key=THE-cron_key-FROM-config.php" >/dev/null 2>&1
 */
define('FEP', true);
define('FEP_ROOT', __DIR__);
require FEP_ROOT . '/app/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    $key = (string)cfg('cron_key', '');
    if ($key === '' || !safe_equal($key, (string)($_GET['key'] ?? ''))) {
        http_response_code(403);
        header('Content-Type: text/plain; charset=utf-8');
        exit("Forbidden. Set 'cron_key' in config.php and call cron.php?key=THAT-VALUE.\n");
    }
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
}
@set_time_limit(120);
try {
    $sweep = run_sweeps();
    $processed = 0;
    $failed = 0;
    for ($i = 0; $i < 5; $i++) {
        $r = run_jobs(['limit' => 100, 'budgetMs' => 20000]);
        $processed += $r['processed'];
        $failed += $r['failed'];
        if ($r['processed'] === 0) {
            break;
        }
    }
    echo "ok processed={$processed} failed={$failed}\n";
} catch (Throwable $e) {
    app_log('cron.php: ' . $e->getMessage());
    http_response_code(500);
    echo "error\n";
}
