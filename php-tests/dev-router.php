<?php
/**
 * Router script for PHP's built-in web server, used only for local testing (it does what .htaccess does on real hosting):
 *   FEP_STRICT=1 FEP_DISABLE_RATE_LIMIT=1 php -S 127.0.0.1:8081 -t public_html php-tests/dev-router.php
 * Not needed on cPanel hosting.
 */
$root = dirname(__DIR__) . '/public_html';
$path = rawurldecode((string)parse_url((string)$_SERVER['REQUEST_URI'], PHP_URL_PATH));
if ($path !== '/' && is_file($root . $path) && !str_ends_with($path, '.php')) {
    if (preg_match('#^/(app|storage)/#', $path) || preg_match('#\.(sql|log|key|ini|md)$#', $path)) {
        http_response_code(403);
        exit;
    }
    return false; // serve the static file
}
define('FEP_CONFIG_OVERRIDE', require __DIR__ . '/test-config.php');
chdir($root);
if ($path === '/cron.php') {
    define('FEP', true);
    define('FEP_ROOT', $root);
    require $root . '/cron.php';
    return;
}
require $root . '/index.php';
