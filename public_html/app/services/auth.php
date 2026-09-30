<?php
/** Authentication: registration, password + 2FA sign-in, magic links, password reset, invites, Google, demo accounts, self-service. */
defined('FEP') or exit;

const FEP_MIN_PASSWORD = 10;
const FEP_DEMO_PASSWORD = 'demo-password-123';
const FEP_DEMO_ACCOUNTS = [
    'admin' => ['email' => 'admin@demo.faizaneditspro.test', 'label' => 'Admin Demo', 'role' => 'super_admin'],
    'editor' => ['email' => 'editor@demo.faizaneditspro.test', 'label' => 'Editor Demo', 'role' => 'editor'],
    'client' => ['email' => 'client@demo.faizaneditspro.test', 'label' => 'Client Demo', 'role' => 'client'],
];

function norm_email(string $e): string { return strtolower(trim($e)); }

function assert_password_strength(string $pw): void
{
    if (mb_strlen($pw) < FEP_MIN_PASSWORD) {
        throw bad_request('Use at least ' . FEP_MIN_PASSWORD . ' characters for your password.', ['password' => 'At least ' . FEP_MIN_PASSWORD . ' characters.']);
    }
    if (mb_strlen($pw) > 200) {
        throw bad_request('That password is too long.', ['password' => 'Too long.']);
    }
    if (preg_match('/^(.)\1+$/us', $pw) || preg_match('/^(password|12345678|qwertyuiop)/i', $pw)) {
        throw bad_request('That password is too easy to guess.', ['password' => 'Too easy to guess.']);
    }
}

function landing_path_for(string $userId): string
{
    $u = Db::first('users', ['id' => $userId]);
    return $u ? home_for_user_id($u['id'], (bool)$u['isStaff']) : '/dashboard';
}

/**
 * Connects a verified user to any existing (unlinked) Client records that share their email, so the portal shows their projects,
 * invoices, contracts, files and messages immediately. ONLY call after the email address has been proven (magic link, invite, verify link, Google).
 */
function link_clients_for_user(array $user): int
{
    $clients = Db::find('clients', ['email' => $user['email'], 'userId' => null]);
    foreach ($clients as $c) {
        Db::tx(function () use ($c, $user) {
            Db::update('clients', ['id' => $c['id']], ['userId' => $user['id']]);
            Db::upsert('organization_members', ['organizationId' => $c['organizationId'], 'userId' => $user['id'], 'role' => 'OWNER', 'title' => 'Owner'], []);
        });
    }
    return count($clients);
}

function client_role_id(): string
{
    $r = Db::first('roles', ['key' => 'client']);
    if (!$r) {
        throw new AppError('INTERNAL', 'The database has not been set up (missing roles). Import database.sql first.');
    }
    return $r['id'];
}

/**
 * Anyone can register a password account for any email address before it has been verified. If the real owner later proves they
 * hold that address by another route (Google, a magic link), the account's password and sessions belong to whoever registered it,
 * not to them — so both are dropped. The owner can set a new password from the reset page.
 */
function reclaim_unverified(array $user): void
{
    if ($user['emailVerifiedAt']) {
        return;
    }
    if ($user['passwordHash']) {
        Db::update('users', ['id' => $user['id']], ['passwordHash' => null]);
    }
    Sessions::destroyAllFor($user['id']);
}

function mark_verified(string $userId): void
{
    Db::update('users', ['id' => $userId], ['emailVerifiedAt' => db_dt(), 'status' => 'ACTIVE', 'lastLoginAt' => db_dt()]);
}

// ───────────────────────────── registration ─────────────────────────────

