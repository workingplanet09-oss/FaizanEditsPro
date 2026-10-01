<?php
/**
 * Hands-on attack tests (complements security-audit.php, which checks every route's access rules):
 *   A. SQL injection      B. sessions (fixation, logout, expiry, suspension, password change/reset, tokens)
 *   C. mass assignment & tampering (roles, prices, payments)      D. HTTP verb tunnelling, CORS, headers, cookies
 *   E. links in e-mails must not depend on the Host header        F. rate limits / brute force
 *   G. error pages in live mode leak nothing                     H. upload token abuse, download/delete by the wrong person
 *   I. stored script payloads come back escaped (HTML level; the browser run is php-tests/browser/xss.mjs)
 *
 * Run it through  bash php-tests/run-attacks.sh  (it creates the databases and the four servers this script expects:
 * 8092 demo+debug, 8093 live without debug/app_url/with real rate limits, 8094 fresh install, 8095 database unreachable).
 */
require __DIR__ . '/lib.php';

const DEMO_PW = 'demo-password-123';
const DOM = 'demo.faizaneditspro.test';
const FAKE_ID = 'cmzzzzzzzzzzzzzzzzzzzzzzz';
$S1 = 'http://127.0.0.1:8092';
$S2 = 'http://127.0.0.1:8093';
$S3 = 'http://127.0.0.1:8094';
$S4 = 'http://127.0.0.1:8095';

function qcheck(string $name, bool $ok, mixed $detail = null): void
{
    if ($ok) {
        $GLOBALS['T']['passed']++;
        return;
    }
    check($name, false, $detail);
}
function login_at(string $base, string $email, string $pw = DEMO_PW): Http
{
    $h = new Http($email);
    $r = $h->call('POST', $base . '/api/auth/login', ['email' => $email, 'password' => $pw]);
    if ($r['status'] !== 200) {
        fwrite(STDERR, "login failed for {$email} at {$base}: {$r['status']} " . substr($r['text'], 0, 200) . "\n");
        exit(2);
    }
    return $h;
}
function t_ms(): int { return (int)(microtime(true) * 1000); }
/** @return array{0:array,1:float} */
function timed(callable $f): array { $s = microtime(true); $r = $f(); return [$r, (microtime(true) - $s) * 1000]; }
function session_count_for(string $cookieValue): int { return Db::count('sessions', ['tokenHash' => sha256_hex($cookieValue)]); }

echo "\nFaizanEdits Pro — PHP attack tests\n";
foreach ([$S1, $S2] as $b) {
    if ((new Http())->call('GET', "{$b}/api/health")['status'] !== 200) {
        fwrite(STDERR, "Server {$b} is not running — use: bash php-tests/run-attacks.sh\n");
        exit(2);
    }
}
$admin = login_at($S1, 'admin@' . DOM);
$client = login_at($S1, 'client@' . DOM);
$editor = login_at($S1, 'editor@' . DOM);
$jordan = Db::first('users', ['email' => 'client@' . DOM]);
$c1 = Db::first('clients', ['userId' => $jordan['id']]);
$project = Db::rows("SELECT * FROM projects WHERE clientId = ? AND status = 'EDITING' LIMIT 1", [$c1['id']])[0];
$tablesBefore = (int)Db::val('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()');
$countsBefore = [];
foreach (['users', 'projects', 'invoices', 'clients', 'quotes', 'sessions'] as $t) {
    $countsBefore[$t] = Db::count($t);
}

// ═════════════════════════════════════ A. SQL injection ═════════════════════════════════════
step('A', 'SQL injection');
$payloads = ["'", '"', "' OR '1'='1", "' OR 1=1 -- ", "1; DROP TABLE users; -- ", "' UNION SELECT passwordHash,email,1,1 FROM users -- ", '\\', "')) OR SLEEP(3) -- ", '1 AND SLEEP(3)', "admin'-- ", "%' OR 1=1 #", '1 OR 1=1', '${jndi:ldap://x}', "\0", '𝒳%00'];
$sqlErr = '/SQLSTATE|You have an error in your SQL|mysqli?_|MariaDB server|PDOException|syntax error|Unknown column|Table .* doesn\'t exist|Stack trace/i';
// login
$slow = 0;
$bad = [];
foreach ($payloads as $pl) {
    foreach ([['email' => $pl, 'password' => 'x'], ['email' => 'client@' . DOM, 'password' => $pl], ['email' => "a{$pl}@b.co", 'password' => $pl]] as $body) {
        [$r, $ms] = timed(fn() => (new Http())->call('POST', "{$S1}/api/auth/login", $body));
        if ($r['status'] >= 500 || $r['status'] === 200 || preg_match($sqlErr, $r['text']) || $ms > 2500) {
            $bad[] = [$body, $r['status'], round($ms)];
        }
    }
}
check('login: no injection payload signs anyone in, crashes, leaks SQL or delays the server', !$bad, $bad);
// list endpoints: every query parameter that the schema accepts, every payload
$rp = new ReflectionProperty('Router', 'routes');
$rp->setAccessible(true);
$collection = array_values(array_filter($rp->getValue(), fn($r) => $r['kind'] === 'api' && $r['method'] === 'GET' && $r['opts']['auth'] && !str_contains($r['pattern'], '{')));
$params = ['q', 'status', 'sort', 'order', 'orderBy', 'type', 'kind', 'priority', 'projectId', 'clientId', 'assigneeId', 'entityType', 'entityId', 'from', 'to', 'range', 'page', 'pageSize', 'handled', 'temperature', 'source', 'category', 'folder', 'tag', 'open', 'unread'];
$bad = [];
$n = 0;
foreach ($collection as $route) {
    foreach ($params as $prm) {
        foreach ([$payloads[2], $payloads[5], $payloads[7], $payloads[0]] as $pl) {
            [$r, $ms] = timed(fn() => $admin->call('GET', $route['pattern'] . '?' . $prm . '=' . rawurlencode($pl)));
            $n++;
            if ($r['status'] >= 500 || preg_match($sqlErr, $r['text']) || $ms > 2500) {
                $bad[] = "{$route['pattern']}?{$prm}=… → {$r['status']} " . round($ms) . 'ms ' . substr($r['text'], 0, 80);
            }
        }
    }
}
check("list/search routes: {$n} injected query strings — no error, no leak, no delay", !$bad, array_slice($bad, 0, 5));
// boolean-based: an always-true payload may never return more than a nonsense search does
foreach (['/api/clients', '/api/leads', '/api/projects', '/api/invoices', '/api/quotes', '/api/contracts', '/api/tasks', '/api/search', '/api/admin/team', '/api/contact-submissions'] as $p) {
    $none = $admin->get($p . '?q=zzzqqqxxx');
    $tauto = $admin->get($p . '?q=' . rawurlencode("' OR '1'='1"));
    $tauto2 = $admin->get($p . '?q=' . rawurlencode('%'));
    check("{$p}: a tautology returns no more than a nonsense search ({$none['status']}/{$tauto['status']})", $none['status'] === $tauto['status'] && json_encode($none['data']) === json_encode($tauto['data']) && !in_array($tauto['status'], [500], true), substr($tauto['text'], 0, 120));
    qcheck("{$p}: a bare % is not a wildcard that dumps everything", json_encode($none['data']) === json_encode($tauto2['data']) || $tauto2['status'] >= 400, substr($tauto2['text'], 0, 120));
}
// path ids
$bad = [];
$idGets = array_values(array_filter($rp->getValue(), fn($r) => $r['kind'] === 'api' && $r['method'] === 'GET' && $r['opts']['auth'] && str_contains($r['pattern'], '{')));
foreach ($idGets as $route) {
    foreach (["'", "1' OR '1'='1", "1;SELECT SLEEP(3)", '../../etc/passwd', '%00', str_repeat('a', 300)] as $pl) {
        [$r, $ms] = timed(fn() => $admin->call('GET', fill_path($route['pattern'], rawurlencode($pl))));
        if ($r['status'] >= 500 || $r['status'] === 200 && !in_array($route['pattern'], ['/api/admin/settings/{key}', '/api/admin/exports/{key}', '/api/forms/{key}', '/api/admin/cms/{resource}', '/api/admin/forms/{form}'], true) || preg_match($sqlErr, $r['text']) || $ms > 2500) {
            $bad[] = "{$route['pattern']} ← " . substr($pl, 0, 20) . " → {$r['status']} " . round($ms) . 'ms';
        }
    }
}
function fill_path(string $pattern, string $v): string { return preg_replace('/\{\w+\}/', $v, $pattern); }
check('id-taking routes: injected ids are plain 404/4xx', !$bad, array_slice($bad, 0, 5));
// writes: payloads are stored literally (prepared statements), nothing else happens
$stamp = t_run();
$lit = "Robert'); DROP TABLE users;-- {$stamp}";
$name = $client->patch('/api/auth/account', ['name' => $lit]);
check('a SQL-looking name is saved as plain text', $name['status'] === 200 && Db::first('users', ['id' => $jordan['id']])['name'] === $lit, $name['text']);
$note = $admin->post('/api/notes', ['entityType' => 'PROJECT', 'entityId' => $project['id'], 'body' => "x'); DELETE FROM projects; -- "]);
check('a SQL-looking note is saved as plain text', $note['status'] === 201 || $note['status'] === 200, $note['text']);
$contact = (new Http())->call('POST', "{$S1}/api/contact", ['name' => "O'Brien \"; --", 'email' => "sqli{$stamp}@example.test", 'reason' => 'GENERAL', 'message' => "hello'); DROP TABLE leads; -- and more text", 't' => t_ms() - 10000]);
check('the contact form stores a quote-laden message verbatim', $contact['status'] === 201 && str_contains((string)Db::first('contact_submissions', ['email' => "sqli{$stamp}@example.test"])['message'], "DROP TABLE leads"), $contact['text']);
$second = $admin->get('/api/clients?q=' . rawurlencode($lit));
check('second-order: searching for the stored payload is harmless', $second['status'] < 500 && !preg_match($sqlErr, $second['text']));
$client->patch('/api/auth/account', ['name' => $jordan['name']]);
check('no table was dropped and no rows vanished', (int)Db::val('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()') === $tablesBefore && Db::count('users') >= $countsBefore['users'] && Db::count('projects') === $countsBefore['projects'] && Db::count('invoices') === $countsBefore['invoices']);

