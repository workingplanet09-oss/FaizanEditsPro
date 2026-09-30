<?php
/**
 * General helpers: configuration access, ids, dates, formatting, money, strings.
 * Everything here is pure (no database, no output) so it can be used from services, API handlers and views.
 */
defined('FEP') or exit;

// ─────────────────────────────── configuration ───────────────────────────────

function cfg(string $path, $default = null)
{
    static $config = null;
    if ($config === null) {
        $config = require FEP_ROOT . '/config.php';
        if (defined('FEP_CONFIG_OVERRIDE')) {
            $config = array_replace_recursive($config, FEP_CONFIG_OVERRIDE);
        }
    }
    $cur = $config;
    foreach (explode('.', $path) as $key) {
        if (!is_array($cur) || !array_key_exists($key, $cur)) {
            return $default;
        }
        $cur = $cur[$key];
    }
    return $cur;
}

function is_demo_mode(): bool
{
    return cfg('mode', 'live') === 'demo';
}

function is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') {
        return true;
    }
    if ((int)($_SERVER['SERVER_PORT'] ?? 0) === 443) {
        return true;
    }
    return (int)cfg('trusted_proxy_hops', 0) > 0 && strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

/** The public address of the site, without a trailing slash. */
function app_url(): string
{
    $configured = trim((string)cfg('app_url', ''));
    if ($configured !== '') {
        return rtrim($configured, '/');
    }
    $host = (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
    if (!preg_match('/^[a-z0-9.\-]+(:\d{1,5})?$/i', $host)) {
        $host = 'localhost';
    }
    return (is_https() ? 'https://' : 'http://') . $host;
}

function absolute_url(string $path): string
{
    return preg_match('#^https?://#i', $path) ? $path : app_url() . ($path !== '' && $path[0] === '/' ? '' : '/') . $path;
}

// ─────────────────────────────── ids, randomness, encoding ───────────────────────────────

/** Collision-resistant id in the same shape as the previous system's ids (c + time + counter + random). */
function cuid(): string
{
    static $counter = 0;
    $counter = ($counter + 1) % 1679616;
    $ms = (int)(microtime(true) * 1000);
    return 'c' . str_pad(base_convert((string)$ms, 10, 36), 8, '0', STR_PAD_LEFT)
        . str_pad(base_convert((string)$counter, 10, 36), 4, '0', STR_PAD_LEFT)
        . substr(str_pad(base_convert((string)random_int(0, 1679615), 10, 36), 4, '0', STR_PAD_LEFT), -4)
        . substr(str_pad(base_convert((string)random_int(0, 2821109907455), 10, 36), 8, '0', STR_PAD_LEFT), -8);
}

function b64url_encode(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

function b64url_decode(string $s): string|false
{
    return base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
}

function random_token(int $bytes = 32): string
{
    return b64url_encode(random_bytes($bytes));
}

function sha256_hex(string $s): string
{
    return hash('sha256', $s);
}

function safe_equal(string $a, string $b): bool
{
    return hash_equals($a, $b);
}

/** Loose JSON encode used for API output and DB JSON columns. */
function json_enc($v, int $flags = 0): string
{
    return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_INVALID_UTF8_SUBSTITUTE | $flags) ?: 'null';
}

function json_dec(?string $s, $default = null)
{
    if ($s === null || $s === '') {
        return $default;
    }
    $v = json_decode($s, true);
    return json_last_error() === JSON_ERROR_NONE ? $v : $default;
}

// ─────────────────────────────── time ───────────────────────────────
// The database stores UTC. Inside PHP a timestamp is a DB string 'Y-m-d H:i:s.v' or an ISO string 'Y-m-dTH:i:s.vZ'.

function now_ms(): int
{
    return (int)floor(microtime(true) * 1000);
}

/** Milliseconds since the epoch → DB string. */
function db_dt(int|float|null $ms = null): string
{
    $ms = (int)($ms ?? now_ms());
    return gmdate('Y-m-d H:i:s', intdiv($ms, 1000)) . '.' . str_pad((string)($ms % 1000), 3, '0', STR_PAD_LEFT);
}

function iso_dt(int|float|null $ms = null): string
{
    return str_replace(' ', 'T', db_dt($ms)) . 'Z';
}

/** Anything date-like (DB string, ISO string, DateTimeInterface, epoch ms) → epoch ms, or null. */
function ts_ms(mixed $v): ?int
{
    if ($v === null || $v === '') {
        return null;
    }
    if ($v instanceof DateTimeInterface) {
        return (int)$v->format('Uv');
    }
    if (is_int($v) || is_float($v)) {
        return (int)$v;
    }
    $s = trim((string)$v);
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?)?(Z|[+-]\d{2}:?\d{2})?$/', $s, $m)) {
        $t = strtotime($s);
        return $t === false ? null : $t * 1000;
    }
    $t = gmmktime((int)($m[4] ?? 0), (int)($m[5] ?? 0), (int)($m[6] ?? 0), (int)$m[2], (int)$m[3], (int)$m[1]);
    $ms = isset($m[7]) ? (int)substr(str_pad($m[7], 3, '0'), 0, 3) : 0;
    $off = 0;
    if (!empty($m[8]) && $m[8] !== 'Z') {
        $sign = $m[8][0] === '-' ? -1 : 1;
        $digits = preg_replace('/\D/', '', $m[8]);
        $off = $sign * ((int)substr($digits, 0, 2) * 3600 + (int)substr($digits, 2, 2) * 60);
    }
    return ($t - $off) * 1000 + $ms;
}