function register_user(array $in): array
{
    rate_limit('register:' . $in['ip'], 6, 3600000);
    $email = norm_email($in['email']);
    assert_password_strength($in['password']);
    $ws = workspace_id();
    if (Db::exists('users', ['email' => $email])) {
        throw new AppError('CONFLICT', 'An account with this email already exists. Sign in, or request a magic link.', ['email' => 'Already registered.']);
    }
    $pendingClient = Db::first('clients', ['email' => $email, 'userId' => null]);
    $hash = hash_password($in['password']);
    $user = Db::tx(function () use ($ws, $in, $email, $hash) {
        $u = Db::insert('users', ['workspaceId' => $ws, 'name' => trim($in['name']), 'email' => $email, 'passwordHash' => $hash, 'isStaff' => false, 'status' => 'ACTIVE']);
        Db::insert('user_roles', ['userId' => $u['id'], 'roleId' => client_role_id()], false);
        return $u;
    });
    // A brand-new email gets its own company + client profile right away. An email that matches an
    // existing (admin-created) client is linked ONLY after they verify the address — never on trust.
    if (!$pendingClient) {
        create_client_record(['workspaceId' => $ws, 'name' => $user['name'], 'email' => $email, 'companyName' => trim($in['company'] ?? '') ?: $user['name'], 'status' => 'PROSPECT', 'source' => 'portal_signup', 'userId' => $user['id'], 'referralCode' => $in['referralCode'] ?? null]);
    }
    send_verify_email($user);
    audit(system_actor('Sign-up'), ['workspaceId' => $ws, 'action' => 'auth.register', 'entityType' => 'user', 'entityId' => $user['id'], 'message' => "{$user['name']} registered"]);
    Sessions::create($user['id']);
    return ['user' => $user, 'needsVerification' => (bool)$pendingClient, 'redirect' => '/dashboard'];
}

function send_verify_email(array $user): void
{
    $token = random_token(32);
    Db::insert('auth_tokens', ['userId' => $user['id'], 'email' => $user['email'], 'type' => 'EMAIL_VERIFY', 'tokenHash' => sha256_hex($token), 'expiresAt' => now_ms() + 48 * 3600000], false);
    queue_email(['workspaceId' => $user['workspaceId'], 'toEmail' => $user['email'], 'toUserId' => $user['id'], 'templateKey' => 'welcome', 'vars' => ['client_name' => $user['name'], 'verify_url' => absolute_url("/auth/verify?type=verify&token={$token}"), 'dashboard_url' => absolute_url('/dashboard')]]);
}

function consume_token(string $token, string $type): array
{
    $row = Db::first('auth_tokens', ['tokenHash' => sha256_hex($token)]);
    $msg = 'This link has expired or was already used. Request a new one.';
    if (!$row || $row['type'] !== $type || $row['usedAt'] || ts_ms($row['expiresAt']) < now_ms()) {
        throw new AppError('BAD_REQUEST', $msg);
    }
    if (Db::update('auth_tokens', ['sql' => '`id` = ? AND `usedAt` IS NULL', 'params' => [$row['id']]], ['usedAt' => db_dt()]) !== 1) {
        throw new AppError('BAD_REQUEST', $msg);
    }
    return $row;
}

function verify_email(string $token): array
{
    $row = consume_token($token, 'EMAIL_VERIFY');
    $user = $row['userId'] ? Db::first('users', ['id' => $row['userId']]) : null;
    if (!$user) {
        throw new AppError('NOT_FOUND', 'Account not found.');
    }
    mark_verified($user['id']);
    $linked = link_clients_for_user($user);
    Sessions::create($user['id']);
    return ['linked' => $linked, 'redirect' => landing_path_for($user['id'])];
}

// ───────────────────────────── password login ─────────────────────────────

