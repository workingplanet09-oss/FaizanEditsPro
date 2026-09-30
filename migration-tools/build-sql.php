<?php
/**
 * Builds the two SQL files that ship with the application (developer tool — not needed on the hosting account):
 *
 *   public_html/database.sql        the empty structure + the reference data the application needs (roles, permissions, forms, templates…)
 *   public_html/database-demo.sql   OPTIONAL sample studio (fictional clients, projects, invoices…) that can be removed later from Admin → Settings
 *
 * It compares two MySQL databases that were produced by the data exporter (pg-to-mysql.mjs):
 *   BOOT  = structure + bootstrap data only          DEMO = the same database after the demo seed was added on top
 * Everything in DEMO that is not in BOOT (or differs from it) becomes database-demo.sql. Sample accounts get a freshly hashed
 * password, the sample media is pointed at the files in assets/demo, and every date is shifted to "now" when the file is imported.
 *
 *   php migration-tools/build-sql.php  [boot-db=fep_boot] [demo-db=fep_demo] [mysql-user=root] [mysql-pass=]
 */
const FEP = true;
define('FEP_ROOT', dirname(__DIR__) . '/public_html');
require FEP_ROOT . '/app/core/crypto.php';

[$_, $bootDb, $demoDb, $user, $pass] = array_pad($argv, 5, null);
$bootDb ??= 'fep_boot';
$demoDb ??= 'fep_demo';
$user ??= 'root';
$pass ??= '';
$connect = fn(string $db) => new PDO("mysql:host=127.0.0.1;dbname={$db};charset=utf8mb4", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => true]);
$boot = $connect($bootDb);
$demo = $connect($demoDb);
$q = fn(string $id) => '`' . str_replace('`', '``', $id) . '`';

/** Demo accounts all use this password (shown on the login page in demo mode). Hashed here, in the format the application verifies. */
$demoPassword = 'demo-password-123';
$demoHash = hash_password($demoPassword);

// sample media: match each stored sample file to the bundled copy by content hash
$bundled = [];
foreach (glob(FEP_ROOT . '/assets/demo/*') as $f) {
    $bundled[sha1_file($f)] = basename($f);
}
$storageDir = getenv('DEMO_STORAGE') ?: '/tmp/fep-demo-storage';
$mapKey = function (?string $key, string $id) use ($bundled, $storageDir): ?string {
    if ($key === null || $key === '') {
        return $key;
    }
    $p = $storageDir . '/' . $key;
    if (!is_file($p)) {
        fwrite(STDERR, "warning: sample file missing for {$key}\n");
        return $key;
    }
    $h = sha1_file($p);
    if (!isset($bundled[$h])) {
        fwrite(STDERR, "warning: sample file {$key} has no bundled copy\n");
        return $key;
    }
    // storage keys are unique per file, so each sample asset gets its own key: demo/<asset id>~<bundled file name>
    return 'demo/' . $id . '~' . $bundled[$h];
};

$tables = array_column($demo->query('SHOW TABLES')->fetchAll(PDO::FETCH_NUM), 0);
$out = [];
$shift = [];
$counts = ['new' => 0, 'changed' => 0];
$SKIP = ['jobs', 'sessions', 'rate_limits', 'auth_tokens'];
$manifest = []; // sample rows in reference/content tables (they carry no isDemo flag): removed by id when the sample data is removed