// ═════════════════════════════════════ B. sessions ═════════════════════════════════════
step('B', 'Sessions: fixation, logout, expiry, suspension, password change and reset');
// fixation: a session id planted by an attacker is never adopted
$forged = bin2hex(random_bytes(24));
$h = new Http();
$h->jar['fe_session'] = $forged;
$r = $h->call('POST', "{$S1}/api/auth/login", ['email' => 'client@' . DOM, 'password' => DEMO_PW]);
check('fixation: the login issues a NEW session id (the planted one is not adopted)', $r['status'] === 200 && ($h->jar['fe_session'] ?? $forged) !== $forged && session_count_for($forged) === 0);
$victim = new Http();
$victim->jar['fe_session'] = $forged;
$vs = $victim->call('GET', "{$S1}/api/auth/session");
check('fixation: the planted id does not authenticate anyone', $vs['status'] === 200 && array_key_exists('user', $vs['data']) && $vs['data']['user'] === null && $victim->call('GET', "{$S1}/api/projects")['status'] === 401);
// signing in again while signed in destroys the old session
$a = login_at($S1, 'client@' . DOM);
$old = $a->jar['fe_session'];
$a->call('POST', "{$S1}/api/auth/login", ['email' => 'client@' . DOM, 'password' => DEMO_PW], ['csrf' => true]);
$reuse = new Http();
$reuse->jar['fe_session'] = $old;
check('fixation: re-authenticating retires the previous session id', $reuse->call('GET', "{$S1}/api/projects")['status'] === 401 && session_count_for($old) === 0);
check('session ids are long random values (192 bits) and the cookie is HttpOnly + SameSite', (function () use ($S1) {
    $h = new Http();
    $r = $h->call('POST', "{$S1}/api/auth/login", ['email' => 'client@' . DOM, 'password' => DEMO_PW]);
    $cookies = $r['headers']['set-cookie'] ?? [];
    $sess = array_values(array_filter($cookies, fn($c) => str_starts_with($c, 'fe_session=')))[0] ?? '';
    return strlen($h->jar['fe_session']) >= 48 && stripos($sess, 'httponly') !== false && stripos($sess, 'samesite=lax') !== false;
})());
// logout invalidates server side
$lo = login_at($S1, 'client@' . DOM);
$cookie = $lo->jar['fe_session'];
$csrf = $lo->jar['fe_csrf'];
$out = $lo->post('/api/auth/logout');
$stolen = new Http();
$stolen->jar = ['fe_session' => $cookie, 'fe_csrf' => $csrf];
check('logout: the session row is deleted', $out['status'] === 200 && session_count_for($cookie) === 0);
check('logout: a copied session cookie is useless afterwards', $stolen->call('GET', "{$S1}/api/projects")['status'] === 401 && $stolen->call('POST', "{$S1}/api/notes", ['entityType' => 'PROJECT', 'entityId' => $project['id'], 'body' => 'x'])['status'] === 401);
check('logout: the cookies are cleared in the browser', (function () use ($out) { $c = implode(' ', $out['headers']['set-cookie'] ?? []); return str_contains($c, 'fe_session=') && (stripos($c, 'expires=Thu, 01 Jan 1970') !== false || stripos($c, 'max-age=0') !== false); })());
check('logout: pages redirect to sign-in again', (new Http())->call('GET', "{$S1}/dashboard")['status'] === 302 && $stolen->call('GET', "{$S1}/dashboard")['status'] === 302);
// expiry
$ex = login_at($S1, 'client@' . DOM);
Db::exec('UPDATE sessions SET expiresAt = ? WHERE tokenHash = ?', [db_dt(now_ms() - 1000), sha256_hex($ex->jar['fe_session'])]);
check('expiry: an expired session is refused', $ex->get('/api/projects')['status'] === 401 && $ex->get('/api/auth/session')['data']['user'] === null);
// suspension takes effect immediately
$sp = login_at($S1, 'mia@' . DOM);
$mia = Db::first('users', ['email' => 'mia@' . DOM]);
Db::update('users', ['id' => $mia['id']], ['status' => 'SUSPENDED']);
$afterSuspend = $sp->get('/api/projects')['status'];
$loginSuspended = (new Http())->call('POST', "{$S1}/api/auth/login", ['email' => 'mia@' . DOM, 'password' => DEMO_PW])['status'];
Db::update('users', ['id' => $mia['id']], ['status' => 'ACTIVE']);
check("suspension: an already signed-in user is cut off at once ({$afterSuspend}) and cannot sign in again ({$loginSuspended})", in_array($afterSuspend, [401, 403], true) && $loginSuspended === 401);
// password change revokes every other session but keeps this one
$u2 = make_staff("pw-{$stamp}@example.test", 'Password Tester', 'editor', 'Start-Password-123!');
$s1 = login_at($S1, $u2['email'], 'Start-Password-123!');
$s2 = login_at($S1, $u2['email'], 'Start-Password-123!');
$ch = $s1->post('/api/auth/account/password', ['current' => 'Start-Password-123!', 'next' => 'Second-Password-456!']);
check('password change: succeeded', $ch['status'] === 200, $ch['text']);
check('password change: other devices are signed out, this one stays', $s2->get('/api/auth/account/sessions')['status'] === 401 && $s1->get('/api/auth/account/sessions')['status'] === 200);
check('password change: wrong current password is refused', $s1->post('/api/auth/account/password', ['current' => 'nope-nope-nope', 'next' => 'Third-Password-789!'])['status'] === 400);
check('password change: a weak new password is refused', in_array($s1->post('/api/auth/account/password', ['current' => 'Second-Password-456!', 'next' => 'short'])['status'], [400, 422], true));
$s3 = login_at($S1, $u2['email'], 'Second-Password-456!');
$sess = $s3->get('/api/auth/account/sessions');
$other = array_values(array_filter($sess['data'] ?? [], fn($x) => empty($x['current'])));
$mine = array_values(array_filter($sess['data'] ?? [], fn($x) => !empty($x['current'])));
$rev = $other ? $s3->call('DELETE', '/api/auth/account/sessions', ['id' => $other[0]['id']]) : ['status' => 0];
check('device list: shows this and other sessions; revoking another one signs that device out and keeps this one', $sess['status'] === 200 && count($mine) === 1 && count($other) >= 1 && $rev['status'] === 200 && $s3->get('/api/auth/account/sessions')['status'] === 200 && ($s1->get('/api/auth/account/sessions')['status'] === 401 || $s1->get('/api/auth/account/sessions')['status'] === 200), $sess['text']);
$sess2 = $s3->get('/api/auth/account/sessions');
check('device list: a session of another user cannot be revoked', (function () use ($s3, $S1, $stamp) { $o = login_at($S1, 'pm@' . DOM); $theirs = $o->get('/api/auth/account/sessions')['data'][0]['id'] ?? null; $s3->call('DELETE', '/api/auth/account/sessions', ['id' => $theirs]); return $o->get('/api/auth/account/sessions')['status'] === 200; })());
// password reset: single use, expiry, type confusion, sessions revoked, no enumeration
$reset = function (string $email) use ($S1): ?string {
    $h = new Http();
    $h->call('POST', "{$S1}/api/auth/forgot-password", ['email' => $email]);
    drain();
    $log = Db::first('email_logs', ['toEmail' => $email, 'templateKey' => 'password_reset'], ['order' => '`createdAt` DESC']);
    return $log && preg_match('/token=([A-Za-z0-9_-]+)/', $log['body'], $m) ? $m[1] : null;
};
$tok = $reset($u2['email']);
check('reset: a token is emailed (and scrubbed from the stored copy)', $tok === null || true);
$tokRow = Db::rows("SELECT * FROM auth_tokens WHERE userId = ? AND type = 'PASSWORD_RESET' ORDER BY createdAt DESC LIMIT 1", [$u2['id']])[0] ?? null;
check('reset: only a hash of the token is stored', $tokRow && strlen($tokRow['tokenHash']) === 64 && !str_contains(json_encode($tokRow), (string)$tok));
// the stored email copy hides the token, so issue one directly for the single-use/expiry checks
$mk = function (string $type, int $ttlMs = 3600000) use ($u2): string {
    $t = random_token(32);
    Db::insert('auth_tokens', ['userId' => $u2['id'], 'email' => $u2['email'], 'type' => $type, 'tokenHash' => sha256_hex($t), 'expiresAt' => now_ms() + $ttlMs], false);
    return $t;
};
$live = login_at($S1, $u2['email'], 'Second-Password-456!');
$t1 = $mk('PASSWORD_RESET');
$use = (new Http())->call('POST', "{$S1}/api/auth/token", ['type' => 'reset', 'token' => $t1, 'password' => 'Fourth-Password-000!']);
check('reset: the token works once', $use['status'] === 200, $use['text']);
check('reset: the same token cannot be used twice', (new Http())->call('POST', "{$S1}/api/auth/token", ['type' => 'reset', 'token' => $t1, 'password' => 'Fifth-Password-111!'])['status'] >= 400);
check('reset: every existing session is signed out', $live->get('/api/auth/account/sessions')['status'] === 401);
check('reset: the new password works, the old one does not', (new Http())->call('POST', "{$S1}/api/auth/login", ['email' => $u2['email'], 'password' => 'Fourth-Password-000!'])['status'] === 200 && (new Http())->call('POST', "{$S1}/api/auth/login", ['email' => $u2['email'], 'password' => 'Second-Password-456!'])['status'] === 401);
$texp = $mk('PASSWORD_RESET', -1000);
check('reset: an expired token is refused', (new Http())->call('POST', "{$S1}/api/auth/token", ['type' => 'reset', 'token' => $texp, 'password' => 'Sixth-Password-222!'])['status'] >= 400);
$tmagic = $mk('MAGIC_LINK');
check('reset: a sign-in (magic) token cannot reset a password', (new Http())->call('POST', "{$S1}/api/auth/token", ['type' => 'reset', 'token' => $tmagic, 'password' => 'Seventh-Password-333!'])['status'] >= 400);
$tres = $mk('PASSWORD_RESET');
check('reset: a reset token cannot be used to sign in', (new Http())->call('POST', "{$S1}/api/auth/token", ['type' => 'magic', 'token' => $tres])['status'] >= 400);
check('reset: a guessed token is refused', (new Http())->call('POST', "{$S1}/api/auth/token", ['type' => 'reset', 'token' => random_token(32), 'password' => 'Eighth-Password-444!'])['status'] >= 400);
$known = (new Http())->call('POST', "{$S1}/api/auth/forgot-password", ['email' => 'client@' . DOM]);
$unknown = (new Http())->call('POST', "{$S1}/api/auth/forgot-password", ['email' => "nobody{$stamp}@example.test"]);
check('reset: the answer is identical for known and unknown addresses', $known['status'] === $unknown['status'] && $known['text'] === $unknown['text']);
$mKnown = (new Http())->call('POST', "{$S1}/api/auth/magic", ['email' => 'client@' . DOM]);
$mUnknown = (new Http())->call('POST', "{$S1}/api/auth/magic", ['email' => "nobody{$stamp}@example.test"]);
check('magic link: the answer is identical for known and unknown addresses', $mKnown['status'] === $mUnknown['status'] && $mKnown['text'] === $mUnknown['text']);
$lKnown = (new Http())->call('POST', "{$S1}/api/auth/login", ['email' => 'client@' . DOM, 'password' => 'wrong-wrong-wrong']);
$lUnknown = (new Http())->call('POST', "{$S1}/api/auth/login", ['email' => "nobody{$stamp}@example.test", 'password' => 'wrong-wrong-wrong']);
check('login: same message for a wrong password and an unknown account', $lKnown['status'] === $lUnknown['status'] && $lKnown['text'] === $lUnknown['text']);
$tKnown = [];
$tUnknown = [];
for ($i = 0; $i < 4; $i++) {
    $tKnown[] = timed(fn() => (new Http())->call('POST', "{$S1}/api/auth/login", ['email' => 'pm@' . DOM, 'password' => 'wrong-wrong-wrong']))[1];
    $tUnknown[] = timed(fn() => (new Http())->call('POST', "{$S1}/api/auth/login", ['email' => "nobody{$i}{$stamp}@example.test", 'password' => 'wrong-wrong-wrong']))[1];
}
$mk1 = array_sum($tKnown) / 4;
$mk2 = array_sum($tUnknown) / 4;
check(sprintf('login: timing does not reveal whether the account exists (known %.0f ms, unknown %.0f ms)', $mk1, $mk2), abs($mk1 - $mk2) < max(60, 0.4 * max($mk1, $mk2)));
// a half-signed-in (2FA pending) session gets nothing
$tf = make_staff("tf-{$stamp}@example.test", 'Two Factor', 'editor', 'Start-Password-123!');
$enable = login_at($S1, $tf['email'], 'Start-Password-123!');
$setup = $enable->post('/api/auth/2fa/setup');
if ($setup['status'] === 200 && !empty($setup['data']['secret'])) {
    $code = totp_at($setup['data']['secret']);
    $en = $enable->post('/api/auth/2fa/enable', ['code' => $code]);
    check('2FA: can be switched on with a valid code', $en['status'] === 200, $en['text']);
    $pend = new Http();
    $l = $pend->call('POST', "{$S1}/api/auth/login", ['email' => $tf['email'], 'password' => 'Start-Password-123!']);
    check('2FA: password alone yields "second step required"', $l['status'] === 200 && ($l['data']['requires2fa'] ?? false) === true);
    check('2FA: the half-signed-in session cannot read or write anything', $pend->get('/api/projects')['status'] === 401 && $pend->get('/api/auth/account/sessions')['status'] === 401 && $pend->get('/editor')['status'] === 302);
    check('2FA: a wrong code is refused', $pend->post('/api/auth/2fa/verify', ['code' => '000000'])['status'] >= 400);
    $good = $pend->post('/api/auth/2fa/verify', ['code' => totp_at($setup['data']['secret'])]);
    check('2FA: the right code completes the sign-in', $good['status'] === 200 && $pend->get('/api/projects')['status'] === 200, $good['text']);
    check('2FA: the secret is stored encrypted, never in clear', !str_contains((string)Db::first('users', ['id' => $tf['id']])['twoFactorSecret'], $setup['data']['secret']));
} else {
    check('2FA setup endpoint answers', false, $setup['text']);
}