function login_user(array $in): array
{
    $email = norm_email($in['email']);
    rate_limit('login:' . $in['ip'], 30, 15 * 60000);
    rate_limit("login-user:{$email}", 8, 15 * 60000, 'Too many sign-in attempts for this account. Try again in a few minutes or use a magic link.');
    $user = Db::first('users', ['email' => $email]);
    $legacy = $user && is_legacy_password_hash($user['passwordHash']);
    $ok = verify_password($in['password'], $user['passwordHash'] ?? null);
    if (!$user || !$ok || $user['status'] === 'SUSPENDED') {
        // Accounts moved over from the previous version keep an older kind of password hash. Those users set a new password once.
        $hint = $legacy ? ' If your account was moved here from the previous version of this site, use “Forgot your password?” to choose a new password.' : '';
        throw new AppError('UNAUTHENTICATED', 'Incorrect email or password.' . ($legacy ? $hint : ''));
    }
    rate_reset("login-user:{$email}");
    if (password_needs_upgrade($user['passwordHash'])) {
        Db::update('users', ['id' => $user['id']], ['passwordHash' => hash_password($in['password'])]);
    }
    if ($user['twoFactorEnabled']) {
        Sessions::create($user['id'], true);
        return ['requires2fa' => true, 'userId' => $user['id']];
    }
    Sessions::create($user['id']);
    Db::update('users', ['id' => $user['id']], ['lastLoginAt' => db_dt()]);
    if ($user['emailVerifiedAt']) {
        link_clients_for_user($user);
    }
    audit(null, ['workspaceId' => $user['workspaceId'], 'action' => 'auth.login', 'entityType' => 'user', 'entityId' => $user['id'], 'message' => "{$user['name']} signed in"]);
    return ['requires2fa' => false, 'userId' => $user['id'], 'redirect' => landing_path_for($user['id'])];
}

/** The half-signed-in session waiting for its second factor (the browser holds its cookie), or null. */
function pending_two_factor_session(): ?array
{
    $id = Sessions::resume();
    if (!$id) {
        return null;
    }
    $row = Db::first('sessions', ['tokenHash' => sha256_hex($id)]);
    return $row && $row['twoFactorPending'] && ts_ms($row['expiresAt']) > now_ms() ? $row : null;
}

function complete_two_factor(string $code, string $ip): array
{
    rate_limit("2fa:{$ip}", 12, 15 * 60000);
    $session = pending_two_factor_session();
    if (!$session) {
        throw new AppError('UNAUTHENTICATED', 'Your sign-in expired. Please start again.');
    }
    $user = Db::first('users', ['id' => $session['userId']]);
    rate_limit("2fa-user:{$user['id']}", 8, 15 * 60000);
    $secret = $user['twoFactorSecret'] ? decrypt_secret($user['twoFactorSecret']) : '';
    $ok = $secret !== '' && totp_verify($secret, $code);
    if (!$ok) {
        $h = sha256_hex(strtolower(preg_replace('/[\s-]/', '', $code) ?? ''));
        if (in_array($h, $user['recoveryCodes'], true)) {
            $ok = true;
            Db::update('users', ['id' => $user['id']], ['recoveryCodes' => array_values(array_diff($user['recoveryCodes'], [$h]))]);
        }
    }
    if (!$ok) {
        throw new AppError('UNAUTHENTICATED', "That code isn't right. Check your authenticator app and try again.");
    }
    Sessions::create($user['id']); // a brand-new session id once the second factor is proven; the pending one is destroyed
    Db::update('users', ['id' => $user['id']], ['lastLoginAt' => db_dt()]);
    if ($user['emailVerifiedAt']) {
        link_clients_for_user($user);
    }
    audit(null, ['workspaceId' => $user['workspaceId'], 'action' => 'auth.login_2fa', 'entityType' => 'user', 'entityId' => $user['id'], 'message' => "{$user['name']} signed in with 2FA"]);
    return ['redirect' => landing_path_for($user['id'])];
}

// ───────────────────────────── magic link ─────────────────────────────

