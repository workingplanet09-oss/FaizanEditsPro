<?php
/** Admin console: messages, files, revisions, tasks, calendar. */
defined('FEP') or exit;

// ── messages ──
staff_get('admin', '/admin/messages', 'messages:read', 'Messages', 'admin/messages', function (Actor $a, Ctx $c) {
    $threads = list_threads($a);
    $active = q_str($c, 'thread');
    $current = null;
    foreach ($threads as $t) {
        if ($t['key'] === $active) {
            $current = $t;
            break;
        }
    }
    if (!$current && $active) {
        foreach ($threads as $t) {
            if ($t['projectId'] === $active) {
                $current = $t;
                break;
            }
        }
    }
    $current ??= $threads[0] ?? null;
    $items = $current ? list_messages($a, $current['projectId'] ? ['projectId' => $current['projectId'], 'markRead' => true] : ['clientId' => $current['clientId'], 'markRead' => true]) : [];
    return ['threads' => $threads, 'current' => $current, 'items' => $items];
});

// ── files ──
staff_get('admin', '/admin/files', 'files:read', 'Files', 'admin/files', function (Actor $a, Ctx $c) {
    $q = q_str($c, 'q');
    return ['q' => $q, 'res' => list_all_assets($a, ['q' => $q, 'page' => page_num($c->query['page'] ?? 1)])];
});

// ── revisions ──
staff_get('admin', '/admin/revisions', ['revisions:manage', 'projects:read_all'], 'Revisions', 'admin/revisions', function (Actor $a, Ctx $c) {
    $tab = ($c->query['tab'] ?? '') === 'all' ? 'all' : 'open';
    return ['base' => '/admin', 'tab' => $tab, 'rows' => list_revisions($a, $tab === 'open' ? ['status' => 'open'] : []), 'canManage' => $a->can('revisions:manage')];
});

// ── tasks ──
staff_get('admin', '/admin/tasks', 'tasks:read', 'Tasks', 'admin/tasks', function (Actor $a, Ctx $c) {
    $tab = in_array($c->query['tab'] ?? '', ['mine', 'today', 'overdue', 'done'], true) ? $c->query['tab'] : 'open';
    $open = 'TODO,IN_PROGRESS,REVIEW,BLOCKED';
    $query = match ($tab) { 'mine' => ['mine' => '1', 'status' => $open], 'overdue' => ['due' => 'overdue'], 'today' => ['due' => 'today'], 'done' => ['status' => 'COMPLETE'], default => ['status' => $open] };
    $ws = $a->workspaceId;
    return [
        'tab' => $tab, 'tasks' => list_tasks($a, $query + ['pageSize' => 200])['items'], 'staff' => $a->can('projects:assign') ? list_assignable($a) : [],
        'projects' => array_map(fn($p) => ['id' => $p['id'], 'label' => $p['code'] . ' · ' . $p['name']], Db::rows("SELECT `id`, `code`, `name` FROM `projects` WHERE `workspaceId` = ? AND `status` NOT IN ('ARCHIVED','CANCELLED','DELIVERED') ORDER BY `createdAt` DESC LIMIT 200", [$ws])),
        'openNew' => ($c->query['new'] ?? '') === '1',
    ];
});

// ── calendar ──
staff_get('admin', '/admin/calendar', null, 'Calendar', 'admin/calendar', function (Actor $a, Ctx $c) {
    $view = in_array($c->query['view'] ?? '', ['week', 'day'], true) ? $c->query['view'] : 'month';
    $tz = viewer_tz();
    [$date, $from, $to] = calendar_range($view, q_str($c, 'date'), $tz);
    return [
        'view' => $view, 'date' => $date, 'tz' => $tz, 'events' => calendar_events($a, $from->getTimestamp() * 1000, $to->getTimestamp() * 1000),
        'clients' => $a->can('clients:read') ? list_clients($a, ['pageSize' => 200, 'sort' => 'name'])['items'] : [],
    ];
});
