<?php
/**
 * Black-box security audit against a RUNNING copy of the application that has the sample studio loaded (database-demo.sql).
 *
 *   mysql -e "create database fep_audit character set utf8mb4 collate utf8mb4_unicode_ci"
 *   mysql fep_audit < public_html/database.sql && mysql fep_audit < public_html/database-demo.sql
 *   FEP_TEST_DB=fep_audit FEP_TEST_URL=http://127.0.0.1:8082 FEP_STRICT=1 FEP_DISABLE_RATE_LIMIT=1 FEP_NO_PSEUDO_CRON=1 \
 *       php -S 127.0.0.1:8082 -t public_html php-tests/dev-router.php            (terminal 1)
 *   FEP_TEST_DB=fep_audit FEP_TEST_URL=http://127.0.0.1:8082 php php-tests/security-audit.php    (terminal 2)
 *
 * It reads every route from the application's own route table and then attacks all of them:
 *   1. unauthenticated access to every protected route (must be 401)
 *   2. CSRF on every state-changing route (missing token, wrong token, cross-site origin — must be 403)
 *   3. a second workspace: nothing from the first one may be visible or changeable (tenant isolation)
 *   4. role exposure: client and editor sessions call every GET route; no response may contain another client's (or an
 *      unassigned project's) identifiers, and admin-only routes must refuse them; id-taking routes are probed with every foreign id
 *   5. real mutations against someone else's quotes, contracts, invoices, files, versions, comments, notifications, messages,
 *      members… — refused, and the database is verified unchanged
 *   6. pages (server-rendered) enforce the same rules; 7. redirect/sniffing/scrubbing helpers; 8. uploads; 9. request size
 * Rows it creates (a second workspace + user) are removed again at the end.
 */
require __DIR__ . '/lib.php';

const DEMO_PASSWORD = 'demo-password-123';
const FAKE = 'cmzzzzzzzzzzzzzzzzzzzzzzz';
const DOMAIN = 'demo.faizaneditspro.test';

/** Like check(), but prints failures only (for the big loops) */
function qcheck(string $name, bool $ok, mixed $detail = null): void
{
    if ($ok) {
        $GLOBALS['T']['passed']++;
        return;
    }
    check($name, false, $detail);
}

function login_as(string $email, string $password = DEMO_PASSWORD): Http
{
    $h = new Http($email);
    $r = $h->post('/api/auth/login', ['email' => $email, 'password' => $password]);
    if ($r['status'] !== 200) {
        fwrite(STDERR, "login failed for {$email}: {$r['status']} " . substr($r['text'], 0, 200) . "\n");
        exit(2);
    }
    return $h;
}

function route_table(): array
{
    $rp = new ReflectionProperty('Router', 'routes');
    $rp->setAccessible(true);
    return array_values(array_filter($rp->getValue(), fn($r) => $r['kind'] === 'api'));
}

function fill_route(string $pattern, string $id): string
{
    return preg_replace_callback('/\{(\w+)\}/', function ($m) use ($pattern, $id) {
        return match ($m[1]) {
            'resource' => 'services',
            'form' => 'inquiry',
            'key' => str_contains($pattern, 'exports') ? 'clients' : (str_contains($pattern, 'settings') ? 'business' : 'inquiry'),
            default => $id,
        };
    }, $pattern);
}

function mutating(string $m): bool { return in_array($m, ['POST', 'PUT', 'PATCH', 'DELETE'], true); }
function ids(string $sql, array $p = [], int $n = 6): array { return array_slice(Db::col($sql, $p), 0, $n); }
function any_id_in(string $text, array $forbidden): ?array
{
    foreach ($forbidden as $f) {
        if (str_contains($text, $f['id'])) {
            return $f;
        }
    }
    return null;
}
function flat(array $byKind, array $skip = []): array
{
    $out = [];
    foreach ($byKind as $k => $ids) {
        if (in_array($k, $skip, true)) {
            continue;
        }
        foreach ($ids as $id) {
            $out[] = ['id' => $id, 'kind' => $k];
        }
    }
    return $out;
}

echo "\nFaizanEdits Pro — PHP security audit  (" . t_base() . ")\n";
$health = (new Http())->get('/api/health');
if (($health['data']['status'] ?? null) !== 'ok') {
    fwrite(STDERR, "App is not reachable. Start it first (see the header of this file).\n");
    exit(2);
}
if (Db::count('users', ['email' => 'mia@' . DOMAIN]) === 0) {
    fwrite(STDERR, "The sample studio is not loaded in this database (import database-demo.sql).\n");
    exit(2);
}

$routes = route_table();
$auth = array_values(array_filter($routes, fn($r) => $r['opts']['auth']));
$publ = array_values(array_filter($routes, fn($r) => !$r['opts']['auth']));
echo 'Discovered ' . count($routes) . ' API routes (' . count($auth) . ' authenticated, ' . count($publ) . " public).\n";
check('route discovery found the API', count($routes) > 150, count($routes));

// ───────────────────────────────── 1. unauthenticated ─────────────────────────────────
step('1', 'Unauthenticated access to every protected route');
$anon = new Http('anon');
foreach ($auth as $r) {
    $res = $anon->call($r['method'], fill_route($r['pattern'], FAKE), mutating($r['method']) ? (object)[] : null);
    qcheck("{$r['method']} {$r['pattern']} → 401 when signed out", $res['status'] === 401, $res['status'] . ' ' . substr($res['text'], 0, 120));
}
echo '  (' . count($auth) . " protected routes answered 401)\n";
$publicExpect = [
    'GET /api/health' => fn($s) => $s === 200,
    'GET /api/auth/session' => fn($s) => $s === 200,
    'POST /api/auth/logout' => fn($s) => $s === 200,
    'GET /api/booking/slots' => fn($s) => $s === 200,
    'GET /api/forms/{key}' => fn($s) => $s === 200 || $s === 404,
    'GET /api/forms/{key}/draft' => fn($s) => $s === 200 || ($s >= 400 && $s < 500),
    'GET /api/auth/google' => fn($s) => $s >= 300 && $s < 500,
    'GET /api/auth/google/callback' => fn($s) => $s >= 300 && $s < 500,
    'POST /api/cron/run' => fn($s) => $s === 401 || $s === 403,
    'POST /api/setup' => fn($s) => in_array($s, [409, 403, 422], true),
];
foreach ($publ as $r) {
    $res = $anon->call($r['method'], fill_route($r['pattern'], FAKE), mutating($r['method']) ? (object)[] : null);
    $rule = $publicExpect["{$r['method']} {$r['pattern']}"] ?? null;
    if ($rule) {
        check("public {$r['method']} {$r['pattern']} behaves ({$res['status']})", $rule($res['status']), substr($res['text'], 0, 120));
    } else {
        check("public {$r['method']} {$r['pattern']} refuses empty input without a server error ({$res['status']})", $res['status'] >= 400 && $res['status'] < 500, substr($res['text'], 0, 160));
    }
}
$setupAgain = $anon->post('/api/setup', ['studio' => 'X', 'name' => 'Intruder', 'email' => 'intruder@example.test', 'password' => 'Intruder-Password-1', 'confirm' => 'Intruder-Password-1', 'code' => 'abcdef']);
check("the setup wizard refuses to run again on an installed site ({$setupAgain['status']})", $setupAgain['status'] === 409 && Db::count('users', ['email' => 'intruder@example.test']) === 0);
check('storage object GET without a token is refused', $anon->get('/api/storage/object')['status'] === 403);
check('storage object PUT without a token is refused', $anon->call('PUT', '/api/storage/object', 'x', ['raw' => true])['status'] === 403);
check('storage object with a forged token is refused', $anon->get('/api/storage/object?t=' . str_repeat('A', 60))['status'] === 403);
check('payment webhook without a signature is rejected', $anon->post('/api/webhooks/payments', ['type' => 'checkout.session.completed', 'data' => ['object' => ['payment_status' => 'paid', 'metadata' => ['invoice_id' => FAKE]]]])['status'] === 400);