function request_magic_link(array $in): array
{
    $email = norm_email($in['email']);
    rate_limit('magic:' . $in['ip'], 10, 15 * 60000);
    rate_limit("magic-user:{$email}", 4, 15 * 60000, 'A link was just sent. Check your inbox (and spam) before requesting another.');
    $ws = workspace_id();
    $user = Db::first('users', ['email' => $email]);
    if (!$user) {
        // An admin-created client with no portal user yet can claim access by proving email ownership.
        $client = Db::first('clients', ['email' => $email, 'userId' => null]);
        if ($client) {
            $user = Db::tx(function () use ($ws, $client, $email) {
                $u = Db::insert('users', ['workspaceId' => $ws, 'name' => $client['name'], 'email' => $email, 'isStaff' => false, 'status' => 'INVITED']);
                Db::insert('user_roles', ['userId' => $u['id'], 'roleId' => client_role_id()], false);
                return $u;
            });
        }
    }
    if (!$user || $user['status'] === 'SUSPENDED') {
        return ['sent' => true]; // never reveal whether the account exists
    }
    $token = random_token(32);
    Db::insert('auth_tokens', ['userId' => $user['id'], 'email' => $email, 'type' => 'MAGIC_LINK', 'tokenHash' => sha256_hex($token), 'meta' => ['next' => $in['next'] ?? null], 'expiresAt' => now_ms() + 15 * 60000], false);
    queue_email(['workspaceId' => $user['workspaceId'], 'toEmail' => $email, 'toUserId' => $user['id'], 'templateKey' => 'magic_link', 'vars' => ['client_name' => $user['name'], 'magic_url' => absolute_url("/auth/verify?type=magic&token={$token}")]]);
    return ['sent' => true];
}

function verify_magic_link(string $token): array
{
    $row = consume_token($token, 'MAGIC_LINK');
    $user = $row['userId'] ? Db::first('users', ['id' => $row['userId']]) : null;
    if (!$user || $user['status'] === 'SUSPENDED') {
        throw new AppError('UNAUTHENTICATED', 'Account unavailable.');
    }
    reclaim_unverified($user);
    mark_verified($user['id']);
    link_clients_for_user($user);
    // Magic link proves email ownership; 2FA users still complete their second factor.
    Sessions::create($user['id'], (bool)$user['twoFactorEnabled']);
    audit(null, ['workspaceId' => $user['workspaceId'], 'action' => 'auth.magic_link', 'entityType' => 'user', 'entityId' => $user['id'], 'message' => "{$user['name']} signed in with a magic link"]);
    return ['requires2fa' => (bool)$user['twoFactorEnabled'], 'redirect' => safe_redirect_path($row['meta']['next'] ?? null, landing_path_for($user['id']))];
}

// ───────────────────────────── password reset / invite ─────────────────────────────

function request_password_reset(array $in): array
{
    $email = norm_email($in['email']);
    rate_limit('reset:' . $in['ip'], 8, 3600000);
    rate_limit("reset-user:{$email}", 3, 3600000);
    $user = Db::first('users', ['email' => $email]);
    if ($user && $user['status'] !== 'SUSPENDED') {
        $token = random_token(32);
        Db::insert('auth_tokens', ['userId' => $user['id'], 'email' => $email, 'type' => 'PASSWORD_RESET', 'tokenHash' => sha256_hex($token), 'expiresAt' => now_ms() + 3600000], false);
        queue_email(['workspaceId' => $user['workspaceId'], 'toEmail' => $email, 'toUserId' => $user['id'], 'templateKey' => 'password_reset', 'vars' => ['client_name' => $user['name'], 'reset_url' => absolute_url("/auth/verify?type=reset&token={$token}")]]);
    }
    return ['sent' => true];
}

function reset_password(string $token, string $password): array
{
    assert_password_strength($password);
    $row = consume_token($token, 'PASSWORD_RESET');
    Db::update('users', ['id' => $row['userId']], ['passwordHash' => hash_password($password), 'emailVerifiedAt' => db_dt(), 'status' => 'ACTIVE']);
    $user = Db::first('users', ['id' => $row['userId']]);
    Sessions::destroyAllFor($user['id']);
    link_clients_for_user($user);
    audit(null, ['workspaceId' => $user['workspaceId'], 'action' => 'auth.password_reset', 'entityType' => 'user', 'entityId' => $user['id'], 'message' => "{$user['name']} reset their password"]);
    return ['ok' => true];
}

/** Creates a portal (client) user for a Client record and emails an invite link to set a password. */
function invite_client_user(Actor $actor, string $clientId): array
{
    $client = Db::first('clients', ['id' => $clientId, 'workspaceId' => $actor->workspaceId]);
    if (!$client) {
        throw new AppError('NOT_FOUND', 'Client not found.');
    }
    return invite_user_by_email(['workspaceId' => $actor->workspaceId, 'email' => $client['email'], 'name' => $client['name'], 'kind' => 'client', 'clientId' => $client['id'], 'invitedBy' => $actor]);
}

