<?php
/**
 * Sample-data life cycle on a site that was just installed from database.sql:
 * load the sample studio → explore it like a person would → remove it → the site is exactly as clean as before.
 *
 *   mysql -e "create database fep_cycle character set utf8mb4 collate utf8mb4_unicode_ci" && mysql fep_cycle < public_html/database.sql
 *   FEP_TEST_DB=fep_cycle FEP_TEST_URL=http://127.0.0.1:8083 php -S 127.0.0.1:8083 -t public_html php-tests/dev-router.php      (terminal 1)
 *   FEP_TEST_DB=fep_cycle FEP_TEST_URL=http://127.0.0.1:8083 php php-tests/demo-cycle.php                                      (terminal 2)
 */
require __DIR__ . '/lib.php';

$counts = function (): array {
    $t = [];
    foreach (['clients', 'organizations', 'projects', 'leads', 'quotes', 'invoices', 'contracts', 'payments', 'messages', 'tasks', 'assets', 'video_versions', 'video_comments', 'testimonials', 'case_studies', 'portfolio_projects', 'blog_posts', 'pricing_plans', 'notifications', 'activity_logs', 'email_logs', 'counters', 'onboarding_responses', 'automation_runs', 'project_members', 'retainers', 'time_entries', 'contact_submissions'] as $table) {
        $t[$table] = Db::count($table);
    }
    $t['users'] = Db::count('users');
    return $t;
};
$bootstrap = fn() => [
    'roles' => Db::count('roles'), 'permissions' => Db::count('permissions'), 'services' => Db::count('services'), 'faqs' => Db::count('faqs'), 'questions' => Db::count('onboarding_questions'),
    'templates' => Db::count('email_templates'), 'automations' => Db::count('automations'), 'project_types' => Db::count('project_types'), 'kb' => Db::count('kb_articles'),
];

step(1, 'Fresh install: no admin yet → the wizard state');
check('the imported database is waiting for its first administrator', install_state() === 'needs_admin', install_state());
$base = $bootstrap();
check('reference data came with database.sql', $base['roles'] === 10 && $base['permissions'] === 45 && $base['questions'] === 153 && $base['services'] === 14, $base);
$ws = Db::first('workspaces', null);
$role = Db::first('roles', ['key' => 'super_admin']);
$admin = Db::insert('users', ['workspaceId' => $ws['id'], 'email' => 'owner@example.com', 'name' => 'Real Owner', 'passwordHash' => hash_password('owner-passphrase-1'), 'isStaff' => true, 'status' => 'ACTIVE', 'emailVerifiedAt' => now_ms()]);
Db::insert('user_roles', ['userId' => $admin['id'], 'roleId' => $role['id']], false);
check('with a staff account the site counts as installed', install_state(true) === 'ready');
$empty = $counts();

step(2, 'Load the sample studio');
check('sample data can be added to an empty site', demo_can_load());
$n = load_demo_data();
check('the sample SQL ran', $n > 50, $n);
$loaded = $counts();
check('sample clients, projects and invoices exist', $loaded['clients'] === 5 && $loaded['projects'] === 9 && $loaded['invoices'] === 12, $loaded);
check('sample data cannot be loaded twice', !demo_can_load());
$demoAdmin = Http::class;
$adm = new Http('demo-admin');
$r = $adm->post('/api/auth/login', ['email' => 'admin@demo.faizaneditspro.test', 'password' => 'demo-password-123']);
check('the sample accounts sign in with the documented password', $r['status'] === 200, $r['error']);

step(3, 'Explore it like a person would (creates records the sample file never contained)');
$client = Db::first('clients', ['isDemo' => true]);
$q = $adm->post('/api/quotes', ['clientId' => $client['id'], 'title' => 'Explored quote', 'currency' => 'USD', 'depositPercent' => 50, 'items' => [['description' => 'Extra edit', 'quantity' => 1, 'unitPrice' => 10000]]]);
check('a quote is created for a sample client', $q['status'] === 201, $q['error']);
$adm->post("/api/quotes/{$q['data']['id']}/send");
$inv = $adm->post('/api/invoices', ['clientId' => $client['id'], 'kind' => 'OTHER', 'items' => [['description' => 'Explored invoice', 'quantity' => 1, 'unitPrice' => 5000]], 'send' => true]);
check('an invoice is created and sent', $inv['status'] === 201, $inv['error']);
$adm->post("/api/invoices/{$inv['data']['id']}/manual-payment", ['amount' => 2000, 'method' => 'Bank transfer']);
$adm->post('/api/tasks', ['title' => 'Explored task']);
drain();
$explored = $counts();
check('exploring added unflagged records', $explored['quotes'] > $loaded['quotes'] && $explored['payments'] > $loaded['payments'] && $explored['tasks'] > $loaded['tasks'], $explored);

step(4, 'Only a Super Admin can remove it');
$ed = new Http('demo-editor');
$ed->post('/api/auth/login', ['email' => 'editor@demo.faizaneditspro.test', 'password' => 'demo-password-123']);
check('an editor cannot remove the sample data', $ed->post('/api/admin/demo/clear')['status'] === 403);
$owner = new Http('owner');
$ol = $owner->post('/api/auth/login', ['email' => 'owner@example.com', 'password' => 'owner-passphrase-1']);
check('the real owner signs in', $ol['status'] === 200, $ol['error']);
$clear = $owner->post('/api/admin/demo/clear');
check('the owner removes the sample data', $clear['status'] === 200, $clear['error']);
$after = $counts();
$left = array_filter($after, fn($n, $k) => $n !== ($empty[$k] ?? 0), ARRAY_FILTER_USE_BOTH);
check('every count is back to the empty-site value (except the owner\'s own sign-in history)', !array_diff_key($left, array_flip(['notifications', 'activity_logs'])), $left);
check('only the real administrator remains', Db::count('users') === 1 && Db::first('users', null)['email'] === 'owner@example.com');
check('no email, job or audit row still mentions the sample domain', Db::count('email_logs') === 0 && !Db::val("SELECT COUNT(*) FROM `audit_logs` WHERE `message` LIKE '%demo.faizaneditspro.test%'"));
check('the bundled sample media files are still on disk', is_file(FEP_ROOT . '/assets/demo/tour-v1.mp4') && is_file(FEP_ROOT . '/assets/demo/work-1.jpg'));
check('reference data is untouched', $bootstrap() == $base, [$bootstrap(), $base]);
check('numbering starts again from the beginning', Db::count('counters') === 0);

step(5, 'And it can be loaded again');
check('sample data can be added again', demo_can_load());
$again = load_demo_data();
check('second load works', $again > 50 && Db::count('projects') === 9);
$owner->post('/api/admin/demo/clear');
check('second removal leaves a clean site', Db::count('projects') === 0 && Db::count('users') === 1);
exit(summary());
