<?php
/**
 * File storage. Files live outside the web tree's reach (storage/uploads is closed by .htaccess) and are only ever handed out by
 * the application, through short-lived signed links minted after the ownership checks. The database stores just the storage key.
 *
 * Uploads are sent in pieces (chunks) so big video files work on hosting plans with small request limits; a chunk that is
 * interrupted can be resent. Stored object names are random — nothing the uploader typed ever becomes part of a path.
 */
defined('FEP') or exit;

final class LocalStorage
{
    public string $name = 'local';

    public function root(): string
    {
        $dir = (string)cfg('storage.dir', FEP_ROOT . '/storage/uploads');
        if (!is_dir($dir)) {
            @mkdir($dir, 0750, true);
        }
        return rtrim((string)(realpath($dir) ?: $dir), '/\\');
    }

    /** Resolves a storage key to a path inside the storage root, refusing traversal. */
    public function path(string $key): string
    {
        if ($key === '' || str_contains($key, "\0") || str_contains($key, '\\')) {
            throw new RuntimeException('Invalid storage key');
        }
        foreach (explode('/', $key) as $seg) {
            if ($seg === '' || $seg === '.' || $seg === '..') {
                throw new RuntimeException('Invalid storage key');
            }
        }
        if ($this->isBundled($key)) { // the sample media that ships with the demo data (read-only, lives in assets/demo)
            // demo/<asset id>~<file name>: every sample asset has its own (unique) key but they share the bundled files
            $name = preg_replace('/^[A-Za-z0-9_-]{8,40}~/', '', substr($key, 5));
            if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/', $name)) {
                throw new RuntimeException('Invalid storage key');
            }
            return FEP_ROOT . '/assets/demo/' . $name;
        }
        return $this->root() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $key);
    }

    /** Sample media referenced by the optional demo data. Never written to or deleted by the application. */
    public function isBundled(string $key): bool
    {
        return str_starts_with($key, 'demo/') && substr_count($key, '/') === 1;
    }

    public function partialPath(string $key): string
    {
        $dir = FEP_ROOT . '/storage/tmp';
        if (!is_dir($dir)) {
            @mkdir($dir, 0750, true);
        }
        return $dir . '/' . sha1($key) . '.part';
    }

    /** @return array{url:string,method:string,headers:array,expiresAt:string,chunkBytes:int} */
    public function uploadTarget(string $key, string $contentType, int $size, int $expiresSec = 3600): array
    {
        $exp = now_ms() + $expiresSec * 1000;
        $t = sign_payload(['op' => 'put', 'k' => $key, 'ct' => $contentType, 'max' => $size, 'exp' => $exp], 'storage');
        return ['url' => '/api/storage/object?t=' . $t, 'method' => 'PUT', 'headers' => ['content-type' => 'application/octet-stream'], 'expiresAt' => iso_dt($exp), 'chunkBytes' => max(1, (int)cfg('storage.chunk_mb', 4)) * 1048576];
    }

    public function downloadUrl(string $key, array $opts = []): string
    {
        $exp = now_ms() + (int)($opts['expiresSec'] ?? 3600) * 1000;
        return '/api/storage/object?t=' . sign_payload(['op' => 'get', 'k' => $key, 'fn' => $opts['filename'] ?? null, 'ct' => $opts['contentType'] ?? null, 'inl' => !empty($opts['inline']), 'exp' => $exp], 'storage');
    }

    public function head(string $key): ?array
    {
        try {
            $p = $this->path($key);
            return is_file($p) ? ['size' => (int)filesize($p)] : null;
        } catch (Throwable) {
            return null;
        }
    }

    public function remove(string $key): void
    {
        if ($this->isBundled($key)) {
            return;
        }
        try {
            $p = $this->path($key);
            if (is_file($p)) {
                @unlink($p);
            }
        } catch (Throwable) {
        }
    }

    public function put(string $key, string $body, string $contentType = ''): void
    {
        if ($this->isBundled($key)) {
            throw new RuntimeException('Bundled sample media is read-only');
        }
        $p = $this->path($key);
        if (!is_dir(dirname($p))) {
            mkdir(dirname($p), 0750, true);
        }
        file_put_contents($p, $body, LOCK_EX);
    }

    public function read(string $key, int $maxBytes = 52428800): string
    {
        $p = $this->path($key);
        if (filesize($p) > $maxBytes) {
            throw new RuntimeException('Object too large to read into memory');
        }
        return (string)file_get_contents($p);
    }

    /** The first bytes of an object (for content sniffing) without reading the rest. */
    public function readHead(string $key, int $bytes = 512): string
    {
        $fh = fopen($this->path($key), 'rb');
        if (!$fh) {
            return '';
        }
        $b = (string)fread($fh, $bytes);
        fclose($fh);
        return $b;
    }
}