/** $in: workspaceId, email, name, kind ('client'|'staff'), roleKeys?, clientId?, invitedBy */
function invite_user_by_email(array $in): array
{
    $email = norm_email($in['email']);
    $user = Db::first('users', ['email' => $email]);
    if (!$user) {
        $roleKeys = $in['kind'] === 'client' ? ['client'] : ($in['roleKeys'] ?? ['editor']);
        $user = Db::tx(function () use ($in, $email, $roleKeys) {
            $u = Db::insert('users', ['workspaceId' => $in['workspaceId'], 'name' => $in['name'], 'email' => $email, 'isStaff' => $in['kind'] === 'staff', 'status' => 'INVITED']);
            foreach (Db::find('roles', ['key' => $roleKeys]) as $r) {
                Db::insert('user_roles', ['userId' => $u['id'], 'roleId' => $r['id']], false);
            }
            return $u;
        });
    }
    if ($in['kind'] === 'client' && !empty($in['clientId'])) {
        $client = Db::first('clients', ['id' => $in['clientId']]);
        if ($client && !$client['userId']) {
            Db::update('clients', ['id' => $client['id']], ['userId' => $user['id']]);
            Db::upsert('organization_members', ['organizationId' => $client['organizationId'], 'userId' => $user['id'], 'role' => 'OWNER', 'title' => 'Owner'], []);
        }
    }
    $token = random_token(32);
    Db::insert('auth_tokens', ['userId' => $user['id'], 'email' => $email, 'type' => 'INVITE', 'tokenHash' => sha256_hex($token), 'expiresAt' => now_ms() + 7 * 86400000], false);
    $business = get_setting($in['workspaceId'], 'business');
    queue_email(['workspaceId' => $in['workspaceId'], 'toEmail' => $email, 'toUserId' => $user['id'], 'templateKey' => 'invite', 'vars' => ['client_name' => $user['name'], 'business_name' => $business['name'], 'invite_url' => absolute_url("/auth/verify?type=invite&token={$token}")]]);
    return ['userId' => $user['id'], 'email' => $email, 'inviteToken' => is_demo_mode() ? $token : null];
}

function accept_invite(string $token, string $password, ?string $name): array
{
    assert_password_strength($password);
    $row = consume_token($token, 'INVITE');
    $data = ['passwordHash' => hash_password($password), 'status' => 'ACTIVE', 'emailVerifiedAt' => db_dt(), 'lastLoginAt' => db_dt()];
    if ($name) {
        $data['name'] = $name;
    }
    Db::update('users', ['id' => $row['userId']], $data);
    $user = Db::first('users', ['id' => $row['userId']]);
    link_clients_for_user($user);
    Sessions::create($user['id']);
    audit(null, ['workspaceId' => $user['workspaceId'], 'action' => 'auth.invite_accepted', 'entityType' => 'user', 'entityId' => $user['id'], 'message' => "{$user['name']} accepted their invite"]);
    return ['redirect' => landing_path_for($user['id'])];
}

// ───────────────────────────── 2FA ─────────────────────────────

function begin_two_factor_setup(Actor $actor): array
{
    $secret = totp_generate_secret();
    Db::update('users', ['id' => $actor->userId], ['twoFactorSecret' => encrypt_secret($secret), 'twoFactorEnabled' => false]);
    $business = get_setting($actor->workspaceId, 'business');
    $url = totp_otpauth_url($secret, $actor->email, $business['name']);
    return ['secret' => $secret, 'otpauthUrl' => $url, 'qrDataUrl' => qr_svg_data_url($url)];
}

