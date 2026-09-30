<?php
/** Team tasks (with checklist sub-tasks and comments). Staff only; editors see tasks on projects they are assigned to. */
defined('FEP') or exit;

const FEP_TASK_SELECT = 't.*, au.`name` AS assignee_name, p.`id` AS p_id, p.`name` AS p_name, p.`code` AS p_code, (SELECT COUNT(*) FROM `task_comments` tc WHERE tc.`taskId` = t.`id`) AS comment_count';

function task_row_dto(array $r): array
{
    $t = Db::hydrate('tasks', array_intersect_key($r, Db::table('tasks')['cols']));
    $t['assignee'] = $t['assigneeId'] ? ['id' => $t['assigneeId'], 'name' => $r['assignee_name']] : null;
    $t['project'] = $r['p_id'] ? ['id' => $r['p_id'], 'name' => $r['p_name'], 'code' => $r['p_code']] : null;
    $t['subtasks'] = array_map(fn($s) => ['id' => $s['id'], 'title' => $s['title'], 'status' => $s['status'], 'assigneeId' => $s['assigneeId']], Db::find('tasks', ['parentId' => $t['id']], ['order' => '`sortOrder` ASC', 'cols' => ['id', 'title', 'status', 'assigneeId']]));
    $t['_count'] = ['comments' => (int)$r['comment_count']];
    return $t;
}

function task_full(string $id): array
{
    $r = Db::rowRaw('SELECT ' . FEP_TASK_SELECT . ' FROM `tasks` t LEFT JOIN `users` au ON au.`id` = t.`assigneeId` LEFT JOIN `projects` p ON p.`id` = t.`projectId` WHERE t.`id` = ?', [$id]);
    return task_row_dto($r);
}

function scoped_task_row(Actor $actor, string $id, string $what = 'Task'): array
{
    [$s, $p] = scope_task($actor, 'tk');
    $row = Db::rowRaw("SELECT tk.* FROM `tasks` tk WHERE tk.`id` = ? AND {$s}", [$id, ...$p]);
    if (!$row) {
        throw not_found($what);
    }
    return Db::hydrate('tasks', $row);
}

/** $q: projectId, assigneeId, status (comma list), mine ("1"), due (today|overdue|week), q, topLevel, page, pageSize */
function list_tasks(Actor $actor, array $q = []): array
{
    assert_can($actor, 'tasks:read');
    ['page' => $page, 'pageSize' => $pageSize, 'skip' => $skip, 'take' => $take] = page_args($q, 50, 200);
    [$s, $params] = scope_task($actor, 'tk');
    $where = [$s];
    if (($q['topLevel'] ?? true) !== false) {
        $where[] = 'tk.`parentId` IS NULL';
    }
    if (!empty($q['projectId'])) {
        $where[] = 'tk.`projectId` = ?';
        $params[] = $q['projectId'];
    }
    if (($q['mine'] ?? null) === '1') {
        $where[] = 'tk.`assigneeId` = ?';
        $params[] = $actor->userId;
    } elseif (!empty($q['assigneeId'])) {
        $where[] = 'tk.`assigneeId` = ?';
        $params[] = $q['assigneeId'];
    }
    if (!empty($q['status'])) {
        [$ph, $pp] = Db::in(explode(',', (string)$q['status']));
        $where[] = "tk.`status` IN {$ph}";
        array_push($params, ...$pp);
    }
    $now = now_ms();
    $eod = gmmktime(0, 0, 0, (int)gmdate('n', intdiv($now, 1000)), (int)gmdate('j', intdiv($now, 1000)) + 1, (int)gmdate('Y', intdiv($now, 1000))) * 1000;
    switch ($q['due'] ?? null) {
        case 'today':
            $where[] = "tk.`dueDate` < ? AND tk.`status` <> 'COMPLETE'";
            $params[] = db_dt($eod);
            break;
        case 'overdue':
            $where[] = "tk.`dueDate` < ? AND tk.`status` <> 'COMPLETE'";
            $params[] = db_dt($now);
            break;
        case 'week':
            $where[] = "tk.`dueDate` < ? AND tk.`status` <> 'COMPLETE'";
            $params[] = db_dt($now + 7 * 86400000);
            break;
    }
    if (!empty($q['q'])) {
        $where[] = 'tk.`title` LIKE ?';
        $params[] = like_pattern((string)$q['q']);
    }
    $w = implode(' AND ', array_map(fn($x) => "({$x})", $where));
    $rows = Db::rows(
        "SELECT tk.*, au.`name` AS assignee_name, p.`id` AS p_id, p.`name` AS p_name, p.`code` AS p_code, (SELECT COUNT(*) FROM `task_comments` tc WHERE tc.`taskId` = tk.`id`) AS comment_count
         FROM `tasks` tk LEFT JOIN `users` au ON au.`id` = tk.`assigneeId` LEFT JOIN `projects` p ON p.`id` = tk.`projectId`
         WHERE {$w} ORDER BY tk.`status` ASC, tk.`dueDate` IS NULL, tk.`dueDate` ASC, tk.`sortOrder` ASC LIMIT " . (int)$take . ' OFFSET ' . (int)$skip,
        $params,
    );
    $total = (int)Db::val("SELECT COUNT(*) FROM `tasks` tk WHERE {$w}", $params);
    return paged(array_map('task_row_dto', $rows), $total, $page, $pageSize);
}

function assert_assignable_user(Actor $actor, string $userId): void
{
    if (!Db::exists('users', ['sql' => "`id` = ? AND `workspaceId` = ? AND `isStaff` = 1 AND `status` <> 'SUSPENDED'", 'params' => [$userId, $actor->workspaceId]])) {
        throw bad_request('You can only assign tasks to active team members.');
    }
}