// ───────────────────────────────── 2. CSRF ─────────────────────────────────
step('2', 'CSRF on every state-changing route (signed in as admin)');
$admin = login_as('admin@' . DOMAIN);
$mutAuth = array_values(array_filter($auth, fn($r) => mutating($r['method'])));
$csrfExempt = array_values(array_filter($routes, fn($r) => mutating($r['method']) && ($r['opts']['csrf'] ?? true) === false));
echo '  state-changing routes that opt out of CSRF: ' . implode(', ', array_map(fn($r) => "{$r['method']} {$r['pattern']}", $csrfExempt)) . "\n";
// logout is exempt on purpose (an expired token must still be able to sign out; SameSite cookies mean a cross-site request carries no session); the webhook
// and cron carry their own secret/signature; the chunk endpoint is authorised by its signed, expiring upload token.
check('only logout, cron, the payment webhook and the signed upload endpoint opt out of CSRF', !array_filter($csrfExempt, fn($r) => !in_array($r['pattern'], ['/api/cron/run', '/api/auth/logout', '/api/webhooks/payments', '/api/storage/object'], true)));
foreach ($mutAuth as $r) {
    $url = fill_route($r['pattern'], FAKE);
    $body = $r['method'] === 'DELETE' ? null : (object)[];
    $none = $admin->call($r['method'], $url, $body, ['csrf' => false]);
    qcheck("{$r['method']} {$r['pattern']} needs the CSRF token", $none['status'] === 403, $none['status']);
    $wrong = $admin->call($r['method'], $url, $body, ['csrf' => false, 'headers' => ['X-CSRF-Token' => 'not-the-token']]);
    qcheck("{$r['method']} {$r['pattern']} rejects a wrong CSRF token", $wrong['status'] === 403, $wrong['status']);
    $cross = $admin->call($r['method'], $url, $body, ['headers' => ['Origin' => 'https://evil.example', 'Sec-Fetch-Site' => 'cross-site']]);
    qcheck("{$r['method']} {$r['pattern']} rejects cross-site requests", $cross['status'] === 403, $cross['status']);
    $sameSite = $admin->call($r['method'], $url, $body, ['headers' => ['Sec-Fetch-Site' => 'same-site']]);
    qcheck("{$r['method']} {$r['pattern']} rejects requests from a sibling site", $sameSite['status'] === 403, $sameSite['status']);
}
echo '  (' . count($mutAuth) . " state-changing routes × 4 attacks)\n";
$publicForms = [['POST', '/api/auth/login', ['email' => 'a@b.co', 'password' => 'x']], ['POST', '/api/leads', (object)[]], ['POST', '/api/contact', (object)[]], ['POST', '/api/booking', (object)[]], ['POST', '/api/newsletter', ['email' => 'a@b.co']], ['POST', '/api/auth/register', (object)[]], ['POST', '/api/auth/magic', ['email' => 'a@b.co']], ['POST', '/api/auth/forgot-password', ['email' => 'a@b.co']], ['POST', '/api/auth/token', ['type' => 'magic', 'token' => 'x']], ['PUT', '/api/forms/inquiry/draft', (object)[]], ['POST', '/api/auth/demo', (object)[]]];
$badCross = [];
$badSigned = [];
$signedIn = login_as('client@' . DOMAIN);
foreach ($publicForms as [$m, $u, $b]) {
    $r = (new Http())->call($m, $u, $b, ['headers' => ['Origin' => 'https://evil.example', 'Sec-Fetch-Site' => 'cross-site']]);
    if ($r['status'] !== 403) {
        $badCross[] = "{$m} {$u} → {$r['status']}";
    }
    // a browser that already carries a session cookie must also prove intent with the token (login-CSRF, form-spam as the victim)
    $r = $signedIn->call($m, $u, $b, ['csrf' => false]);
    if ($r['status'] !== 403) {
        $badSigned[] = "{$m} {$u} → {$r['status']}";
    }
}
check('public forms refuse cross-site requests (login, register, leads, contact, booking, newsletter, magic link, reset…)', !$badCross, $badCross);
check('public forms need the CSRF token as soon as a session cookie is present', !$badSigned, $badSigned);

// ───────────────────────────────── people and object pools ─────────────────────────────────
$jordan = Db::first('users', ['email' => 'client@' . DOMAIN]);
$mia = Db::first('users', ['email' => 'mia@' . DOMAIN]);
$marco = Db::first('users', ['email' => 'editor@' . DOMAIN]);
$c1 = Db::first('clients', ['userId' => $jordan['id']]);
$c2 = Db::first('clients', ['userId' => $mia['id']]);

$foreignForClient = function (string $own, string $ownUser): array {
    return [
        'clients' => ids('SELECT id FROM clients WHERE id <> ?', [$own]),
        'projects' => ids('SELECT id FROM projects WHERE clientId <> ?', [$own], 8),
        'quotes' => ids('SELECT id FROM quotes WHERE clientId <> ?', [$own]),
        'invoices' => ids('SELECT id FROM invoices WHERE clientId <> ?', [$own]),
        'contracts' => ids('SELECT id FROM contracts WHERE clientId <> ?', [$own]),
        'payments' => ids('SELECT id FROM payments WHERE clientId <> ?', [$own]),
        'assets' => ids('SELECT a.id FROM assets a JOIN projects p ON p.id = a.projectId WHERE p.clientId <> ?', [$own], 8),
        'versions' => ids('SELECT v.id FROM video_versions v JOIN projects p ON p.id = v.projectId WHERE p.clientId <> ?', [$own]),
        'comments' => ids('SELECT v.id FROM video_comments v JOIN projects p ON p.id = v.projectId WHERE p.clientId <> ?', [$own]),
        'revisions' => ids('SELECT v.id FROM revision_requests v JOIN projects p ON p.id = v.projectId WHERE p.clientId <> ?', [$own]),
        'messages' => ids('SELECT id FROM messages WHERE clientId <> ?', [$own]),
        'retainers' => ids('SELECT id FROM retainers WHERE clientId <> ?', [$own]),
        'notes' => ids('SELECT id FROM internal_notes'),
        'leads' => ids('SELECT id FROM leads'),
        'tasks' => ids('SELECT id FROM tasks'),
        'notifications' => ids('SELECT id FROM notifications WHERE userId <> ?', [$ownUser]),
        'audit' => ids('SELECT id FROM audit_logs'),
        'emails' => ids('SELECT id FROM email_logs'),
        'fileRequests' => ids('SELECT v.id FROM file_requests v JOIN projects p ON p.id = v.projectId WHERE p.clientId <> ?', [$own]),
        'changeRequests' => ids('SELECT v.id FROM change_requests v JOIN projects p ON p.id = v.projectId WHERE p.clientId <> ?', [$own]),
        'meetings' => ids('SELECT id FROM meetings WHERE clientId IS NULL OR clientId <> ?', [$own]),
        'times' => ids('SELECT id FROM time_entries'),
        'clientUsers' => ids('SELECT id FROM users WHERE isStaff = 0 AND id <> ?', [$ownUser]),
    ];
};
$fC1 = $foreignForClient($c1['id'], $jordan['id']);
$assignedToMarco = Db::col('SELECT projectId FROM project_members WHERE userId = ?', [$marco['id']]);
$unassigned = Db::col('SELECT id FROM projects WHERE id NOT IN (' . implode(',', array_fill(0, count($assignedToMarco), '?')) . ')', $assignedToMarco);
$editorsClients = Db::col('SELECT DISTINCT clientId FROM projects WHERE id IN (' . implode(',', array_fill(0, count($assignedToMarco), '?')) . ')', $assignedToMarco);
$inList = fn(array $a) => $a ? implode(',', array_fill(0, count($a), '?')) : "''";
$fEd = [
    'projects' => $unassigned,
    'quotes' => ids('SELECT id FROM quotes'),
    'invoices' => ids('SELECT id FROM invoices'),
    'contracts' => ids('SELECT id FROM contracts'),
    'payments' => ids('SELECT id FROM payments'),
    'leads' => ids('SELECT id FROM leads'),
    'audit' => ids('SELECT id FROM audit_logs'),
    'emails' => ids('SELECT id FROM email_logs'),
    'clients' => ids('SELECT id FROM clients WHERE id NOT IN (' . $inList($editorsClients) . ')', $editorsClients),
    'unassignedAssets' => ids('SELECT id FROM assets WHERE projectId IN (' . $inList($unassigned) . ')', $unassigned, 8),
    'unassignedVersions' => ids('SELECT id FROM video_versions WHERE projectId IN (' . $inList($unassigned) . ')', $unassigned),
];
check('fixtures: there are foreign objects to probe with', count(flat($fC1)) > 50 && count($fEd['projects']) >= 1 && count($assignedToMarco) >= 1, [count(flat($fC1)), count($fEd['projects'])]);
$client1 = login_as('client@' . DOMAIN);
$editor1 = login_as('editor@' . DOMAIN);
$client2 = login_as('mia@' . DOMAIN);

