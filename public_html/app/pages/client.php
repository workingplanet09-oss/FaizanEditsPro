<?php
/** Client portal: /dashboard/* */
defined('FEP') or exit;

/** Shared by every signed-in page: the actor, the area frame and the script bundle. */
function portal_page(string $area, string $view, Actor $actor, array $vars, array $meta, int $status = 200): never
{
    $badges = [];
    if ($area === 'client') {
        $badges['/dashboard/messages'] = unread_message_count($actor);
    }
    render_page('portal', $view, $vars + ['area' => $area, 'actor' => $actor, 'badges' => $badges, 'scripts' => ['js/uploader.js', 'js/portal.js']], $meta + ['noindex' => true], $status);
}

function client_page(string $path, string $title, string $view, callable $vars): void
{
    page($path, function (Ctx $c) use ($path, $title, $view, $vars) {
        $actor = require_page_actor('client', req_path());
        portal_page('client', $view, $actor, $vars($actor, $c), ['title' => $title, 'path' => req_path()]);
    });
}

client_page('/dashboard', 'Dashboard', 'portal/dashboard', fn(Actor $a) => ['home' => client_home($a), 'hello' => viewer_greeting(), 'first' => explode(' ', $a->name)[0]]);

client_page('/dashboard/projects', 'Projects', 'portal/projects', function (Actor $a, Ctx $c) {
    $tab = in_array($c->query['tab'] ?? '', ['delivered', 'all'], true) ? $c->query['tab'] : 'active';
    $all = list_client_projects($a, ['includeClosed' => true]);
    return ['tab' => $tab, 'active' => array_values(array_filter($all, fn($p) => !in_array($p['status'], ['DELIVERED', 'ARCHIVED', 'CANCELLED'], true))),
        'delivered' => array_values(array_filter($all, fn($p) => in_array($p['status'], ['DELIVERED', 'ARCHIVED'], true))), 'all' => $all];
});

client_page('/dashboard/files', 'Files', 'portal/files', function (Actor $a, Ctx $c) {
    $q = trim((string)($c->query['q'] ?? ''));
    return ['q' => $q, 'res' => list_all_assets($a, ['q' => $q, 'page' => page_num($c->query['page'] ?? 1)])];
});

client_page('/dashboard/messages', 'Messages', 'portal/messages', function (Actor $a, Ctx $c) {
    $active = (string)($c->query['thread'] ?? 'general');
    $threads = list_threads($a);
    $projects = list_client_projects($a, ['includeClosed' => true]);
    $items = [];
    try {
        $items = list_messages($a, ['projectId' => $active === 'general' ? null : $active, 'markRead' => true]);
    } catch (AppError) {
        $active = 'general';
        $items = list_messages($a, ['projectId' => null, 'markRead' => true]);
    }
    return ['active' => $active, 'threads' => $threads, 'projects' => $projects, 'items' => $items];
});

client_page('/dashboard/quotes', 'Quotes', 'portal/quotes', fn(Actor $a, Ctx $c) => ['res' => list_quotes($a, ['page' => page_num($c->query['page'] ?? 1)])]);
client_page('/dashboard/contracts', 'Contracts', 'portal/contracts', fn(Actor $a, Ctx $c) => ['res' => list_contracts($a, ['page' => page_num($c->query['page'] ?? 1)])]);
client_page('/dashboard/invoices', 'Invoices', 'portal/invoices', function (Actor $a, Ctx $c) {
    $tab = in_array($c->query['tab'] ?? '', ['due', 'paid'], true) ? $c->query['tab'] : 'all';
    return ['tab' => $tab, 'res' => list_invoices($a, ['page' => page_num($c->query['page'] ?? 1), 'status' => $tab === 'paid' ? 'PAID' : null])];
});
client_page('/dashboard/retainers', 'Retainers', 'portal/retainers', fn(Actor $a) => ['list' => list_retainers($a), 'canManage' => (bool)array_filter($a->orgs, fn($o) => org_role_can($o['role'], 'manage_projects'))]);

client_page('/dashboard/brand-kit', 'Brand kit', 'portal/brand-kit', function (Actor $a) {
    $client = primary_client_for($a);
    if (!$client) {
        return ['client' => null];
    }
    $org = array_values(array_filter($a->orgs, fn($o) => $o['organizationId'] === $client['organizationId']))[0]['role'] ?? 'MEMBER';
    return ['client' => $client, 'kit' => get_brand_kit($a, $client['id']), 'assets' => list_brand_assets($a, $client['id']), 'canEdit' => org_role_can($org, 'manage_projects')];
});

