<?php
/**
 * Request / response plumbing: the request object, the JSON API envelope ({ok,data} / {ok:false,error}),
 * security headers, client IP, same-origin (CSRF layer 1), rate limiting and logging.
 */
defined('FEP') or exit;

// ─────────────────────────────── logging (never shown to visitors) ───────────────────────────────

function app_log(string $message): void
{
    $dir = FEP_ROOT . '/storage/logs';
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }
    $line = '[' . gmdate('Y-m-d H:i:s') . ' UTC] ' . preg_replace('/\s+/', ' ', $message) . "\n";
    @file_put_contents($dir . '/app.log', $line, FILE_APPEND | LOCK_EX);
}

// ─────────────────────────────── client identity ───────────────────────────────

function client_ip(): string
{
    $hops = max(0, min(5, (int)cfg('trusted_proxy_hops', 0)));
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    if ($hops > 0) {
        // Each proxy appends the address it saw; the entry `hops` from the right is the one our own proxy recorded.
        $parts = array_values(array_filter(array_map('trim', explode(',', (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '')))));
        if ($parts) {
            $ip = $parts[max(0, count($parts) - $hops)];
        }
    }
    return substr(filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0', 0, 64);
}

function user_agent(): string
{
    return substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 300);
}

/** Origin / Sec-Fetch-Site check — the cheap, effective CSRF layer on top of SameSite cookies + the double-submit token. */
function is_same_origin(): bool
{
    $site = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? null;
    if ($site && $site !== 'same-origin' && $site !== 'none') {
        return false;
    }
    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
    if (!$origin) {
        return true; // non-browser clients still need the CSRF token when cookie-authenticated
    }
    $o = parse_url($origin);
    if (!$o || empty($o['host'])) {
        return false;
    }
    $oHost = strtolower($o['host'] . (isset($o['port']) ? ':' . $o['port'] : ''));
    $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    $app = parse_url(app_url());
    $appHost = strtolower(($app['host'] ?? '') . (isset($app['port']) ? ':' . $app['port'] : ''));
    return $oHost === $host || $oHost === $appHost;
}

// ─────────────────────────────── request ───────────────────────────────

final class Req
{
    public string $method;
    public string $path;
    public array $query;
    public array $params = [];
    private ?string $rawBody = null;
    private mixed $json = null;
    private bool $jsonParsed = false;

    public const MAX_JSON_BYTES = 1000000;

    public function __construct()
    {
        $this->method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        $uri = (string)($_SERVER['REQUEST_URI'] ?? '/');
        $path = rawurldecode((string)parse_url($uri, PHP_URL_PATH));
        $path = preg_replace('#/{2,}#', '/', $path) ?? '/';
        $this->path = ($path !== '/' ? rtrim($path, '/') : '/') ?: '/';
        $this->query = $_GET;
    }

    public function header(string $name): ?string
    {
        $k = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        if ($name === 'content-type' || $name === 'Content-Type') {
            return $_SERVER['CONTENT_TYPE'] ?? null;
        }
        return isset($_SERVER[$k]) ? (string)$_SERVER[$k] : null;
    }

    public function q(string $key, ?string $default = null): ?string
    {
        $v = $this->query[$key] ?? $default;
        return is_array($v) ? ($v[0] ?? $default) : ($v === null ? null : (string)$v);
    }

    public function raw(): string
    {
        if ($this->rawBody === null) {
            $declared = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
            if ($declared > self::MAX_JSON_BYTES) {
                throw new AppError('TOO_LARGE', 'That request is too large.');
            }
            $this->rawBody = (string)file_get_contents('php://input', false, null, 0, self::MAX_JSON_BYTES + 1);
            if (strlen($this->rawBody) > self::MAX_JSON_BYTES) {
                throw new AppError('TOO_LARGE', 'That request is too large.');
            }
        }
        return $this->rawBody;
    }

    /** Decoded JSON body (any JSON value). Invalid JSON is a 400. */
    public function json(): mixed
    {
        if (!$this->jsonParsed) {
            $raw = $this->raw();
            $this->json = json_decode($raw, true);
            if ($raw === '' || json_last_error() !== JSON_ERROR_NONE) {
                throw new AppError('BAD_REQUEST', 'Request body must be valid JSON.');
            }
            $this->jsonParsed = true;
        }
        return $this->json;
    }

    public function isMutating(): bool
    {
        return in_array($this->method, ['POST', 'PUT', 'PATCH', 'DELETE'], true);
    }
}

// ─────────────────────────────── responses ───────────────────────────────