// ───────────────────────────────── 3. tenant isolation ─────────────────────────────────
step('3', 'A second workspace cannot see or change the first');
$stamp = t_run();
$ws2 = Db::insert('workspaces', ['name' => "Isolation {$stamp}", 'slug' => "isolation-{$stamp}"]);
$otherEmail = "tenant2-{$stamp}@example.test";
$other = make_staff($otherEmail, 'Other Tenant Admin', 'super_admin', 'Tenant-Two-123!');
Db::update('users', ['id' => $other['id']], ['workspaceId' => $ws2['id']]);
try {
    $t2 = login_as($otherEmail, 'Tenant-Two-123!');
    $w1 = [
        'project' => Db::first('projects', ['clientId' => $c1['id']])['id'], 'client' => $c1['id'],
        'invoice' => Db::first('invoices', ['clientId' => $c1['id']])['id'], 'quote' => Db::first('quotes', ['clientId' => $c1['id']])['id'],
        'contract' => Db::first('contracts', ['clientId' => $c1['id']])['id'], 'lead' => Db::first('leads', [])['id'],
    ];
    $listPaths = ['/api/projects', '/api/clients', '/api/invoices', '/api/quotes', '/api/contracts', '/api/leads', '/api/payments', '/api/tasks', '/api/messages/threads', '/api/notifications', '/api/admin/team', '/api/admin/audit-log', '/api/admin/emails', '/api/contact-submissions', '/api/retainers', '/api/meetings', '/api/assets', '/api/revisions', '/api/admin/analytics?range=12m', '/api/search?q=a', '/api/admin/settings', '/api/admin/jobs'];
    $w1Ids = array_merge(array_values($w1), array_column(flat($fC1), 'id'));
    foreach ($listPaths as $p) {
        $r = $t2->get($p);
        $leaked = null;
        foreach ($w1Ids as $id) {
            if (str_contains($r['text'], $id)) {
                $leaked = $id;
                break;
            }
        }
        check("tenant 2 GET {$p} shows nothing from tenant 1 ({$r['status']})", !$leaked && $r['status'] < 500, ['status' => $r['status'], 'leaked' => $leaked]);
    }
    foreach (['project' => "/api/projects/{$w1['project']}", 'client' => "/api/clients/{$w1['client']}", 'invoice' => "/api/invoices/{$w1['invoice']}", 'quote' => "/api/quotes/{$w1['quote']}", 'contract' => "/api/contracts/{$w1['contract']}", 'lead' => "/api/leads/{$w1['lead']}"] as $name => $p) {
        $r = $t2->get($p);
        check("tenant 2 cannot read tenant 1's {$name} by id ({$r['status']})", in_array($r['status'], [403, 404], true), substr($r['text'], 0, 120));
    }
    $snapP = fn() => json_encode(Db::first('projects', ['id' => $w1['project']]));
    $before = $snapP();
    $tries = [
        $t2->patch("/api/projects/{$w1['project']}", ['name' => 'hijacked']),
        $t2->post("/api/projects/{$w1['project']}/transition", ['to' => 'CANCELLED', 'override' => true, 'comment' => 'x']),
        $t2->post("/api/invoices/{$w1['invoice']}/manual-payment", ['amount' => 100, 'method' => 'cash']),
        $t2->post("/api/invoices/{$w1['invoice']}/cancel", (object)[]),
        $t2->patch("/api/clients/{$w1['client']}", ['companyName' => 'hijacked']),
        $t2->post("/api/quotes/{$w1['quote']}/send", (object)[]),
        $t2->post("/api/contracts/{$w1['contract']}/send", (object)[]),
        $t2->patch("/api/leads/{$w1['lead']}", ['name' => 'hijacked']),
        $t2->post("/api/projects/{$w1['project']}/assign", ['editorIds' => []]),
        $t2->post("/api/notes", ['entityType' => 'PROJECT', 'entityId' => $w1['project'], 'body' => 'x']),
    ];
    foreach ($tries as $i => $r) {
        check("tenant 2 mutation #" . ($i + 1) . " against tenant 1 is refused ({$r['status']})", in_array($r['status'], [403, 404, 409, 422], true), substr($r['text'], 0, 120));
    }
    check("tenant 1's project is unchanged after tenant 2's attempts", $snapP() === $before);
    $ex = $t2->get('/api/admin/exports/clients');
    $hit = null;
    foreach ($w1Ids as $id) {
        if (str_contains($ex['text'], $id)) {
            $hit = $id;
            break;
        }
    }
    check("tenant 2's client export contains no tenant 1 rows ({$ex['status']})", $hit === null && !preg_match('/Northwind|Lumen|Pixel Forge/', $ex['text']), $hit);
} finally {
    Db::exec('DELETE FROM sessions WHERE userId = ?', [$other['id']]);
    foreach (['audit_logs', 'activity_logs', 'notifications', 'email_logs'] as $t) {
        Db::exec("DELETE FROM `{$t}` WHERE workspaceId = ?", [$ws2['id']]);
    }
    Db::exec('DELETE FROM user_roles WHERE userId = ?', [$other['id']]);
    Db::exec('DELETE FROM users WHERE id = ?', [$other['id']]);
    Db::exec('DELETE FROM workspaces WHERE id = ?', [$ws2['id']]);
}

// ───────────────────────────────── 4. role exposure and object-level probes ─────────────────────────────────
$collectionGets = array_values(array_filter($auth, fn($r) => $r['method'] === 'GET' && !str_contains($r['pattern'], '{')));
$idGets = array_values(array_filter($auth, fn($r) => $r['method'] === 'GET' && str_contains($r['pattern'], '{')));
$queries = fn(array $fx) => array_merge(['', '?page=1&pageSize=200', '?q=a', '?q=e', '?q=video', '?pageSize=1000'], isset($fx['project']) ? ["?projectId={$fx['project']}", "?entityType=PROJECT&entityId={$fx['project']}"] : [], isset($fx['client']) ? ["?clientId={$fx['client']}"] : []);
$foreignC1 = flat($fC1);
$foreignEd = flat($fEd);
foreach ([['client (Jordan)', $client1, $foreignC1, true], ['editor (Marco)', $editor1, $foreignEd, false]] as [$label, $http, $foreign, $isClient]) {
    step('4a', "What a {$label} can read");
    $exposed = [];
    $fx = ['project' => null, 'client' => null];
    foreach ($foreign as $f) {
        if ($f['kind'] === 'projects' && !$fx['project']) {
            $fx['project'] = $f['id'];
        }
        if ($f['kind'] === 'clients' && !$fx['client']) {
            $fx['client'] = $f['id'];
        }
    }
    $fx = array_filter($fx);
    foreach ($collectionGets as $h) {
        foreach ($queries($fx) as $qs) {
            $r = $http->get($h['pattern'] . $qs);
            if ($r['status'] >= 500) {
                check("{$label} GET {$h['pattern']}{$qs} does not crash", false, $r['status']);
            }
            if ($r['status'] === 200) {
                if ($qs === '') {
                    $exposed[$h['pattern']] = true;
                }
                $hit = any_id_in($r['text'], $foreign);
                qcheck("{$label} GET {$h['pattern']}{$qs} contains no foreign " . ($hit['kind'] ?? 'ids'), $hit === null, $hit ? "{$hit['kind']} {$hit['id']}" : null);
            }
        }
    }
    $ex = array_keys($exposed);
    sort($ex);
    echo "  {$label} gets 200 from: " . implode(', ', $ex) . "\n";
    $ex1 = $http->get('/api/admin/exports/clients');
    check("{$label} is refused the client export ({$ex1['status']})", $ex1['status'] === 403, substr($ex1['text'], 0, 100));
    foreach ($auth as $h) {
        if (str_starts_with($h['pattern'], '/api/admin/') && $h['method'] === 'GET' && !str_contains($h['pattern'], '{')) {
            $r = $http->get($h['pattern']);
            qcheck("{$label} is refused {$h['pattern']} ({$r['status']})", $r['status'] === 403, substr($r['text'], 0, 100));
        }
    }
    foreach (['/api/leads', '/api/contact-submissions', '/api/clients', '/api/assignable'] as $p) {
        $r = $http->get($p);
        if ($isClient || $p !== '/api/assignable') {
            check("{$label} is refused {$p} ({$r['status']})", $r['status'] === 403, substr($r['text'], 0, 100));
        }
    }

    step('4b', "{$label}: id-taking GET routes with foreign identifiers");
    $sample = [];
    $per = [];
    foreach ($foreign as $f) {
        $per[$f['kind']] = ($per[$f['kind']] ?? 0);
        if ($per[$f['kind']] < 3) {
            $sample[] = $f;
            $per[$f['kind']]++;
        }
    }
    $n = 0;
    foreach ($idGets as $h) {
        foreach ($sample as $f) {
            $r = $http->get(fill_route($h['pattern'], $f['id']));
            $n++;
            qcheck("{$label} GET {$h['pattern']} with a foreign {$f['kind']} id is not served", !($r['status'] === 200 || $r['status'] >= 500), "{$r['status']} " . substr($r['text'], 0, 160));
        }
    }
    echo "  ({$n} probes)\n";
}

