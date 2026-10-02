<?php
/** Admin console: website content, form builder, analytics, automations, team, exports, audit log, emails, settings, account. */
defined('FEP') or exit;

// ── website content (CMS) ──
staff_get('admin', '/admin/content', 'cms:manage', 'Website content', 'admin/content', function (Actor $a, Ctx $c) {
    $all = cms_resources();
    $key = isset($all[$c->query['r'] ?? '']) ? $c->query['r'] : 'services';
    $def = $all[$key];
    $list = cms_list($a, $key, ['pageSize' => 200]);
    $business = get_setting($a->workspaceId, 'business');
    $relations = [];
    foreach (array_unique(array_filter(array_map(fn($f) => ($f['type'] === 'relation') ? ($f['relation'] ?? null) : null, $def['fields']))) as $rk) {
        $rdef = $all[$rk];
        $relations[$rk] = array_map(fn($r) => ['value' => $r['id'], 'label' => (string)($r[$rdef['titleField']] ?? $r['id'])], cms_list($a, $rk, ['pageSize' => 200])['items']);
    }
    $items = array_map(function ($r) use ($def) {
        $r['_href'] = !empty($def['publicPathTemplate']) && !empty($r['slug']) ? str_replace('{slug}', rawurlencode((string)$r['slug']), $def['publicPathTemplate']) : null;
        return $r;
    }, $list['items']);
    $lite = array_intersect_key($def, array_flip(['key', 'label', 'singular', 'description', 'titleField', 'subtitleField', 'flagField', 'sortable', 'allowCreate', 'allowDelete', 'allowDuplicate', 'fields', 'defaults']));
    return ['extraScripts' => ['js/admin-editors.js'], 'all' => $all, 'key' => $key, 'def' => $def, 'lite' => $lite, 'items' => $items, 'total' => $list['total'], 'relations' => $relations, 'currency' => $business['defaultCurrency'], 'icons' => app_data('cms-resources')['SERVICE_ICONS']];
});

// ── project form builder ──
staff_get('admin', '/admin/forms', 'forms:manage', 'Project form', 'admin/forms', function (Actor $a, Ctx $c) {
    $key = ($c->query['form'] ?? '') === 'project_onboarding' ? 'project_onboarding' : 'inquiry';
    $o = admin_overview($a, $key);
    $form = $o['form'];
    $section = q_str($c, 'section') ?? ($form['sections'][0]['key'] ?? '');
    return ['extraScripts' => ['js/admin-editors.js'], 'form' => $form, 'forms' => $o['forms'], 'categories' => array_map(fn($x) => ['key' => $x['key'], 'name' => $x['name']], $o['categories']), 'section' => $section];
});

// ── analytics ──
const ANALYTICS_RANGES = ['3m' => ['3 months', 3], '6m' => ['6 months', 6], '12m' => ['12 months', 12]];
staff_get('admin', '/admin/analytics', 'analytics:read', 'Analytics', 'admin/analytics', function (Actor $a, Ctx $c) {
    $key = isset(ANALYTICS_RANGES[$c->query['range'] ?? '']) ? $c->query['range'] : '12m';
    $months = ANALYTICS_RANGES[$key][1];
    $t = time();
    $from = gmmktime(0, 0, 0, (int)gmdate('n', $t) - ($months - 1), 1, (int)gmdate('Y', $t)) * 1000;
    return ['key' => $key, 'r' => analytics_report($a, ['from' => $from, 'to' => now_ms() + 86400000]), 'workload' => team_workload($a), 'profit' => $a->can('profitability:read') ? profitability($a) : null];
});

// ── automations ──
staff_get('admin', '/admin/automations', 'automations:manage', 'Automations', 'admin/automations', function (Actor $a) {
    $rows = list_automations($a);
    return [
        'extraScripts' => ['js/admin-editors.js'],
        'events' => array_map(fn($e) => ['value' => $e, 'label' => FEP_EVENT_LABELS[$e]], event_names()),
        'templates' => Db::rows('SELECT `key`, `name` FROM `email_templates` WHERE `workspaceId` = ? ORDER BY `name` ASC', [$a->workspaceId]),
        'rows' => array_map(fn($r) => ['id' => $r['id'], 'name' => $r['name'], 'description' => $r['description'], 'event' => $r['event'], 'enabled' => (bool)$r['enabled'], 'isSystem' => (bool)$r['isSystem'], 'conditions' => $r['conditions'],
            'actions' => array_map(fn($x) => ['id' => $x['id'], 'type' => $x['type'], 'config' => (object)($x['config'] ?? []), 'delayMinutes' => (int)$x['delayMinutes']], $r['actions']), 'runs' => $r['_count']['runs']], $rows),
        'statuses' => array_map(fn($s) => ['value' => $s, 'label' => status_meta($s)['label']], project_statuses()),
    ];
});

// ── team ──
staff_get('admin', '/admin/team', 'team:manage', 'Team', 'admin/team', fn(Actor $a) => ['extraScripts' => ['js/admin-editors.js'], 'members' => list_team($a), 'roles' => list_roles($a), 'isSuper' => in_array('super_admin', $a->roleKeys, true)]);

