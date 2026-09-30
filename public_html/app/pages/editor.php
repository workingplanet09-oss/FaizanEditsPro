<?php
/** Editor workspace: /editor/* — assigned work only (scopes enforce it; the links below are just the editor's view of the same services). */
defined('FEP') or exit;

staff_get('editor', '/editor', null, 'My work', 'editor/home', function (Actor $a) {
    return ['h' => editor_home($a), 'timer' => $a->can('time:track') ? my_timer($a) : null, 'hello' => viewer_greeting(), 'first' => explode(' ', $a->name)[0]];
});

staff_get('editor', '/editor/projects', null, 'My projects', 'editor/projects', function (Actor $a, Ctx $c) {
    $scope = ($c->query['scope'] ?? '') === 'all' ? 'all' : 'open';
    $f = ['q' => q_str($c, 'q'), 'status' => q_str($c, 'status'), 'sort' => q_str($c, 'sort') ?? 'deadline'];
    $res = list_projects_staff($a, array_filter($f) + ['view' => $f['status'] ? 'all' : $scope, 'page' => page_num($c->query['page'] ?? 1), 'pageSize' => 25]);
    return ['scope' => $scope, 'f' => $f, 'res' => $res, 'filtered' => (bool)($f['q'] || $f['status'])];
});

page('/editor/projects/{id}', fn(Ctx $c) => project_workspace('editor', require_page_actor('editor', req_path()), $c->params['id'], $c));
page('/editor/projects/{id}/review', fn(Ctx $c) => review_page('editor', require_page_actor('editor', req_path()), $c->params['id'], null));
page('/editor/projects/{id}/review/{versionId}', fn(Ctx $c) => review_page('editor', require_page_actor('editor', req_path()), $c->params['id'], $c->params['versionId']));

staff_get('editor', '/editor/tasks', 'tasks:read', 'My tasks', 'editor/tasks', function (Actor $a, Ctx $c) {
    $tab = in_array($c->query['tab'] ?? '', ['today', 'overdue', 'done'], true) ? $c->query['tab'] : 'open';
    $query = match ($tab) { 'today' => ['due' => 'today'], 'overdue' => ['due' => 'overdue'], 'done' => ['status' => 'COMPLETE'], default => ['status' => 'TODO,IN_PROGRESS,REVIEW,BLOCKED'] };
    $canWrite = $a->can('tasks:write');
    $projects = $canWrite ? list_projects_staff($a, ['view' => 'open', 'pageSize' => 100])['items'] : [];
    return [
        'tab' => $tab, 'tasks' => list_tasks($a, $query + ['mine' => '1', 'pageSize' => 200])['items'], 'staff' => $a->can('projects:assign') ? list_assignable($a) : [], 'canWrite' => $canWrite,
        'projects' => array_map(fn($p) => ['id' => $p['id'], 'label' => $p['code'] . ' · ' . $p['name']], $projects), 'openNew' => ($c->query['new'] ?? '') === '1',
    ];
});

staff_get('editor', '/editor/revisions', null, 'Revisions', 'admin/revisions', function (Actor $a, Ctx $c) {
    $tab = ($c->query['tab'] ?? '') === 'all' ? 'all' : 'open';
    return ['base' => '/editor', 'tab' => $tab, 'rows' => list_revisions($a, $tab === 'open' ? ['status' => 'open'] : []), 'canManage' => $a->can('revisions:manage')];
});

staff_get('editor', '/editor/files', null, 'Files', 'editor/files', function (Actor $a, Ctx $c) {
    $q = q_str($c, 'q');
    return ['q' => $q, 'res' => list_all_assets($a, ['q' => $q, 'page' => page_num($c->query['page'] ?? 1)])];
});

page('/editor/account', fn(Ctx $c) => account_page('editor', require_page_actor('editor', req_path()), $c));