// ───────────────────────────────── 5. mutations against other people's objects ─────────────────────────────────
step('5', "Mutations against someone else's objects (client Jordan vs Mia's data, editor vs unassigned projects)");
$miaProject = Db::rows("SELECT * FROM projects WHERE clientId = ? AND status IN ('REVISION','CLIENT_REVIEW','FINAL_REVIEW') LIMIT 1", [$c2['id']])[0] ?? Db::first('projects', ['clientId' => $c2['id']]);
$miaVersion = Db::rows('SELECT * FROM video_versions WHERE projectId = ? ORDER BY createdAt DESC LIMIT 1', [$miaProject['id']])[0];
$miaComment = Db::rows('SELECT * FROM video_comments WHERE projectId = ? LIMIT 1', [$miaProject['id']])[0];
$miaAsset = Db::rows('SELECT * FROM assets WHERE projectId = ? AND deletedAt IS NULL LIMIT 1', [$miaProject['id']])[0];
$miaInvoice = Db::rows("SELECT * FROM invoices WHERE clientId = ? AND status IN ('SENT','VIEWED','PARTIALLY_PAID','OVERDUE') LIMIT 1", [$c2['id']])[0] ?? Db::first('invoices', ['clientId' => $c2['id']]);
$miaQuote = Db::first('quotes', ['clientId' => $c2['id']]);
$miaContract = Db::first('contracts', ['clientId' => $c2['id']]);
$miaNotification = Db::rows('SELECT * FROM notifications WHERE userId = ? AND readAt IS NULL LIMIT 1', [$mia['id']])[0];
$miaOrgMember = Db::first('organization_members', ['organizationId' => $c2['organizationId']]);
$miaRevision = Db::rows('SELECT * FROM revision_requests WHERE projectId = ? LIMIT 1', [$miaProject['id']])[0] ?? null;
foreach (['miaVersion', 'miaComment', 'miaAsset', 'miaInvoice', 'miaQuote', 'miaContract', 'miaNotification', 'miaOrgMember'] as $v) {
    if (!$$v) {
        fwrite(STDERR, "fixture missing: {$v}\n");
        exit(2);
    }
}
$snap = fn() => json_encode([
    Db::rows('SELECT status, name FROM projects WHERE id = ?', [$miaProject['id']]),
    Db::rows('SELECT status, amountPaid FROM invoices WHERE id = ?', [$miaInvoice['id']]),
    Db::rows('SELECT status FROM quotes WHERE id = ?', [$miaQuote['id']]),
    Db::rows('SELECT status FROM contracts WHERE id = ?', [$miaContract['id']]),
    Db::rows('SELECT deletedAt, displayName, visibleToClient FROM assets WHERE id = ?', [$miaAsset['id']]),
    Db::rows('SELECT status FROM video_comments WHERE id = ?', [$miaComment['id']]),
    Db::rows('SELECT releasedAt, approvedAt FROM video_versions WHERE id = ?', [$miaVersion['id']]),
    Db::rows('SELECT readAt FROM notifications WHERE id = ?', [$miaNotification['id']]),
    Db::rows('SELECT role FROM organization_members WHERE id = ?', [$miaOrgMember['id']]),
    Db::val('SELECT COUNT(*) FROM organization_members WHERE organizationId = ?', [$c2['organizationId']]),
    Db::val('SELECT COUNT(*) FROM video_comments WHERE projectId = ?', [$miaProject['id']]),
    Db::val('SELECT COUNT(*) FROM messages WHERE clientId = ?', [$c2['id']]),
    Db::val('SELECT COUNT(*) FROM payments WHERE clientId = ?', [$c2['id']]),
    Db::val('SELECT COUNT(*) FROM revision_requests WHERE projectId = ?', [$miaProject['id']]),
    Db::val('SELECT COUNT(*) FROM change_requests WHERE projectId = ?', [$miaProject['id']]),
    Db::val('SELECT COUNT(*) FROM file_requests WHERE projectId = ?', [$miaProject['id']]),
    Db::val('SELECT COUNT(*) FROM tasks'),
    Db::val('SELECT COUNT(*) FROM internal_notes'),
    Db::val('SELECT COUNT(*) FROM time_entries'),
    Db::val('SELECT COUNT(*) FROM invoices'),
    Db::val('SELECT COUNT(*) FROM quotes'),
    Db::val('SELECT COUNT(*) FROM projects'),
    Db::val('SELECT COUNT(*) FROM users'),
    Db::val('SELECT COUNT(*) FROM settings'),
    Db::val('SELECT COUNT(*) FROM automations'),
    Db::rows('SELECT status FROM users WHERE id = ?', [$marco['id']]),
    Db::rows('SELECT updatedAt FROM client_brand_kits WHERE clientId = ?', [$c2['id']]),
]);
$lead0 = $fC1['leads'][0];
$attacks = [
    ['quote accept', 'POST', "/api/quotes/{$miaQuote['id']}/accept", (object)[]],
    ['quote reject', 'POST', "/api/quotes/{$miaQuote['id']}/reject", ['reason' => 'x']],
    ['quote edit', 'PATCH', "/api/quotes/{$miaQuote['id']}", ['title' => 'hijack']],
    ['contract sign', 'POST', "/api/contracts/{$miaContract['id']}/sign", ['signerName' => 'Jordan Ellis', 'signature' => 'Jordan Ellis', 'kind' => 'typed', 'accept' => true, 'version' => 1]],
    ['contract download', 'GET', "/api/contracts/{$miaContract['id']}/download"],
    ['invoice read', 'GET', "/api/invoices/{$miaInvoice['id']}"],
    ['invoice pay', 'POST', "/api/invoices/{$miaInvoice['id']}/pay", (object)[]],
    ['invoice demo-pay', 'POST', "/api/invoices/{$miaInvoice['id']}/pay/demo", (object)[]],
    ['invoice manual payment', 'POST', "/api/invoices/{$miaInvoice['id']}/manual-payment", ['amount' => 100, 'method' => 'cash']],
    ['invoice cancel', 'POST', "/api/invoices/{$miaInvoice['id']}/cancel", (object)[]],
    ['invoice send', 'POST', "/api/invoices/{$miaInvoice['id']}/send", (object)[]],
    ['project read', 'GET', "/api/projects/{$miaProject['id']}"],
    ['project edit', 'PATCH', "/api/projects/{$miaProject['id']}", ['name' => 'hijack']],
    ['project transition', 'POST', "/api/projects/{$miaProject['id']}/transition", ['to' => 'APPROVED', 'override' => true, 'comment' => 'x']],
    ['project approve', 'POST', "/api/projects/{$miaProject['id']}/approve", ['versionId' => $miaVersion['id'], 'confirmVersionNumber' => 1]],
    ['project brief edit', 'PATCH', "/api/projects/{$miaProject['id']}/brief", ['answers' => ['x' => 'y']]],
    ['project assign', 'POST', "/api/projects/{$miaProject['id']}/assign", ['editorIds' => []]],
    ['project duplicate', 'POST', "/api/projects/{$miaProject['id']}/duplicate", (object)[]],
    ['project timeline', 'GET', "/api/projects/{$miaProject['id']}/timeline"],
    ['change request', 'POST', "/api/projects/{$miaProject['id']}/change-requests", ['whatChanged' => 'please change everything']],
    ['file request', 'POST', "/api/projects/{$miaProject['id']}/file-requests", ['title' => 'Send me things']],
    ['version comments read', 'GET', "/api/video-versions/{$miaVersion['id']}/comments"],
    ['version comment add', 'POST', "/api/video-versions/{$miaVersion['id']}/comments", ['timecodeMs' => 1000, 'comment' => 'injected']],
    ['version playback', 'GET', "/api/video-versions/{$miaVersion['id']}/playback"],
    ['version poster', 'GET', "/api/video-versions/{$miaVersion['id']}/poster"],
    ['version release', 'POST', "/api/video-versions/{$miaVersion['id']}/release", (object)[]],
    ['comment status', 'PATCH', "/api/video-comments/{$miaComment['id']}", ['status' => 'CLOSED']],
    ['revision submit', 'POST', '/api/revisions', ['projectId' => $miaProject['id'], 'versionId' => $miaVersion['id'], 'description' => 'x']],
    ...($miaRevision ? [['revision status', 'PATCH', "/api/revisions/{$miaRevision['id']}", ['status' => 'CLOSED']]] : []),
    ['asset read', 'GET', "/api/assets/{$miaAsset['id']}?download=1"],
    ['asset rename', 'PATCH', "/api/assets/{$miaAsset['id']}", ['displayName' => 'hijack', 'visibleToClient' => false]],
    ['asset delete', 'DELETE', "/api/assets/{$miaAsset['id']}"],
    ['asset share', 'POST', "/api/assets/{$miaAsset['id']}/share", (object)[]],
    ['asset unshare', 'DELETE', "/api/assets/{$miaAsset['id']}/share"],
    ['asset versions', 'GET', "/api/assets/{$miaAsset['id']}/versions"],
    ['asset thumbnail', 'GET', "/api/assets/{$miaAsset['id']}/thumbnail"],
    ['message send', 'POST', '/api/messages', ['projectId' => $miaProject['id'], 'body' => 'injected']],
    ['message read', 'GET', "/api/messages?projectId={$miaProject['id']}"],
    ['notification read', 'POST', "/api/notifications/{$miaNotification['id']}/read", (object)[]],
    ['member role change', 'PATCH', "/api/members/{$miaOrgMember['id']}", ['role' => 'OWNER']],
    ['member remove', 'DELETE', "/api/members/{$miaOrgMember['id']}"],
    ['member invite', 'POST', "/api/organizations/{$c2['organizationId']}/members", ['name' => 'Intruder', 'email' => "intruder-{$stamp}@example.test", 'role' => 'OWNER']],
    ['member list', 'GET', "/api/organizations/{$c2['organizationId']}/members"],
    ['brand kit read', 'GET', "/api/clients/{$c2['id']}/brand-kit"],
    ['brand kit write', 'PUT', "/api/clients/{$c2['id']}/brand-kit", ['colors' => [['name' => 'x', 'hex' => '#ffffff']]]],
    ['client profile edit', 'PATCH', "/api/clients/{$c2['id']}", ['companyName' => 'hijack']],
    ['client company edit', 'PATCH', "/api/clients/{$c2['id']}/company", ['name' => 'hijack']],
    ['client profile details', 'PATCH', "/api/clients/{$c2['id']}/profile", ['timezone' => 'UTC']],
    ['client invite', 'POST', "/api/clients/{$c2['id']}/invite", (object)[]],
    ['client checklist', 'GET', "/api/clients/{$c2['id']}/checklist"],
    ['notes read', 'GET', "/api/notes?entityType=PROJECT&entityId={$miaProject['id']}"],
    ['notes write', 'POST', '/api/notes', ['entityType' => 'PROJECT', 'entityId' => $miaProject['id'], 'body' => 'injected']],
    ['time read', 'GET', "/api/time?projectId={$miaProject['id']}"],
    ['time write', 'POST', '/api/time', ['projectId' => $miaProject['id'], 'minutes' => 30]],
    ['task create', 'POST', '/api/tasks', ['projectId' => $miaProject['id'], 'title' => 'injected']],
    ['deliverables publish', 'POST', "/api/projects/{$miaProject['id']}/deliverables/publish", (object)[]],
    ['deliverables read', 'GET', "/api/projects/{$miaProject['id']}/deliverables"],
    ['assets ready', 'POST', "/api/projects/{$miaProject['id']}/assets-ready", (object)[]],
    ['onboarding read', 'GET', "/api/projects/{$miaProject['id']}/onboarding"],
    ['onboarding write', 'PUT', "/api/projects/{$miaProject['id']}/onboarding", ['answers' => ['x' => 'y'], 'step' => 1]],
    ['feedback write', 'POST', "/api/projects/{$miaProject['id']}/feedback", ['rating' => 1, 'comment' => 'x']],
    ['exports', 'GET', '/api/admin/exports/clients'],
    ['analytics', 'GET', '/api/admin/analytics'],
    ['audit log', 'GET', '/api/admin/audit-log'],
    ['team list', 'GET', '/api/admin/team'],
    ['team change', 'PATCH', "/api/admin/team/{$marco['id']}", ['status' => 'SUSPENDED']],
    ['team invite', 'POST', '/api/admin/team', ['name' => 'Evil', 'email' => "evil-{$stamp}@example.test", 'role' => 'super_admin']],
    ['settings write', 'PUT', '/api/admin/settings/business', ['name' => 'hijack']],
    ['cms write', 'POST', '/api/admin/cms/services', ['title' => 'x']],
    ['automation create', 'POST', '/api/admin/automations', ['name' => 'x']],
    ['demo clear', 'POST', '/api/admin/demo/clear', (object)[]],
    ['demo load', 'POST', '/api/admin/demo/load', (object)[]],
    ['lead read', 'GET', "/api/leads/{$lead0}"],
    ['lead convert', 'POST', "/api/leads/{$lead0}/convert", (object)[]],
    ['invoice create', 'POST', '/api/invoices', ['clientId' => $c1['id'], 'items' => [['description' => 'free money', 'quantity' => 1, 'unitPrice' => 100]]]],
    ['quote create', 'POST', '/api/quotes', ['clientId' => $c1['id'], 'items' => [['description' => 'free', 'quantity' => 1, 'unitPrice' => 1]]]],
    ['project create', 'POST', '/api/projects', ['clientId' => $c1['id'], 'name' => 'Self-made project']],
    ['payment record', 'POST', '/api/payments', ['invoiceId' => $miaInvoice['id'], 'amount' => 100]],
    ['run background jobs', 'POST', '/api/admin/jobs', (object)[]],
    ['cron without the secret', 'POST', '/api/cron/run', (object)[]],
];
$before = $snap();
foreach ($attacks as [$name, $method, $url, $body]) {
    $r = $client1->call($method, $url, in_array($method, ['GET', 'DELETE'], true) ? null : ($body ?? (object)[]));
    // Marking somebody else's notification read is scoped to the owner's rows, so it is a no-op that reports zero updates.
    $noop = $name === 'notification read' && $r['status'] === 200 && ($r['data']['updated'] ?? null) === 0;
    check("client Jordan: {$name} is refused ({$r['status']})", $noop || in_array($r['status'], [400, 401, 403, 404, 405, 409, 422], true), "{$r['status']} " . substr($r['text'], 0, 140));
}
check("none of Jordan's attempts changed Mia's data or the shared tables", $snap() === $before);
check('Jordan can still read his own project', $client1->get('/api/projects/' . Db::first('projects', ['clientId' => $c1['id']])['id'])['status'] === 200);
check('Jordan can still list his own invoices', $client1->get('/api/invoices')['status'] === 200);
check('Mia can still read her own project', $client2->get("/api/projects/{$miaProject['id']}")['status'] === 200);