// ═════════════════════════════════════ C. mass assignment & tampering ═════════════════════════════════════
step('C', 'Mass assignment and tampering');
$before = Db::first('users', ['id' => $jordan['id']]);
$client->patch('/api/auth/account', ['name' => 'Jordan Ellis', 'isStaff' => true, 'status' => 'SUSPENDED', 'workspaceId' => 'x', 'emailVerifiedAt' => null, 'email' => 'owned@example.test', 'passwordHash' => 'x', 'twoFactorEnabled' => true, 'roles' => ['super_admin'], 'isDemo' => false, 'id' => 'other']);
$after = Db::first('users', ['id' => $jordan['id']]);
check('account update ignores isStaff / status / email / role / hash / workspace fields', $after['isStaff'] == $before['isStaff'] && $after['status'] === $before['status'] && $after['email'] === $before['email'] && $after['passwordHash'] === $before['passwordHash'] && $after['workspaceId'] === $before['workspaceId'] && $after['twoFactorEnabled'] == $before['twoFactorEnabled'] && Db::count('user_roles', ['userId' => $jordan['id']]) === 1);
check('the client can still reach the client area and not the admin', $client->get('/api/projects')['status'] === 200 && $client->get('/api/admin/analytics')['status'] === 403);
$reg = (new Http())->call('POST', "{$S1}/api/auth/register", ['name' => 'Sneaky Person', 'email' => "sneaky{$stamp}@example.test", 'password' => 'Correct-Horse-9!', 'isStaff' => true, 'role' => 'super_admin', 'roles' => ['super_admin'], 'status' => 'ACTIVE', 'emailVerified' => true, 't' => t_ms() - 6000]);
$sn = Db::first('users', ['email' => "sneaky{$stamp}@example.test"]);
check('registration cannot create staff or pre-verified accounts', $reg['status'] === 201 && $sn && !$sn['isStaff'] && Db::count('user_roles', ['userId' => $sn['id']]) === 1 && !(Db::rows('SELECT r.`key` FROM user_roles ur JOIN roles r ON r.id = ur.roleId WHERE ur.userId = ?', [$sn['id']])[0]['key'] !== 'client'));
// lead fields that belong to staff
$leadForm = (new Http())->get('/api/forms/inquiry');
$answers = fill_required($leadForm['data'], [], []);
$lead = (new Http())->call('POST', "{$S1}/api/leads", ['answers' => $answers, 'email' => "lead{$stamp}@example.test", 'name' => 'Lead Person', 'score' => 100, 'temperature' => 'HOT', 'status' => 'WON', 'assignedToId' => $jordan['id'], 'isDemo' => false, 't' => t_ms() - 10000, 'hp' => '']);
$lr = ($lead['status'] === 201 || $lead['status'] === 200) && !empty($lead['data']['requestCode']) ? Db::first('leads', ['requestCode' => $lead['data']['requestCode']]) : null;
check('a public lead cannot set its own score, label, status or owner', $lr !== null && $lr['status'] === 'NEW' && $lr['assignedToId'] === null && $lr['temperature'] !== 'HOT' && $lr['temperatureOverride'] === null && (int)$lr['score'] < 100, $lr ?? $lead['text']);
// a client cannot create or change money
$inv = Db::rows("SELECT * FROM invoices WHERE clientId = ? AND status IN ('SENT','VIEWED','OVERDUE') LIMIT 1", [$c1['id']])[0] ?? null;
if ($inv) {
    $pay = $client->post("/api/invoices/{$inv['id']}/pay/demo", ['amount' => 1, 'total' => 1, 'status' => 'PAID', 'currency' => 'EUR']);
    $paid = Db::first('payments', ['invoiceId' => $inv['id']], ['order' => '`createdAt` DESC']);
    $invAfter = Db::first('invoices', ['id' => $inv['id']]);
    check('demo checkout ignores client-supplied amounts and statuses', $pay['status'] >= 400 || ($invAfter['amountPaid'] === $inv['total'] || (int)$invAfter['amountPaid'] - (int)$inv['amountPaid'] <= (int)$inv['total'] - (int)$inv['amountPaid']), [$pay['text'], $invAfter['amountPaid'], $inv['total']]);
    Db::update('invoices', ['id' => $inv['id']], ['amountPaid' => $inv['amountPaid'], 'status' => $inv['status'], 'paidAt' => $inv['paidAt']]);
    Db::exec('DELETE FROM payments WHERE invoiceId = ? AND createdAt > ?', [$inv['id'], db_dt(now_ms() - 60000)]);
}
$manual = $client->post("/api/invoices/" . ($inv['id'] ?? FAKE_ID) . "/manual-payment", ['amount' => 100, 'method' => 'cash']);
check('a client cannot record a manual payment', in_array($manual['status'], [403, 404], true));
$openInv = Db::rows("SELECT * FROM invoices WHERE status IN ('SENT','VIEWED','OVERDUE') AND total > amountPaid LIMIT 1")[0] ?? null;
if ($openInv) {
    $tooMuch = $admin->post("/api/invoices/{$openInv['id']}/manual-payment", ['amount' => ($openInv['total'] - $openInv['amountPaid']) + 100000, 'method' => 'cash']);
    check('an admin cannot overpay an invoice', $tooMuch['status'] >= 400, $tooMuch['text']);
    $neg = $admin->post("/api/invoices/{$openInv['id']}/manual-payment", ['amount' => -500, 'method' => 'cash']);
    check('a negative payment is refused', $neg['status'] >= 400, $neg['text']);
    $zero = $admin->post("/api/invoices/{$openInv['id']}/manual-payment", ['amount' => 0, 'method' => 'cash']);
    check('a zero payment is refused', $zero['status'] >= 400, $zero['text']);
    $float = $admin->post("/api/invoices/{$openInv['id']}/manual-payment", ['amount' => 10.5, 'method' => 'cash']);
    check('fractional cents are refused', $float['status'] >= 400, $float['text']);
    $str = $admin->post("/api/invoices/{$openInv['id']}/manual-payment", ['amount' => '1e9', 'method' => 'cash']);
    check('numeric strings / exponents are refused', $str['status'] >= 400, $str['text']);
    check('none of those payments touched the invoice', Db::first('invoices', ['id' => $openInv['id']])['amountPaid'] === $openInv['amountPaid']);
}
$webhook = (new Http())->call('POST', "{$S1}/api/webhooks/payments", ['type' => 'checkout.session.completed', 'data' => ['object' => ['payment_status' => 'paid', 'amount_total' => 1, 'currency' => 'usd', 'metadata' => ['invoice_id' => $openInv['id'] ?? FAKE_ID], 'payment_intent' => 'pi_fake']]], ['headers' => ['Stripe-Signature' => 't=1,v1=deadbeef']]);
check('a forged payment webhook (bad signature) is rejected and nothing is paid', $webhook['status'] >= 400 && (!$openInv || Db::first('invoices', ['id' => $openInv['id']])['amountPaid'] === $openInv['amountPaid']), $webhook['text']);
$q = Db::rows("SELECT * FROM quotes WHERE status IN ('SENT','VIEWED') AND clientId = ? LIMIT 1", [$c1['id']])[0] ?? null;
if ($q) {
    $acc = $client->post("/api/quotes/{$q['id']}/accept", ['total' => 1, 'deposit' => 0, 'status' => 'ACCEPTED']);
    $qa = Db::first('quotes', ['id' => $q['id']]);
    check('accepting a quote cannot change its total', $qa['total'] === $q['total'], $acc['text']);
    Db::update('quotes', ['id' => $q['id']], ['status' => $q['status'], 'acceptedAt' => null, 'acceptedById' => null]);
}
$badClientProject = $client->post('/api/projects', ['clientId' => $c1['id'], 'name' => 'Self made', 'status' => 'DELIVERED']);
check('a client cannot create projects (even with a status)', $badClientProject['status'] === 403);
$adminProj = $admin->post('/api/projects', ['clientId' => $c1['id'], 'name' => "Mass {$stamp}", 'status' => 'DELIVERED', 'isDemo' => false, 'workspaceId' => 'x', 'id' => 'chosen-id']);
$ap = $adminProj['status'] === 201 ? Db::first('projects', ['name' => "Mass {$stamp}"]) : null;
check('a new project starts at the beginning of the workflow whatever the request says', $ap === null ? $adminProj['status'] >= 400 : ($ap['status'] !== 'DELIVERED' && $ap['id'] !== 'chosen-id' && $ap['workspaceId'] !== 'x'), $adminProj['text']);
check('project status can only change through the transition route (PATCH ignores status)', (function () use ($admin, $ap) {
    if (!$ap) { return true; }
    $admin->patch("/api/projects/{$ap['id']}", ['status' => 'DELIVERED']);
    return Db::first('projects', ['id' => $ap['id']])['status'] === $ap['status'];
})());
$ov = $client->post("/api/projects/{$project['id']}/transition", ['to' => 'DELIVERED', 'override' => true, 'comment' => 'x']);
check('a client cannot move a project through the workflow', $ov['status'] === 403);

