<?php
/**
 * Routing and the API wrapper (a port of the previous authRoute / publicRoute): authentication → same-origin check →
 * CSRF token → rate limit → input validation → handler → JSON envelope.
 */
defined('FEP') or exit;

final class Ctx
{
    public Req $req;
    public ?Actor $actor;
    public mixed $body = null;
    public array $query = [];
    public array $params = [];
    public string $ip;

    public function need(): Actor
    {
        return $this->actor ?? throw new AppError('UNAUTHENTICATED', 'Please sign in to continue.');
    }
}

/** A file / streamed response returned by a handler (instead of a JSON envelope). */
final class RawResponse
{
    public function __construct(public $send) {}
}

final class Router
{
    /** @var array<int,array{method:string,pattern:string,segs:array,kind:string,fn:callable,opts:array}> */
    private static array $routes = [];

    public static function add(string $kind, string $method, string $pattern, callable $fn, array $opts = []): void
    {
        self::$routes[] = ['method' => $method, 'pattern' => $pattern, 'segs' => explode('/', trim($pattern, '/')), 'kind' => $kind, 'fn' => $fn, 'opts' => $opts];
    }

    /** @return array{0:?array,1:array} [matched route or null, methods allowed for that path] */
    public static function match(string $method, string $path): array
    {
        $parts = $path === '/' ? [''] : explode('/', trim($path, '/'));
        $best = null;
        $bestScore = null;
        $allowed = [];
        foreach (self::$routes as $r) {
            $segs = $r['segs'];
            if ($r['pattern'] === '/') {
                $segs = [''];
            }
            if (count($segs) !== count($parts)) {
                continue;
            }
            $params = [];
            $score = [];
            $ok = true;
            foreach ($segs as $i => $s) {
                if ($s !== '' && $s[0] === '{') {
                    $params[trim($s, '{}')] = $parts[$i];
                    $score[] = 1;
                } elseif ($s === $parts[$i]) {
                    $score[] = 2;
                } else {
                    $ok = false;
                    break;
                }
            }
            if (!$ok) {
                continue;
            }
            $allowed[$r['method']] = true;
            if ($r['method'] !== $method && !($method === 'HEAD' && $r['method'] === 'GET')) {
                continue;
            }
            if ($bestScore === null || $score > $bestScore) {
                $bestScore = $score;
                $best = $r + ['params' => $params];
            }
        }
        return [$best, array_keys($allowed)];
    }
}

// ─────────────────────────────── registration helpers ───────────────────────────────

/**
 * API endpoint. $opts: auth (default true) · body (V schema) · query (V schema) · rate [name, limit, windowSec, 'ip'|'user']
 * · status (default 200) · csrf (default true; false for webhooks / signature-verified endpoints).
 */
function api(string $method, string $pattern, callable $fn, array $opts = []): void
{
    Router::add('api', $method, $pattern, $fn, $opts + ['auth' => true]);
}

/** Open API endpoint (lead forms, webhooks, login). $c->actor is set when a valid session is present. */
function api_public(string $method, string $pattern, callable $fn, array $opts = []): void
{
    Router::add('api', $method, $pattern, $fn, ['auth' => false] + $opts);
}

/** HTML page. The handler prints via View::render or returns nothing. */
function page(string $pattern, callable $fn, array $opts = []): void
{
    Router::add('page', 'GET', $pattern, $fn, $opts);
}

function page_post(string $pattern, callable $fn, array $opts = []): void
{
    Router::add('page', 'POST', $pattern, $fn, $opts);
}

// ─────────────────────────────── execution ───────────────────────────────

final class App
{
    public static function run(): void
    {
        $req = new Req();
        $path = $req->path;
        $isApi = str_starts_with($path, '/api/') || $path === '/api';
        $portal = (bool)preg_match('#^/(dashboard|admin|editor)(/|$)#', $path);

        try {
            Res::security($portal);
            if ($req->method === 'OPTIONS') {
                http_response_code(204);
                exit;
            }
            // Convenience redirect for signed-out visitors (real authorization still happens in every page and API call).
            if ($portal && empty($_COOKIE[Sessions::COOKIE])) {
                Res::redirect('/login?next=' . rawurlencode($path . (!empty($_SERVER['QUERY_STRING']) ? '?' . $_SERVER['QUERY_STRING'] : '')));
            }
            [$route, $allowed] = Router::match($req->method, $path);
            if (!$route) {
                if ($allowed) {
                    header('Allow: ' . implode(', ', $allowed));
                    if ($isApi) {
                        Res::error(new AppError('BAD_REQUEST', 'Method not allowed.'));
                    }
                    http_response_code(405);
                    exit;
                }
                $isApi ? Res::error(new AppError('NOT_FOUND', 'Not found.')) : Pages::notFound();
            }
            $req->params = $route['params'];
            if ($route['kind'] === 'api') {
                self::runApi($req, $route);
            } else {
                self::runPage($req, $route);
            }
        } catch (Throwable $e) {
            if ($isApi || ($e instanceof AppError && $isApi)) {
                Res::error($e);
            }
            Pages::fromException($e, $req);
        }
    }

    private static function runApi(Req $req, array $route): void
    {
        $opts = $route['opts'];
        $c = new Ctx();
        $c->req = $req;
        $c->ip = client_ip();
        $c->params = $req->params;
        $c->actor = actor();
        if (($opts['auth'] ?? true) && !$c->actor) {
            throw new AppError('UNAUTHENTICATED', 'Please sign in to continue.');
        }
        if ($req->isMutating() && ($opts['csrf'] ?? true)) {
            if (!is_same_origin()) {
                throw new AppError('FORBIDDEN', 'Cross-site request blocked.');
            }
            // Any request that rides on a session cookie must prove intent with the double-submit token.
            if ($c->actor) {
                $sent = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
                if ($sent === '' || !safe_equal(Sessions::csrfFor($c->actor->sessionHash), $sent)) {
                    throw new AppError('FORBIDDEN', 'Security token missing or expired. Refresh the page and try again.');
                }
            }
        }
        if (!empty($opts['rate'])) {
            [$name, $limit, $windowSec] = $opts['rate'];
            $by = $opts['rate'][3] ?? 'ip';
            rate_limit($name . ':' . ($by === 'user' && $c->actor ? $c->actor->userId : $c->ip), $limit, $windowSec * 1000);
        }
        $c->query = isset($opts['query']) ? $opts['query']->parse($req->query) : $req->query;
        if (isset($opts['body'])) {
            // an empty body is only acceptable for schemas that have a default (e.g. "complete upload" with no options)
            $c->body = $opts['body']->parse($req->raw() === '' ? null : $req->json());
        }
        $result = ($route['fn'])($c);
        if ($result instanceof RawResponse) {
            ($result->send)();
            exit;
        }
        Res::json($result, $opts['status'] ?? 200);
    }

    private static function runPage(Req $req, array $route): void
    {
        $c = new Ctx();
        $c->req = $req;
        $c->ip = client_ip();
        $c->params = $req->params;
        $c->query = $req->query;
        $c->actor = actor();
        if ($req->method === 'POST') {
            if (!is_same_origin()) {
                throw new AppError('FORBIDDEN', 'Cross-site request blocked.');
            }
            if ($c->actor) {
                $sent = (string)($_POST['_csrf'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
                if ($sent === '' || !safe_equal(Sessions::csrfFor($c->actor->sessionHash), $sent)) {
                    throw new AppError('FORBIDDEN', 'Security token missing or expired. Refresh the page and try again.');
                }
            }
        }
        ($route['fn'])($c);
    }
}