$ed0 = $fEd['projects'][0];
$edAttacks = [
    ['invoice read', 'GET', "/api/invoices/{$fEd['invoices'][0]}"],
    ['quote read', 'GET', "/api/quotes/{$fEd['quotes'][0]}"],
    ['contract read', 'GET', "/api/contracts/{$fEd['contracts'][0]}"],
    ['payments list', 'GET', '/api/payments'],
    ['manual payment', 'POST', "/api/invoices/{$fEd['invoices'][0]}/manual-payment", ['amount' => 100, 'method' => 'cash']],
    ['invoice create', 'POST', '/api/invoices', ['clientId' => $c1['id'], 'items' => [['description' => 'x', 'quantity' => 1, 'unitPrice' => 100]]]],
    ['unassigned project read', 'GET', "/api/projects/{$ed0}"],
    ['unassigned project edit', 'PATCH', "/api/projects/{$ed0}", ['name' => 'hijack']],
    ['unassigned transition', 'POST', "/api/projects/{$ed0}/transition", ['to' => 'APPROVED', 'override' => true, 'comment' => 'x']],
    ['unassigned versions', 'GET', "/api/projects/{$ed0}/versions"],
    ['unassigned upload version', 'POST', "/api/projects/{$ed0}/versions", ['assetId' => $fEd['unassignedAssets'][0] ?? FAKE, 'label' => 'x']],
    ['unassigned assets', 'GET', "/api/projects/{$ed0}/assets"],
    ['asset delete (unassigned)', 'DELETE', '/api/assets/' . ($fEd['unassignedAssets'][0] ?? FAKE)],
    ['lead read', 'GET', "/api/leads/{$fEd['leads'][0]}"],
    ['client read', 'GET', "/api/clients/{$fEd['clients'][0]}"],
    ['project assign', 'POST', "/api/projects/{$ed0}/assign", ['editorIds' => [$marco['id']]]],
    ['client-only approve on an assigned project', 'POST', "/api/projects/{$assignedToMarco[0]}/approve", ['versionId' => FAKE, 'confirmVersionNumber' => 1]],
    ['team change', 'PATCH', "/api/admin/team/{$jordan['id']}", ['status' => 'SUSPENDED']],
    ['settings write', 'PUT', '/api/admin/settings/business', ['name' => 'hijack']],
    ['exports', 'GET', '/api/admin/exports/clients'],
    ['audit log', 'GET', '/api/admin/audit-log'],
    ['cms write', 'POST', '/api/admin/cms/services', ['title' => 'x']],
    ['run jobs', 'POST', '/api/admin/jobs', (object)[]],
    ['demo clear', 'POST', '/api/admin/demo/clear', (object)[]],
];
$edBefore = $snap();
foreach ($edAttacks as [$name, $method, $url, $body]) {
    $r = $editor1->call($method, $url, in_array($method, ['GET', 'DELETE'], true) ? null : ($body ?? (object)[]));
    check("editor Marco: {$name} is refused ({$r['status']})", in_array($r['status'], [400, 403, 404, 405, 409, 422], true), "{$r['status']} " . substr($r['text'], 0, 140));
}
check("none of Marco's attempts changed the database", $snap() === $edBefore);