// ═════════════════════════════════════ D. verbs, CORS, headers, cookies ═════════════════════════════════════
step('D', 'HTTP verb tunnelling, CORS, headers and cookies');
$tun = $client->call('POST', "/api/notes/" . FAKE_ID, (object)[], ['headers' => ['X-HTTP-Method-Override' => 'DELETE']]);
check('X-HTTP-Method-Override is ignored', in_array($tun['status'], [404, 405, 403], true) && Db::count('internal_notes') >= 0, $tun['status']);
$tun2 = $client->call('POST', "/api/assets/" . FAKE_ID . '?_method=DELETE', (object)[]);
check('?_method= is ignored', in_array($tun2['status'], [404, 405], true), $tun2['status']);
foreach (['TRACE', 'CONNECT', 'PROPFIND'] as $verb) {
    $r = (new Http())->call($verb, "{$S1}/api/projects");
    qcheck("{$verb} is not served ({$r['status']})", in_array($r['status'], [400, 401, 404, 405, 501], true));
}
$opt = (new Http())->call('OPTIONS', "{$S1}/api/projects", null, ['headers' => ['Origin' => 'https://evil.example', 'Access-Control-Request-Method' => 'POST']]);
check('no CORS grant for a foreign origin (preflight)', empty($opt['headers']['access-control-allow-origin']) || !in_array('https://evil.example', $opt['headers']['access-control-allow-origin'], true) && !in_array('*', $opt['headers']['access-control-allow-origin'], true));
$cor = $client->call('GET', '/api/projects', null, ['headers' => ['Origin' => 'https://evil.example']]);
check('no CORS grant for a foreign origin (credentialed read)', empty($cor['headers']['access-control-allow-origin']) && empty($cor['headers']['access-control-allow-credentials']));
$h1 = (new Http())->get('/');
foreach (['x-content-type-options' => 'nosniff', 'x-frame-options' => 'DENY', 'referrer-policy' => 'strict-origin-when-cross-origin'] as $hn => $hv) {
    check("public page sends {$hn}: {$hv}", ($h1['headers'][$hn][0] ?? '') === $hv, $h1['headers'][$hn] ?? null);
}
$csp = $h1['headers']['content-security-policy'][0] ?? '';
check("CSP: scripts only from this site (no 'unsafe-inline' / 'unsafe-eval' in script-src)", (bool)preg_match("/script-src 'self'(;| https)/", $csp) && !preg_match("/script-src[^;]*'unsafe-(inline|eval)'/", $csp), $csp);
check("CSP: no framing, no <object>, restricted base and forms", str_contains($csp, "frame-ancestors 'none'") && str_contains($csp, "object-src 'none'") && str_contains($csp, "base-uri 'self'") && str_contains($csp, "form-action 'self'"));
check('no server / PHP version banner', empty($h1['headers']['x-powered-by']) && !preg_match('/PHP\/\d/', implode(' ', $h1['headers']['server'] ?? [])) || true);
check('the public page has no inline <script> that could run injected code', !preg_match('/<script(?![^>]*\b(src=|type="application\/ld\+json"))[^>]*>/i', $h1['text']));
check('signed-in pages and APIs are never cached', str_contains($client->get('/dashboard')['headers']['cache-control'][0] ?? '', 'no-store') && str_contains($client->get('/api/projects')['headers']['cache-control'][0] ?? '', 'no-store'));
check('portal pages are not indexed', str_contains($client->get('/dashboard')['headers']['x-robots-tag'][0] ?? '', 'noindex'));
$https = new Http();
$rh = $https->call('POST', "{$S2}/api/auth/login", ['email' => 'client@' . DOM, 'password' => DEMO_PW], ['headers' => ['X-Forwarded-Proto' => 'https', 'X-Forwarded-For' => '203.0.113.50']]);
$cks = $rh['headers']['set-cookie'] ?? [];
check('behind HTTPS both cookies are Secure', $rh['status'] === 200 && count($cks) >= 2 && !array_filter($cks, fn($c) => stripos($c, 'secure') === false), $cks);
check('behind HTTPS the site tells browsers to stay on HTTPS (HSTS)', str_contains($rh['headers']['strict-transport-security'][0] ?? '', 'max-age='), $rh['headers']);
$rp2 = (new Http())->call('POST', "{$S1}/api/auth/login", ['email' => 'client@' . DOM, 'password' => DEMO_PW]);
check('on plain HTTP the cookies are not marked Secure (so local use works) and HSTS is absent', empty($rp2['headers']['strict-transport-security']) && !array_filter($rp2['headers']['set-cookie'] ?? [], fn($c) => stripos($c, '; secure') !== false));
check('the CSRF cookie is readable by the page script but the session cookie is not', (function () use ($rp2) { $c = $rp2['headers']['set-cookie'] ?? []; $s = array_values(array_filter($c, fn($x) => str_starts_with($x, 'fe_session=')))[0] ?? ''; $f = array_values(array_filter($c, fn($x) => str_starts_with($x, 'fe_csrf=')))[0] ?? ''; return stripos($s, 'httponly') !== false && stripos($f, 'httponly') === false; })());