client_page('/dashboard/settings', 'Settings', 'portal/settings', function (Actor $a, Ctx $c) {
    $tab = in_array($c->query['tab'] ?? '', ['company', 'team', 'notifications', 'security'], true) ? $c->query['tab'] : 'profile';
    $client = primary_client_for($a);
    $role = $client ? (array_values(array_filter($a->orgs, fn($o) => $o['organizationId'] === $client['organizationId']))[0]['role'] ?? 'MEMBER') : 'MEMBER';
    $user = Db::first('users', ['id' => $a->userId], ['cols' => ['phone', 'timezone']]);
    $v = ['tab' => $tab, 'client' => $client, 'role' => $role, 'user' => $user];
    if ($tab === 'team' && $client) {
        $v['members'] = list_members($a, $client['organizationId']);
    }
    if ($tab === 'notifications') {
        $v['prefs'] = get_preferences($a);
    }
    if ($tab === 'security') {
        $v['sessions'] = list_sessions($a);
    }
    return $v;
});

// ── quotes, contracts, invoices (detail) ──
page('/dashboard/quotes/{id}', function (Ctx $c) {
    $a = require_page_actor('client', req_path());
    $q = get_quote($a, $c->params['id'], ['markViewed' => true]);
    portal_page('client', 'portal/quote', $a, ['q' => $q], ['title' => 'Quote ' . $q['number'], 'path' => req_path()]);
});

page('/dashboard/contracts/{id}', function (Ctx $c) {
    $a = require_page_actor('client', req_path());
    $ct = get_contract($a, $c->params['id'], ['markViewed' => true]);
    portal_page('client', 'portal/contract', $a, ['c' => $ct, 'canSign' => (bool)array_filter($a->orgs, fn($o) => org_role_can($o['role'], 'approve'))], ['title' => 'Contract ' . $ct['number'], 'path' => req_path()]);
});

page('/dashboard/invoices/{id}', function (Ctx $c) {
    $a = require_page_actor('client', req_path());
    $inv = get_invoice($a, $c->params['id'], ['markViewed' => true]);
    $canPay = (bool)array_filter($a->orgs, fn($o) => $o['organizationId'] === $inv['organizationId'] && org_role_can($o['role'], 'billing'));
    portal_page('client', 'portal/invoice', $a, [
        'inv' => $inv, 'business' => get_setting($a->workspaceId, 'business'), 'invoiceSettings' => get_setting($a->workspaceId, 'invoice'), 'online' => online_payments_available(), 'canPay' => $canPay,
        'demoCheckout' => ($c->query['checkout'] ?? '') === 'demo' && cfg('payments.provider', 'demo') === 'demo' && is_demo_mode(), 'paid' => ($c->query['paid'] ?? '') === '1', 'cancelled' => ($c->query['cancelled'] ?? '') === '1',
    ], ['title' => 'Invoice ' . $inv['number'], 'path' => req_path()]);
});

// ── projects ──
page('/dashboard/projects/{id}', function (Ctx $c) {
    $id = $c->params['id'];
    $a = require_page_actor('client', req_path());
    $p = get_project_detail($a, $id);
    $docs = project_documents($a, $id);
    $versions = list_versions($a, $id);
    $status = $p['status'];
    $org = array_values(array_filter($a->orgs, fn($o) => $o['organizationId'] === $p['organization']['id']))[0]['role'] ?? 'MEMBER';
    $can = ['upload' => org_role_can($org, 'upload'), 'manage' => org_role_can($org, 'manage_projects')];
    $delivered = in_array($status, ['APPROVED', 'DELIVERED', 'ARCHIVED'], true);
    $production = !in_array($status, ['INQUIRY', 'AWAITING_QUOTE', 'AWAITING_CONTRACT', 'AWAITING_PAYMENT'], true);
    $allowed = ['overview', 'timeline', 'files', 'versions', 'messages', 'billing'] + ($delivered ? [6 => 'delivery', 7 => 'feedback'] : []) + ($production ? [8 => 'changes'] : []);
    $tab = in_array($c->query['tab'] ?? 'overview', $allowed, true) ? ($c->query['tab'] ?? 'overview') : 'overview';
    $fileRequests = list_file_requests($a, $id, ['openOnly' => true]);
    $v = ['p' => $p, 'docs' => $docs, 'versions' => $versions, 'latest' => $versions[0] ?? null, 'tab' => $tab, 'can' => $can, 'delivered' => $delivered, 'production' => $production, 'fileRequests' => $fileRequests];
    switch ($tab) {
        case 'overview':
            $v['milestones'] = project_milestones($a, $id);
            break;
        case 'timeline':
            $v['timeline'] = project_timeline($a, $id, ['limit' => 80]);
            break;
        case 'files':
            $folder = preg_match('/^[a-z0-9-]{1,40}$/', (string)($c->query['folder'] ?? '')) ? $c->query['folder'] : null;
            $v += ['folder' => $folder, 'folders' => list_folders($a, $id), 'files' => list_assets($a, $id, ['folderKey' => $folder])];
            break;
        case 'versions':
            $v['posters'] = array_map(function ($ver) use ($a) {
                try {
                    return get_version_poster($a, $ver['id'])['url'] ?? null;
                } catch (Throwable) {
                    return null;
                }
            }, $versions);
            $v['revisions'] = list_revisions($a, ['projectId' => $id]);
            break;
        case 'messages':
            $v['messages'] = list_messages($a, ['projectId' => $id, 'markRead' => true]);
            break;
        case 'delivery':
            $v['delivery'] = list_deliverables($a, $id);
            break;
        case 'feedback':
            $v['feedback'] = get_feedback_state($a, $id);
            break;
        case 'changes':
            $v['changes'] = list_change_requests($a, $id);
            break;
    }
    portal_page('client', 'portal/project', $a, $v, ['title' => $p['name'], 'path' => req_path()]);
});

