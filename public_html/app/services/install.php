<?php
/**
 * Installation state: is the database imported, and does the site have its first administrator?
 * Until it does, every page leads to /setup (a short first-run wizard).
 */
defined('FEP') or exit;

const FEP_DEMO_EMAIL = 'admin@demo.faizaneditspro.test';

/** 'ready' · 'needs_admin' (database imported, no staff account yet) · 'no_database' (not reachable / database.sql not imported). */
function install_state(bool $fresh = false): string
{
    static $state = null;
    if ($state !== null && !$fresh) {
        return $state;
    }
    try {
        // the normal case costs one tiny indexed query
        if (Db::exists('users', ['isStaff' => true])) {
            return $state = 'ready';
        }
        $have = (int)Db::val("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('users','roles','workspaces','permissions')");
        if ($have < 4 || !Db::exists('workspaces', null) || !Db::exists('roles', null)) {
            return $state = 'no_database';
        }
        return $state = 'needs_admin';
    } catch (Throwable $e) {
        app_log('install_state: ' . $e->getMessage());
        return $state = 'no_database';
    }
}

/** Called for every request: sends visitors of an unfinished site to the wizard. */
function install_gate(Req $req, bool $isApi): void
{
    $path = $req->path;
    if (in_array($path, ['/setup', '/api/setup', '/favicon.ico', '/robots.txt', '/manifest.webmanifest'], true)) {
        return;
    }
    $state = install_state();
    if ($state === 'ready') {
        return;
    }
    if ($isApi) {
        Res::error(new AppError('NOT_CONFIGURED', 'This site has not finished setup yet.'));
    }
    if ($state === 'needs_admin') {
        Res::redirect('/setup');
    }
    Pages::error(503, 'Setup', 'settings', 'The database is not ready yet', 'Import database.sql into the MySQL database named in config.php (phpMyAdmin → Import), then reload this page. The README has the exact steps.', [['Reload', $path, true]]);
}

/** True when the optional sample studio has been loaded (and not yet removed). */
function demo_loaded(): bool
{
    return Db::exists('users', ['email' => FEP_DEMO_EMAIL]);
}

/** The sample data can only be added to a site that has no business data yet (so numbers and records can never clash). */
function demo_can_load(): bool
{
    foreach (['clients', 'projects', 'leads', 'quotes', 'invoices', 'contracts', 'organizations'] as $t) {
        if (Db::exists($t, null)) {
            return false;
        }
    }
    return is_file(FEP_ROOT . '/database-demo.sql') && !demo_loaded();
}

/**
 * Runs an SQL file statement by statement. Handles quoted text that contains semicolons or line breaks.
 * Used only for the bundled sample data; nothing user-supplied ever reaches it.
 */
function run_sql_file(string $path): int
{
    $sql = (string)file_get_contents($path);
    $pdo = Db::pdo();
    $n = strlen($sql);
    $stmt = '';
    $count = 0;
    $inStr = false;
    for ($i = 0; $i < $n; $i++) {
        $ch = $sql[$i];
        if ($inStr) {
            $stmt .= $ch;
            if ($ch === '\\' && $i + 1 < $n) {
                $stmt .= $sql[++$i];
            } elseif ($ch === "'") {
                if ($i + 1 < $n && $sql[$i + 1] === "'") {
                    $stmt .= $sql[++$i];
                } else {
                    $inStr = false;
                }
            }
            continue;
        }
        if ($ch === "'") {
            $inStr = true;
            $stmt .= $ch;
        } elseif ($ch === '-' && $i + 1 < $n && $sql[$i + 1] === '-' && ($stmt === '' || substr($stmt, -1) === "\n")) {
            $e = strpos($sql, "\n", $i);
            $i = $e === false ? $n : $e; // comment line
        } elseif ($ch === ';') {
            if (trim($stmt) !== '') {
                $pdo->exec($stmt);
                $count++;
            }
            $stmt = '';
        } else {
            $stmt .= $ch;
        }
    }
    if (trim($stmt) !== '') {
        $pdo->exec($stmt);
        $count++;
    }
    return $count;
}

function load_demo_data(): int
{
    if (!demo_can_load()) {
        throw new AppError('CONFLICT', 'Sample data can only be added to a site that has no clients, projects or invoices yet.');
    }
    $pdo = Db::pdo();
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    try {
        return run_sql_file(FEP_ROOT . '/database-demo.sql');
    } finally {
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    }
}
