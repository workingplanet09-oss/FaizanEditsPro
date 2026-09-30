<?php
/** Loads everything and installs the error handling. Included by index.php, cron.php and the command-line tools. */
defined('FEP') or exit;

mb_internal_encoding('UTF-8');
date_default_timezone_set('UTC');

require_once FEP_ROOT . '/app/core/util.php';

$debug = (bool)cfg('debug', false);
error_reporting(E_ALL);
ini_set('display_errors', $debug ? '1' : '0');
ini_set('log_errors', '1');
@ini_set('error_log', FEP_ROOT . '/storage/logs/php-error.log');
if (!is_dir(FEP_ROOT . '/storage/logs')) {
    @mkdir(FEP_ROOT . '/storage/logs', 0750, true);
}

foreach (['errors', 'db', 'crypto', 'validate', 'http', 'session', 'auth', 'router', 'view'] as $core) {
    require_once FEP_ROOT . "/app/core/{$core}.php";
}
foreach (['lib', 'services', 'api', 'pages'] as $dir) {
    $files = glob(FEP_ROOT . "/app/{$dir}/*.php") ?: [];
    sort($files);
    foreach ($files as $f) {
        require_once $f;
    }
}

// Warnings and notices are logged (and, when FEP_STRICT=1 in the test environment, turned into failures so bugs cannot hide).
set_error_handler(function (int $no, string $msg, string $file, int $line): bool {
    if (!(error_reporting() & $no)) {
        return false;
    }
    if (getenv('FEP_STRICT') === '1') {
        throw new ErrorException($msg, 0, $no, $file, $line);
    }
    app_log("PHP[{$no}] {$msg} @ " . basename($file) . ":{$line}");
    return true;
});

register_shutdown_function(function (): void {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        app_log("FATAL {$e['message']} @ " . basename($e['file']) . ":{$e['line']}");
        if (!headers_sent() && PHP_SAPI !== 'cli') {
            http_response_code(500);
            header('Content-Type: text/html; charset=utf-8');
            echo '<!doctype html><meta charset="utf-8"><title>Something went wrong</title><body style="font-family:system-ui;padding:3rem"><h1>Something went wrong</h1><p>Please try again in a moment.</p></body>';
        }
    }
});