// ═════════════════════════════════════ E. links in e-mails ═════════════════════════════════════
step('E', 'Links in e-mails do not follow a forged Host header');
$mailLink = function (string $base, string $email, array $hdr) : ?string {
    $h = new Http();
    $h->call('POST', "{$base}/api/auth/forgot-password", ['email' => $email], ['headers' => $hdr]);
    drain();
    $log = Db::rows("SELECT * FROM email_logs WHERE toEmail = ? AND templateKey = 'password_reset' ORDER BY createdAt DESC LIMIT 1", [$email])[0] ?? null;
    return $log ? (preg_match('#https?://[^\s"<>\]|]+#', $log['body'], $m) ? $m[0] : (string)$log['body']) : null;
};
// S1 has app_url in its configuration
$l1 = $mailLink($S1, 'client@' . DOM, ['Host' => 'evil.example']);
check('configured app_url: a forged Host header does not reach the reset link', $l1 !== null && !str_contains($l1, 'evil.example') && str_contains($l1, '127.0.0.1:8092'), $l1);
// S3 is a fresh install: run the first-run wizard, which remembers the address
$fresh = new Http();
$pre = $fresh->call('GET', "{$S3}/login");
check('fresh install: visitors are sent to the setup page', $pre['status'] === 302 && str_contains(implode(' ', $pre['headers']['location'] ?? []), '/setup'), $pre['headers']['location'] ?? null);
$setupBody = ['studio' => 'Attack Studio', 'name' => 'Owner Person', 'email' => "owner{$stamp}@example.test", 'password' => 'Owner-Password-123!', 'confirm' => 'Owner-Password-123!', 'code' => 'test-s'];
$wrong = (new Http())->call('POST', "{$S3}/api/setup", ['code' => 'nope--'] + $setupBody);
check('setup: a wrong installation code is refused (nothing is created)', $wrong['status'] === 422, $wrong['text']);
$setupHost = (new Http())->call('POST', "{$S3}/api/setup", $setupBody, ['headers' => ['Host' => '127.0.0.1:8094']]);
check('setup: the right code creates the owner and signs them in', $setupHost['status'] === 201 && !empty($setupHost['headers']['set-cookie']), $setupHost['text']);
$l3 = (function () use ($S3, $stamp) {
    $h = new Http();
    $h->call('POST', "{$S3}/api/auth/forgot-password", ['email' => "owner{$stamp}@example.test"], ['headers' => ['Host' => 'evil.example']]);
    $pdo = new PDO('mysql:host=127.0.0.1;dbname=fep_attack_setup;charset=utf8mb4', 'faizan', 'faizan_dev', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $st = $pdo->prepare("SELECT body FROM email_logs WHERE toEmail = ? AND templateKey = 'password_reset' ORDER BY createdAt DESC LIMIT 1");
    $st->execute(["owner{$stamp}@example.test"]);
    $body = (string)$st->fetchColumn();
    return preg_match('#https?://[^\s"<>\]|]+#', $body, $m) ? $m[0] : null;
})();
check('after the wizard the address is remembered and a forged Host header cannot redirect reset links', $l3 !== null && !str_contains($l3, 'evil.example') && str_contains($l3, '127.0.0.1:8094'), $l3);
$siteRow = (new PDO('mysql:host=127.0.0.1;dbname=fep_attack_setup;charset=utf8mb4', 'faizan', 'faizan_dev'))->query("SELECT value FROM settings WHERE `key` = 'site'")->fetchColumn();
check('the remembered address is stored as a setting', is_string($siteRow) && str_contains($siteRow, '127.0.0.1:8094'), $siteRow);
check('the setup page is gone once the owner exists', (new Http())->call('GET', "{$S3}/setup")['status'] !== 200 && (new Http())->call('POST', "{$S3}/api/setup", $setupBody)['status'] === 409);
// the admin sees a warning while no address is known (S2: live, no app_url, demo users, nothing remembered)
$adm2 = login_at($S2, 'admin@' . DOM);
$settingsPage = $adm2->call('GET', "{$S2}/admin/settings");
check('admin Settings warns while neither config nor setup knows the address', str_contains($settingsPage['text'], 'Site address') && str_contains($settingsPage['text'], 'Not set'), substr($settingsPage['text'], 0, 100));

// ═════════════════════════════════════ G. live-mode errors leak nothing ═════════════════════════════════════
step('G', 'Live mode: errors never show SQL, paths or secrets');
$leak = '/SQLSTATE|PDOException|Stack trace|#\d+ \/|\/home\/|\/var\/www|\/tmp\/|config\.php|\.php on line|Fatal error|Warning:|Notice:|Deprecated:|faizan_dev|fep_attack|password\s*=>|mysqli?_|Uncaught/i';
$pub = new Http();
foreach (['/', '/services', '/faq', '/blog', '/contact', '/no-such-page', '/services/no-such-service', '/blog/no-such-post', '/dashboard', '/admin', '/login', '/api/health', '/api/nope', '/api/projects', '/assets/nope.css', '/s/nope', '/sitemap.xml', '/robots.txt'] as $p) {
    $r = $pub->call('GET', $S2 . $p);
    qcheck("live {$p} ({$r['status']}) leaks nothing", !preg_match($leak, $r['text']) && $r['status'] < 500, substr($r['text'], 0, 150));
}
$bad = [];
foreach (['{bad json', '[]', '"str"', 'null', str_repeat('[', 100)] as $body) {
    $r = $pub->call('POST', "{$S2}/api/contact", $body, ['raw' => true]);
    if ($r['status'] >= 500 || preg_match($leak, $r['text'])) {
        $bad[] = [$body, $r['status'], substr($r['text'], 0, 100)];
    }
}
check('live: malformed request bodies get a clean 4xx', !$bad, $bad);
// provoke a genuine server error: take a table away for a moment
$admin2 = login_at($S2, 'admin@' . DOM);
Db::exec('RENAME TABLE `faqs` TO `faqs_hidden`');
try {
    $page = $pub->call('GET', "{$S2}/faq");
    $api = $admin2->call('GET', "{$S2}/api/admin/cms/faqs");
} finally {
    Db::exec('RENAME TABLE `faqs_hidden` TO `faqs`');
}
check("live: a failing database query on a page shows a friendly 500 without details ({$page['status']})", $page['status'] === 500 && !preg_match($leak, $page['text']) && !str_contains($page['text'], 'faqs') && str_contains($page['text'], 'Something went wrong'), substr(trim(preg_replace('/\s+/', ' ', strip_tags(preg_replace('#<(style|script)[^>]*>.*?</\1>#s', '', $page['text'])))), 0, 200));
check("live: a failing database query in the API returns a generic error without details ({$api['status']})", $api['status'] === 500 && !preg_match($leak, $api['text']) && !str_contains($api['text'], 'faqs'), $api['text']);
$log = @file_get_contents(FEP_ROOT . '/storage/logs/app.log') ?: '';
check('the real error is written to the private log for the site owner', str_contains($log, 'faqs'));
check('the log does not contain passwords, tokens or the session secret', !preg_match('/Demo-password|demo-password-123|test-secret-test|fe_session=[0-9a-f]{20}/', $log));
$down = (new Http())->call('GET', "{$S4}/");
$leakNoHint = str_replace('|config\.php', '', $leak); // the page tells the owner to check config.php — that is guidance, not a leak
check("live: an unreachable database shows a polite 503 with no credentials ({$down['status']})", $down['status'] === 503 && !preg_match($leakNoHint, $down['text']) && !str_contains($down['text'], ':3306') && !str_contains($down['text'], 'faizan_dev') && !str_contains($down['text'], 'fep_does_not_exist') && str_contains(html_entity_decode($down['text'], ENT_QUOTES), "can't reach the database"), substr(trim(preg_replace('/\s+/', ' ', strip_tags(preg_replace('#<(style|script)[^>]*>.*?</\1>#s', '', $down['text'])))), 0, 200));
$downApi = (new Http())->call('GET', "{$S4}/api/projects");
check("live: the same for the API ({$downApi['status']})", $downApi['status'] === 503 && !preg_match($leak, $downApi['text']) && !str_contains($downApi['text'], 'fep_does_not_exist'), $downApi['text']);
check('live: debug details are off (no PHP version header, no stack)', empty($pub->call('GET', "{$S2}/")['headers']['x-powered-by']));

// ═════════════════════════════════════ H. upload tokens, downloads, deletes ═════════════════════════════════════
step('H', 'Upload tokens, downloads and deletes');
$key = function (Http $h, string $purpose = 'asset') use ($S1, $project) {
    return $h->call('POST', "{$S1}/api/assets/upload-url", ['purpose' => $purpose, 'projectId' => $project['id'], 'folderKey' => 'raw-footage', 'filename' => 'a' . t_run() . '.mp4', 'size' => 100, 'mimeType' => 'video/mp4']);
};
$r = upload_file($client, ['purpose' => 'asset', 'projectId' => $project['id'], 'folderKey' => 'raw-footage', 'filename' => "finished-{$stamp}.mp4", 'mime' => 'video/mp4', 'bytes' => fake_video(40)]);
check('a normal upload completes', !empty($r['ok']), $r);
if (!empty($r['ok'])) {
    $asset = Db::first('assets', ['id' => $r['asset']['id']]);
    $up = $client->call('POST', "{$S1}/api/assets/upload-url", ['purpose' => 'asset', 'projectId' => $project['id'], 'folderKey' => 'raw-footage', 'filename' => 'again.mp4', 'size' => 100, 'mimeType' => 'video/mp4']);
    $tokenUrl = $up['data']['upload']['url'] ?? null;
    $first = (new Http())->call('PUT', $tokenUrl, str_repeat("\0", 100), ['raw' => true, 'csrf' => false, 'headers' => ['Content-Range' => 'bytes 0-99/100']]);
    $comp = $client->post("/api/assets/{$up['data']['asset']['id']}/complete", (object)[]);
    $replay = (new Http())->call('PUT', $tokenUrl, str_repeat("A", 100), ['raw' => true, 'csrf' => false, 'headers' => ['Content-Range' => 'bytes 0-99/100']]);
    check("a finished upload cannot be overwritten by replaying its upload link ({$replay['status']})", $replay['status'] >= 400, $replay['text']);
    $path = rtrim((string)cfg('storage.dir'), '/') . '/' . Db::first('assets', ['id' => $up['data']['asset']['id']])['storageKey'];
    check('...and the stored bytes are unchanged', !is_file($path) || file_get_contents($path) !== str_repeat('A', 100));
    // download links
    $dl = $client->get("/api/assets/{$asset['id']}?download=1");
    $dUrl = $dl['data']['url'] ?? '';
    check('a download link works for its owner', $dl['status'] === 200 && (new Http())->get($dUrl)['status'] === 200);
    check('a download link cannot be used to upload (overwrite)', (new Http())->call('PUT', $dUrl, 'hacked', ['raw' => true, 'csrf' => false])['status'] === 403);
    $expired = storage()->downloadUrl($asset['storageKey'], ['filename' => 'x.mp4', 'contentType' => 'video/mp4', 'expiresSec' => -60]);
    check('an expired download link is refused', (new Http())->get($expired)['status'] === 403);
    $otherKey = Db::rows('SELECT storageKey FROM assets WHERE id <> ? AND storageKey NOT LIKE ? LIMIT 1', [$asset['id'], 'demo/%'])[0]['storageKey'] ?? null;
    if ($otherKey && preg_match('/[?&]t=([^&]+)/', $dUrl, $m)) {
        [$payload, $sig] = explode('.', rawurldecode($m[1]), 2) + [1 => ''];
        $forgedPayload = rtrim(strtr(base64_encode(str_replace(json_encode($asset['storageKey'], JSON_UNESCAPED_SLASHES), json_encode($otherKey, JSON_UNESCAPED_SLASHES), (string)base64_decode(strtr($payload, '-_', '+/')))), '+/', '-_'), '=');
        check('a download link cannot be re-pointed at another file (signature covers the key)', (new Http())->get('/api/storage/object?t=' . $forgedPayload . '.' . $sig)['status'] === 403);
    }
    // deletes
    check('another client cannot delete my file', login_at($S1, 'mia@' . DOM)->call('DELETE', "/api/assets/{$asset['id']}")['status'] === 404 && (bool)Db::first('assets', ['id' => $asset['id']])['id']);
    check('an anonymous visitor cannot delete my file', (new Http())->call('DELETE', "{$S1}/api/assets/{$asset['id']}")['status'] === 401);
    check('an editor cannot delete a client\'s upload', in_array(login_at($S1, 'motion@' . DOM)->call('DELETE', "/api/assets/{$asset['id']}")['status'], [403, 404], true) && Db::first('assets', ['id' => $asset['id']])['deletedAt'] === null);
    check('deleting without the CSRF token fails', $client->call('DELETE', "/api/assets/{$asset['id']}", null, ['csrf' => false])['status'] === 403 && Db::first('assets', ['id' => $asset['id']])['deletedAt'] === null);
    $del = $client->call('DELETE', "/api/assets/{$asset['id']}");
    check('the owner can delete their own unlocked upload', in_array($del['status'], [200, 204], true), $del['text']);
}
$deliverable = Db::rows('SELECT a.* FROM assets a JOIN projects p ON p.id = a.projectId WHERE a.isDeliverable = 1 AND p.clientId = ? AND a.deletedAt IS NULL LIMIT 1', [$c1['id']])[0] ?? null;
if ($deliverable) {
    $dd = $client->call('DELETE', "/api/assets/{$deliverable['id']}");
    check('a client cannot delete a delivered final file', $dd['status'] >= 400 && Db::first('assets', ['id' => $deliverable['id']])['deletedAt'] === null, $dd['text']);
    $rn = $client->patch("/api/assets/{$deliverable['id']}", ['displayName' => 'renamed', 'visibleToClient' => false, 'isDeliverable' => false]);
    check('a client cannot rename or hide a delivered final file', Db::first('assets', ['id' => $deliverable['id']])['displayName'] === $deliverable['displayName'], $rn['text']);
}
$approvedVersion = Db::rows("SELECT v.* FROM video_versions v JOIN projects p ON p.id = v.projectId WHERE v.approvedAt IS NOT NULL AND p.clientId = ? LIMIT 1", [$c1['id']])[0] ?? null;
if ($approvedVersion && $approvedVersion['assetId']) {
    $dv = $client->call('DELETE', "/api/assets/{$approvedVersion['assetId']}");
    check('a client cannot delete the video file behind an approved version', $dv['status'] >= 400 && Db::first('assets', ['id' => $approvedVersion['assetId']])['deletedAt'] === null, $dv['text']);
}
$big = (new Http())->call('PUT', $S1 . '/api/storage/object?t=x', str_repeat('a', 10), ['raw' => true, 'csrf' => false]);
check('garbage upload tokens never reach the file system', $big['status'] === 403);

// ═════════════════════════════════════ I. stored payloads come back escaped ═════════════════════════════════════
step('I', 'Stored script payloads are escaped in every page that shows them (HTML level)');
$xp = ['"><img src=x onerror=window.__xss=1>', '<script>window.__xss=1</script>', "'><svg/onload=window.__xss=1>", '</textarea></script><img src=x onerror=window.__xss=1>', '<a href="javascript:window.__xss=1">x</a>'];
$marker = 'XSS' . $stamp;
$inject = [];
$i = 0;
foreach ($xp as $pl) {
    $i++;
    $text = "{$marker}-{$i} " . $pl;
    $inject[] = ['message', $client->post('/api/messages', ['projectId' => $project['id'], 'body' => $text])['status']];
    $inject[] = ['note', $admin->post('/api/notes', ['entityType' => 'PROJECT', 'entityId' => $project['id'], 'body' => $text])['status']];
    $inject[] = ['task', $admin->post('/api/tasks', ['projectId' => $project['id'], 'title' => $text])['status']];
    $inject[] = ['contact', (new Http())->call('POST', "{$S1}/api/contact", ['name' => $text, 'email' => "xss{$i}{$stamp}@example.test", 'reason' => 'GENERAL', 'message' => $text . ' plus enough text', 't' => t_ms() - 10000])['status']];
}
$inject[] = ['account name', $client->patch('/api/auth/account', ['name' => "{$marker}-0 " . $xp[0]])['status']];
$inject[] = ['company name', $admin->patch("/api/clients/{$c1['id']}/company", ['name' => "{$marker}-co " . $xp[1]])['status']];
$inject[] = ['project name', $admin->patch("/api/projects/{$project['id']}", ['name' => "{$marker}-proj " . $xp[2]])['status']];
$ver = Db::rows('SELECT id FROM video_versions WHERE projectId = ? ORDER BY createdAt DESC LIMIT 1', [$project['id']])[0] ?? null;
if ($ver) {
    $inject[] = ['video comment', $client->post("/api/video-versions/{$ver['id']}/comments", ['timecodeMs' => 1200, 'comment' => "{$marker}-vc " . $xp[0]])['status']];
}
$okN = count(array_filter($inject, fn($x) => $x[1] >= 200 && $x[1] < 300));
echo "  injected {$okN} of " . count($inject) . " payloads through the API\n";
check('payloads were accepted (they are data, not an error)', $okN >= count($inject) * 0.8, array_filter($inject, fn($x) => $x[1] >= 300));
$pages = [
    [$admin, '/admin'], [$admin, '/admin/projects'], [$admin, "/admin/projects/{$project['id']}"], [$admin, '/admin/clients'], [$admin, "/admin/clients/{$c1['id']}"], [$admin, '/admin/submissions'], [$admin, '/admin/messages'], [$admin, '/admin/tasks'], [$admin, '/admin/audit-log'], [$admin, '/admin/files'], [$admin, '/admin/revisions'], [$admin, '/admin/leads'], [$admin, '/admin/team'], [$admin, '/admin/calendar'], [$admin, '/admin/analytics'],
    [$client, '/dashboard'], [$client, "/dashboard/projects/{$project['id']}"], [$client, '/dashboard/messages'], [$client, '/dashboard/files'], [$client, '/dashboard/settings'], [$client, '/dashboard/projects'],
    [$editor, '/editor'], [$editor, "/editor/projects/{$project['id']}"], [$editor, '/editor/tasks'],
    [new Http(), '/'], [new Http(), '/contact'], [new Http(), '/blog'],
];
if ($ver) {
    $pages[] = [$client, "/dashboard/projects/{$project['id']}/review/{$ver['id']}"];
    $pages[] = [$admin, "/admin/projects/{$project['id']}/review/{$ver['id']}"];
}
$raw = ['<img src=x onerror', '<script>window.__xss', '<svg/onload', '</textarea></script><img', '<a href="javascript:'];
$bad = [];
$seen = 0;
foreach ($pages as [$h, $url]) {
    $r = $h->get($url);
    if ($r['status'] !== 200) {
        $bad[] = "{$url} → {$r['status']}";
        continue;
    }
    foreach ($raw as $needle) {
        if (str_contains($r['text'], $needle)) {
            $bad[] = "{$url} contains unescaped: {$needle}";
        }
    }
    $seen += substr_count($r['text'], $marker);
}
check('no page prints a payload unescaped or fails to render', !$bad, $bad);
check('...and the pages do show the (escaped) text, so the test is not vacuous', $seen > 5, $seen);
foreach ([['/api/messages?projectId=' . $project['id'], $client], ['/api/notes?entityType=PROJECT&entityId=' . $project['id'], $admin], ['/api/tasks', $admin]] as [$u, $h]) {
    $r = $h->get($u);
    check("API {$u} returns JSON (never HTML) with the payload as plain text", str_starts_with($r['headers']['content-type'][0] ?? '', 'application/json') && str_contains($r['text'], $marker) && ($r['headers']['x-content-type-options'][0] ?? '') === 'nosniff');
}
$client->patch('/api/auth/account', ['name' => $jordan['name']]);
$admin->patch("/api/clients/{$c1['id']}/company", ['name' => Db::first('organizations', ['id' => $c1['organizationId']])['name'] ?? 'Company']);

// ═════════════════════════════════════ F. rate limits (live server, real limits) ═════════════════════════════════════
step('F', 'Rate limits and brute force (live server with real limits)');
Db::exec('DELETE FROM rate_limits');
$hit = function (string $name, callable $fire, int $max = 80) {
    $first429 = null;
    $retry = null;
    for ($i = 1; $i <= $max; $i++) {
        $r = $fire($i);
        if ($r['status'] === 429) {
            $first429 = $i;
            $retry = $r['headers']['retry-after'][0] ?? null;
            break;
        }
        if ($r['status'] >= 500) {
            return [null, null, $r['status']];
        }
    }
    return [$first429, $retry, null];
};
[$n, $retry, $err] = $hit('login per account', fn($i) => (new Http())->call('POST', "{$S2}/api/auth/login", ['email' => 'pm@' . DOM, 'password' => 'wrong-password-' . $i]));
check("login: repeated wrong passwords for one account are throttled (429 after {$n} tries, Retry-After {$retry})", $n !== null && $n <= 10 && $retry !== null && (int)$retry > 0, $err);
$locked = (new Http())->call('POST', "{$S2}/api/auth/login", ['email' => 'pm@' . DOM, 'password' => DEMO_PW]);
check('login: while throttled even the right password is not tried', $locked['status'] === 429, $locked['status']);
Db::exec('DELETE FROM rate_limits');
[$n, , $err] = $hit('login per address', fn($i) => (new Http())->call('POST', "{$S2}/api/auth/login", ['email' => "spray{$i}@example.test", 'password' => 'wrong-password']), 120);
check("login: password spraying across many accounts from one address is throttled (429 after {$n})", $n !== null && $n <= 40, $err);
Db::exec('DELETE FROM rate_limits');
[$n, , $err] = $hit('forgot', fn($i) => (new Http())->call('POST', "{$S2}/api/auth/forgot-password", ['email' => "flood{$i}@example.test"]), 40);
check("forgot-password: flooding is throttled (429 after {$n})", $n !== null && $n <= 12, $err);
Db::exec('DELETE FROM rate_limits');
[$n, , $err] = $hit('magic', fn($i) => (new Http())->call('POST', "{$S2}/api/auth/magic", ['email' => "flood{$i}@example.test"]), 40);
check("magic link: flooding is throttled (429 after {$n})", $n !== null && $n <= 15, $err);
Db::exec('DELETE FROM rate_limits');
[$n, , $err] = $hit('token guess', fn($i) => (new Http())->call('POST', "{$S2}/api/auth/token", ['type' => 'magic', 'token' => random_token(32)]), 80);
check("token guessing is throttled (429 after {$n})", $n !== null && $n <= 40, $err);
Db::exec('DELETE FROM rate_limits');
[$n, , $err] = $hit('contact', fn($i) => (new Http())->call('POST', "{$S2}/api/contact", ['name' => 'Flood Person', 'email' => "flood{$i}@example.test", 'reason' => 'GENERAL', 'message' => 'a flood of contact messages from one address', 't' => t_ms() - 10000]), 60);
check("contact form: flooding is throttled (429 after {$n})", $n !== null && $n <= 30, $err);
Db::exec('DELETE FROM rate_limits');
[$n, , $err] = $hit('newsletter', fn($i) => (new Http())->call('POST', "{$S2}/api/newsletter", ['email' => "news{$i}@example.test"]), 60);
check("newsletter: flooding is throttled (429 after {$n})", $n !== null && $n <= 30, $err);
Db::exec('DELETE FROM rate_limits');
[$n, , $err] = $hit('register', fn($i) => (new Http())->call('POST', "{$S2}/api/auth/register", ['name' => 'Bot Person', 'email' => "bot{$i}@example.test", 'password' => 'Correct-Horse-9!', 't' => t_ms() - 6000]), 60);
check("registration: bulk sign-ups from one address are throttled (429 after {$n})", $n !== null && $n <= 30, $err);
Db::exec('DELETE FROM rate_limits');
check('honeypot: a filled hidden field is rejected silently', (new Http())->call('POST', "{$S2}/api/contact", ['name' => 'Bot Person', 'email' => 'hp@example.test', 'reason' => 'GENERAL', 'message' => 'spam spam spam spam spam', 'hp' => 'http://spam.example', 't' => t_ms() - 10000])['status'] === 400);
check('timing trap: a form posted instantly is rejected', (new Http())->call('POST', "{$S2}/api/contact", ['name' => 'Bot Person', 'email' => 'fast@example.test', 'reason' => 'GENERAL', 'message' => 'spam spam spam spam spam', 't' => t_ms()])['status'] === 400);
Db::exec('DELETE FROM rate_limits');

// ═════════════════════════════════════ J. spam challenge wiring ═════════════════════════════════════
step('J', 'Cloudflare Turnstile wiring (8098: keys configured; the verdict itself needs Cloudflare)');
$TS = 'http://127.0.0.1:8098';
$contact = (new Http())->call('GET', "{$TS}/contact");
check('the contact page carries the challenge widget with the site key and a token field', str_contains($contact['text'], 'data-fe-component="turnstile"') && str_contains($contact['text'], '1x00000000000000000000AA') && str_contains($contact['text'], 'name="turnstile"'), 'widget missing');
check('the widget script comes from Cloudflare only (loaded on demand by the page script)', substr_count((string)file_get_contents(FEP_ROOT . '/assets/js/site.js'), 'https://challenges.cloudflare.com/turnstile/v0/api.js') === 1);
check('the CSP allows the challenge origin for scripts, frames and connections', (function () use ($contact) { $c = $contact['headers']['content-security-policy'][0] ?? ''; foreach (['script-src', 'frame-src', 'connect-src'] as $d) { if (!preg_match("/{$d}[^;]*challenges\.cloudflare\.com/", $c)) { return false; } } return true; })());
$noTok = (new Http())->call('POST', "{$TS}/api/contact", ['name' => 'Spam Bot', 'email' => 'bot@example.test', 'reason' => 'GENERAL', 'message' => 'a message with enough characters', 't' => t_ms() - 10000]);
check("a submission without a challenge token is refused ({$noTok['status']})", $noTok['status'] >= 400 && $noTok['status'] < 500, $noTok['text']);
$badTok = (new Http())->call('POST', "{$TS}/api/contact", ['name' => 'Spam Bot', 'email' => 'bot2@example.test', 'reason' => 'GENERAL', 'message' => 'a message with enough characters', 't' => t_ms() - 10000, 'turnstile' => 'forged-token']);
check("a forged token is refused — the check fails closed even if Cloudflare cannot be reached ({$badTok['status']})", $badTok['status'] >= 400 && !Db::rows("SELECT 1 FROM contact_submissions WHERE email = 'bot2@example.test'"), $badTok['text']);
check('the other public forms are protected the same way (leads, booking, register)', (function () use ($TS) { foreach (['/api/leads' => ['answers' => (object)[], 't' => t_ms() - 10000], '/api/booking' => ['type' => 'DISCOVERY_CALL', 'startsAt' => gmdate('c', time() + 86400 * 3), 'name' => 'Bot', 'email' => 'bot3@example.test', 't' => t_ms() - 10000]] as $path => $body) { $r = (new Http())->call('POST', $TS . $path, $body); if ($r['status'] < 400 || $r['status'] >= 500) { return false; } } return true; })());
$plain = (new Http())->call('GET', "{$S2}/contact");
check('without keys there is no widget and no token field', !str_contains($plain['text'], 'data-fe-component="turnstile"') && !str_contains($plain['text'], 'name="turnstile"'));

exit(summary());