// ───────────────────────────────── 6. pages ─────────────────────────────────
step('6', 'Pages: direct URL access');
$pageOk = fn($r) => $r['status'] === 404 || $r['status'] === 403 || ($r['status'] >= 300 && $r['status'] < 400);
$norm = fn($u) => preg_replace('/cm[a-z0-9]{20,}/', ':id', $u);
[$fInvoice, $fQuote, $fContract, $fProject, $fVersion] = [$fC1['invoices'][0], $fC1['quotes'][0], $fC1['contracts'][0], $fC1['projects'][0], $fC1['versions'][0]];
foreach (["/dashboard/projects/{$fProject}", "/dashboard/projects/{$fProject}/review", "/dashboard/projects/{$fProject}/review/{$fVersion}", "/dashboard/projects/{$fProject}/setup", "/dashboard/quotes/{$fQuote}", "/dashboard/invoices/{$fInvoice}", "/dashboard/contracts/{$fContract}", '/admin', '/admin/invoices', "/admin/projects/{$fProject}", "/admin/projects/{$fProject}/review/{$fVersion}", '/admin/settings', '/admin/audit-log', '/admin/team', '/admin/exports', '/editor', "/editor/projects/{$fProject}"] as $u) {
    $r = $client1->get($u);
    check("client Jordan cannot open {$norm($u)} ({$r['status']})", $pageOk($r), substr($r['text'], 0, 80));
}
foreach (["/editor/projects/{$fEd['projects'][0]}", "/editor/projects/{$fEd['projects'][0]}/review", '/editor/projects/' . $fEd['projects'][0] . '/review/' . ($fEd['unassignedVersions'][0] ?? FAKE), '/admin', '/admin/invoices', '/admin/settings', '/admin/leads', '/admin/team', '/admin/audit-log', '/dashboard', "/dashboard/invoices/{$fEd['invoices'][0]}"] as $u) {
    $r = $editor1->get($u);
    check("editor Marco cannot open {$norm($u)} ({$r['status']})", $pageOk($r), substr($r['text'], 0, 80));
}
foreach (['/dashboard', '/admin', '/editor', "/dashboard/projects/{$fProject}", '/admin/projects', '/dashboard/invoices', '/dashboard/settings', '/editor/tasks'] as $u) {
    $r = $anon->get($u);
    check("signed-out visitor is sent to sign in for {$norm($u)} ({$r['status']})", $r['status'] >= 300 && $r['status'] < 400 && str_contains(implode(' ', $r['headers']['location'] ?? []), '/login'), implode(' ', $r['headers']['location'] ?? []));
}
check('a missing record is a plain 404, not a crash (admin)', $admin->get('/admin/projects/' . FAKE)['status'] === 404);
check('a missing record is a plain 404 for clients too', $client1->get('/dashboard/projects/' . FAKE)['status'] === 404);
check('a missing page is a 404 with the site layout', ($nf = (new Http())->get('/no-such-page-' . $stamp))['status'] === 404 && str_contains($nf['text'], '<html'));

// ───────────────────────────────── 7. helpers ─────────────────────────────────
step('7', 'Redirect, content-sniffing, IP and secret-scrubbing helpers');
foreach (['//evil.example', '/\\evil.example', "/\t/evil.example", "/\n/evil.example", 'https://evil.example', 'javascript:alert(1)', 'evil', '', ' /x', '/ok\\path', "/x\0y", '/' . str_repeat('a', 600), "/\r\nSet-Cookie: x=1", '/%0d%0aX:y'] as $bad) {
    $got = safe_redirect_path($bad, '/home');
    check('open redirect refused: ' . json_encode(substr($bad, 0, 40)), $got === '/home' || !preg_match('/[\r\n]/', $got) && str_starts_with($got, '/') && !str_starts_with($got, '//'), $got);
}
foreach (['/dashboard', '/admin/projects/abc?tab=files', '/a/b-c_d%20e#x'] as $good) {
    check("safe path kept: {$good}", safe_redirect_path($good, '/home') === $good);
}
check('Windows executables are recognised', sniff_content("MZ\x90\0") === 'executable');
check('ELF binaries are recognised', sniff_content("\x7fELF\2") === 'executable');
check('Mach-O binaries are recognised', sniff_content("\xcf\xfa\xed\xfe") === 'executable');
check('shebang scripts are recognised', sniff_content("#!/bin/sh\nrm -rf /") === 'script');
check('HTML is recognised', sniff_content('  <!DOCTYPE html><script>alert(1)</script>') === 'markup');
check('PHP code is recognised', in_array(sniff_content('<?php system($_GET["c"]);'), ['script', 'markup', 'executable'], true));
check('a real MP4 header is fine', sniff_content("\0\0\0\x18ftypisom") === 'other');
check('a PDF header is fine', sniff_content("%PDF-1.7\n") === 'other');
check('a program pretending to be video is refused', content_problem('executable', 'video/mp4', 'clip.mp4') !== null);
check('HTML pretending to be an image is refused', content_problem('markup', 'image/png', 'photo.png') !== null);
check('a plain-text file may start with #!', content_problem('script', 'text/plain', 'notes.txt') === null);
check('sign-in tokens are scrubbed from stored emails', !preg_match('/token=[A-Za-z0-9_-]{16,}/', scrub_tokens('Open http://x/auth/verify?type=magic&token=abcDEF1234567890abcDEF1234567890 now')));
check('scrubbing leaves ordinary links alone', scrub_tokens('See http://x/dashboard?tab=files') === 'See http://x/dashboard?tab=files');
$ipProbe = function (int $hops, string $xff): string {
    $code = 'define("FEP",true);define("FEP_ROOT","' . FEP_ROOT . '");define("FEP_CONFIG_OVERRIDE",["trusted_proxy_hops"=>' . $hops . ']);require FEP_ROOT."/app/bootstrap.php";$_SERVER["REMOTE_ADDR"]="198.51.100.7";' . ($xff !== '' ? '$_SERVER["HTTP_X_FORWARDED_FOR"]="' . $xff . '";' : '') . 'echo client_ip();';
    return trim((string)shell_exec('php -r ' . escapeshellarg($code) . ' 2>/dev/null'));
};
check('without a trusted proxy a forged X-Forwarded-For is ignored', $ipProbe(0, '6.6.6.6') === '198.51.100.7');
check('with one trusted proxy the forged left-most entry is ignored', $ipProbe(1, '6.6.6.6, 203.0.113.9') === '203.0.113.9');
check('with one trusted proxy a single entry is the client address', $ipProbe(1, '203.0.113.9') === '203.0.113.9');
check('a garbage address becomes a safe placeholder', $ipProbe(1, 'not-an-ip') === '0.0.0.0');

