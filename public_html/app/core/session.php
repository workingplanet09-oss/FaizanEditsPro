<?php
/**
 * Sessions — PHP's native session mechanism, stored in the `sessions` table.
 *
 *  • The browser holds only a random session id (cookie `fe_session`: HttpOnly, SameSite=Lax, Secure on HTTPS).
 *  • The database holds sha256(session id), the user, expiry, IP and user agent — so any session can be revoked
 *    (sign out everywhere, password change, suspended user) and a leaked database never contains usable ids.
 *  • A fresh id is generated at every sign-in and any previous session is destroyed first, so a planted or stale id is never reused
 *    (session-fixation protection). `session.use_strict_mode` also refuses ids the server did not issue.
 *  • CSRF: a second, script-readable cookie `fe_csrf` carries an HMAC bound to the session; JavaScript echoes it in the
 *    `X-CSRF-Token` header on every state-changing request (double-submit) on top of the same-origin check.
 */
defined('FEP') or exit;

final class FepSessionHandler implements SessionHandlerInterface, SessionUpdateTimestampHandlerInterface
{
    public function open(string $path, string $name): bool { return true; }
    public function close(): bool { return true; }

    public function read(string $id): string|false
    {
        $d = Db::val('SELECT `data` FROM `sessions` WHERE `tokenHash` = ? AND `expiresAt` > ?', [sha256_hex($id), db_dt()]);
        return (string)($d ?? '');
    }

    public function write(string $id, string $data): bool
    {
        Db::exec('UPDATE `sessions` SET `data` = ? WHERE `tokenHash` = ?', [$data, sha256_hex($id)]);
        return true;
    }

    public function destroy(string $id): bool
    {
        Db::exec('DELETE FROM `sessions` WHERE `tokenHash` = ?', [sha256_hex($id)]);
        return true;
    }

    public function gc(int $max_lifetime): int|false
    {
        return Db::exec('DELETE FROM `sessions` WHERE `expiresAt` < ?', [db_dt()]);
    }

    public function validateId(string $id): bool
    {
        return Db::val('SELECT 1 FROM `sessions` WHERE `tokenHash` = ? AND `expiresAt` > ?', [sha256_hex($id), db_dt()]) !== null;
    }

    /** Sliding expiry: extended at most every 10 minutes so reads stay cheap. */
    public function updateTimestamp(string $id, string $data): bool
    {
        $now = now_ms();
        Db::exec('UPDATE `sessions` SET `lastUsedAt` = ?, `expiresAt` = ? WHERE `tokenHash` = ? AND `lastUsedAt` < ?', [db_dt($now), db_dt($now + Sessions::TTL_MS), sha256_hex($id), db_dt($now - 600000)]);
        return true;
    }
}

final class Sessions
{
    public const COOKIE = 'fe_session';
    public const CSRF_COOKIE = 'fe_csrf';
    public const TTL_MS = 30 * 86400 * 1000;

    private static bool $configured = false;

    private static function configure(): void
    {
        if (self::$configured) {
            return;
        }
        self::$configured = true;
        ini_set('session.use_cookies', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_trans_sid', '0');
        ini_set('session.cookie_httponly', '1');
        ini_set('session.gc_probability', '0'); // expired rows are swept by the housekeeping job instead
        session_name(self::COOKIE);
        session_set_cookie_params(['lifetime' => intdiv(self::TTL_MS, 1000), 'path' => '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
        session_set_save_handler(new FepSessionHandler(), true);
    }

    /** CSRF token bound to a session (its stored hash). */
    public static function csrfFor(string $tokenHash): string
    {
        return hmac_sig($tokenHash, 'csrf');
    }

    private static function setCsrfCookie(string $tokenHash): void
    {
        setcookie(self::CSRF_COOKIE, self::csrfFor($tokenHash), ['expires' => time() + intdiv(self::TTL_MS, 1000), 'path' => '/', 'secure' => is_https(), 'httponly' => false, 'samesite' => 'Lax']);
    }

    /** Starts the PHP session when the browser sent one. Returns the session id, or null for anonymous visitors. */
    public static function resume(): ?string
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return session_id() ?: null;
        }
        if (empty($_COOKIE[self::COOKIE]) || !is_string($_COOKIE[self::COOKIE]) || !preg_match('/^[A-Za-z0-9,-]{20,256}$/', $_COOKIE[self::COOKIE])) {
            return null;
        }
        self::configure();
        if (!@session_start()) {
            return null;
        }
        if (empty($_SESSION['uid'])) {
            // unknown / expired id: strict mode gave us a brand-new empty session — drop it and forget the cookie
            session_destroy();
            self::forgetCookies();
            return null;
        }
        return session_id();
    }

    /** Creates a new session for a user (destroying any session the browser already had) and sets the cookies. */
    public static function create(string $userId, bool $twoFactorPending = false): void
    {
        self::configure();
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_destroy();
        }
        $id = bin2hex(random_bytes(24));
        $now = now_ms();
        Db::insert('sessions', [
            'userId' => $userId,
            'tokenHash' => sha256_hex($id),
            'twoFactorPending' => $twoFactorPending,
            'ip' => client_ip(),
            'userAgent' => user_agent(),
            'expiresAt' => db_dt($now + ($twoFactorPending ? 10 * 60000 : self::TTL_MS)),
            'lastUsedAt' => db_dt($now),
        ], false);
        session_id($id);
        session_start();
        $_SESSION['uid'] = $userId;
        $_SESSION['tfp'] = $twoFactorPending;
        self::setCsrfCookie(sha256_hex($id));
    }

    /** Signs the current browser out. */
    public static function destroyCurrent(): void
    {
        if (self::resume() !== null) {
            $_SESSION = [];
            session_destroy();
        }
        self::forgetCookies();
    }

    public static function forgetCookies(): void
    {
        foreach ([self::COOKIE => true, self::CSRF_COOKIE => false] as $name => $httpOnly) {
            if (!headers_sent()) {
                setcookie($name, '', ['expires' => 1, 'path' => '/', 'secure' => is_https(), 'httponly' => $httpOnly, 'samesite' => 'Lax']);
            }
        }
    }

    public static function destroyAllFor(string $userId, ?string $exceptHash = null): void
    {
        if ($exceptHash) {
            Db::exec('DELETE FROM `sessions` WHERE `userId` = ? AND `tokenHash` <> ?', [$userId, $exceptHash]);
        } else {
            Db::exec('DELETE FROM `sessions` WHERE `userId` = ?', [$userId]);
        }
    }

    /** Lets the signed-in user's browser keep working after the CSRF cookie was cleared. */
    public static function refreshCsrfCookie(string $tokenHash): void
    {
        if (($_COOKIE[self::CSRF_COOKIE] ?? '') !== self::csrfFor($tokenHash) && !headers_sent()) {
            self::setCsrfCookie($tokenHash);
        }
    }
}