function storage(): LocalStorage
{
    static $s = null;
    return $s ??= new LocalStorage();
}

/** RFC 7233 range streaming of a file to the browser (so the review player can seek). */
function stream_file(string $file, string $type, string $disposition, array $extraHeaders = []): never
{
    $size = (int)filesize($file);
    $start = 0;
    $end = $size - 1;
    $status = 200;
    $range = $_SERVER['HTTP_RANGE'] ?? null;
    if ($range && preg_match('/bytes=(\d*)-(\d*)/', $range, $m) && ($m[1] !== '' || $m[2] !== '')) {
        if ($m[1] === '') {
            $start = max(0, $size - (int)$m[2]);
            $end = $size - 1;
        } else {
            $start = (int)$m[1];
            $end = ($m[2] === '' || (int)$m[2] >= $size) ? $size - 1 : (int)$m[2];
        }
        if ($start > $end || $start >= $size) {
            http_response_code(416);
            header("Content-Range: bytes */{$size}");
            exit;
        }
        $status = 206;
    }
    while (ob_get_level() > 0) {
        @ob_end_clean();
    }
    http_response_code($status);
    header('Content-Type: ' . $type);
    header('Accept-Ranges: bytes');
    header('Content-Disposition: ' . $disposition);
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: sandbox; default-src 'none'");
    header('Cache-Control: private, max-age=300');
    foreach ($extraHeaders as $k => $v) {
        header("{$k}: {$v}");
    }
    if ($status === 206) {
        header("Content-Range: bytes {$start}-{$end}/{$size}");
    }
    header('Content-Length: ' . ($end - $start + 1));
    if ($_SERVER['REQUEST_METHOD'] === 'HEAD') {
        exit;
    }
    @set_time_limit(0);
    $fh = fopen($file, 'rb');
    fseek($fh, $start);
    $left = $end - $start + 1;
    while ($left > 0 && !feof($fh) && !connection_aborted()) {
        $chunk = fread($fh, min(262144, $left));
        if ($chunk === false || $chunk === '') {
            break;
        }
        echo $chunk;
        $left -= strlen($chunk);
        flush();
    }
    fclose($fh);
    exit;
}

/**
 * What the first bytes of an uploaded file say it is. The declared MIME type and the file extension are chosen by the uploader,
 * so they can't be trusted on their own: this catches programs and web pages dressed up as media or documents.
 * @return 'executable'|'script'|'markup'|'other'
 */
function sniff_content(string $head): string
{
    $n = strlen($head);
    if ($n >= 2 && $head[0] === 'M' && $head[1] === 'Z') {
        return 'executable'; // Windows PE / DOS
    }
    if ($n >= 4 && substr($head, 0, 4) === "\x7fELF") {
        return 'executable';
    }
    if ($n >= 4) {
        $magic = unpack('N', substr($head, 0, 4))[1];
        if (in_array($magic, [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe], true)) {
            return 'executable'; // Mach-O, fat binaries, Java class files
        }
    }
    if ($n >= 2 && $head[0] === '#' && $head[1] === '!') {
        return 'script';
    }
    $text = strtolower(ltrim(preg_replace('/^\xEF\xBB\xBF/', '', substr($head, 0, 512)) ?? ''));
    if (preg_match('/^(<!doctype\s+html|<html|<head|<body|<script|<iframe|<\?php|<\?=)/', $text)) {
        return 'markup';
    }
    return 'other';
}

/** Returns why a file must be refused, or null when its contents are consistent with what it claims to be. */
function content_problem(string $kind, string $mime, string $filename): ?string
{
    $text = str_starts_with($mime, 'text/') || $mime === 'application/json' || preg_match('/\.(txt|csv|json|srt|vtt|ass|lut|cube|md)$/i', $filename);
    if ($kind === 'executable') {
        return "It looks like a program, which isn't allowed for security reasons.";
    }
    if ($kind === 'script' && !$text) {
        return "Its contents look like a script rather than the file type it claims to be.";
    }
    if ($kind === 'markup' && !$text) {
        return "Its contents look like a web page rather than the file type it claims to be.";
    }
    return null;
}
