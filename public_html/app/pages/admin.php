<?php
/** Admin console: command center, projects and the shared project workspace (also used by /editor). */
defined('FEP') or exit;

// ── command center ──
staff_get('admin', '/admin', null, 'Command center', 'admin/home', function (Actor $a) {
    $h = admin_home($a);
    $report = null;
    if ($a->can('analytics:read')) {
        try {
            $report = analytics_report($a);
        } catch (Throwable) {
            $report = null;
        }
    }
    return ['h' => $h, 'report' => $report, 'hello' => viewer_greeting(), 'first' => explode(' ', $a->name)[0]];
});

// ── project list ──
const PROJECT_FILTERS = ['q', 'status', 'priority', 'payment', 'deadline', 'editorId', 'sort'];

staff_get('admin', '/admin/projects', ['projects:read_all', 'projects:read_assigned'], 'Projects', 'admin/projects', function (Actor $a, Ctx $c) {
    $view = ($c->query['view'] ?? '') === 'board' ? 'board' : 'table';
    $f = [];
    foreach (PROJECT_FILTERS as $k) {
        $f[$k] = q_str($c, $k);
    }
    $stage = q_str($c, 'stage');
    if ($stage && !$f['status']) {
        foreach (pipeline_stages() as $s) {
            if ($s['key'] === $stage) {
                $f['status'] = implode(',', $s['statuses']);
            }
        }
    }
    $scope = ($c->query['scope'] ?? '') === 'all' ? 'all' : 'open';
    $res = list_projects_staff($a, array_filter($f) + ['view' => $f['status'] ? 'all' : $scope, 'page' => page_num($c->query['page'] ?? 1), 'pageSize' => $view === 'board' ? 200 : 25]);
    return ['view' => $view, 'f' => $f, 'scope' => $scope, 'res' => $res, 'staff' => $a->can('projects:assign') ? list_assignable($a) : []];
});

// ── new project ──
staff_get('admin', '/admin/projects/new', 'projects:write', 'New project', 'admin/project-new', function (Actor $a, Ctx $c) {
    $ws = $a->workspaceId;
    $business = get_setting($ws, 'business');
    return [
        'clients' => list_clients($a, ['pageSize' => 200, 'sort' => 'name'])['items'],
        'services' => Db::rows('SELECT `id`, `title` AS label FROM `services` WHERE `workspaceId` = ? ORDER BY `sortOrder` ASC', [$ws]),
        'types' => Db::rows('SELECT `key` AS id, `name` AS label FROM `project_types` WHERE `workspaceId` = ? ORDER BY `name` ASC', [$ws]),
        'templates' => Db::rows('SELECT `id`, `name` AS label FROM `project_templates` WHERE `workspaceId` = ? ORDER BY `name` ASC', [$ws]),
        'staff' => $a->can('projects:assign') ? list_assignable($a) : [],
        'business' => $business, 'defaultClient' => q_str($c, 'clientId'),
    ];
});

// ── project workspace (admin + editor) ──
function project_workspace(string $area, Actor $a, string $id, Ctx $c): never
{
    $base = "/{$area}";
    $tab = (string)($c->query['tab'] ?? 'overview');
    $p = get_project_detail($a, $id);
    $docs = project_documents($a, $id);
    $versions = list_versions($a, $id);
    $canAssign = $a->can('projects:assign');
    $staff = $canAssign ? list_assignable($a) : [];
    $showBilling = $a->canAny(['invoices:read', 'quotes:read', 'contracts:read']);
    $keys = ['overview', 'brief', 'files', 'videos', 'revisions', 'tasks', 'messages', 'delivery', 'time', 'activity'] + ($showBilling ? [20 => 'billing'] : []) + ($a->can('notes:read') ? [21 => 'notes'] : []);
    if (!in_array($tab, $keys, true)) {
        $tab = 'overview';
    }
    $v = ['area' => $area, 'base' => $base, 'p' => $p, 'docs' => $docs, 'versions' => $versions, 'latest' => $versions[0] ?? null, 'staff' => $staff, 'tab' => $tab, 'showBilling' => $showBilling];
    switch ($tab) {
        case 'overview':
            $v['milestones'] = project_milestones($a, $id);
            break;
        case 'brief':
            $v['brief'] = get_brief($a, $id);
            break;
        case 'files':
            $folder = preg_match('/^[a-z0-9-]{1,40}$/', (string)($c->query['folder'] ?? '')) ? $c->query['folder'] : null;
            $v += ['folder' => $folder, 'folders' => list_folders($a, $id), 'files' => list_assets($a, $id, ['folderKey' => $folder, 'includeDrafts' => true]), 'fileRequests' => list_file_requests($a, $id)];
            break;
        case 'videos':
            $v['posters'] = array_map(function ($ver) use ($a) {
                try {
                    return get_version_poster($a, $ver['id'])['url'] ?? null;
                } catch (Throwable) {
                    return null;
                }
            }, $versions);
            $v['openRevisions'] = list_revisions($a, ['projectId' => $id, 'status' => 'open']);
            break;
        case 'revisions':
            $v += ['revisions' => list_revisions($a, ['projectId' => $id]), 'changeRequests' => list_change_requests($a, $id)];
            break;
        case 'tasks':
            $v['tasks'] = $a->can('tasks:read') ? list_tasks($a, ['projectId' => $id, 'pageSize' => 100])['items'] : [];
            break;
        case 'messages':
            $v['messages'] = list_messages($a, ['projectId' => $id, 'markRead' => true]);
            break;
        case 'delivery':
            $v['delivery'] = list_deliverables($a, $id);
            break;
        case 'time':
            if ($a->can('time:track')) {
                $v += ['entries' => list_time($a, ['projectId' => $id]), 'running' => my_timer($a)];
            }
            break;
        case 'activity':
            $v['timeline'] = project_timeline($a, $id, ['limit' => 100]);
            break;
        case 'notes':
            $v['notes'] = list_notes($a, 'PROJECT', $id);
            break;
    }
    staff_page($area, 'admin/project', $a, $v, ['title' => $p['name'], 'path' => req_path()]);
}

page('/admin/projects/{id}', fn(Ctx $c) => project_workspace('admin', require_page_actor('admin', req_path()), $c->params['id'], $c));
page('/admin/projects/{id}/review', fn(Ctx $c) => review_page('admin', require_page_actor('admin', req_path()), $c->params['id'], null));
page('/admin/projects/{id}/review/{versionId}', fn(Ctx $c) => review_page('admin', require_page_actor('admin', req_path()), $c->params['id'], $c->params['versionId']));