final class Res
{
    public static function security(bool $portal = false): void
    {
        if (headers_sent()) {
            return;
        }
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: strict-origin-when-cross-origin');
        header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self)');
        header('Cross-Origin-Opener-Policy: same-origin');
        if (is_https()) {
            header('Strict-Transport-Security: max-age=63072000; includeSubDomains; preload');
        }
        header('Content-Security-Policy: ' . csp_header());
        if ($portal) {
            header('X-Robots-Tag: noindex, nofollow');
        }
        header_remove('X-Powered-By');
    }

    public static function json(mixed $data, int $status = 200, array $headers = []): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        foreach ($headers as $k => $v) {
            header("{$k}: {$v}");
        }
        echo json_enc(['ok' => true, 'data' => $data ?? ['done' => true]]);
        exit;
    }

    public static function error(AppError|Throwable $e): never
    {
        $status = 500;
        $code = 'INTERNAL';
        $message = 'Something went wrong on our side. Please try again.';
        $fields = null;
        $headers = [];
        if ($e instanceof AppError) {
            $status = $e->status;
            $code = $e->errorCode;
            $message = $e->getMessage();
            $fields = $e->fields;
            if ($e->retryAfterSec) {
                $headers['Retry-After'] = (string)$e->retryAfterSec;
            }
        } else {
            app_log('Unhandled ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine());
            if (cfg('debug', false)) {
                $message = get_class($e) . ': ' . $e->getMessage();
            }
        }
        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store');
            foreach ($headers as $k => $v) {
                header("{$k}: {$v}");
            }
        }
        echo json_enc(['ok' => false, 'error' => array_filter(['code' => $code, 'message' => $message, 'fields' => $fields], fn($x) => $x !== null)]);
        exit;
    }

    public static function redirect(string $to, int $status = 302): never
    {
        http_response_code($status);
        header('Location: ' . $to);
        header('Cache-Control: no-store');
        exit;
    }

    public static function html(string $html, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: text/html; charset=utf-8');
        echo $html;
        exit;
    }

    public static function text(string $body, string $type = 'text/plain; charset=utf-8', int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: ' . $type);
        echo $body;
        exit;
    }
}

/** RFC 6266 / 5987 Content-Disposition with a safe ASCII fallback, so file names with “—”, accents or emoji never break headers. */
function content_disposition(string $name, bool $inline = false): string
{
    $clean = trim(preg_replace('/[\r\n"\\\\]/', '', $name) ?? '') ?: 'file';
    $ascii = preg_replace('/[^\x20-\x7e]/', '_', $clean);
    $enc = preg_replace_callback("/['()*]/", fn($m) => '%' . strtoupper(dechex(ord($m[0]))), rawurlencode($clean));
    return ($inline ? 'inline' : 'attachment') . '; filename="' . $ascii . '"; filename*=UTF-8\'\'' . $enc;
}

/** Content-Security-Policy, built per request from the configuration. */
function csp_header(): string
{
    $turnstile = cfg('turnstile.secret_key') && cfg('turnstile.site_key') ? 'https://challenges.cloudflare.com' : '';
    $join = fn(string ...$p) => implode(' ', array_filter($p));
    return implode('; ', [
        "default-src 'self'",
        $join("script-src 'self' 'unsafe-inline'", $turnstile),
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "media-src 'self' blob: https:",
        $join("connect-src 'self'", $turnstile),
        "font-src 'self' data:",
        $join('frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com', $turnstile),
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
    ]);
}

// ─────────────────────────────── rate limiting (fixed window, kept in the database) ───────────────────────────────

/** Records a hit and returns [allowed, retryAfterSec]. Shared hosting has no shared memory, so the counters live in MySQL. */
function rate_hit(string $key, int $limit, int $windowMs): array
{
    $key = substr($key, 0, 190);
    $now = now_ms();
    $reset = $now + $windowMs;
    Db::exec('INSERT INTO `rate_limits` (`k`, `hits`, `resetAt`) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE `hits` = IF(`resetAt` <= ?, 1, `hits` + 1), `resetAt` = IF(`resetAt` <= ?, ?, `resetAt`)', [$key, $reset, $now, $now, $reset]);
    $row = Db::rowRaw('SELECT `hits`, `resetAt` FROM `rate_limits` WHERE `k` = ?', [$key]);
    if (random_int(1, 200) === 1) {
        Db::exec('DELETE FROM `rate_limits` WHERE `resetAt` < ?', [$now - 60000]);
    }
    return [(int)$row['hits'] <= $limit, max(1, (int)ceil(((int)$row['resetAt'] - $now) / 1000))];
}

function rate_limit(string $key, int $limit, int $windowMs, string $message = 'Too many attempts. Please wait a moment and try again.'): void
{
    // A test switch for local runs only — ignored unless debug is on, so a stray setting can never turn protection off.
    if (cfg('debug', false) && getenv('FEP_DISABLE_RATE_LIMIT') === '1') {
        return;
    }
    [$ok, $retry] = rate_hit($key, $limit, $windowMs);
    if (!$ok) {
        throw new AppError('RATE_LIMITED', $message, null, $retry);
    }
}

function rate_reset(string $key): void
{
    Db::exec('DELETE FROM `rate_limits` WHERE `k` = ?', [substr($key, 0, 190)]);
}
