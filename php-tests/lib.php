<?php
/**
 * Shared helpers for the PHP test scripts: boots the application code (so tests can use the same database layer),
 * an HTTP client with a cookie jar that talks to the running app, and a tiny check/report facility.
 *
 *   FEP_STRICT=1 FEP_DISABLE_RATE_LIMIT=1 php -S 127.0.0.1:8081 -t public_html php-tests/dev-router.php   (terminal 1)
 *   php php-tests/e2e-workflow.php                                                                          (terminal 2)
 */
define('FEP', true);
define('FEP_ROOT', dirname(__DIR__) . '/public_html');
define('FEP_CONFIG_OVERRIDE', require __DIR__ . '/test-config.php');
putenv('FEP_DISABLE_RATE_LIMIT=1');
require FEP_ROOT . '/app/bootstrap.php';

$GLOBALS['T'] = ['passed' => 0, 'failed' => 0, 'failures' => []];

function t_base(): string { return rtrim(getenv('FEP_TEST_URL') ?: 'http://127.0.0.1:8081', '/'); }

function check(string $name, bool $ok, mixed $detail = null): void
{
    $T = &$GLOBALS['T'];
    if ($ok) {
        $T['passed']++;
        echo "  \033[32m✓\033[0m {$name}\n";
        return;
    }
    $T['failed']++;
    $T['failures'][] = $name;
    $d = $detail === null ? '' : "\n      " . mb_substr(is_string($detail) ? $detail : json_encode($detail, JSON_UNESCAPED_UNICODE), 0, 500);
    echo "  \033[31m✗ {$name}\033[0m{$d}\n";
}

function step(string|int $n, string $title): void { echo "\n\033[1m" . (is_int($n) ? "Step {$n}" : $n) . ": {$title}\033[0m\n"; }

function summary(): int
{
    $T = $GLOBALS['T'];
    echo "\n" . str_repeat('═', 60) . "\n" . ($T['failed'] ? "\033[31m" : "\033[32m") . "{$T['passed']} passed, {$T['failed']} failed\033[0m\n";
    if ($T['failed']) {
        echo "\nFailures:\n" . implode("\n", array_map(fn($f) => "  • {$f}", $T['failures'])) . "\n";
    }
    return $T['failed'] ? 1 : 0;
}

final class Http
{
    /** @var array<string,string> */
    public array $jar = [];

    public function __construct(public string $who = '') {}

    /** @return array{status:int,json:mixed,data:mixed,error:mixed,text:string,headers:array} */
    public function call(string $method, string $path, mixed $body = null, array $opts = []): array
    {
        $headers = [];
        foreach ($opts['headers'] ?? [] as $k => $v) {
            $headers[] = "{$k}: {$v}";
        }
        if ($body !== null) {
            $headers[] = 'Content-Type: application/json';
        }
        if ($this->jar) {
            $headers[] = 'Cookie: ' . implode('; ', array_map(fn($k, $v) => "{$k}={$v}", array_keys($this->jar), $this->jar));
        }
        if (($opts['csrf'] ?? true) && isset($this->jar['fe_csrf'])) {
            $headers[] = 'X-CSRF-Token: ' . $this->jar['fe_csrf'];
        }
        $ch = curl_init(str_starts_with($path, 'http') ? $path : t_base() . $path);
        $resp = [];
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers, CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => 120,
            CURLOPT_POSTFIELDS => $body === null ? null : (is_string($body) && ($opts['raw'] ?? false) ? $body : json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION)),
            CURLOPT_HEADERFUNCTION => function ($c, $line) use (&$resp) {
                if (str_contains($line, ':')) {
                    [$k, $v] = explode(':', $line, 2);
                    $resp[strtolower(trim($k))][] = trim($v);
                }
                return strlen($line);
            },
        ]);
        $text = (string)curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        foreach ($resp['set-cookie'] ?? [] as $sc) {
            $pair = explode(';', $sc)[0];
            $i = strpos($pair, '=');
            $name = substr($pair, 0, $i);
            $val = substr($pair, $i + 1);
            if ($val === '' || preg_match('/expires=thu, 01[- ]jan[- ]1970/i', $sc)) {
                unset($this->jar[$name]);
            } else {
                $this->jar[$name] = $val;
            }
        }
        $json = json_decode($text, true);
        return ['status' => $status, 'json' => $json, 'data' => $json['data'] ?? null, 'error' => $json['error'] ?? null, 'text' => $text, 'headers' => $resp];
    }
    public function get(string $p): array { return $this->call('GET', $p); }
    public function post(string $p, mixed $b = []): array { return $this->call('POST', $p, $b); }
    public function put(string $p, mixed $b = []): array { return $this->call('PUT', $p, $b); }
    public function patch(string $p, mixed $b = []): array { return $this->call('PATCH', $p, $b); }
    public function del(string $p): array { return $this->call('DELETE', $p); }
}