// ───────────────────────────────── 8. uploads ─────────────────────────────────
step('8', 'Uploads');
$jordanProject = Db::rows("SELECT * FROM projects WHERE clientId = ? AND status IN ('EDITING','AWAITING_ASSETS','ONBOARDING','QUEUED') LIMIT 1", [$c1['id']])[0];
check('fixture: Jordan has a project that accepts uploads', (bool)$jordanProject);
$try = function (Http $h, string $name, string $mime, string $bytes, ?string $projectId = null) use ($jordanProject): array {
    $r = $h->post('/api/assets/upload-url', ['purpose' => 'asset', 'projectId' => $projectId ?? $jordanProject['id'], 'folderKey' => 'raw-footage', 'filename' => $name, 'size' => strlen($bytes), 'mimeType' => $mime]);
    if ($r['status'] !== 201) {
        return ['stage' => 'request', 'status' => $r['status'], 'asset' => null];
    }
    $up = $r['data']['upload'];
    $put = (new Http())->call('PUT', $up['url'], $bytes, ['raw' => true, 'csrf' => false, 'headers' => ['Content-Type' => 'application/octet-stream', 'Content-Range' => 'bytes 0-' . (strlen($bytes) - 1) . '/' . strlen($bytes)]]);
    if ($put['status'] !== 200) {
        return ['stage' => 'put', 'status' => $put['status'], 'asset' => $r['data']['asset']];
    }
    $c = $h->post("/api/assets/{$r['data']['asset']['id']}/complete", (object)[]);
    return ['stage' => 'complete', 'status' => $c['status'], 'asset' => $r['data']['asset']];
};
$mp4 = "\0\0\0\x18ftyp" . str_repeat("\7", 2048);
check('a genuine-looking video uploads and completes', $try($client1, "audit-{$stamp}.mp4", 'video/mp4', $mp4)['status'] === 200);
$exe = $try($client1, "holiday-{$stamp}.mp4", 'video/mp4', "MZ\x90\0" . str_repeat("\1", 2048));
check("a Windows program renamed .mp4 is rejected on completion ({$exe['status']})", $exe['stage'] === 'complete' && $exe['status'] === 415);
$html = $try($client1, "logo-{$stamp}.png", 'image/png', "<!DOCTYPE html><html><script>fetch('/api/auth/session')</script></html>");
check("an HTML page declared as an image is rejected ({$html['status']})", $html['stage'] === 'complete' && $html['status'] === 415);
$phpDisg = $try($client1, "clip-{$stamp}.mp4", 'video/mp4', '<?php system($_GET["c"]); ?>' . str_repeat(' ', 2048));
check("PHP code renamed .mp4 is rejected ({$phpDisg['status']})", $phpDisg['stage'] === 'complete' && $phpDisg['status'] === 415);
check('a rejected file is marked failed and its bytes are gone', $exe['asset'] && (Db::first('assets', ['id' => $exe['asset']['id']])['status'] ?? '') === 'FAILED' && !is_file(rtrim((string)cfg('storage.dir'), '/') . '/' . Db::first('assets', ['id' => $exe['asset']['id']])['storageKey']));
foreach ([['setup.exe', 'application/octet-stream'], ['run.sh', 'text/x-shellscript'], ['macro.bat', 'application/x-bat'], ['library.dll', 'application/octet-stream'], ['shell.php', 'application/x-php'], ['shell.phtml', 'text/html'], ['page.html', 'text/html'], ['trick.php.mp4.exe', 'video/mp4'], ['app.jar', 'application/java-archive'], ['mac.app', 'application/octet-stream']] as [$name, $mime]) {
    $r = $client1->post('/api/assets/upload-url', ['purpose' => 'asset', 'projectId' => $jordanProject['id'], 'filename' => $name, 'size' => 100, 'mimeType' => $mime]);
    check("{$name} is refused at the door ({$r['status']})", in_array($r['status'], [400, 415], true), substr($r['text'], 0, 100));
}
// files that are allowed but hostile if a browser ever rendered them: never inline, never under their own name on disk
$hostile = [['vector.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.domain)</script></svg>'], ['.htaccess', 'text/plain', "AddType application/x-httpd-php .mp4\n"], ['note.html.txt', 'text/plain', '<script>alert(1)</script>']];
foreach ($hostile as [$hn, $hm, $hb]) {
    $up = upload_file($client1, ['purpose' => 'asset', 'projectId' => $jordanProject['id'], 'folderKey' => 'raw-footage', 'filename' => $hn, 'mime' => $hm, 'bytes' => $hb]);
    $row = !empty($up['ok']) ? Db::first('assets', ['id' => $up['asset']['id']]) : null;
    check("{$hn}: stored under an opaque key that does not contain the file name", $row && str_ends_with($row['storageKey'], '/blob') && !str_contains($row['storageKey'], 'htaccess') && !str_contains($row['storageKey'], '.svg'), $row['storageKey'] ?? $up);
    $d = $row ? $client1->get("/api/assets/{$row['id']}?download=1") : ['data' => null];
    $f = !empty($d['data']['url']) ? (new Http())->get($d['data']['url']) : ['status' => 0, 'headers' => []];
    $h = $f['headers'];
    check("{$hn}: is served as a download with nosniff and a sandboxing CSP", $f['status'] === 200 && str_starts_with($h['content-disposition'][0] ?? '', 'attachment') && ($h['x-content-type-options'][0] ?? '') === 'nosniff' && str_contains($h['content-security-policy'][0] ?? '', 'sandbox'), $h);
    $inl = $row ? $client1->get("/api/assets/{$row['id']}/thumbnail") : ['status' => 0];
    $pv = $row ? $client1->get("/api/assets/{$row['id']}?download=1&inline=1") : ['data' => null];
    $pvF = !empty($pv['data']['url']) ? (new Http())->get($pv['data']['url']) : ['headers' => []];
    check("{$hn}: a request for an inline preview still yields an attachment", str_starts_with($pvF['headers']['content-disposition'][0] ?? '', 'attachment'), $pvF['headers']);
}
$trav = $client1->post('/api/assets/upload-url', ['purpose' => 'asset', 'projectId' => $jordanProject['id'], 'filename' => '../../../../etc/passwd.mp4', 'size' => 100, 'mimeType' => 'video/mp4']);
$travKey = $trav['status'] === 201 ? (string)Db::first('assets', ['id' => $trav['data']['asset']['id']])['storageKey'] : '';
check('a path-traversal filename is neutralised in the storage key', $trav['status'] === 201 && !str_contains($travKey, '..') && !str_contains($travKey, '/etc/'), [$trav['status'], $travKey]);
$nul = $client1->post('/api/assets/upload-url', ['purpose' => 'asset', 'projectId' => $jordanProject['id'], 'filename' => "nul\0.mp4", 'size' => 100, 'mimeType' => 'video/mp4']);
check("a filename with a NUL byte is refused or cleaned ({$nul['status']})", $nul['status'] >= 400 && $nul['status'] < 500 || ($nul['status'] === 201 && !str_contains((string)Db::first('assets', ['id' => $nul['data']['asset']['id']])['storageKey'], "\0")));
$zero = $client1->post('/api/assets/upload-url', ['purpose' => 'asset', 'projectId' => $jordanProject['id'], 'filename' => 'empty.mp4', 'size' => 0, 'mimeType' => 'video/mp4']);
check("an empty file is refused ({$zero['status']})", $zero['status'] >= 400 && $zero['status'] < 500);
$neg = $client1->post('/api/assets/upload-url', ['purpose' => 'asset', 'projectId' => $jordanProject['id'], 'filename' => 'neg.mp4', 'size' => -5, 'mimeType' => 'video/mp4']);
check("a negative size is refused ({$neg['status']})", $neg['status'] >= 400 && $neg['status'] < 500);
$huge = $client1->post('/api/assets/upload-url', ['purpose' => 'asset', 'projectId' => $jordanProject['id'], 'filename' => 'huge.mp4', 'size' => 60 * 1024 ** 3, 'mimeType' => 'video/mp4']);
check("a file beyond the size limit is refused ({$huge['status']})", $huge['status'] >= 400 && $huge['status'] < 500);
foreach (['version', 'deliverable'] as $purpose) {
    $r = $client1->post('/api/assets/upload-url', ['purpose' => $purpose, 'projectId' => $jordanProject['id'], 'filename' => 'v9.mp4', 'size' => 100, 'mimeType' => 'video/mp4']);
    check("a client cannot upload a \"{$purpose}\" ({$r['status']})", $r['status'] === 403);
}
$foreignUpload = $client1->post('/api/assets/upload-url', ['purpose' => 'asset', 'projectId' => $miaProject['id'], 'filename' => 'x.mp4', 'size' => 100, 'mimeType' => 'video/mp4']);
check("uploading into another client's project is refused ({$foreignUpload['status']})", in_array($foreignUpload['status'], [403, 404], true));
$edUpload = $editor1->post('/api/assets/upload-url', ['purpose' => 'asset', 'projectId' => $fEd['projects'][0], 'filename' => 'x.mp4', 'size' => 100, 'mimeType' => 'video/mp4']);
check("an editor cannot upload into an unassigned project ({$edUpload['status']})", in_array($edUpload['status'], [403, 404], true));
$pending = $client1->post('/api/assets/upload-url', ['purpose' => 'asset', 'projectId' => $jordanProject['id'], 'filename' => "pending-{$stamp}.mp4", 'size' => 100, 'mimeType' => 'video/mp4']);
$hijack = $client2->post("/api/assets/{$pending['data']['asset']['id']}/complete", (object)[]);
check("another client cannot complete my upload ({$hijack['status']})", in_array($hijack['status'], [403, 404], true));
$anonNoToken = $anon->post('/api/assets/upload-url', ['purpose' => 'lead_reference', 'filename' => 'brief.pdf', 'size' => 100, 'mimeType' => 'application/pdf']);
check("anonymous uploads need an upload session ({$anonNoToken['status']})", $anonNoToken['status'] === 400);
$anonProject = $anon->post('/api/assets/upload-url', ['purpose' => 'asset', 'projectId' => $jordanProject['id'], 'filename' => 'x.mp4', 'size' => 100, 'mimeType' => 'video/mp4']);
check("anonymous visitors cannot upload into a project ({$anonProject['status']})", $anonProject['status'] === 401);
$small = $client1->post('/api/assets/upload-url', ['purpose' => 'asset', 'projectId' => $jordanProject['id'], 'filename' => "small-{$stamp}.mp4", 'size' => 100, 'mimeType' => 'video/mp4']);
if ($small['status'] === 201) {
    $u = $small['data']['upload'];
    $over = (new Http())->call('PUT', $u['url'], str_repeat("\0", 5000), ['raw' => true, 'csrf' => false, 'headers' => ['Content-Type' => 'application/octet-stream', 'Content-Range' => 'bytes 0-4999/5000']]);
    check("the storage endpoint enforces the declared size ({$over['status']})", in_array($over['status'], [400, 413], true));
    $readAsPut = (new Http())->get($u['url']);
    check("an upload token cannot be used to download ({$readAsPut['status']})", $readAsPut['status'] === 403);
    $tamper = (new Http())->call('PUT', preg_replace('/(t=)(.)/', '$1x', $u['url']), 'x', ['raw' => true, 'csrf' => false]);
    check("a tampered upload token is refused ({$tamper['status']})", $tamper['status'] === 403);
}
$dl = $client1->get("/api/assets/{$miaAsset['id']}?download=1");
check("downloading another client's file is refused ({$dl['status']})", $dl['status'] === 404);
$dlAnon = $anon->get("/api/assets/{$miaAsset['id']}?download=1");
check("downloading a file while signed out is refused ({$dlAnon['status']})", $dlAnon['status'] === 401);
foreach (['/storage/uploads/', '/storage/uploads/' . ($travKey ?: 'x'), '/app/bootstrap.php', '/app/core/db.php', '/config.php', '/database.sql', '/database-demo.sql', '/README.md', '/.htaccess', '/cron.php?key=', '/app/data/demo-manifest.json', '/index.php/../config.php', '/assets/../config.php', '/%2e%2e/config.php', '/..%2fconfig.php'] as $p) {
    $r = (new Http())->get($p);
    check("the web cannot read {$p} ({$r['status']})", in_array($r['status'], [301, 302, 400, 401, 403, 404], true) && !str_contains($r['text'], "'password'") && !str_contains($r['text'], 'CREATE TABLE'), substr($r['text'], 0, 100));
}

