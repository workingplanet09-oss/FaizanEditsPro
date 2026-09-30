<?php
/**
 * Compares EVERY value of EVERY row between the old PostgreSQL database and the new MySQL database.
 *   php verify-migration.php "pgsql:host=127.0.0.1;dbname=faizaneditspro" pguser pgpass "mysql:host=127.0.0.1;dbname=faizan_php;charset=utf8mb4" myuser mypass
 * Exit code 0 = identical. Used to prove a data migration lost or altered nothing.
 */
$schema = require __DIR__ . '/../public_html/app/schema.php';
[$_, $pgDsn, $pgUser, $pgPass, $myDsn, $myUser, $myPass] = array_pad($argv, 7, '');
$pg = new PDO($pgDsn, $pgUser, $pgPass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$my = new PDO($myDsn, $myUser, $myPass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => false]);
$my->exec("SET time_zone='+00:00'");
$renamed = ['onboarding_category_questions' => ['_OnboardingCategoryToOnboardingQuestion', ['categoryId' => 'A', 'questionId' => 'B']]];
$skip = array_filter(explode(',', getenv('SKIP') ?: 'jobs,rate_limits'));
$phpOnlyCols = ['sessions' => ['data']]; // columns added for the PHP version; they have no counterpart in the old database

/** normalise a value to a comparable string for its kind */
function norm(string $kind, $v): string {
    if ($v === null) return '∅';
    switch ($kind) {
        case 'bool': return ($v === true || $v === 't' || $v === '1' || $v === 1) ? '1' : '0';
        case 'int': case 'bigint': return (string)(int)$v;
        case 'float': return rtrim(rtrim(sprintf('%.9F', (float)$v), '0'), '.');
        case 'dt': $t = strtotime(substr((string)$v, 0, 19) . ' UTC'); $ms = substr(str_pad(substr((string)$v, 20, 3), 3, '0'), 0, 3); return gmdate('Y-m-d H:i:s', $t) . '.' . $ms;
        case 'json': $d = json_decode((string)$v, true); return json_encode(canon($d), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        case 'arr': $s = (string)$v; if ($s !== '' && $s[0] === '{') { /* pg array literal */ $s = pgArray($s); } $d = json_decode($s, true); return json_encode($d ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        default: return (string)$v;
    }
}
function canon($d) { if (is_array($d)) { if (array_is_list($d)) return array_map('canon', $d); ksort($d); return array_map('canon', $d); } return $d; }
function pgArray(string $s): string { // minimal parser for one-dimensional text[] literals
    $s = substr($s, 1, -1); $out = []; $i = 0; $n = strlen($s);
    while ($i < $n) {
        if ($s[$i] === '"') { $i++; $buf = ''; while ($i < $n && $s[$i] !== '"') { if ($s[$i] === '\\') $i++; $buf .= $s[$i++]; } $i++; $out[] = $buf; }
        else { $j = strpos($s, ',', $i); if ($j === false) $j = $n; $tok = substr($s, $i, $j - $i); $out[] = $tok === 'NULL' ? null : $tok; $i = $j; }
        if ($i < $n && $s[$i] === ',') $i++;
    }
    return json_encode($out);
}

$problems = 0; $rows = 0;
foreach ($schema as $table => $def) {
    if (in_array($table, $skip, true)) continue;
    [$pgTable, $colMap] = $renamed[$table] ?? [$table, []];
    $cols = array_values(array_diff(array_keys($def['cols']), $phpOnlyCols[$table] ?? []));
    $order = implode(',', array_map(fn($c) => '"' . ($colMap[$c] ?? $c) . '"', $def['pk'])) ?: '1';
    $pgSel = implode(',', array_map(fn($c) => '"' . ($colMap[$c] ?? $c) . '"' . (in_array($def['cols'][$c][0], ['json', 'arr'], true) ? '::text' : ($def['cols'][$c][0] === 'dt' ? '::text' : '')), $cols));
    $pgRows = $pg->query("SELECT $pgSel FROM \"$pgTable\" ORDER BY $order")->fetchAll(PDO::FETCH_NUM);
    $key = fn(array $r) => implode('|', array_map(fn($c) => $r[array_search($c, $cols, true)], $def['pk']));
    $mySel = implode(',', array_map(fn($c) => "`$c`", $cols));
    $myRows = [];
    foreach ($my->query("SELECT $mySel FROM `$table`", PDO::FETCH_NUM) as $r) $myRows[$key($r)] = $r;
    if (count($myRows) !== count($pgRows)) { echo "COUNT $table pg=" . count($pgRows) . " mysql=" . count($myRows) . "\n"; $problems++; }
    foreach ($pgRows as $r) {
        $rows++; $k = $key($r);
        if (!isset($myRows[$k])) { echo "MISSING $table [$k]\n"; $problems++; continue; }
        foreach ($cols as $i => $c) {
            $kind = $def['cols'][$c][0];
            $a = norm($kind, $r[$i]); $b = norm($kind, $myRows[$k][$i]);
            if ($kind === 'arr' && $a === 'null') $a = '[]';
            if ($a !== $b) { echo "DIFF $table.$c [$k]\n   pg   : " . mb_substr($a, 0, 120) . "\n   mysql: " . mb_substr($b, 0, 120) . "\n"; if (++$problems > 30) exit(1); }
        }
    }
}
echo $problems ? "\nFAILED: $problems problem(s)\n" : "\nIDENTICAL: $rows rows across " . count($schema) . " tables compared value by value\n";
exit($problems ? 1 : 0);
