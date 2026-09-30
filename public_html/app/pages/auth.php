<?php
/** /login, /register, /forgot-password, /login/2fa, /auth/verify */
defined('FEP') or exit;

function guest_only(): void
{
    if (($a = actor())) {
        Res::redirect(safe_redirect_path($_GET['next'] ?? null, home_for_roles($a->roleKeys, $a->permissions)));
    }
}

page('/login', function (Ctx $c) {
    guest_only();
    $q = $c->query;
    $errors = [
        'google_not_configured' => "Google sign-in isn't set up for this site yet. Use your email instead.",
        'google_failed' => "Google sign-in didn't complete. Please try again or use your email.",
        'google_unverified' => "Google couldn't confirm that email address. Use another way to sign in.",
        'suspended' => 'This account has been suspended. Contact the studio for help.',
    ];
    $notices = [];
    if (!empty($q['expired'])) {
        $notices[] = ['Your session expired. Please sign in again.', 'info'];
    }
    if (!empty($q['reset'])) {
        $notices[] = ['Password updated. Sign in with your new password.', 'success'];
    }
    if (!empty($q['verified'])) {
        $notices[] = ['Email confirmed. You can sign in now.', 'success'];
    }
    if (!empty($q['error'])) {
        $notices[] = [$errors[$q['error']] ?? 'Something went wrong signing you in.', 'danger'];
    }
    render_page('flow', 'auth/login', ['next' => $q['next'] ?? null, 'google' => google_configured(), 'demo' => is_demo_mode(), 'notices' => $notices, 'scripts' => ['js/auth.js']], ['title' => 'Sign in', 'path' => '/login', 'noindex' => true]);
});

page('/register', function (Ctx $c) {
    guest_only();
    render_page('flow', 'auth/register', ['ref' => $c->query['ref'] ?? null, 'scripts' => ['js/auth.js']], ['title' => 'Create your account', 'path' => '/register', 'noindex' => true]);
});

page('/forgot-password', function (Ctx $c) {
    render_page('flow', 'auth/forgot', ['scripts' => ['js/auth.js']], ['title' => 'Reset your password', 'path' => '/forgot-password', 'noindex' => true]);
});

page('/login/2fa', function (Ctx $c) {
    render_page('flow', 'auth/two-factor', ['next' => $c->query['next'] ?? null, 'scripts' => ['js/auth.js']], ['title' => 'Two-step verification', 'path' => '/login/2fa', 'noindex' => true]);
});

page('/auth/verify', function (Ctx $c) {
    $type = $c->query['type'] ?? '';
    $token = $c->query['token'] ?? '';
    $meta = ['title' => 'Continue', 'path' => '/auth/verify', 'noindex' => true];
    if ($token === '' || !in_array($type, ['magic', 'verify', 'invite', 'reset'], true)) {
        render_page('flow', 'auth/invalid-link', ['scripts' => ['js/auth.js']], $meta);
    }
    render_page('flow', 'auth/verify', ['type' => $type, 'token' => $token, 'scripts' => ['js/auth.js']], $meta);
});
