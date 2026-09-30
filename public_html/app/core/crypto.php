<?php
/**
 * Passwords, signing, secrets-at-rest and TOTP two-factor codes.
 * Pure PHP 8.2 (openssl + hash extensions only — both are enabled on every ordinary host).
 */
defined('FEP') or exit;

/**
 * The application secret. Taken from config.php; if that still holds the placeholder (or is too short) a strong random
 * secret is generated once and kept in storage/secret.key, so a fresh install is secure without any manual step.
 */
function app_secret(): string
{
    static $secret = null;
    if ($secret !== null) {
        return $secret;
    }
    $configured = (string)cfg('secret', '');
    if (strlen($configured) >= 32 && stripos($configured, 'CHANGE-ME') === false) {
        return $secret = $configured;
    }
    $file = FEP_ROOT . '/storage/secret.key';
    $existing = is_file($file) ? trim((string)@file_get_contents($file)) : '';
    if (strlen($existing) >= 48) {
        return $secret = $existing;
    }
    $generated = bin2hex(random_bytes(32));
    if (!is_dir(dirname($file))) {
        @mkdir(dirname($file), 0750, true);
    }
    @file_put_contents($file, $generated, LOCK_EX);
    @chmod($file, 0600);
    return $secret = $generated;
}

function hmac_sig(string $input, string $purpose = 'generic'): string
{
    return hash_hmac('sha256', $purpose . ':' . $input, app_secret());
}

// ─────────────────────────────── passwords ───────────────────────────────

/** SHA-256 first, so passwords longer than bcrypt's 72-byte limit are never silently truncated. */
function password_prehash(string $password): string
{
    return base64_encode(hash('sha256', $password, true));
}

function hash_password(string $password): string
{
    return password_hash(password_prehash($password), PASSWORD_BCRYPT, ['cost' => 12]);
}

/** A fixed, valid bcrypt hash used to spend comparable time when the account does not exist. */
const FEP_DUMMY_HASH = '$2y$12$DzuRuoZkFpaY/9cUjG07vOtJqwCxStxGy.K8GviHk2XAfUegkNNZa';

function verify_password(string $password, ?string $stored): bool
{
    if ($stored === null || $stored === '' || !str_starts_with($stored, '$2y$')) {
        // Burn comparable time so account existence cannot be inferred from response latency.
        password_verify(password_prehash($password), FEP_DUMMY_HASH);
        return false;
    }
    return password_verify(password_prehash($password), $stored);
}

function password_needs_upgrade(string $stored): bool
{
    return password_needs_rehash($stored, PASSWORD_BCRYPT, ['cost' => 12]);
}

/** Hashes from the previous version of the software (scrypt) cannot be checked by plain PHP; those users set a new password once. */
function is_legacy_password_hash(?string $stored): bool
{
    return $stored !== null && str_starts_with($stored, 'scrypt$');
}

// ─────────────────────────────── signed, expiring blobs ───────────────────────────────

function sign_payload(array $payload, string $purpose): string
{
    $body = b64url_encode(json_enc($payload));
    return $body . '.' . hmac_sig($body, $purpose);
}

function verify_payload(string $token, string $purpose): ?array
{
    $parts = explode('.', $token);
    if (count($parts) !== 2 || $parts[0] === '' || $parts[1] === '' || !safe_equal(hmac_sig($parts[0], $purpose), $parts[1])) {
        return null;
    }
    $raw = b64url_decode($parts[0]);
    $data = $raw === false ? null : json_decode($raw, true);
    return is_array($data) ? $data : null;
}

// ─────────────────────────────── secrets at rest (2FA secrets) — AES-256-GCM ───────────────────────────────

function secret_key32(): string
{
    return hash('sha256', 'enc:' . app_secret(), true);
}

function encrypt_secret(string $plain): string
{
    $iv = random_bytes(12);
    $tag = '';
    $enc = openssl_encrypt($plain, 'aes-256-gcm', secret_key32(), OPENSSL_RAW_DATA, $iv, $tag);
    if ($enc === false) {
        throw new RuntimeException('Encryption failed');
    }
    return 'v1.' . b64url_encode($iv) . '.' . b64url_encode($tag) . '.' . b64url_encode($enc);
}

function decrypt_secret(string $blob): string
{
    $p = explode('.', $blob);
    if (count($p) !== 4 || $p[0] !== 'v1') {
        throw new RuntimeException('Unsupported secret format');
    }
    $plain = openssl_decrypt((string)b64url_decode($p[3]), 'aes-256-gcm', secret_key32(), OPENSSL_RAW_DATA, (string)b64url_decode($p[1]), (string)b64url_decode($p[2]));
    if ($plain === false) {
        throw new RuntimeException('Could not decrypt secret');
    }
    return $plain;
}

// ─────────────────────────────── TOTP (RFC 6238: HMAC-SHA1, 30 s, 6 digits) ───────────────────────────────

const FEP_B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32_encode(string $bin): string
{
    $bits = 0;
    $value = 0;
    $out = '';
    foreach (str_split($bin) as $ch) {
        $value = ($value << 8) | ord($ch);
        $bits += 8;
        while ($bits >= 5) {
            $out .= FEP_B32[($value >> ($bits - 5)) & 31];
            $bits -= 5;
        }
    }
    if ($bits > 0) {
        $out .= FEP_B32[($value << (5 - $bits)) & 31];
    }
    return $out;
}

function base32_decode(string $s): string
{
    $bits = 0;
    $value = 0;
    $out = '';
    foreach (str_split(strtoupper(rtrim($s, '='))) as $ch) {
        $idx = strpos(FEP_B32, $ch);
        if ($idx === false) {
            continue;
        }
        $value = (($value << 5) | $idx) & 0xFFFFFFFF;
        $bits += 5;
        if ($bits >= 8) {
            $out .= chr(($value >> ($bits - 8)) & 255);
            $bits -= 8;
        }
    }
    return $out;
}

function totp_generate_secret(): string
{
    return base32_encode(random_bytes(20));
}

function totp_at(string $secret, ?int $timeMs = null, int $step = 30, int $digits = 6): string
{
    $counter = (int)floor(($timeMs ?? now_ms()) / 1000 / $step);
    $h = hash_hmac('sha1', pack('J', $counter), base32_decode($secret), true);
    $off = ord($h[strlen($h) - 1]) & 0xf;
    $code = ((ord($h[$off]) & 0x7f) << 24) | (ord($h[$off + 1]) << 16) | (ord($h[$off + 2]) << 8) | ord($h[$off + 3]);
    return str_pad((string)($code % (10 ** $digits)), $digits, '0', STR_PAD_LEFT);
}

function totp_verify(string $secret, string $token): bool
{
    $t = preg_replace('/\s+/', '', $token) ?? '';
    if (!preg_match('/^\d{6}$/', $t)) {
        return false;
    }
    foreach ([-1, 0, 1] as $drift) {
        if (safe_equal(totp_at($secret, now_ms() + $drift * 30000), $t)) {
            return true;
        }
    }
    return false;
}

function totp_otpauth_url(string $secret, string $account, string $issuer): string
{
    return 'otpauth://totp/' . rawurlencode($issuer) . ':' . rawurlencode($account) . '?secret=' . $secret . '&issuer=' . rawurlencode($issuer) . '&algorithm=SHA1&digits=6&period=30';
}