function enable_two_factor(Actor $actor, string $code): array
{
    $u = Db::first('users', ['id' => $actor->userId]);
    if (!$u['twoFactorSecret']) {
        throw bad_request('Start setup first.');
    }
    if (!totp_verify(decrypt_secret($u['twoFactorSecret']), $code)) {
        throw new AppError('BAD_REQUEST', "That code isn't right. Try the current code from your app.", ['code' => 'Incorrect code.']);
    }
    $recovery = [];
    for ($i = 0; $i < 8; $i++) {
        $recovery[] = substr(preg_replace('/[^a-z0-9]/', 'x', strtolower(random_token(6))), 0, 10);
    }
    Db::update('users', ['id' => $u['id']], ['twoFactorEnabled' => true, 'recoveryCodes' => array_map('sha256_hex', $recovery)]);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'auth.2fa_enabled', 'entityType' => 'user', 'entityId' => $u['id'], 'message' => "{$actor->name} enabled two-factor authentication"]);
    return ['recoveryCodes' => $recovery];
}

function disable_two_factor(Actor $actor, string $password, string $code): array
{
    $u = Db::first('users', ['id' => $actor->userId]);
    if (!verify_password($password, $u['passwordHash'])) {
        throw new AppError('BAD_REQUEST', 'Incorrect password.', ['password' => 'Incorrect password.']);
    }
    if ($u['twoFactorSecret'] && !totp_verify(decrypt_secret($u['twoFactorSecret']), $code)) {
        throw new AppError('BAD_REQUEST', 'Incorrect code.', ['code' => 'Incorrect code.']);
    }
    Db::update('users', ['id' => $u['id']], ['twoFactorEnabled' => false, 'twoFactorSecret' => null, 'recoveryCodes' => []]);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'auth.2fa_disabled', 'entityType' => 'user', 'entityId' => $u['id'], 'message' => "{$actor->name} disabled two-factor authentication"]);
    return ['ok' => true];
}

// ───────────────────────────── Google OAuth ─────────────────────────────

function google_configured(): bool { return (bool)(cfg('google.client_id') && cfg('google.client_secret')); }

function google_auth_url(string $state): string
{
    return 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query(['client_id' => cfg('google.client_id'), 'redirect_uri' => app_url() . '/api/auth/google/callback', 'response_type' => 'code', 'scope' => 'openid email profile', 'state' => $state, 'prompt' => 'select_account']);
}

function handle_google_callback(string $code): array
{
    if (!google_configured()) {
        throw new AppError('NOT_CONFIGURED', "Google sign-in isn't configured.");
    }
    $fail = new AppError('UNAUTHENTICATED', 'Google sign-in failed. Please try again.');
    $tr = http_request('POST', 'https://oauth2.googleapis.com/token', ['content-type' => 'application/x-www-form-urlencoded'], http_build_query(['code' => $code, 'client_id' => cfg('google.client_id'), 'client_secret' => cfg('google.client_secret'), 'redirect_uri' => app_url() . '/api/auth/google/callback', 'grant_type' => 'authorization_code']), 10);
    $tok = json_dec($tr['body'], []);
    if ($tr['status'] !== 200 || empty($tok['access_token'])) {
        throw $fail;
    }
    $ir = http_request('GET', 'https://openidconnect.googleapis.com/v1/userinfo', ['authorization' => 'Bearer ' . $tok['access_token']], null, 10);
    $info = json_dec($ir['body'], []);
    // Linking by email is only safe when Google vouches for the address; a missing flag is not a yes.
    if (empty($info['sub']) || empty($info['email']) || ($info['email_verified'] ?? null) !== true) {
        throw new AppError('UNAUTHENTICATED', "Your Google account email isn't verified.");
    }
    $email = norm_email($info['email']);
    $ws = workspace_id();
    $linked = Db::first('oauth_accounts', ['provider' => 'google', 'providerAccountId' => $info['sub']]);
    $user = $linked ? Db::first('users', ['id' => $linked['userId']]) : Db::first('users', ['email' => $email]);
    if (!$user) {
        $user = Db::tx(function () use ($ws, $info, $email) {
            $u = Db::insert('users', ['workspaceId' => $ws, 'name' => $info['name'] ?? explode('@', $email)[0], 'email' => $email, 'avatarUrl' => $info['picture'] ?? null, 'isStaff' => false, 'status' => 'ACTIVE', 'emailVerifiedAt' => db_dt()]);
            Db::insert('user_roles', ['userId' => $u['id'], 'roleId' => client_role_id()], false);
            return $u;
        });
        if (!Db::first('clients', ['email' => $email, 'userId' => null])) {
            create_client_record(['workspaceId' => $ws, 'name' => $user['name'], 'email' => $email, 'companyName' => $user['name'], 'status' => 'PROSPECT', 'source' => 'google_signup', 'userId' => $user['id']]);
        }
    }
    if ($user['status'] === 'SUSPENDED') {
        throw new AppError('UNAUTHENTICATED', 'Account unavailable.');
    }
    reclaim_unverified($user);
    if (!$linked) {
        Db::insert('oauth_accounts', ['userId' => $user['id'], 'provider' => 'google', 'providerAccountId' => $info['sub']], false);
    }
    mark_verified($user['id']);
    link_clients_for_user($user);
    Sessions::create($user['id'], (bool)$user['twoFactorEnabled']);
    audit(null, ['workspaceId' => $user['workspaceId'], 'action' => 'auth.google', 'entityType' => 'user', 'entityId' => $user['id'], 'message' => "{$user['name']} signed in with Google"]);
    return ['requires2fa' => (bool)$user['twoFactorEnabled'], 'redirect' => landing_path_for($user['id'])];
}

