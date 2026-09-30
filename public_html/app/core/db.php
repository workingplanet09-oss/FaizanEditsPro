<?php
/**
 * Database layer (PDO, MySQL / MariaDB).
 *
 *  • Every value reaches the database through a prepared statement (real server-side preparation, `?` placeholders).
 *  • app/schema.php (generated from the database structure) tells this layer the type of every column, so rows come
 *    back typed exactly as before: booleans are bool, JSON/array columns are decoded, DATETIME columns are ISO-8601 UTC strings.
 *  • Identifiers (table/column names) are only ever taken from code or checked against the schema — never from user input.
 */
defined('FEP') or exit;

/** Marker for "column = column + n" style updates. */
final class DbInc
{
    public function __construct(public int|float $by) {}
}

/** Raw SQL expression for UPDATE ... SET col = <expr> (code-supplied only, never user input). */
final class DbRaw
{
    public function __construct(public string $sql, public array $params = []) {}
}

final class Db
{
    private static ?PDO $pdo = null;
    private static ?array $schema = null;
    private static int $txDepth = 0;

    public static function schema(): array
    {
        return self::$schema ??= require FEP_ROOT . '/app/schema.php';
    }

    public static function pdo(): PDO
    {
        if (self::$pdo) {
            return self::$pdo;
        }
        $c = cfg('db');
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['host'], (int)($c['port'] ?? 3306), $c['name']);
        try {
            self::$pdo = new PDO($dsn, $c['user'], $c['password'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_STRINGIFY_FETCHES => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci, time_zone = '+00:00', sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'",
            ]);
        } catch (PDOException $e) {
            // Never leak the host, user or password — log the detail, show a neutral message.
            app_log('Database connection failed: ' . $e->getMessage());
            throw new AppError('INTERNAL', 'The database is not reachable. Please check config.php.');
        }
        return self::$pdo;
    }

    // ───────────────────────── running SQL ─────────────────────────

    private static function run(string $sql, array $params): PDOStatement
    {
        $st = self::pdo()->prepare($sql);
        $i = 1;
        foreach ($params as $p) {
            if ($p === null) {
                $st->bindValue($i, null, PDO::PARAM_NULL);
            } elseif (is_bool($p)) {
                $st->bindValue($i, $p ? 1 : 0, PDO::PARAM_INT);
            } elseif (is_int($p)) {
                $st->bindValue($i, $p, PDO::PARAM_INT);
            } elseif (is_float($p)) {
                $st->bindValue($i, (string)$p, PDO::PARAM_STR);
            } elseif (is_array($p) || is_object($p)) {
                $st->bindValue($i, json_enc($p), PDO::PARAM_STR);
            } else {
                $st->bindValue($i, (string)$p, PDO::PARAM_STR);
            }
            $i++;
        }
        $st->execute();
        return $st;
    }

    /** Raw rows (no type casting). */
    public static function rows(string $sql, array $params = []): array
    {
        return self::run($sql, $params)->fetchAll();
    }

    public static function rowRaw(string $sql, array $params = []): ?array
    {
        $r = self::run($sql, $params)->fetch();
        return $r === false ? null : $r;
    }

    public static function val(string $sql, array $params = []): mixed
    {
        $r = self::run($sql, $params)->fetch(PDO::FETCH_NUM);
        return $r === false ? null : $r[0];
    }

    public static function col(string $sql, array $params = []): array
    {
        return self::run($sql, $params)->fetchAll(PDO::FETCH_COLUMN);
    }

    public static function exec(string $sql, array $params = []): int
    {
        return self::run($sql, $params)->rowCount();
    }

    public static function lastInsertId(): string
    {
        return self::pdo()->lastInsertId();
    }

    /** Placeholders for an IN (...) list. An empty list matches nothing. @return array{0:string,1:array} */
    public static function in(array $values): array
    {
        $values = array_values($values);
        return $values ? ['(' . implode(',', array_fill(0, count($values), '?')) . ')', $values] : ['(NULL)', []];
    }

    // ───────────────────────── transactions ─────────────────────────

    /** Runs $fn inside a transaction (nested calls join the outer one). */
    public static function tx(callable $fn): mixed
    {
        $pdo = self::pdo();
        if (self::$txDepth > 0) {
            return $fn();
        }
        $pdo->beginTransaction();
        self::$txDepth = 1;
        try {
            $r = $fn();
            $pdo->commit();
            return $r;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        } finally {
            self::$txDepth = 0;
        }
    }

    // ───────────────────────── typed rows ─────────────────────────

    public static function table(string $table): array
    {
        $t = self::schema()[$table] ?? null;
        if (!$t) {
            throw new LogicException("Unknown table {$table}");
        }
        return $t;
    }

    /** Casts one raw row of $table into its typed form (only keys present in the row are touched). */
    public static function hydrate(string $table, array $row): array
    {
        $cols = self::table($table)['cols'];
        foreach ($row as $k => $v) {
            $def = $cols[$k] ?? null;
            if (!$def || $v === null) {
                if ($def && $v === null && $def[0] === 'arr') {
                    $row[$k] = [];
                }
                continue;
            }
            $row[$k] = match ($def[0]) {
                'bool' => (bool)$v,
                'int', 'bigint' => (int)$v,
                'float' => (float)$v,
                'dt' => str_replace(' ', 'T', (string)$v) . 'Z',
                'json' => json_decode((string)$v, true),
                'arr' => (function () use ($v) {
                    $d = json_decode((string)$v, true);
                    return is_array($d) ? $d : [];
                })(),
                default => $v,
            };
        }
        return $row;
    }

    public static function hydrateAll(string $table, array $rows): array
    {
        return array_map(fn($r) => self::hydrate($table, $r), $rows);
    }

    /** "t.`a` AS `t__a`, t.`b` AS `t__b`, ..." so a JOINed row can be split back into typed per-table rows with extract(). */
    public static function select(string $alias, string $table, ?array $only = null, ?string $prefix = null): string
    {
        $prefix ??= $alias;
        $out = [];
        foreach (array_keys(self::table($table)['cols']) as $c) {
            if ($only === null || in_array($c, $only, true)) {
                $out[] = "`{$alias}`.`{$c}` AS `{$prefix}__{$c}`";
            }
        }
        return implode(', ', $out);
    }

    /** Picks the columns aliased with select($prefix ...) out of a joined row and types them. Returns null when the LEFT JOIN found nothing. */
    public static function extract(array $row, string $prefix, string $table): ?array
    {
        $out = [];
        $any = false;
        $pk = self::table($table)['pk'][0] ?? null;
        foreach ($row as $k => $v) {
            if (str_starts_with($k, $prefix . '__')) {
                $out[substr($k, strlen($prefix) + 2)] = $v;
                if ($v !== null) {
                    $any = true;
                }
            }
        }
        if (!$any || ($pk && ($out[$pk] ?? null) === null)) {
            return null;
        }
        return self::hydrate($table, $out);
    }

    // ───────────────────────── simple queries ─────────────────────────

    /**
     * WHERE builder. $where is either
     *   - ['col' => value, ...]  (null → IS NULL, array → IN (...), Db::not(...) etc. are not needed by callers), or
     *   - ['sql' => '... ? ...', 'params' => [...]] for anything more complex.
     * @return array{0:string,1:array}
     */
    public static function where(array|string|null $where): array
    {
        if ($where === null || $where === [] || $where === '') {
            return ['1=1', []];
        }
        if (is_string($where)) {
            return [$where, []];
        }
        if (isset($where['sql'])) {
            return [$where['sql'], $where['params'] ?? []];
        }
        $parts = [];
        $params = [];
        foreach ($where as $col => $val) {
            self::assertIdent($col);
            if ($val === null) {
                $parts[] = "`{$col}` IS NULL";
            } elseif (is_array($val)) {
                [$ph, $p] = self::in($val);
                $parts[] = "`{$col}` IN {$ph}";
                array_push($params, ...$p);
            } else {
                $parts[] = "`{$col}` = ?";
                $params[] = is_bool($val) ? (int)$val : $val;
            }
        }
        return [implode(' AND ', $parts), $params];
    }

    private static function assertIdent(string $s): void
    {
        if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $s)) {
            throw new LogicException("Bad identifier {$s}");
        }
    }

    /** SELECT * from one table → typed rows. $opts: order (SQL, code-supplied), limit, offset, cols. */
    public static function find(string $table, array|string|null $where = null, array $opts = []): array
    {
        self::table($table);
        [$w, $p] = self::where($where);
        $cols = isset($opts['cols']) ? '`' . implode('`,`', $opts['cols']) . '`' : '*';
        $sql = "SELECT {$cols} FROM `{$table}` WHERE {$w}";
        if (!empty($opts['order'])) {
            $sql .= ' ORDER BY ' . $opts['order'];
        }
        if (isset($opts['limit'])) {
            $sql .= ' LIMIT ' . (int)$opts['limit'] . (isset($opts['offset']) ? ' OFFSET ' . (int)$opts['offset'] : '');
        }
        return self::hydrateAll($table, self::rows($sql, $p));
    }

    public static function first(string $table, array|string|null $where = null, array $opts = []): ?array
    {
        $opts['limit'] = 1;
        return self::find($table, $where, $opts)[0] ?? null;
    }

    public static function count(string $table, array|string|null $where = null): int
    {
        [$w, $p] = self::where($where);
        return (int)self::val("SELECT COUNT(*) FROM `{$table}` WHERE {$w}", $p);
    }

    public static function exists(string $table, array|string|null $where): bool
    {
        [$w, $p] = self::where($where);
        return self::val("SELECT 1 FROM `{$table}` WHERE {$w} LIMIT 1", $p) !== null;
    }

    // ───────────────────────── writes ─────────────────────────

    /** Converts a PHP value into what the column stores. */
    private static function encode(array $def, mixed $v): mixed
    {
        if ($v === null) {
            return null;
        }
        return match ($def[0]) {
            'bool' => $v ? 1 : 0,
            'dt' => to_db_dt($v),
            'json' => json_enc($v),
            'arr' => json_enc(array_values((array)$v)),
            'int', 'bigint' => (int)$v,
            'float' => (float)$v,
            default => is_scalar($v) ? (string)$v : json_enc($v),
        };
    }

    private static function defaultFor(array $def): mixed
    {
        $d = $def[2];
        if ($d === 'now') {
            return db_dt();
        }
        if ($def[0] === 'arr') {
            return '[]';
        }
        if ($def[0] === 'json') {
            return $d === null || $d === 'null' ? null : $d;
        }
        return $d;
    }

    /** Inserts a row, filling ids, timestamps and defaults from the schema. Returns the stored row (typed). */
    public static function insert(string $table, array $data, bool $returnRow = true): ?array
    {
        $t = self::table($table);
        $cols = $t['cols'];
        $values = [];
        foreach ($data as $k => $v) {
            if (!isset($cols[$k])) {
                throw new LogicException("Unknown column {$table}.{$k}");
            }
            $values[$k] = self::encode($cols[$k], $v);
        }
        foreach ($cols as $name => $def) {
            if (array_key_exists($name, $values)) {
                continue;
            }
            if ($name === 'id' && $def[0] === 'id') {
                $values['id'] = cuid();
                continue;
            }
            $d = self::defaultFor($def);
            if ($d !== null) {
                $values[$name] = $d;
            } elseif ($def[1]) {
                continue; // nullable → let the DB store NULL
            } elseif (in_array($def[0], ['str', 'text'], true)) {
                // no value and no default for a NOT NULL text column: leave it out so MySQL rejects it loudly
                continue;
            }
        }
        $names = array_keys($values);
        $sql = 'INSERT INTO `' . $table . '` (`' . implode('`,`', $names) . '`) VALUES (' . implode(',', array_fill(0, count($names), '?')) . ')';
        self::run($sql, array_values($values));
        if (!$returnRow) {
            return null;
        }
        $pk = $t['pk'];
        if (count($pk) === 1 && isset($values[$pk[0]])) {
            return self::first($table, [$pk[0] => $values[$pk[0]]]);
        }
        $where = [];
        foreach ($pk as $c) {
            $where[$c] = $values[$c];
        }
        return self::first($table, $where);
    }

    /** UPDATE by simple where. Values may be DbInc / DbRaw. Returns affected rows. */
    public static function update(string $table, array|string $where, array $data): int
    {
        $t = self::table($table);
        $sets = [];
        $params = [];
        foreach ($data as $k => $v) {
            if (!isset($t['cols'][$k])) {
                throw new LogicException("Unknown column {$table}.{$k}");
            }
            if ($v instanceof DbInc) {
                $sets[] = "`{$k}` = `{$k}` + ?";
                $params[] = $v->by;
            } elseif ($v instanceof DbRaw) {
                $sets[] = "`{$k}` = ({$v->sql})";
                array_push($params, ...$v->params);
            } else {
                $sets[] = "`{$k}` = ?";
                $params[] = self::encode($t['cols'][$k], $v);
            }
        }
        if (!$sets) {
            return 0;
        }
        [$w, $wp] = self::where($where);
        return self::exec("UPDATE `{$table}` SET " . implode(', ', $sets) . " WHERE {$w}", [...$params, ...$wp]);
    }

    public static function delete(string $table, array|string $where): int
    {
        self::table($table);
        [$w, $wp] = self::where($where);
        if ($w === '1=1') {
            throw new LogicException('Refusing to delete without a condition');
        }
        return self::exec("DELETE FROM `{$table}` WHERE {$w}", $wp);
    }

    /** INSERT ... ON DUPLICATE KEY UPDATE for a unique/primary key (values in $update are re-applied). */
    public static function upsert(string $table, array $data, array $update): void
    {
        $t = self::table($table);
        $insert = $data;
        foreach ($t['cols'] as $name => $def) {
            if (!array_key_exists($name, $insert)) {
                if ($name === 'id' && $def[0] === 'id') {
                    $insert['id'] = cuid();
                } elseif (($d = self::defaultFor($def)) !== null) {
                    $insert[$name] = $d;
                }
            }
        }
        $names = array_keys($insert);
        $vals = [];
        foreach ($insert as $k => $v) {
            $vals[] = self::encode($t['cols'][$k], $v);
        }
        $sets = [];
        $up = [];
        foreach ($update as $k => $v) {
            $sets[] = "`{$k}` = ?";
            $up[] = $v instanceof DbInc ? null : self::encode($t['cols'][$k], $v);
        }
        $ph = implode(',', array_fill(0, count($names), '?'));
        if (!$sets) { // nothing to change on a duplicate: keep the existing row
            self::run('INSERT IGNORE INTO `' . $table . '` (`' . implode('`,`', $names) . '`) VALUES (' . $ph . ')', $vals);
            return;
        }
        self::run('INSERT INTO `' . $table . '` (`' . implode('`,`', $names) . '`) VALUES (' . $ph . ') ON DUPLICATE KEY UPDATE ' . implode(', ', $sets), [...$vals, ...$up]);
    }

    /** True when the last error was a duplicate-key violation (unique constraint). */
    public static function isDuplicate(Throwable $e): bool
    {
        return $e instanceof PDOException && (($e->errorInfo[1] ?? 0) === 1062);
    }
}