foreach ($tables as $t) {
    if (in_array($t, $SKIP, true)) {
        continue;
    }
    $cols = $demo->query("SELECT COLUMN_NAME AS n, DATA_TYPE AS t, COLUMN_KEY AS k FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = " . $demo->quote($t) . ' ORDER BY ORDINAL_POSITION')->fetchAll();
    $names = array_column($cols, 'n');
    $pk = array_column(array_filter($cols, fn($c) => $c['k'] === 'PRI'), 'n');
    $dateCols = array_column(array_filter($cols, fn($c) => in_array($c['t'], ['datetime', 'timestamp'], true)), 'n');
    if (!$pk) {
        continue;
    }
    $key = fn(array $r) => implode("\x1f", array_map(fn($c) => (string)$r[$c], $pk));
    $old = [];
    foreach ($boot->query('SELECT * FROM ' . $q($t))->fetchAll() as $r) {
        $old[$key($r)] = $r;
    }
    $new = [];
    $changed = [];
    foreach ($demo->query('SELECT * FROM ' . $q($t))->fetchAll() as $r) {
        $k = $key($r);
        if (!isset($old[$k])) {
            $new[] = $r;
        } elseif ($old[$k] != $r) {
            $changed[] = $r;
        }
    }
    if (!$new && !$changed) {
        continue;
    }
    // transformations for the shipped sample data
    $tx = function (array $r) use ($t, $demoHash, $mapKey): array {
        if ($t === 'users') {
            $r['passwordHash'] = $demoHash;
        }
        if ($t === 'assets') {
            $r['storageKey'] = $mapKey($r['storageKey'], $r['id']);
            if (array_key_exists('thumbnailKey', $r)) {
                $r['thumbnailKey'] = $mapKey($r['thumbnailKey'], $r['id']);
            }
        }
        foreach ($r as $c => $v) {
            if (is_string($v) && str_contains($v, '/demo/')) {
                $r[$c] = preg_replace('#(?<![\w.])/demo/#', '/assets/demo/', $v);
            }
        }
        return $r;
    };
    $lit = fn($v) => $v === null ? 'NULL' : $demo->quote((string)$v);
    $colList = implode(', ', array_map($q, $names));
    $out[] = "\n-- {$t}: " . count($new) . ' new' . ($changed ? ', ' . count($changed) . ' updated' : '') . ' row(s)';
    foreach (array_chunk($new, 150) as $chunk) {
        $rows = array_map(fn($r) => '(' . implode(', ', array_map($lit, array_values($tx($r)))) . ')', $chunk);
        $out[] = 'INSERT INTO ' . $q($t) . " ({$colList}) VALUES\n" . implode(",\n", $rows) . ';';
    }
    foreach ($changed as $r) {
        $r = $tx($r);
        $set = implode(', ', array_map(fn($c) => $q($c) . ' = VALUES(' . $q($c) . ')', array_diff($names, $pk)));
        $out[] = 'INSERT INTO ' . $q($t) . " ({$colList}) VALUES (" . implode(', ', array_map($lit, array_values($r))) . ") ON DUPLICATE KEY UPDATE {$set};";
    }
    if ($new && $boot->query('SELECT 1 FROM ' . $q($t) . ' LIMIT 1')->fetchColumn() && !in_array('isDemo', $names, true) && count($pk) === 1) {
        $manifest[$t] = array_column($new, $pk[0]);
    }
    $counts['new'] += count($new);
    $counts['changed'] += count($changed);
    if ($dateCols && count($pk) === 1 && $new) {
        $ids = array_map(fn($r) => $demo->quote((string)$r[$pk[0]]), $new);
        foreach (array_chunk($ids, 400) as $chunk) {
            $set = implode(', ', array_map(fn($c) => $q($c) . ' = DATE_ADD(' . $q($c) . ', INTERVAL @demo_days DAY)', $dateCols));
            $shift[] = 'UPDATE ' . $q($t) . " SET {$set} WHERE " . $q($pk[0]) . ' IN (' . implode(',', $chunk) . ');';
        }
    }
}

$built = gmdate('Y-m-d');
$header = <<<SQL
-- FaizanEdits Pro — OPTIONAL sample data (a fictional studio).
-- Import this file AFTER database.sql if you want to explore the application with example clients, projects, invoices and videos.
-- Every sample row is flagged and can be removed again with Admin → Settings → Integrations & system → "Remove demo data".
-- Sample sign-ins (password for all: {$demoPassword}):  admin@demo.faizaneditspro.test · editor@demo.faizaneditspro.test · client@demo.faizaneditspro.test
-- Dates in this file were created on {$built}; the last statements move them forward so the data looks current when you import it.

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 0;
SET @demo_days = DATEDIFF(UTC_DATE(), '{$built}');

SQL;
$footer = "\n\n-- Move every sample date forward to today (relative times such as \"due in 4 days\" stay true)\n" . implode("\n", $shift) . "\n\nSET FOREIGN_KEY_CHECKS = 1;\n";
file_put_contents(FEP_ROOT . '/database-demo.sql', $header . implode("\n", $out) . $footer);
file_put_contents(FEP_ROOT . '/app/data/demo-manifest.json', json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
fwrite(STDERR, sprintf("database-demo.sql: %d new rows, %d updated rows, %.0f KB\n", $counts['new'], $counts['changed'], filesize(FEP_ROOT . '/database-demo.sql') / 1024));
