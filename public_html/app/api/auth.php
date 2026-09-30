<?php
/** /api/auth/* — sign-in, registration, links, two-factor, account. */
defined('FEP') or exit;

api_public('POST', '/api/auth/login', function (Ctx $c) {
    $r = login_user(['email' => $c->body['email'], 'password' => $c->body['password'], 'ip' => $c->ip]);
    return $r['requires2fa'] ? ['requires2fa' => true] : ['requires2fa' => false, 'redirect' => $r['redirect']];
}, ['body' => V::obj(['email' => V::str()->email(), 'password' => V::str()->min(1)->max(200)])]);

api_public('POST', '/api/auth/logout', function (Ctx $c) {
    Sessions::destroyCurrent();
    return ['redirect' => '/login'];
}, ['csrf' => false]);

api_public('POST', '/api/auth/register', function (Ctx $c) {
    $b = $c->body;
    assert_not_spam(['hp' => $b['hp'] ?? null, 't' => $b['t'] ?? null], $c->ip, ['minMs' => 1200]);
    $r = register_user($b + ['ip' => $c->ip]);
    return ['redirect' => $r['redirect'], 'needsVerification' => $r['needsVerification']];
}, ['status' => 201, 'body' => V::obj([
    'name' => V::str()->trim()->min(2)->max(100), 'email' => V::str()->email()->max(200), 'password' => V::str()->min(1)->max(200),
    'company' => V::str()->max(120)->optional(), 'referralCode' => V::str()->max(24)->optional(), 'hp' => V::str()->optional(), 't' => V::num()->optional(),
])]);

api_public('POST', '/api/auth/magic', function (Ctx $c) {
    request_magic_link(['email' => $c->body['email'], 'ip' => $c->ip, 'next' => $c->body['next'] ?? null]);
    return ['sent' => true]; // identical response whether or not the account exists
}, ['body' => V::obj(['email' => V::str()->email()->max(200), 'next' => V::str()->max(300)->optional()])]);

api_public('POST', '/api/auth/forgot-password', function (Ctx $c) {
    request_password_reset(['email' => $c->body['email'], 'ip' => $c->ip]);
    return ['sent' => true];
}, ['body' => V::obj(['email' => V::str()->email()->max(200)])]);

/** One endpoint for every emailed link: magic sign-in, email verification, invite acceptance, password reset. */
api_public('POST', '/api/auth/token', function (Ctx $c) {
    rate_limit("token:{$c->ip}", 30, 15 * 60000);
    $b = $c->body;
    switch ($b['type']) {
        case 'magic':
            $r = verify_magic_link($b['token']);
            return ['redirect' => $r['requires2fa'] ? '/login/2fa' : $r['redirect']];
        case 'verify':
            return ['redirect' => verify_email($b['token'])['redirect']];
        case 'invite':
            if (empty($b['password'])) {
                throw new AppError('VALIDATION', 'Choose a password.', ['password' => 'Required.']);
            }
            return ['redirect' => accept_invite($b['token'], $b['password'], $b['name'] ?? null)['redirect']];
    }
    if (empty($b['password'])) {
        throw new AppError('VALIDATION', 'Choose a new password.', ['password' => 'Required.']);
    }
    reset_password($b['token'], $b['password']);
    return ['redirect' => '/login?reset=1'];
}, ['body' => V::obj(['type' => V::enum(['magic', 'verify', 'invite', 'reset']), 'token' => V::str()->min(10)->max(200), 'password' => V::str()->max(200)->optional(), 'name' => V::str()->max(100)->optional()])]);

api_public('POST', '/api/auth/demo', function (Ctx $c) {
    return ['redirect' => demo_login($c->body['kind'])['redirect']];
}, ['body' => V::obj(['kind' => V::enum(['admin', 'editor', 'client'])]), 'rate' => ['demo', 30, 600]]);

api_public('GET', '/api/auth/session', function (Ctx $c) {
    $a = $c->actor;
    if (!$a) {
        return ['user' => null, 'providers' => ['google' => google_configured(), 'demo' => is_demo_mode()]];
    }
    $u = Db::first('users', ['id' => $a->userId], ['cols' => ['id', 'name', 'email', 'avatarUrl', 'twoFactorEnabled']]);
    return ['user' => $u + ['isStaff' => $a->isStaff, 'roles' => $a->roleKeys, 'permissions' => array_keys($a->permissions), 'orgs' => $a->orgs, 'unreadNotifications' => unread_count($a)]];
});

// ── two-factor ──
api_public('POST', '/api/auth/2fa/verify', function (Ctx $c) {
    return complete_two_factor($c->body['code'], $c->ip);
}, ['body' => V::obj(['code' => V::str()->min(6)->max(24)])]);
api('POST', '/api/auth/2fa/setup', fn(Ctx $c) => begin_two_factor_setup($c->need()));
api('POST', '/api/auth/2fa/enable', fn(Ctx $c) => enable_two_factor($c->need(), $c->body['code']), ['body' => V::obj(['code' => V::str()->min(6)->max(12)])]);
api('POST', '/api/auth/2fa/disable', fn(Ctx $c) => disable_two_factor($c->need(), $c->body['password'], $c->body['code']), ['body' => V::obj(['password' => V::str()->min(1)->max(200), 'code' => V::str()->min(6)->max(12)]), 'rate' => ['2fa-disable', 6, 900, 'user']]);

// ── account ──
api('PATCH', '/api/auth/account', fn(Ctx $c) => update_profile($c->need(), $c->body), ['body' => V::obj([
    'name' => V::str()->trim()->min(2)->max(100)->optional(), 'phone' => V::str()->max(40)->nullish(), 'timezone' => V::str()->max(60)->nullish(), 'avatarUrl' => V::str()->url()->max(500)->nullish(),
])]);
api('POST', '/api/auth/account/password', fn(Ctx $c) => change_password($c->need(), $c->body['current'], $c->body['next']), ['body' => V::obj(['current' => V::str()->max(200), 'next' => V::str()->max(200)]), 'rate' => ['pw-change', 8, 900, 'user']]);
api('GET', '/api/auth/account/sessions', fn(Ctx $c) => list_sessions($c->need()));
api('DELETE', '/api/auth/account/sessions', fn(Ctx $c) => revoke_session($c->need(), $c->body['id']), ['body' => V::obj(['id' => V::str()])]);

// ── Google ──
api_public('GET', '/api/auth/google', function (Ctx $c) {
    if (!google_configured()) {
        Res::redirect(app_url() . '/login?error=google_not_configured');
    }
    $state = random_token(16);
    setcookie('fe_oauth_state', $state, ['expires' => time() + 600, 'path' => '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
    Res::redirect(google_auth_url($state));
});

api_public('GET', '/api/auth/google/callback', function (Ctx $c) {
    $expected = (string)($_COOKIE['fe_oauth_state'] ?? '');
    setcookie('fe_oauth_state', '', ['expires' => 1, 'path' => '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
    $state = (string)($c->req->q('state') ?? '');
    $code = $c->req->q('code');
    $fail = fn(string $why) => Res::redirect(app_url() . '/login?error=' . $why);
    if (!$code || $expected === '' || !safe_equal($state, $expected)) {
        $fail('google_failed');
    }
    try {
        $r = handle_google_callback($code);
    } catch (Throwable) {
        $fail('google_failed');
    }
    Res::redirect(app_url() . ($r['requires2fa'] ? '/login/2fa' : $r['redirect']));
}, ['csrf' => false]);
