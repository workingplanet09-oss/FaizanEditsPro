<?php
/**
 * Layered anti-spam for public forms: honeypot + minimum fill time + optional Cloudflare Turnstile.
 * Rate limiting is applied separately per IP by the route.
 */
defined('FEP') or exit;

function turnstile_enabled(): bool { return (bool)(cfg('turnstile.secret_key') && cfg('turnstile.site_key')); }

/** $f: hp? (honeypot), t? (ms epoch when the form was first rendered), turnstile? — $opts: minMs, captcha (require the Turnstile token) */
function assert_not_spam(array $f, string $ip, array $opts = []): void
{
    if (!empty($f['hp']) && trim((string)$f['hp']) !== '') {
        throw new AppError('BAD_REQUEST', 'Submission rejected.');
    }
    $minMs = $opts['minMs'] ?? 1500;
    if (isset($f['t']) && is_numeric($f['t']) && now_ms() - (int)$f['t'] < $minMs) {
        throw new AppError('BAD_REQUEST', 'That was a little too fast — please try again.');
    }
    if (turnstile_enabled() && !empty($opts['captcha'])) { // only forms that actually render the widget
        if (empty($f['turnstile'])) {
            throw new AppError('BAD_REQUEST', 'Please complete the spam check.');
        }
        // unreachable or slow → treated as a failed check (fail closed)
        $r = http_request('POST', 'https://challenges.cloudflare.com/turnstile/v0/siteverify', ['content-type' => 'application/x-www-form-urlencoded'], http_build_query(['secret' => cfg('turnstile.secret_key'), 'response' => $f['turnstile'], 'remoteip' => $ip]), 8);
        $j = json_dec($r['body'], []);
        if ($r['status'] !== 200 || empty($j['success'])) {
            throw new AppError('BAD_REQUEST', 'Spam check failed. Please retry.');
        }
    }
}