// ── exports ──
const EXPORT_LIST = [
    ['leads', 'Leads', 'Every inquiry with score, temperature, source and UTM data.', 'inbox', 'leads:read'],
    ['clients', 'Clients', 'Company, contact, status, project counts.', 'building', 'clients:read'],
    ['projects', 'Projects', 'Status, deadline, team, payment state.', 'film', 'projects:read_all'],
    ['invoices', 'Invoices', 'Numbers, amounts, status, due dates.', 'receipt', 'invoices:read'],
    ['payments', 'Payments', 'Every payment with method and transaction reference.', 'wallet', 'payments:read'],
    ['testimonials', 'Testimonials', 'Ratings, quotes and publishing permission.', 'quote', 'cms:manage'],
    ['report-monthly-revenue', 'Report — monthly revenue', 'Collected revenue per month and currency.', 'chart', 'analytics:read'],
    ['report-client-acquisition', 'Report — client acquisition', 'New leads and clients by month and source.', 'trending', 'analytics:read'],
    ['report-project-performance', 'Report — project performance', 'Turnaround and revisions per project.', 'timer', 'analytics:read'],
    ['report-editing-services', 'Report — editing services', 'Projects and revenue by service.', 'layers', 'analytics:read'],
    ['report-outstanding-invoices', 'Report — outstanding invoices', 'Everything unpaid, with ageing.', 'alert', 'analytics:read'],
    ['report-team-workload', 'Report — team workload', 'Open projects, tasks and hours per person.', 'users', 'analytics:read'],
];
staff_get('admin', '/admin/exports', 'reports:export', 'Exports', 'admin/exports', fn(Actor $a) => ['list' => array_values(array_filter(EXPORT_LIST, fn($e) => $a->can($e[4])))]);

// ── audit log ──
staff_get('admin', '/admin/audit-log', 'audit:read', 'Audit log', 'admin/audit-log', function (Actor $a, Ctx $c) {
    $f = ['q' => q_str($c, 'q'), 'entityType' => q_str($c, 'entityType')];
    return ['f' => $f, 'res' => list_audit_log($a, array_filter($f) + ['page' => page_num($c->query['page'] ?? 1)])];
});

// ── email outbox ──
staff_get('admin', '/admin/emails', 'automations:manage', 'Email outbox', 'admin/emails', function (Actor $a, Ctx $c) {
    $f = ['q' => q_str($c, 'q'), 'status' => q_str($c, 'status')];
    return ['f' => $f, 'res' => list_emails($a, array_filter($f) + ['page' => page_num($c->query['page'] ?? 1)]), 'jobs' => $a->can('settings:manage') ? job_stats($a) : null, 'email' => integration_status()['email']];
});

// ── settings ──
const SETTING_GROUPS = [
    ['business', 'Business', 'building', 'Name, descriptor, handle, portrait, contact details, currencies, revision policy.'],
    ['theme', 'Brand colour', 'palette', 'The single accent colour used across the site and apps.'],
    ['hero', 'Homepage hero', 'sparkles', 'Headline, sub-headline, buttons and trust points.'],
    ['stats', 'Homepage stats', 'chart', 'Real (auto) or hand-typed figures. Empty ones are hidden.'],
    ['nav', 'Navigation', 'menu', 'Header links and buttons.'],
    ['footer', 'Footer', 'panel', 'Footer columns, description and newsletter.'],
    ['process', 'Process page', 'workflow', 'The steps shown on the Process page and the home page.'],
    ['about', 'About page', 'users', 'Story, values and team.'],
    ['contactInfo', 'Contact page', 'mail', 'Heading, intro and promised response time.'],
    ['legal', 'Legal', 'file', 'Terms of service and privacy policy text.'],
    ['quote', 'Quotes', 'clipboard', 'Prefix, validity, default deposit, terms.'],
    ['invoice', 'Invoices', 'receipt', 'Prefix, due days, notes, payment instructions.'],
    ['workflow', 'Workflow rules', 'settings', 'Payment-before-delivery, internal review, automations.'],
    ['booking', 'Booking', 'calendar', 'Availability, slot length, call types.'],
    ['seo', 'SEO', 'globe', 'Title template, default description, social image.'],
    ['notifications', 'Notifications', 'bell', 'Where admin alerts are emailed.'],
];
staff_get('admin', '/admin/settings', 'settings:manage', 'Settings', 'admin/settings', function (Actor $a, Ctx $c) {
    $key = $c->query['g'] ?? 'integrations';
    $group = null;
    foreach (SETTING_GROUPS as $g) {
        if ($g[0] === $key) {
            $group = $g;
        }
    }
    $v = ['extraScripts' => ['js/admin-editors.js'], 'key' => $group ? $key : 'integrations', 'group' => $group, 'jobs' => job_stats($a), 'st' => integration_status(), 'demo' => is_demo_mode(), 'demoLoaded' => demo_loaded(), 'demoCanLoad' => demo_can_load(), 'isSuper' => in_array('super_admin', $a->roleKeys, true)];
    if ($group) {
        $v['value'] = get_all_settings($a->workspaceId)[$key] ?? new stdClass();
    }
    return $v;
});

// ── my account ──
function account_page(string $area, Actor $a, Ctx $c): never
{
    $tab = in_array($c->query['tab'] ?? '', ['notifications', 'security'], true) ? $c->query['tab'] : 'profile';
    $user = Db::first('users', ['id' => $a->userId], ['cols' => ['phone', 'timezone']]);
    $v = ['area2' => $area, 'tab' => $tab, 'user' => $user];
    if ($tab === 'notifications') {
        $v['prefs'] = get_preferences($a);
    }
    if ($tab === 'security') {
        $v['sessions'] = list_sessions($a);
    }
    staff_page($area, 'admin/account', $a, $v, ['title' => 'My account', 'path' => req_path()]);
}
page('/admin/account', fn(Ctx $c) => account_page('admin', require_page_actor('admin', req_path()), $c));
