<?php
/** /setup — first-run wizard: create the administrator account. */
defined('FEP') or exit;

page('/setup', function (Ctx $c) {
    $state = install_state();
    if ($state === 'ready') {
        Res::redirect('/login');
    }
    if ($state === 'no_database') {
        Pages::error(503, 'Setup', 'settings', 'The database is not ready yet', 'Import database.sql into the MySQL database named in config.php (phpMyAdmin → Import), then reload this page. The README has the exact steps.', [['Reload', '/setup', true]]);
    }
    $secret = (string)cfg('secret', '');
    render_page('flow', 'auth/setup', [
        'secretOk' => strlen($secret) >= 32 && !str_starts_with($secret, 'CHANGE-ME'),
        'canDemo' => demo_can_load(), 'scripts' => ['js/auth.js'],
    ], ['title' => 'Set up your studio', 'path' => '/setup', 'noindex' => true]);
});