// ───────────────────────────────── 9. request size and shape ─────────────────────────────────
step('9', 'Request size and malformed input');
$big = $client1->post('/api/notes', ['entityType' => 'PROJECT', 'entityId' => $jordanProject['id'], 'body' => str_repeat('x', 2000000)]);
check("an oversized JSON body is refused before parsing ({$big['status']})", in_array($big['status'], [403, 413, 422], true), substr($big['text'], 0, 100));
$none = $client1->call('POST', '/api/messages');
check("a missing body is a 4xx, not a crash ({$none['status']})", $none['status'] >= 400 && $none['status'] < 500);
$bad = $client1->call('POST', '/api/messages', '{not json', ['raw' => true]);
check("malformed JSON is a 4xx, not a crash ({$bad['status']})", $bad['status'] >= 400 && $bad['status'] < 500 && !str_contains($bad['text'], 'Stack') && !str_contains($bad['text'], '.php'));
$arr = $client1->post('/api/messages', ['projectId' => ['x'], 'body' => ['y']]);
check("wrong types (arrays for strings) are a 4xx ({$arr['status']})", $arr['status'] >= 400 && $arr['status'] < 500);
$deep = $client1->call('POST', '/api/messages', str_repeat('[', 5000) . str_repeat(']', 5000), ['raw' => true]);
check("deeply nested JSON is a 4xx ({$deep['status']})", $deep['status'] >= 400 && $deep['status'] < 500);
check('no route answers with a PHP warning or stack trace in strict mode', (function () use ($client1, $collectionGets) {
    $bad = [];
    foreach ($collectionGets as $h) {
        $r = $client1->get($h['pattern'] . '?q=%27%22%3C&page=-1&pageSize=abc');
        if ($r['status'] >= 500 || preg_match('/Warning:|Notice:|Deprecated:|Fatal error|Stack trace|SQLSTATE/', $r['text'])) {
            $bad[] = "{$h['pattern']} {$r['status']}";
        }
    }
    return $bad ?: true;
})() === true);

exit(summary());