page('/dashboard/projects/{id}/setup', function (Ctx $c) {
    $id = $c->params['id'];
    $a = require_page_actor('client', req_path());
    $data = get_project_onboarding($a, $id);
    $open = in_array($data['project']['status'], ['ONBOARDING', 'AWAITING_ASSETS', 'QUEUED'], true);
    if (!$open || $data['locked']) {
        $locked = (bool)$data['locked'];
        Pages::error(200, $locked ? 'Locked' : 'Not yet', $locked ? 'lock' : 'clock', $locked ? 'The brief is locked — production has started' : 'Project setup opens after payment',
            $locked ? "To keep the edit on track, the brief can't change once editing begins. Send a change request and we'll confirm scope and cost." : 'Once your quote is accepted, the contract is signed and the deposit is paid, this form opens so you can tell us exactly what you want.',
            [[$locked ? 'Change requests' : 'Back to project', "/dashboard/projects/{$id}" . ($locked ? '?tab=changes' : ''), true]]);
    }
    $prefill = inquiry_prefill($a);
    $props = ['mode' => 'project', 'form' => $data['form'], 'answers' => (object)$data['answers'], 'initialStep' => $data['step'], 'extraCategories' => $data['extraCategories'], 'exitHref' => "/dashboard/projects/{$id}", 'uploads' => ['purpose' => 'asset', 'projectId' => $id, 'folderKey' => 'references'],
        'firstTime' => (bool)$data['firstTime'], 'submitLabel' => 'Send project details', 'previousProjects' => array_values(array_filter($prefill['previousProjects'], fn($p) => $p['id'] !== $id)), 'previousUrl' => '/api/leads/previous?projectId=',
        'saveUrl' => "/api/projects/{$id}/onboarding", 'submitUrl' => "/api/projects/{$id}/onboarding", 'projectId' => $id, 'projectName' => $data['project']['name']];
    render_page('portal', 'portal/setup', ['area' => 'client', 'actor' => $a, 'props' => $props, 'project' => $data['project'], 'badges' => [], 'scripts' => ['js/conditions.js', 'js/uploader.js', 'js/portal.js', 'js/wizard.js']], ['title' => 'Project setup', 'path' => req_path(), 'noindex' => true]);
});

// ── review player (shared with the admin and editor areas through review_page()) ──
/** The timestamped review page for $projectId, opened on $versionId (latest when null). $area: client|admin|editor. */
function review_page(string $area, Actor $a, string $projectId, ?string $versionId): never
{
    $base = ['client' => '/dashboard', 'admin' => '/admin', 'editor' => '/editor'][$area];
    $data = get_review_data($a, $projectId, $versionId);
    if ($versionId && $data['versions'] && !array_filter($data['versions'], fn($v) => $v['id'] === $versionId)) {
        Pages::notFound();
    }
    $vars = ['base' => $base, 'data' => $data, 'projectId' => $projectId, 'props' => null, 'playback' => null];
    if ($data['current']) {
        try {
            $pb = get_version_playback($a, $data['current']['id']);
            $playback = ['url' => $pb['url'], 'external' => $pb['external'], 'mimeType' => $pb['mimeType']];
        } catch (Throwable $e) {
            $playback = ['url' => null, 'external' => false, 'error' => $e instanceof AppError ? $e->getMessage() : 'Video unavailable'];
        }
        $poster = null;
        try {
            $poster = get_version_poster($a, $data['current']['id'])['url'];
        } catch (Throwable) {
        }
        $vars['props'] = ['base' => $base, 'staff' => $a->isStaff, 'me' => ['id' => $a->userId, 'name' => $a->name], 'project' => $data['project'], 'versions' => $data['versions'], 'current' => $data['current'], 'comments' => $data['comments'], 'perms' => $data['perms'], 'playback' => $playback, 'posterUrl' => $poster];
    }
    render_page('portal', 'portal/review', $vars + ['area' => $area, 'actor' => $a, 'badges' => [], 'scripts' => ['js/uploader.js', 'js/portal.js', 'js/review.js']], ['title' => 'Review video', 'path' => req_path(), 'noindex' => true]);
}

page('/dashboard/projects/{id}/review', function (Ctx $c) {
    review_page('client', require_page_actor('client', req_path()), $c->params['id'], null);
});
page('/dashboard/projects/{id}/review/{versionId}', function (Ctx $c) {
    review_page('client', require_page_actor('client', req_path()), $c->params['id'], $c->params['versionId']);
});