/** Normalises any date-like value for a DATETIME(3) column. */
function to_db_dt(mixed $v): ?string
{
    $ms = ts_ms($v);
    return $ms === null ? null : db_dt($ms);
}

function ms_days(int $days): int
{
    return $days * 86400000;
}

// ─────────────────────────────── strings ───────────────────────────────

function e(mixed $s): string
{
    return htmlspecialchars((string)($s ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function slugify(string $s): string
{
    $s = mb_strtolower($s, 'UTF-8');
    if (function_exists('iconv')) {
        $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
        if ($t !== false) {
            $s = $t;
        }
    }
    $s = preg_replace('/[^a-z0-9]+/', '-', $s) ?? '';
    return mb_substr(trim($s, '-'), 0, 80);
}

/** Interview_Final_V2.mp4 → ['group' => 'interviewfinal', 'version' => 2]. */
function parse_versioned_name(string $filename): array
{
    $dot = strrpos($filename, '.');
    $stem = $dot > 0 ? substr($filename, 0, $dot) : $filename;
    $m = [];
    $has = preg_match('/^(.*?)[\s._-]*(?:v|ver|version)[\s._-]?(\d{1,3})$/i', $stem, $m);
    $base = strtolower(preg_replace('/[^a-z0-9]+/i', '', $has ? $m[1] : $stem) ?? '');
    return ['group' => $base !== '' ? $base : 'file', 'version' => $has ? (int)$m[2] : 1];
}

function str_limit(string $s, int $n, string $end = '…'): string
{
    return mb_strlen($s) > $n ? rtrim(mb_substr($s, 0, $n - 1)) . $end : $s;
}

function title_case(string $s): string
{
    return preg_replace_callback('/\b\w/u', fn($m) => mb_strtoupper($m[0]), preg_replace('/[_-]+/', ' ', $s) ?? '') ?? $s;
}

function pluralize(int $n, string $one, ?string $many = null): string
{
    return $n . ' ' . ($n === 1 ? $one : ($many ?? $one . 's'));
}

function initials(?string $name): string
{
    if (!$name) {
        return '?';
    }
    $parts = preg_split('/\s+/u', trim($name)) ?: [];
    $a = mb_substr($parts[0] ?? '', 0, 1);
    $b = count($parts) > 1 ? mb_substr($parts[count($parts) - 1], 0, 1) : '';
    $r = mb_strtoupper($a . $b);
    return $r !== '' ? $r : '?';
}

/** Only a rooted path on this site is accepted as a redirect target. */
function safe_redirect_path(?string $next, string $fallback): string
{
    if ($next === null || $next === '' || strlen($next) > 500) {
        return $fallback;
    }
    return preg_match('/^\/(?![\/\\\\])[^\s\\\\\x00-\x1f\x7f]*$/', $next) ? $next : $fallback;
}

function array_pluck(array $rows, string $key): array
{
    return array_map(fn($r) => $r[$key] ?? null, $rows);
}

function index_by(array $rows, string $key): array
{
    $out = [];
    foreach ($rows as $r) {
        $out[$r[$key]] = $r;
    }
    return $out;
}

function group_by(array $rows, string $key): array
{
    $out = [];
    foreach ($rows as $r) {
        $out[$r[$key]][] = $r;
    }
    return $out;
}

// ─────────────────────────────── formatting (UTC everywhere, exactly as before) ───────────────────────────────

function fmt_bytes(int|float|null $bytes): string
{
    $n = (float)($bytes ?? 0);
    if (!is_finite($n) || $n <= 0) {
        return '0 B';
    }
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $i = min((int)floor(log($n) / log(1024)), count($units) - 1);
    $v = $n / (1024 ** $i);
    return ($v >= 100 || $i === 0 ? (string)round($v) : number_format($v, 1, '.', '')) . ' ' . $units[$i];
}

function fmt_timecode(int|float $ms, bool $withMs = false): string
{
    $total = max(0, (int)floor($ms / 1000));
    $h = intdiv($total, 3600);
    $m = intdiv($total % 3600, 60);
    $s = $total % 60;
    $base = $h > 0 ? sprintf('%d:%02d:%02d', $h, $m, $s) : sprintf('%02d:%02d', $m, $s);
    return $withMs ? $base . '.' . str_pad((string)((int)floor($ms) % 1000), 3, '0', STR_PAD_LEFT) : $base;
}

function fmt_date(mixed $d): string
{
    $ms = ts_ms($d);
    return $ms === null ? '—' : gmdate('M j, Y', intdiv($ms, 1000));
}

function fmt_date_short(mixed $d): string
{
    $ms = ts_ms($d);
    return $ms === null ? '—' : gmdate('M j', intdiv($ms, 1000));
}

/** "Oct 5, 3:00 PM UTC" */
function fmt_datetime(mixed $d): string
{
    $ms = ts_ms($d);
    return $ms === null ? '—' : gmdate('M j, g:i A', intdiv($ms, 1000)) . ' UTC';
}

function time_ago(mixed $d, ?int $nowMs = null): string
{
    $ms = ts_ms($d);
    if ($ms === null) {
        return '—';
    }
    $diff = (int)round((($nowMs ?? now_ms()) - $ms) / 1000);
    $abs = abs($diff);
    $fmt = fn(int $n, string $u) => $diff >= 0 ? "{$n}{$u} ago" : "in {$n}{$u}";
    if ($abs < 45) {
        return $diff >= 0 ? 'just now' : 'in a moment';
    }
    if ($abs < 3600) {
        return $fmt((int)round($abs / 60), 'm');
    }
    if ($abs < 86400) {
        return $fmt((int)round($abs / 3600), 'h');
    }
    if ($abs < 86400 * 30) {
        return $fmt((int)round($abs / 86400), 'd');
    }
    return fmt_date($d);
}

/** Whole calendar days until a date (negative = past), in UTC. */
function days_until(mixed $d, ?int $nowMs = null): ?int
{
    $ms = ts_ms($d);
    if ($ms === null) {
        return null;
    }
    $a = intdiv($ms, 86400000);
    $b = intdiv($nowMs ?? now_ms(), 86400000);
    return $a - $b;
}

function relative_deadline(mixed $d): string
{
    $n = days_until($d);
    if ($n === null) {
        return 'No deadline';
    }
    if ($n < -1) {
        return abs($n) . ' days overdue';
    }
    return match (true) {
        $n === -1 => '1 day overdue',
        $n === 0 => 'Due today',
        $n === 1 => 'Due tomorrow',
        default => "Due in {$n} days",
    };
}

function greeting_for(?int $hour = null): string
{
    if ($hour === null) {
        return 'Welcome back';
    }
    return $hour < 5 ? 'Good evening' : ($hour < 12 ? 'Good morning' : ($hour < 18 ? 'Good afternoon' : 'Good evening'));
}

// ─────────────────────────────── money (integer minor units, explicit currency) ───────────────────────────────

function currency_digits(string $currency): int
{
    $c = strtoupper($currency);
    if (in_array($c, ['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF', 'PYG', 'RWF', 'VUV', 'KMF', 'GNF', 'DJF', 'XPF'], true)) {
        return 0;
    }
    if (in_array($c, ['BHD', 'KWD', 'OMR', 'JOD', 'TND', 'IQD', 'LYD'], true)) {
        return 3;
    }
    return 2;
}

function to_minor(int|float|string $major, string $currency): int
{
    $n = is_string($major) ? (float)preg_replace('/[^0-9.\-]/', '', $major) : (float)$major;
    return is_finite($n) ? (int)round($n * (10 ** currency_digits($currency))) : 0;
}

function from_minor(int $minor, string $currency): float
{
    return $minor / (10 ** currency_digits($currency));
}

function money(?int $minor, string $currency = 'USD', bool $compact = false): string
{
    if ($minor === null) {
        return '—';
    }
    static $symbols = ['USD' => '$', 'EUR' => '€', 'GBP' => '£', 'JPY' => '¥', 'CNY' => 'CN¥', 'INR' => '₹', 'KRW' => '₩', 'CAD' => 'CA$', 'AUD' => 'A$', 'NZD' => 'NZ$', 'MXN' => 'MX$', 'HKD' => 'HK$', 'BRL' => 'R$', 'ILS' => '₪', 'VND' => '₫', 'PHP' => '₱', 'TWD' => 'NT$'];
    $c = strtoupper($currency);
    $digits = currency_digits($c);
    $div = 10 ** $digits;
    $abs = abs($minor);
    $minFrac = $compact && $abs % $div === 0 ? 0 : $digits;
    $num = number_format($abs / $div, $digits, '.', ',');
    if ($minFrac < $digits) {
        $num = number_format($abs / $div, 0, '.', ',');
    }
    $sym = $symbols[$c] ?? ($c . "\u{00A0}");
    return ($minor < 0 ? '-' : '') . $sym . $num;
}

/** @return array{subtotal:int,discount:int,tax:int,total:int,deposit:int,balance:int} */
function compute_totals(array $lines, int $discount = 0, int $taxRateBps = 0, int $depositPercent = 100): array
{
    $subtotal = 0;
    foreach ($lines as $l) {
        $subtotal += (int)round(((float)$l['quantity']) * ((float)$l['unitPrice']));
    }
    $discount = min(max($discount, 0), $subtotal);
    $taxable = $subtotal - $discount;
    $tax = (int)round(($taxable * $taxRateBps) / 10000);
    $total = $taxable + $tax;
    $pct = min(max($depositPercent, 0), 100);
    $deposit = $pct >= 100 ? $total : (int)round(($total * $pct) / 100);
    return ['subtotal' => $subtotal, 'discount' => $discount, 'tax' => $tax, 'total' => $total, 'deposit' => $deposit, 'balance' => $total - $deposit];
}

// ─────────────────────────────── colour (accessible accent text) ───────────────────────────────

function color_parse(string $hex): ?array
{
    return preg_match('/^#?([0-9a-f]{6})$/i', $hex, $m) ? [hexdec(substr($m[1], 0, 2)), hexdec(substr($m[1], 2, 2)), hexdec(substr($m[1], 4, 2))] : null;
}

function color_luminance(array $rgb): float
{
    [$r, $g, $b] = array_map(fn($c) => ($c /= 255) <= 0.03928 ? $c / 12.92 : (($c + 0.055) / 1.055) ** 2.4, $rgb);
    return 0.2126 * $r + 0.7152 * $g + 0.0722 * $b;
}

function color_to_hex(array $rgb): string
{
    return '#' . implode('', array_map(fn($c) => str_pad(dechex((int)round(max(0, min(255, $c)))), 2, '0', STR_PAD_LEFT), $rgb));
}

function contrast_ratio(string $a, string $b): float
{
    $pa = color_parse($a);
    $pb = color_parse($b);
    if (!$pa || !$pb) {
        return 1.0;
    }
    $l = [color_luminance($pa), color_luminance($pb)];
    rsort($l);
    return ($l[0] + 0.05) / ($l[1] + 0.05);
}

function contrast_on(string $hex): string
{
    $rgb = color_parse($hex);
    if (!$rgb) {
        return '#0b0b0c';
    }
    $L = color_luminance($rgb);
    return ($L + 0.05) / 0.05 > 1.05 / ($L + 0.05) ? '#0b0b0c' : '#ffffff';
}

function accent_for_text(string $accent, string $surface, string $toward, float $min = 4.6): string
{
    $rgb = color_parse($accent);
    if (!$rgb) {
        return $accent;
    }
    $target = $toward === 'black' ? 0 : 255;
    for ($t = 0.0; $t <= 1.0001; $t += 0.03) {
        $mixed = color_to_hex(array_map(fn($c) => $c + ($target - $c) * $t, $rgb));
        if (contrast_ratio($mixed, $surface) >= $min) {
            return $mixed;
        }
    }
    return $toward === 'black' ? '#000000' : '#ffffff';
}