// ───────────────────────────── demo accounts ─────────────────────────────

function demo_login(string $kind): array
{
    if (!is_demo_mode()) {
        throw new AppError('FORBIDDEN', 'Demo accounts are disabled.');
    }
    $acct = FEP_DEMO_ACCOUNTS[$kind] ?? throw bad_request('Unknown demo account.');
    $user = Db::first('users', ['email' => $acct['email']]);
    if (!$user) {
        throw new AppError('NOT_FOUND', "Demo data isn't installed. Import database-demo.sql first.");
    }
    Sessions::create($user['id']);
    Db::update('users', ['id' => $user['id']], ['lastLoginAt' => db_dt()]);
    return ['redirect' => landing_path_for($user['id'])];
}

// ───────────────────────────── account self-service ─────────────────────────────

function update_profile(Actor $actor, array $in): array
{
    $data = array_intersect_key($in, array_flip(['name', 'phone', 'timezone', 'avatarUrl']));
    if ($data) {
        Db::update('users', ['id' => $actor->userId], $data);
    }
    $u = Db::first('users', ['id' => $actor->userId]);
    return ['id' => $u['id'], 'name' => $u['name'], 'phone' => $u['phone'], 'timezone' => $u['timezone'], 'avatarUrl' => $u['avatarUrl']];
}

function change_password(Actor $actor, string $current, string $next): array
{
    $u = Db::first('users', ['id' => $actor->userId]);
    if ($u['passwordHash'] && !verify_password($current, $u['passwordHash'])) {
        throw new AppError('BAD_REQUEST', 'Your current password is incorrect.', ['current' => 'Incorrect password.']);
    }
    assert_password_strength($next);
    Db::update('users', ['id' => $u['id']], ['passwordHash' => hash_password($next)]);
    Sessions::destroyAllFor($u['id'], $actor->sessionHash);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'auth.password_changed', 'entityType' => 'user', 'entityId' => $u['id'], 'message' => "{$actor->name} changed their password"]);
    return ['ok' => true];
}

function list_sessions(Actor $actor): array
{
    $rows = Db::find('sessions', ['sql' => '`userId` = ? AND `twoFactorPending` = 0 AND `expiresAt` > ?', 'params' => [$actor->userId, db_dt()]], ['order' => '`lastUsedAt` DESC']);
    return array_map(fn($s) => ['id' => $s['id'], 'ip' => $s['ip'], 'userAgent' => $s['userAgent'], 'lastUsedAt' => $s['lastUsedAt'], 'createdAt' => $s['createdAt'], 'current' => $s['id'] === $actor->sessionId], $rows);
}

function revoke_session(Actor $actor, string $id): array
{
    Db::delete('sessions', ['id' => $id, 'userId' => $actor->userId]);
    return ['ok' => true];
}