/** Runs the queued background jobs in-process (the app under test shares this database). */
function drain(): void
{
    for ($i = 0; $i < 6; $i++) {
        $r = run_jobs(['limit' => 100, 'budgetMs' => 20000]);
        if ($r['processed'] === 0) {
            break;
        }
    }
}

function make_staff(string $email, string $name, string $roleKey, string $password): array
{
    $ws = workspace_id();
    $role = Db::first('roles', ['key' => $roleKey]);
    $u = Db::insert('users', ['workspaceId' => $ws, 'email' => $email, 'name' => $name, 'passwordHash' => hash_password($password), 'isStaff' => true, 'status' => 'ACTIVE', 'emailVerifiedAt' => now_ms(), 'isDemo' => true]);
    Db::insert('user_roles', ['userId' => $u['id'], 'roleId' => $role['id']], false);
    return $u;
}

function magic_login(Http $http, string $email): array
{
    $r = $http->post('/api/auth/magic', ['email' => $email]);
    if ($r['status'] !== 200) {
        return ['ok' => false, 'r' => $r];
    }
    drain();
    $log = Db::first('email_logs', ['toEmail' => $email, 'templateKey' => 'magic_link'], ['order' => '`createdAt` DESC']);
    if (!$log || !preg_match('/token=([A-Za-z0-9_-]+)/', $log['body'], $m)) {
        return ['ok' => false, 'r' => $r];
    }
    $t = $http->post('/api/auth/token', ['type' => 'magic', 'token' => $m[1]]);
    return ['ok' => $t['status'] === 200, 'r' => $t];
}

function sample_answer(array $q): mixed
{
    return match ($q['type']) {
        'SELECT', 'RADIO' => $q['options'][0]['value'] ?? 'x',
        'MULTI_SELECT' => [$q['options'][0]['value'] ?? 'x'],
        'NUMBER', 'CURRENCY' => 3,
        'EMAIL' => 'e2e-' . t_run() . '@example.com',
        'URL' => 'https://example.com',
        'PHONE' => '+1 555 010 0100',
        'DATE' => '2026-12-01',
        'COLOR' => '#112233',
        'TEXTAREA' => 'This is an end-to-end test answer that is comfortably longer than the minimum length.',
        default => 'E2E ' . $q['key'],
    };
}
function t_run(): string { static $r = null; return $r ??= base_convert((string)(int)(microtime(true) * 1000), 10, 36); }

/** Fill every required + visible question in a form with a plausible value (this also exercises the dynamic question engine). */
function fill_required(array $form, array $seed = [], array $extra = []): array
{
    $answers = $seed;
    for ($pass = 0; $pass < 4; $pass++) {
        foreach ($form['sections'] as $s) {
            foreach (visible_questions($form, $s, $answers, $extra) as $q) {
                if (empty($q['required']) || array_key_exists($q['key'], $answers)) {
                    continue;
                }
                $answers[$q['key']] = sample_answer($q);
            }
        }
    }
    return $answers;
}

/** Uploads a file the way the browser does: upload-url → chunked PUTs → complete. */
function upload_file(Http $http, array $in): array
{
    $bytes = $in['bytes'];
    $r = $http->post('/api/assets/upload-url', array_filter([
        'purpose' => $in['purpose'] ?? null, 'projectId' => $in['projectId'] ?? null, 'folderKey' => $in['folderKey'] ?? null, 'filename' => $in['filename'], 'size' => strlen($bytes),
        'mimeType' => $in['mime'], 'label' => $in['label'] ?? null, 'draftToken' => $in['draftToken'] ?? null, 'clientId' => $in['clientId'] ?? null,
    ], fn($v) => $v !== null));
    if ($r['status'] !== 201) {
        return ['ok' => false, 'stage' => 'upload-url', 'r' => $r];
    }
    ['asset' => $asset, 'upload' => $upload] = $r['data'];
    $chunk = (int)($upload['chunkBytes'] ?? 4194304);
    $total = strlen($bytes);
    for ($off = 0; $off < $total; $off += $chunk) {
        $part = substr($bytes, $off, $chunk);
        $put = (new Http())->call('PUT', $upload['url'], $part, ['raw' => true, 'csrf' => false, 'headers' => ['Content-Type' => 'application/octet-stream', 'Content-Range' => 'bytes ' . $off . '-' . ($off + strlen($part) - 1) . '/' . $total]]);
        if ($put['status'] !== 200) {
            return ['ok' => false, 'stage' => 'put', 'r' => $put];
        }
    }
    $c = $http->post("/api/assets/{$asset['id']}/complete", isset($in['draftToken']) ? ['draftToken' => $in['draftToken']] : (object)[]);
    if ($c['status'] !== 200) {
        return ['ok' => false, 'stage' => 'complete', 'r' => $c];
    }
    return ['ok' => true, 'asset' => $c['data']];
}

function fake_video(int $kb = 300): string { return "\0\0\0\x18ftyp" . random_bytes($kb * 1024); }