/** $in: projectId?, parentId?, title, description?, assigneeId?, priority?, dueDate?, status? */
function create_task(Actor $actor, array $in): array
{
    assert_can($actor, 'tasks:write');
    if (!empty($in['projectId'])) {
        require_project($actor, $in['projectId']);
    }
    $projectId = $in['projectId'] ?? null;
    if (!empty($in['parentId'])) {
        $parent = scoped_task_row($actor, $in['parentId'], 'Parent task');
        $projectId = $parent['projectId'];
    }
    if (!empty($in['assigneeId'])) {
        assert_assignable_user($actor, $in['assigneeId']);
    }
    $last = (int)Db::val('SELECT COALESCE(MAX(`sortOrder`), 0) FROM `tasks` WHERE `parentId` <=> ? AND `projectId` <=> ?', [$in['parentId'] ?? null, $projectId]);
    $t = Db::insert('tasks', [
        'workspaceId' => $actor->workspaceId, 'projectId' => $projectId, 'parentId' => $in['parentId'] ?? null, 'title' => trim($in['title']), 'description' => $in['description'] ?? null,
        'assigneeId' => $in['assigneeId'] ?? null, 'priority' => $in['priority'] ?? 'NORMAL', 'dueDate' => $in['dueDate'] ?? null, 'status' => $in['status'] ?? 'TODO', 'sortOrder' => $last + 1, 'createdById' => $actor->userId,
    ]);
    if ($t['assigneeId'] && $t['assigneeId'] !== $actor->userId) {
        $proj = $projectId ? Db::first('projects', ['id' => $projectId], ['cols' => ['name', 'code']]) : null;
        notify(['workspaceId' => $actor->workspaceId, 'userIds' => [$t['assigneeId']], 'category' => 'PROJECT', 'type' => 'task.assigned', 'title' => "New task: {$t['title']}", 'message' => $proj ? "{$proj['name']} ({$proj['code']})" : null, 'link' => '/editor/tasks', 'email' => false]);
    }
    return task_full($t['id']);
}

/** $patch keys present are applied: title, description, assigneeId, priority, dueDate, status, sortOrder */
function update_task(Actor $actor, string $id, array $patch): array
{
    assert_can($actor, 'tasks:read');
    $t = scoped_task_row($actor, $id);
    if (!$actor->can('tasks:write')) {
        throw forbidden();
    }
    if (!empty($patch['assigneeId'])) {
        assert_assignable_user($actor, $patch['assigneeId']);
    }
    $data = [];
    foreach (['title', 'description', 'assigneeId', 'priority', 'dueDate', 'status', 'sortOrder'] as $k) {
        if (array_key_exists($k, $patch)) {
            $data[$k] = $patch[$k];
        }
    }
    if (isset($patch['status'])) {
        $data['completedAt'] = $patch['status'] === 'COMPLETE' ? now_ms() : null;
    }
    Db::update('tasks', ['id' => $id], $data);
    if (($patch['status'] ?? null) === 'COMPLETE' && !$t['parentId']) {
        // completing a parent completes its checklist
        Db::exec("UPDATE `tasks` SET `status` = 'COMPLETE', `completedAt` = ? WHERE `parentId` = ? AND `status` <> 'COMPLETE'", [db_dt(), $id]);
    }
    if (!empty($patch['assigneeId']) && $patch['assigneeId'] !== $t['assigneeId'] && $patch['assigneeId'] !== $actor->userId) {
        $title = $patch['title'] ?? $t['title'];
        notify(['workspaceId' => $actor->workspaceId, 'userIds' => [$patch['assigneeId']], 'category' => 'PROJECT', 'type' => 'task.assigned', 'title' => "Task assigned: {$title}", 'link' => '/editor/tasks', 'email' => false]);
    }
    return task_full($id);
}

function delete_task(Actor $actor, string $id): array
{
    assert_can($actor, 'tasks:write');
    $t = scoped_task_row($actor, $id);
    Db::delete('tasks', ['id' => $id]);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'task.deleted', 'entityType' => 'task', 'entityId' => $id, 'message' => "{$actor->name} deleted task “{$t['title']}”"]);
    return ['ok' => true];
}

function list_task_comments(Actor $actor, string $taskId): array
{
    scoped_task_row($actor, $taskId);
    $rows = Db::rows('SELECT c.*, u.`name` AS a_name FROM `task_comments` c JOIN `users` u ON u.`id` = c.`authorId` WHERE c.`taskId` = ? ORDER BY c.`createdAt` ASC', [$taskId]);
    return array_map(fn($r) => Db::hydrate('task_comments', array_intersect_key($r, Db::table('task_comments')['cols'])) + ['author' => ['name' => $r['a_name']]], $rows);
}

function add_task_comment(Actor $actor, string $taskId, string $body): array
{
    assert_can($actor, 'tasks:read');
    $t = scoped_task_row($actor, $taskId);
    if (trim($body) === '') {
        throw bad_request('Write a comment first.');
    }
    $c = Db::insert('task_comments', ['taskId' => $taskId, 'authorId' => $actor->userId, 'body' => mb_substr(trim($body), 0, 3000)]);
    if ($t['assigneeId'] && $t['assigneeId'] !== $actor->userId) {
        notify(['workspaceId' => $actor->workspaceId, 'userIds' => [$t['assigneeId']], 'category' => 'PROJECT', 'type' => 'task.comment', 'title' => "{$actor->name} commented on “{$t['title']}”", 'message' => mb_substr($body, 0, 120), 'link' => '/editor/tasks', 'email' => false]);
    }
    return $c + ['author' => ['name' => $actor->name]];
}
