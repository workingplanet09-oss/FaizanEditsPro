<?php
/** Template rendering, icons and the error pages. Templates are plain PHP files in app/views/. */
defined('FEP') or exit;

final class View
{
    /** Renders app/views/{name}.php with $vars and returns the HTML. */
    public static function capture(string $name, array $vars = []): string
    {
        $file = FEP_ROOT . '/app/views/' . $name . '.php';
        if (!is_file($file)) {
            throw new LogicException("Missing view {$name}");
        }
        return (static function (string $__file, array $__vars): string {
            extract($__vars, EXTR_SKIP);
            ob_start();
            try {
                include $__file;
            } catch (Throwable $e) {
                ob_end_clean();
                throw $e;
            }
            return (string)ob_get_clean();
        })($file, $vars);
    }

    /** Renders a view inside a layout ("layouts/site", "layouts/portal"…) and sends it. $vars['title'], ['description'], … feed the layout. */
    public static function send(string $layout, string $name, array $vars = [], int $status = 200): never
    {
        $vars['content'] = self::capture($name, $vars);
        Res::html(self::capture('layouts/' . $layout, $vars), $status);
    }
}

/** Renders a partial (a view without a layout) and echoes it. */
function partial(string $name, array $vars = []): void
{
    echo View::capture($name, $vars);
}

/** Inline SVG icon from the same icon set the previous UI used (looked up by name). */
function icon(string $name, int $size = 18, string $class = '', float $stroke = 1.75, string $label = ''): string
{
    static $icons = null;
    $icons ??= json_decode((string)file_get_contents(FEP_ROOT . '/app/data/icons.json'), true) ?: [];
    $inner = $icons[$name] ?? ($icons['sparkles'] ?? '');
    $cls = trim('lucide lucide-' . $name . ' ' . $class);
    $aria = $label !== '' ? ' role="img" aria-label="' . e($label) . '"' : ' aria-hidden="true"';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' . $size . '" height="' . $size . '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' . $stroke . '" stroke-linecap="round" stroke-linejoin="round" class="' . e($cls) . '"' . $aria . '>' . $inner . '</svg>';
}

/** URL of a static asset with a cache-busting version taken from the file's modification time. */
function asset(string $path): string
{
    $file = FEP_ROOT . '/assets/' . ltrim($path, '/');
    return '/assets/' . ltrim($path, '/') . (is_file($file) ? '?v=' . dechex((int)filemtime($file)) : '');
}

/** Error and status pages. */
final class Pages
{
    public static function error(int $status, string $code, string $icon, string $title, string $description, array $actions = [['Go to homepage', '/', true]]): never
    {
        if (is_file(FEP_ROOT . '/app/views/error.php')) {
            View::send('bare', 'error', compact('status', 'code', 'icon', 'title', 'description', 'actions'), $status);
        }
        Res::html('<!doctype html><meta charset="utf-8"><title>' . e($title) . '</title><body style="font-family:system-ui;padding:3rem"><h1>' . e($title) . '</h1><p>' . e($description) . '</p></body>', $status);
    }

    public static function notFound(): never
    {
        self::error(404, '404', 'search', "We couldn't find that page", "The link may be out of date, or the page may have moved. Nothing is broken on your end.", [['Go to homepage', '/', true], ['See our work', '/work', false], ['Sign in', '/login', false]]);
    }

    public static function forbidden(): never
    {
        self::error(403, '403', 'lock', "You don't have access to this", 'This area is limited to certain team members or to the account that owns it. If you think that\'s a mistake, ask the account owner or the studio to grant access.', [['Back to my dashboard', '/dashboard', true], ['Switch account', '/login', false]]);
    }

    public static function serverError(): never
    {
        self::error(500, '500', 'warning', 'Something went wrong on our side', "The page hit an unexpected error. It's been logged and your data is safe. Try again — if it keeps happening, let us know.", [['Go to homepage', '/', true]]);
    }

    public static function fromException(Throwable $e, Req $req): never
    {
        if ($e instanceof AppError) {
            switch ($e->errorCode) {
                case 'NOT_FOUND':
                    self::notFound();
                case 'FORBIDDEN':
                    self::forbidden();
                case 'UNAUTHENTICATED':
                    Res::redirect('/login?expired=1&next=' . rawurlencode($req->path));
                case 'RATE_LIMITED':
                    self::error(429, '429', 'clock', 'Too many requests', $e->getMessage(), [['Go to homepage', '/', true]]);
            }
        }
        if ($e instanceof AppError && $e->errorCode === 'UNAVAILABLE') {
            self::error(503, '503', 'warning', 'The site is starting up', "We can't reach the database right now. If you are the site owner, check the database details in config.php and make sure database.sql was imported.", [['Try again', $req->path, true]]);
        }
        app_log('Unhandled ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine());
        if (cfg('debug', false)) {
            Res::html('<pre style="padding:1rem;white-space:pre-wrap">' . e(get_class($e) . ': ' . $e->getMessage() . "\n" . $e->getTraceAsString()) . '</pre>', 500);
        }
        self::serverError();
    }
}
