<?php
/**
 * Projects: creation, lists, detail, updates, the STATUS MACHINE (the only place a status changes), assignment, timeline, milestones.
 * Every read goes through scope_project() so a client can only ever reach their own company's visible projects.
 */
defined('FEP') or exit;

const FEP_DEFAULT_SCOPE = ['deliverables' => [], 'revisionRounds' => 2, 'turnaroundBusinessDays' => 5];

function is_actor(mixed $who): bool { return $who instanceof Actor; }

// ───────────────────────────── create ─────────────────────────────

function ensure_folders(string $projectId): void
{
    foreach (app_data('site-defaults')['DEFAULT_PROJECT_FOLDERS'] as $i => $f) {
        Db::upsert('asset_folders', ['projectId' => $projectId, 'key' => $f['key'], 'name' => $f['name'], 'sortOrder' => $i], []);
    }
}

/**
 * $in: clientId, name, description?, serviceId?, projectTypeKey?, priority?, deadline?, managerId?, scope?, templateId?, currency?, status?,
 * clientVisible?, sourceProjectId?, retainerId?, leadId?, tags?, revisionLimit?, isDemo?, workspaceId?
 */
function create_project(mixed $who, array $in): array
{
    if (is_actor($who)) {
        assert_can($who, 'projects:write');
    }
    $workspaceId = is_actor($who) ? $who->workspaceId : ($in['workspaceId'] ?? null);
    $client = Db::first('clients', ['id' => $in['clientId'], 'workspaceId' => $workspaceId]);
    if (!$client) {
        throw not_found('Client');
    }
    $service = !empty($in['serviceId']) ? Db::first('services', ['id' => $in['serviceId'], 'workspaceId' => $workspaceId]) : null;
    $ptype = !empty($in['projectTypeKey']) ? Db::first('project_types', ['workspaceId' => $workspaceId, 'key' => $in['projectTypeKey']]) : null;
    $template = !empty($in['templateId']) ? Db::first('project_templates', ['id' => $in['templateId'], 'workspaceId' => $workspaceId]) : null;
    $business = get_setting($workspaceId, 'business');

    $number = next_number($workspaceId, 'project', 1000);
    $templateDeliverables = is_array($template['deliverables'] ?? null) ? $template['deliverables'] : [];
    $defaults = FEP_DEFAULT_SCOPE;
    $scope = array_merge($defaults, [
        'revisionRounds' => $in['revisionLimit'] ?? $template['defaultRevisionLimit'] ?? $ptype['defaultRevisionLimit'] ?? $defaults['revisionRounds'],
        'turnaroundBusinessDays' => $template['defaultTurnaroundDays'] ?? $ptype['defaultTurnaroundDays'] ?? $defaults['turnaroundBusinessDays'],
        'deliverables' => $templateDeliverables ?: array_map(fn($d) => ['label' => $d, 'quantity' => 1], $service['deliverables'] ?? []),
        'requiredAssets' => $template['requiredAssets'] ?? [],
        'categories' => array_values(array_merge($ptype['onboardingCategories'] ?? [], $service['onboardingCategories'] ?? [])),
    ], $in['scope'] ?? []);

    $project = Db::tx(function () use ($who, $in, $workspaceId, $client, $service, $ptype, $template, $business, $number, $scope) {
        $p = Db::insert('projects', [
            'workspaceId' => $workspaceId, 'organizationId' => $client['organizationId'], 'clientId' => $client['id'], 'code' => "P-{$number}",
            'serviceId' => $service['id'] ?? null, 'projectTypeId' => $ptype['id'] ?? null, 'templateId' => $template['id'] ?? null,
            'sourceProjectId' => $in['sourceProjectId'] ?? null, 'retainerId' => $in['retainerId'] ?? null, 'leadId' => $in['leadId'] ?? null,
            'name' => $in['name'], 'description' => $in['description'] ?? null, 'status' => $in['status'] ?? 'INQUIRY', 'priority' => $in['priority'] ?? 'NORMAL',
            'deadline' => $in['deadline'] ?? null, 'managerId' => $in['managerId'] ?? null, 'clientVisible' => $in['clientVisible'] ?? false,
            'scope' => $scope, 'revisionLimit' => (int)$scope['revisionRounds'], 'currency' => $in['currency'] ?? $business['defaultCurrency'],
            'tags' => $in['tags'] ?? [], 'isDemo' => $in['isDemo'] ?? $client['isDemo'],
        ]);
        ensure_folders($p['id']);
        if (!empty($in['managerId'])) {
            Db::insert('project_members', ['projectId' => $p['id'], 'userId' => $in['managerId'], 'role' => 'MANAGER'], false);
        }
        if (is_array($template['tasks'] ?? null)) {
            $order = 0;
            foreach ($template['tasks'] as $t) {
                $parent = Db::insert('tasks', [
                    'workspaceId' => $workspaceId, 'projectId' => $p['id'], 'title' => $t['title'], 'sortOrder' => $order++, 'createdById' => who_id($who),
                    'dueDate' => !empty($t['offsetDays']) ? add_business_days_ms(now_ms(), (int)$t['offsetDays']) : null,
                ]);
                foreach (($t['subtasks'] ?? []) as $i => $st) {
                    Db::insert('tasks', ['workspaceId' => $workspaceId, 'projectId' => $p['id'], 'parentId' => $parent['id'], 'title' => $st, 'sortOrder' => $i, 'createdById' => who_id($who)], false);
                }
            }
        }
        return $p;
    });

    if (!empty($in['retainerId'])) {
        record_retainer_usage(['retainerId' => $in['retainerId'], 'projectId' => $project['id'], 'kind' => ($ptype['key'] ?? null) === 'short_form' ? 'SHORT' : 'VIDEO']);
    }
    audit($who, ['workspaceId' => $workspaceId, 'action' => 'project.created', 'entityType' => 'project', 'entityId' => $project['id'], 'message' => who_name($who) . " created project {$project['code']} “{$project['name']}”"]);
    log_activity($who, ['workspaceId' => $workspaceId, 'type' => 'project.created', 'message' => 'Project created', 'projectId' => $project['id'], 'clientId' => $client['id'], 'visibility' => 'CLIENT']);
    emit('project.created', ['workspaceId' => $workspaceId, 'actorId' => who_id($who), 'projectId' => $project['id'], 'clientId' => $client['id']]);
    return $project;
}

// ───────────────────────────── list / detail ─────────────────────────────

/** @param array<int,array{status:string,total:int,amountPaid:int}> $invoices */
function payment_state_of(array $invoices): string
{
    $live = array_values(array_filter($invoices, fn($i) => !in_array($i['status'], ['DRAFT', 'CANCELLED'], true)));
    if (!$live) {
        return 'NONE';
    }
    if (!array_filter($live, fn($i) => $i['status'] !== 'PAID')) {
        return 'PAID';
    }
    if (array_filter($live, fn($i) => $i['status'] === 'OVERDUE')) {
        return 'OVERDUE';
    }
    if (array_filter($live, fn($i) => (int)$i['amountPaid'] > 0)) {
        return 'PARTIAL';
    }
    return 'UNPAID';
}

function list_projects(Actor $actor, array $q = []): array
{
    return $actor->isStaff ? list_projects_staff($actor, $q) : (function () use ($actor, $q) {
        $rows = list_client_projects($actor, ['includeClosed' => ($q['view'] ?? null) === 'all']);
        return ['items' => $rows, 'total' => count($rows), 'page' => 1, 'pageSize' => count($rows) ?: 1, 'pages' => 1];
    })();
}

/** Staff project list. $q: q, status (comma list), clientId, editorId, type, priority, payment, deadline, sort, view (open|all), page, pageSize */
function list_projects_staff(Actor $actor, array $q = []): array
{
    if (!$actor->can('projects:read_all') && !$actor->can('projects:read_assigned')) {
        throw forbidden();
    }
    ['page' => $page, 'pageSize' => $pageSize, 'skip' => $skip, 'take' => $take] = page_args($q);
    [$scope, $params] = scope_project($actor, 'p');
    $where = [$scope];
    $open = "('SENT','VIEWED','PARTIALLY_PAID','OVERDUE')";
    if (!empty($q['status'])) {
        [$ph, $pp] = Db::in(explode(',', (string)$q['status']));
        $where[] = "p.`status` IN {$ph}";
        array_push($params, ...$pp);
    } elseif (($q['view'] ?? null) === 'open') {
        $where[] = "p.`status` NOT IN ('DELIVERED','ARCHIVED','CANCELLED')";
    }
    if (!empty($q['clientId'])) {
        $where[] = 'p.`clientId` = ?';
        $params[] = $q['clientId'];
    }
    if (!empty($q['editorId'])) {
        $where[] = 'EXISTS (SELECT 1 FROM `project_members` pmf WHERE pmf.`projectId` = p.`id` AND pmf.`userId` = ?)';
        $params[] = $q['editorId'];
    }
    if (!empty($q['type'])) {
        $where[] = 'EXISTS (SELECT 1 FROM `project_types` ptf WHERE ptf.`id` = p.`projectTypeId` AND ptf.`key` = ?)';
        $params[] = $q['type'];
    }
    if (!empty($q['priority'])) {
        $where[] = 'p.`priority` = ?';
        $params[] = $q['priority'];
    }
    if (!empty($q['q'])) {
        $like = like_pattern((string)$q['q']);
        $where[] = '(p.`name` LIKE ? OR p.`code` LIKE ? OR EXISTS (SELECT 1 FROM `clients` cf WHERE cf.`id` = p.`clientId` AND cf.`companyName` LIKE ?))';
        array_push($params, $like, $like, $like);
    }
    $now = now_ms();
    switch ($q['deadline'] ?? null) {
        case 'overdue':
            $where[] = "p.`deadline` < ? AND p.`status` NOT IN ('DELIVERED','ARCHIVED','CANCELLED','APPROVED')";
            $params[] = db_dt($now);
            break;
        case 'week':
            $where[] = 'p.`deadline` >= ? AND p.`deadline` <= ?';
            array_push($params, db_dt($now), db_dt($now + 7 * 86400000));
            break;
        case 'month':
            $where[] = 'p.`deadline` >= ? AND p.`deadline` <= ?';
            array_push($params, db_dt($now), db_dt($now + 31 * 86400000));
            break;
        case 'none':
            $where[] = 'p.`deadline` IS NULL';
            break;
    }
    switch ($q['payment'] ?? null) {
        case 'paid':
            $where[] = "EXISTS (SELECT 1 FROM `invoices` iv WHERE iv.`projectId` = p.`id` AND iv.`status` = 'PAID') AND NOT EXISTS (SELECT 1 FROM `invoices` iv2 WHERE iv2.`projectId` = p.`id` AND iv2.`status` IN {$open})";
            break;
        case 'unpaid':
            $where[] = "EXISTS (SELECT 1 FROM `invoices` iv WHERE iv.`projectId` = p.`id` AND iv.`status` IN {$open})";
            break;
        case 'none':
            $where[] = 'NOT EXISTS (SELECT 1 FROM `invoices` iv WHERE iv.`projectId` = p.`id`)';
            break;
    }
    $order = match ($q['sort'] ?? '') {
        'oldest' => 'p.`createdAt` ASC',
        'deadline' => 'p.`deadline` IS NULL, p.`deadline` ASC',
        'priority' => 'p.`priority` DESC, p.`deadline` IS NULL, p.`deadline` ASC',
        'updated' => 'p.`updatedAt` DESC',
        default => 'p.`createdAt` DESC',
    };
    $w = implode(' AND ', array_map(fn($x) => "({$x})", $where));
    $rows = Db::rows(
        "SELECT p.*, c.`name` AS c_name, c.`companyName` AS c_companyName, mu.`name` AS m_name, pt.`name` AS pt_name, pt.`key` AS pt_key, s.`title` AS s_title,
           (SELECT COUNT(*) FROM `revision_requests` rr WHERE rr.`projectId` = p.`id` AND rr.`status` IN ('OPEN','IN_PROGRESS')) AS openRevisions
         FROM `projects` p
         JOIN `clients` c ON c.`id` = p.`clientId`
         LEFT JOIN `users` mu ON mu.`id` = p.`managerId`
         LEFT JOIN `project_types` pt ON pt.`id` = p.`projectTypeId`
         LEFT JOIN `services` s ON s.`id` = p.`serviceId`
         WHERE {$w} ORDER BY {$order} LIMIT " . (int)$take . ' OFFSET ' . (int)$skip,
        $params,
    );
    $total = (int)Db::val("SELECT COUNT(*) FROM `projects` p WHERE {$w}", $params);
    $ids = array_column($rows, 'id');
    $members = [];
    $invoices = [];
    if ($ids) {
        [$ph, $pp] = Db::in($ids);
        foreach (Db::rows("SELECT pm.`projectId`, pm.`role`, u.`id`, u.`name` FROM `project_members` pm JOIN `users` u ON u.`id` = pm.`userId` WHERE pm.`projectId` IN {$ph}", $pp) as $m) {
            $members[$m['projectId']][] = $m;
        }
        foreach (Db::rows("SELECT `projectId`, `status`, `total`, `amountPaid` FROM `invoices` WHERE `projectId` IN {$ph}", $pp) as $i) {
            $invoices[$i['projectId']][] = ['status' => $i['status'], 'total' => (int)$i['total'], 'amountPaid' => (int)$i['amountPaid']];
        }
    }
    $items = array_map(function ($r) use ($members, $invoices) {
        $h = Db::hydrate('projects', array_intersect_key($r, Db::table('projects')['cols']));
        return [
            'id' => $h['id'], 'code' => $h['code'], 'name' => $h['name'], 'status' => $h['status'], 'priority' => $h['priority'], 'deadline' => $h['deadline'],
            'createdAt' => $h['createdAt'], 'updatedAt' => $h['updatedAt'],
            'client' => ['id' => $h['clientId'], 'name' => $r['c_name'], 'companyName' => $r['c_companyName']],
            'manager' => $h['managerId'] ? ['id' => $h['managerId'], 'name' => $r['m_name']] : null,
            'type' => $r['pt_name'] ?? $r['s_title'] ?? null,
            'editors' => array_values(array_map(fn($m) => ['id' => $m['id'], 'name' => $m['name']], array_filter($members[$h['id']] ?? [], fn($m) => $m['role'] !== 'MANAGER'))),
            'paymentState' => payment_state_of($invoices[$h['id']] ?? []),
            'openRevisions' => (int)$r['openRevisions'],
            'progress' => status_meta($h['status'])['progress'],
        ];
    }, $rows);
    return paged($items, $total, $page, $pageSize);
}

/** Portal: the client's projects, grouped for the dashboard. */
function list_client_projects(Actor $actor, array $opts = []): array
{
    [$scope, $params] = scope_project($actor, 'p');
    $extra = !empty($opts['includeClosed']) ? '' : " AND p.`status` NOT IN ('ARCHIVED','CANCELLED')";
    $rows = Db::rows(
        "SELECT p.*, mu.`name` AS m_name, s.`title` AS s_title FROM `projects` p LEFT JOIN `users` mu ON mu.`id` = p.`managerId` LEFT JOIN `services` s ON s.`id` = p.`serviceId`
         WHERE {$scope}{$extra} ORDER BY p.`updatedAt` DESC",
        $params,
    );
    $ids = array_column($rows, 'id');
    $editors = [];
    $latest = [];
    if ($ids) {
        [$ph, $pp] = Db::in($ids);
        foreach (Db::rows("SELECT pm.`projectId`, pm.`role`, u.`name` FROM `project_members` pm JOIN `users` u ON u.`id` = pm.`userId` WHERE pm.`projectId` IN {$ph} ORDER BY pm.`createdAt` ASC", $pp) as $m) {
            if (in_array($m['role'], ['EDITOR', 'MOTION_DESIGNER'], true) && !isset($editors[$m['projectId']])) {
                $editors[$m['projectId']] = $m['name'];
            }
        }
        foreach (Db::rows("SELECT `id`, `projectId`, `label`, `reviewStatus` FROM `video_versions` WHERE `projectId` IN {$ph} AND `releasedAt` IS NOT NULL ORDER BY `versionNumber` DESC", $pp) as $v) {
            $latest[$v['projectId']] ??= ['id' => $v['id'], 'label' => $v['label'], 'reviewStatus' => $v['reviewStatus']];
        }
    }
    return array_map(function ($r) use ($editors, $latest) {
        $h = Db::hydrate('projects', array_intersect_key($r, Db::table('projects')['cols']));
        return [
            'id' => $h['id'], 'code' => $h['code'], 'name' => $h['name'], 'status' => $h['status'], 'deadline' => $h['deadline'], 'updatedAt' => $h['updatedAt'],
            'service' => $r['s_title'], 'editor' => $editors[$h['id']] ?? $r['m_name'] ?? null, 'latestVersion' => $latest[$h['id']] ?? null,
            'progress' => status_meta($h['status'])['progress'],
        ];
    }, $rows);
}

/** Scope-checked project row with its relations (client, organization, service, type, manager, members, brief). */
function get_project_row(Actor $actor, string $id): array
{
    $p = require_project($actor, $id);
    $p['client'] = Db::first('clients', ['id' => $p['clientId']], ['cols' => ['id', 'name', 'email', 'companyName', 'organizationId', 'phone']]);
    $p['organization'] = Db::first('organizations', ['id' => $p['organizationId']], ['cols' => ['id', 'name']]);
    $p['service'] = $p['serviceId'] ? Db::first('services', ['id' => $p['serviceId']], ['cols' => ['id', 'title', 'slug']]) : null;
    $p['projectType'] = $p['projectTypeId'] ? Db::first('project_types', ['id' => $p['projectTypeId']], ['cols' => ['id', 'key', 'name', 'onboardingCategories']]) : null;
    $p['manager'] = $p['managerId'] ? Db::first('users', ['id' => $p['managerId']], ['cols' => ['id', 'name', 'email', 'avatarUrl']]) : null;
    $p['members'] = array_map(function ($m) {
        return ['id' => $m['id'], 'projectId' => $m['projectId'], 'userId' => $m['userId'], 'role' => $m['role'], 'user' => ['id' => $m['userId'], 'name' => $m['u_name'], 'email' => $m['u_email'], 'avatarUrl' => $m['u_avatarUrl']]];
    }, Db::rows('SELECT pm.*, u.`name` AS u_name, u.`email` AS u_email, u.`avatarUrl` AS u_avatarUrl FROM `project_members` pm JOIN `users` u ON u.`id` = pm.`userId` WHERE pm.`projectId` = ? ORDER BY pm.`createdAt` ASC', [$id]));
    $p['brief'] = Db::first('project_briefs', ['projectId' => $id]);
    return $p;
}

/** Bare, scope-checked project (no relations) for other services to authorise against. Out-of-scope rows behave as missing. */
function require_project(Actor $actor, string $id): array
{
    [$scope, $params] = scope_project($actor, 'p');
    $row = Db::rowRaw("SELECT p.* FROM `projects` p WHERE p.`id` = ? AND {$scope}", [$id, ...$params]);
    if (!$row) {
        throw not_found('Project');
    }
    return Db::hydrate('projects', $row);
}

/** What has been agreed and paid so far — drives the payment gates of the status machine. */
function payment_gate(string $projectId): array
{
    $quoteAccepted = Db::exists('quotes', ['sql' => "`projectId` = ? AND `status` = 'ACCEPTED'", 'params' => [$projectId]]);
    $contractSigned = Db::exists('contracts', ['sql' => "`projectId` = ? AND `status` = 'SIGNED'", 'params' => [$projectId]]);
    $invoices = Db::rows("SELECT `status`, `kind`, `total`, `amountPaid` FROM `invoices` WHERE `projectId` = ? AND `status` NOT IN ('DRAFT','CANCELLED')", [$projectId]);
    $outstanding = 0;
    $allPaid = count($invoices) > 0;
    $depositPaid = false;
    foreach ($invoices as $i) {
        if ($i['status'] !== 'PAID') {
            $allPaid = false;
            $outstanding += (int)$i['total'] - (int)$i['amountPaid'];
        } elseif (in_array($i['kind'], ['DEPOSIT', 'FULL'], true)) {
            $depositPaid = true;
        }
    }
    return ['quoteAccepted' => $quoteAccepted, 'contractSigned' => $contractSigned, 'depositPaid' => $depositPaid, 'allPaid' => $allPaid, 'outstanding' => $outstanding];
}

function get_project_detail(Actor $actor, string $id): array
{
    $p = get_project_row($actor, $id);
    $staff = $actor->isStaff;
    $gate = payment_gate($id);
    $counts = [
        'assets' => Db::count('assets', ['sql' => '`projectId` = ? AND `deletedAt` IS NULL AND `status` = \'READY\'' . ($staff ? '' : ' AND `visibleToClient` = 1'), 'params' => [$id]]),
        'versions' => Db::count('video_versions', ['sql' => '`projectId` = ?' . ($staff ? '' : ' AND `releasedAt` IS NOT NULL'), 'params' => [$id]]),
        'openRevisions' => Db::count('revision_requests', ['sql' => "`projectId` = ? AND `status` IN ('OPEN','IN_PROGRESS')", 'params' => [$id]]),
        'openTasks' => $staff ? Db::count('tasks', ['sql' => "`projectId` = ? AND `status` <> 'COMPLETE'", 'params' => [$id]]) : 0,
        'openFileRequests' => Db::count('file_requests', ['sql' => "`projectId` = ? AND `status` = 'OPEN'", 'params' => [$id]]),
    ];
    $history = Db::rows('SELECT h.*, u.`name` AS a_name FROM `project_status_changes` h LEFT JOIN `users` u ON u.`id` = h.`actorId` WHERE h.`projectId` = ? ORDER BY h.`createdAt` ASC', [$id]);
    $invoices = Db::rows("SELECT `status`, `total`, `amountPaid` FROM `invoices` WHERE `projectId` = ? AND `status` <> 'DRAFT'", [$id]);
    $status = $p['status'];
    $canMove = $staff && ($actor->can('projects:transition') || $actor->can('versions:upload'));
    $hideBilling = $staff && !$actor->can('invoices:read');
    $brief = $p['brief'];
    $out = [
        'id' => $p['id'], 'code' => $p['code'], 'name' => $p['name'], 'description' => $p['description'], 'status' => $status, 'priority' => $p['priority'],
        'deadline' => $p['deadline'], 'startDate' => $p['startDate'], 'completionDate' => $p['completionDate'], 'deliveredAt' => $p['deliveredAt'],
        'createdAt' => $p['createdAt'], 'updatedAt' => $p['updatedAt'], 'scope' => $p['scope'] ?? FEP_DEFAULT_SCOPE,
        'revisionLimit' => $p['revisionLimit'], 'revisionsUsed' => $p['revisionsUsed'], 'currency' => $p['currency'],
        'client' => $p['client'], 'organization' => $p['organization'], 'service' => $p['service'], 'projectType' => $p['projectType'], 'manager' => $p['manager'],
        'members' => array_map(fn($m) => ['id' => $m['id'], 'role' => $m['role'], 'user' => $m['user']], $p['members']),
        'brief' => $brief ? ['status' => $brief['status'], 'version' => $brief['version'], 'confirmedAt' => $brief['confirmedAt'], 'lockedAt' => $brief['lockedAt'], 'content' => $brief['content']] : null,
        // staff without billing access (e.g. editors) never see payment state or amounts
        'paymentState' => $hideBilling ? 'NONE' : payment_state_of(array_map(fn($i) => ['status' => $i['status'], 'total' => (int)$i['total'], 'amountPaid' => (int)$i['amountPaid']], $invoices)),
        'gate' => $hideBilling ? array_merge($gate, ['outstanding' => 0]) : $gate,
        'counts' => $counts,
        'history' => array_map(fn($h) => ['id' => $h['id'], 'from' => $h['fromStatus'], 'to' => $h['toStatus'], 'at' => iso_dt(ts_ms($h['createdAt'])), 'by' => $h['a_name'] ?? 'System', 'comment' => $h['comment'], 'override' => $staff ? (bool)$h['override'] : false], $history),
        'allowedNext' => $canMove ? transitions_from($status) : [],
    ];
    if ($staff && $actor->can('profitability:read')) {
        $out['internalCost'] = $p['internalCost'];
    }
    if ($staff) {
        $out += ['rushFee' => $p['rushFee'], 'gateOverride' => $p['gateOverride'], 'tags' => $p['tags'], 'retainerId' => $p['retainerId']];
    }
    return $out;
}

/** Quotes, contracts and invoices attached to one project, scoped to what this actor may see. */
function project_documents(Actor $actor, string $projectId): array
{
    require_project($actor, $projectId);
    $fetch = function (string $table, string $alias, array $scope, string $cols) use ($projectId) {
        [$s, $p] = $scope;
        return Db::hydrateAll($table, Db::rows("SELECT {$cols} FROM `{$table}` {$alias} WHERE {$alias}.`projectId` = ? AND {$s} ORDER BY {$alias}.`createdAt` DESC", [$projectId, ...$p]));
    };
    $quotes = (!$actor->isStaff || $actor->can('quotes:read')) ? $fetch('quotes', 'q', scope_quote($actor, 'q'), 'q.`id`, q.`number`, q.`title`, q.`status`, q.`total`, q.`currency`, q.`validUntil`, q.`createdAt`') : [];
    $contracts = (!$actor->isStaff || $actor->can('contracts:read')) ? $fetch('contracts', 'ct', scope_contract($actor, 'ct'), 'ct.`id`, ct.`number`, ct.`title`, ct.`status`, ct.`signedAt`, ct.`createdAt`') : [];
    $invoices = (!$actor->isStaff || $actor->can('invoices:read')) ? $fetch('invoices', 'i', scope_invoice($actor, 'i'), 'i.`id`, i.`number`, i.`kind`, i.`status`, i.`total`, i.`amountPaid`, i.`currency`, i.`dueDate`, i.`createdAt`') : [];
    return ['quotes' => $quotes, 'contracts' => $contracts, 'invoices' => $invoices];
}

// ───────────────────────────── update ─────────────────────────────

/** $patch: name, description, priority, deadline, scope (partial), revisionLimit, tags, serviceId, internalCost, rushFee (only keys present are applied) */
function update_project(Actor $actor, string $id, array $patch): array
{
    assert_can($actor, 'projects:write');
    $before = require_project($actor, $id);
    $data = [];
    foreach (['name', 'description', 'priority', 'deadline', 'revisionLimit', 'tags', 'serviceId', 'internalCost', 'rushFee'] as $k) {
        if (array_key_exists($k, $patch)) {
            $data[$k] = $patch[$k];
        }
    }
    if (!empty($patch['serviceId'])) {
        // a service from another workspace can never be attached
        if (!Db::exists('services', ['id' => $patch['serviceId'], 'workspaceId' => $actor->workspaceId])) {
            throw not_found('Service');
        }
    }
    if (isset($patch['scope']) && is_array($patch['scope'])) {
        $data['scope'] = array_merge($before['scope'] ?? FEP_DEFAULT_SCOPE, $patch['scope']);
        if (isset($patch['scope']['revisionRounds'])) {
            $data['revisionLimit'] = (int)$patch['scope']['revisionRounds'];
        }
    }
    if (($patch['priority'] ?? null) === 'URGENT' && $before['priority'] !== 'URGENT' && $before['rushFee'] === null) {
        $wf = get_setting($actor->workspaceId, 'workflow');
        $quote = Db::first('quotes', ['projectId' => $id, 'status' => 'ACCEPTED'], ['order' => '`createdAt` DESC']);
        if ($quote) {
            $data['rushFee'] = (int)round(($quote['total'] * $wf['rushFeePercent']) / 100);
        }
    }
    Db::update('projects', ['id' => $id], $data);
    $p = Db::first('projects', ['id' => $id]);
    $changes = [];
    if (!empty($patch['priority']) && $patch['priority'] !== $before['priority']) {
        $changes[] = "priority {$before['priority']} → {$patch['priority']}";
    }
    if (array_key_exists('deadline', $patch) && to_db_dt($patch['deadline']) !== to_db_dt($before['deadline'])) {
        $changes[] = 'deadline updated';
    }
    if ($changes) {
        audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'project.updated', 'entityType' => 'project', 'entityId' => $id, 'message' => "{$actor->name} updated {$before['code']}: " . implode(', ', $changes)]);
        log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'project.updated', 'message' => "{$actor->name} updated the project (" . implode(', ', $changes) . ')', 'projectId' => $id, 'visibility' => array_key_exists('deadline', $patch) ? 'CLIENT' : 'INTERNAL']);
    }
    return $p;
}

// ───────────────────────────── status machine ─────────────────────────────

/** Statuses an editor (without projects:transition) may set on assigned projects. */
const FEP_EDITOR_MOVES = ['EDITING', 'INTERNAL_REVIEW', 'CLIENT_REVIEW', 'AWAITING_ASSETS'];

function gate_reason(string $projectId, string $from, string $to, string $workspaceId): ?string
{
    $g = payment_gate($projectId);
    if ($from === 'AWAITING_QUOTE' && $to === 'AWAITING_CONTRACT' && !$g['quoteAccepted']) {
        return "The client hasn't accepted a quote yet.";
    }
    if ($from === 'AWAITING_CONTRACT' && $to === 'AWAITING_PAYMENT' && !$g['contractSigned']) {
        return "The contract hasn't been signed yet.";
    }
    if ($from === 'AWAITING_PAYMENT' && $to === 'ONBOARDING' && !$g['depositPaid']) {
        return "The deposit/initial invoice hasn't been paid yet.";
    }
    if ($to === 'APPROVED' && !Db::count('video_versions', ['projectId' => $projectId, 'reviewStatus' => 'APPROVED'])) {
        return 'No video version has been approved by the client yet.';
    }
    if ($to === 'DELIVERED') {
        $wf = get_setting($workspaceId, 'workflow');
        $deliverables = Db::count('assets', ['sql' => "`projectId` = ? AND `isDeliverable` = 1 AND `visibleToClient` = 1 AND `deletedAt` IS NULL AND `status` = 'READY'", 'params' => [$projectId]]);
        if (!$deliverables) {
            return 'Publish at least one final deliverable to the client first.';
        }
        if (!empty($wf['requirePaymentBeforeDelivery']) && !$g['allPaid'] && $g['outstanding'] > 0) {
            return 'There are unpaid invoices on this project.';
        }
    }
    return null;
}

/**
 * The ONE place a project status changes. Enforces the strict machine + payment/approval gates.
 * `override` (admin only) bypasses the machine/gates and is recorded on the status change and in the audit log.
 * $opts: comment?, override?, workspaceId?, quiet? (skip the generic status_changed event when the caller emits a more specific one)
 */
function apply_transition(mixed $who, string $projectId, string $to, array $opts = []): array
{
    $project = Db::first('projects', ['id' => $projectId]);
    if (!$project) {
        throw not_found('Project');
    }
    if (!in_array($to, project_statuses(), true)) {
        throw bad_request('Unknown status.');
    }
    $workspaceId = $project['workspaceId'];
    $from = $project['status'];
    if ($from === $to) {
        return $project;
    }
    $legal = can_transition($from, $to);
    $gate = ($legal || !empty($opts['override'])) ? gate_reason($projectId, $from, $to, $workspaceId) : null;
    $overridden = false;
    if (!$legal || $gate) {
        if (empty($opts['override'])) {
            if (!$legal) {
                $allowed = implode(', ', array_map(fn($s) => status_meta($s)['label'], transitions_from($from))) ?: 'none';
                throw new AppError('INVALID_TRANSITION', 'A project can\'t move from “' . status_meta($from)['label'] . '” to “' . status_meta($to)['label'] . "”. Allowed next steps: {$allowed}.");
            }
            throw new AppError('GATED', "{$gate} An admin can override this if needed.");
        }
        $overridden = true;
    }

    $now = now_ms();
    $data = ['status' => $to];
    if ($to === 'ONBOARDING' && !$project['startDate']) {
        $data['startDate'] = $now;
    }
    if (in_array($to, ['ONBOARDING', 'AWAITING_ASSETS', 'QUEUED'], true)) {
        $data['clientVisible'] = true;
    }
    if ($to === 'EDITING' && !$project['startDate']) {
        $data['startDate'] = $now;
    }
    if ($to === 'APPROVED') {
        $data['completionDate'] = $now;
    }
    if ($to === 'DELIVERED') {
        $data['deliveredAt'] = $now;
    }
    if ($overridden) {
        $data['gateOverride'] = true;
    }
    if ($to === 'ONBOARDING' && !$project['deadline']) {
        $scope = $project['scope'] ?? FEP_DEFAULT_SCOPE;
        $data['deadline'] = add_business_days_ms($now, (int)($scope['turnaroundBusinessDays'] ?? 0) ?: 5);
    }

    Db::tx(function () use ($projectId, $data, $from, $to, $who, $opts, $overridden) {
        // compare-and-swap on the previous status: two concurrent moves cannot both succeed
        if (Db::exec('UPDATE `projects` SET `status` = ? WHERE `id` = ? AND `status` = ?', [$to, $projectId, $from]) !== 1) {
            throw new AppError('CONFLICT', 'This project was just updated by someone else. Refresh and try again.');
        }
        unset($data['status']);
        if ($data) {
            Db::update('projects', ['id' => $projectId], $data);
        }
        Db::insert('project_status_changes', ['projectId' => $projectId, 'fromStatus' => $from, 'toStatus' => $to, 'actorId' => who_id($who), 'comment' => $opts['comment'] ?? null, 'override' => $overridden], false);
    });

    // production has started → brief locks; further scope changes become Change Requests
    if (in_array($to, production_started(), true)) {
        Db::exec("UPDATE `project_briefs` SET `status` = 'LOCKED', `lockedAt` = ? WHERE `projectId` = ? AND `status` <> 'LOCKED'", [db_dt($now), $projectId]);
    }

    $fromLabel = status_meta($from)['label'];
    $toLabel = status_meta($to)['label'];
    $name = who_name($who);
    audit($who, [
        'workspaceId' => $workspaceId, 'action' => $overridden ? 'project.status_override' : 'project.status_changed', 'entityType' => 'project', 'entityId' => $projectId,
        'message' => "{$name} changed project status from {$fromLabel} to {$toLabel}" . ($overridden ? ' (admin override)' : ''),
        'metadata' => ['from' => $from, 'to' => $to, 'override' => $overridden, 'gate' => $gate],
    ]);
    log_activity($who, [
        'workspaceId' => $workspaceId, 'type' => 'project.status_changed', 'message' => "{$name} moved the project to {$toLabel}" . (!empty($opts['comment']) ? " — {$opts['comment']}" : ''),
        'projectId' => $projectId, 'clientId' => $project['clientId'], 'visibility' => $to === 'INTERNAL_REVIEW' ? 'INTERNAL' : 'CLIENT', 'metadata' => ['from' => $from, 'to' => $to],
    ]);

    // side effects of specific transitions
    $base = ['workspaceId' => $workspaceId, 'actorId' => who_id($who), 'projectId' => $projectId, 'clientId' => $project['clientId']];
    if ($to === 'ONBOARDING') {
        create_required_asset_requests($projectId, $who);
        emit('project.activated', $base);
    }
    if ($to === 'APPROVED') {
        emit('project.approved', $base);
    }
    if ($to === 'DELIVERED') {
        emit('project.delivered', $base);
        $wf = get_setting($workspaceId, 'workflow');
        if (!empty($wf['testimonialRequestOnDelivery'])) {
            request_testimonial($projectId);
        }
    }
    if (empty($opts['quiet'])) {
        emit('project.status_changed', $base + ['data' => ['from' => $from, 'to' => $to, 'toStatus' => $to, 'toStatusLabel' => $toLabel]]);
    }
    return Db::first('projects', ['id' => $projectId]);
}

/** Public transition API for staff (PMs/admins; editors limited to their working states). */
function transition_project(mixed $who, string $projectId, string $to, array $opts = []): array
{
    if (!is_actor($who)) {
        return apply_transition($who, $projectId, $to, $opts);
    }
    if (!$who->isStaff) {
        throw forbidden();
    }
    require_project($who, $projectId);
    $allowedFull = $who->can('projects:transition');
    $allowedEditor = $who->can('versions:upload') && in_array($to, FEP_EDITOR_MOVES, true);
    if (!$allowedFull && !$allowedEditor) {
        throw forbidden("You can't change this project's status.");
    }
    if (!empty($opts['override']) && !$who->can('deliverables:override')) {
        throw forbidden('Only admins can override status rules.');
    }
    return apply_transition($who, $projectId, $to, $opts);
}

function create_required_asset_requests(string $projectId, mixed $who): void
{
    $p = Db::first('projects', ['id' => $projectId], ['cols' => ['scope', 'workspaceId']]);
    $required = $p['scope']['requiredAssets'] ?? [];
    $by = is_actor($who) ? $who->userId : Db::val(
        "SELECT u.`id` FROM `users` u WHERE u.`workspaceId` = ? AND u.`isStaff` = 1 AND EXISTS (SELECT 1 FROM `user_roles` ur JOIN `roles` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = u.`id` AND r.`key` IN ('super_admin','admin')) LIMIT 1",
        [$p['workspaceId']],
    );
    if (!$by) {
        return;
    }
    foreach ($required as $title) {
        if (!Db::count('file_requests', ['projectId' => $projectId, 'title' => $title])) {
            Db::insert('file_requests', ['workspaceId' => $p['workspaceId'], 'projectId' => $projectId, 'requestedById' => $by, 'title' => $title], false);
        }
    }
}

/** Client says "I've uploaded everything" → project can be queued for an editor. */
function mark_assets_ready(Actor $actor, string $projectId): array
{
    $p = require_project($actor, $projectId);
    assert_org_action($actor, $p['organizationId'], 'upload');
    if (!in_array($p['status'], ['ONBOARDING', 'AWAITING_ASSETS'], true)) {
        throw bad_request("This project isn't waiting for files.");
    }
    $ready = (int)Db::val(
        "SELECT COUNT(*) FROM `assets` a JOIN `asset_folders` f ON f.`id` = a.`folderId` WHERE a.`projectId` = ? AND a.`deletedAt` IS NULL AND a.`status` = 'READY' AND f.`key` IN ('raw-footage','audio','voiceovers')",
        [$projectId],
    );
    if (!$ready) {
        throw bad_request('Upload at least one footage or audio file first.');
    }
    apply_transition($actor, $projectId, 'QUEUED', ['comment' => 'Client confirmed all assets are uploaded', 'quiet' => true]);
    emit('assets.ready', ['workspaceId' => $actor->workspaceId, 'actorId' => $actor->userId, 'projectId' => $projectId, 'clientId' => $p['clientId']]);
    return ['ok' => true];
}

// ───────────────────────────── team assignment ─────────────────────────────

/** $input: managerId? (null clears), editorIds?, motionDesignerIds?, reviewerIds? — only the roles present are touched. */
function assign_project(Actor $actor, string $projectId, array $input): array
{
    assert_can($actor, 'projects:assign');
    $p = require_project($actor, $projectId);
    $wanted = [];
    foreach ([['editorIds', 'EDITOR'], ['motionDesignerIds', 'MOTION_DESIGNER'], ['reviewerIds', 'REVIEWER']] as [$key, $role]) {
        foreach ($input[$key] ?? [] as $userId) {
            $wanted[] = ['userId' => $userId, 'role' => $role];
        }
    }
    if (!empty($input['managerId'])) {
        $wanted[] = ['userId' => $input['managerId'], 'role' => 'MANAGER'];
    }
    $ids = array_values(array_unique(array_column($wanted, 'userId')));
    $users = [];
    if ($ids) {
        [$ph, $pp] = Db::in($ids);
        $users = Db::rows("SELECT `id`, `name` FROM `users` WHERE `id` IN {$ph} AND `workspaceId` = ? AND `isStaff` = 1 AND `status` <> 'SUSPENDED'", [...$pp, $actor->workspaceId]);
    }
    if (count($users) !== count($ids)) {
        throw bad_request('You can only assign active team members.');
    }
    $rolesTouched = [];
    foreach ([['editorIds', 'EDITOR'], ['motionDesignerIds', 'MOTION_DESIGNER'], ['reviewerIds', 'REVIEWER']] as [$key, $role]) {
        if (array_key_exists($key, $input)) {
            $rolesTouched[] = $role;
        }
    }
    if (array_key_exists('managerId', $input)) {
        $rolesTouched[] = 'MANAGER';
    }
    $existing = $rolesTouched ? Db::find('project_members', ['projectId' => $projectId, 'role' => $rolesTouched]) : [];
    $has = fn(array $list, array $w) => (bool)array_filter($list, fn($e) => $e['userId'] === $w['userId'] && $e['role'] === $w['role']);
    $newOnes = array_values(array_filter($wanted, fn($w) => !$has($existing, $w)));
    Db::tx(function () use ($existing, $wanted, $has, $newOnes, $input, $projectId) {
        foreach ($existing as $e) {
            if (!$has($wanted, $e)) {
                Db::delete('project_members', ['id' => $e['id']]);
            }
        }
        foreach ($newOnes as $w) {
            Db::insert('project_members', ['projectId' => $projectId, 'userId' => $w['userId'], 'role' => $w['role']], false);
        }
        if (array_key_exists('managerId', $input)) {
            Db::update('projects', ['id' => $projectId], ['managerId' => $input['managerId']]);
        }
    });
    $newIds = array_column($newOnes, 'userId');
    $names = array_values(array_map(fn($u) => $u['name'], array_filter($users, fn($u) => in_array($u['id'], $newIds, true))));
    if ($newOnes) {
        audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'project.assigned', 'entityType' => 'project', 'entityId' => $projectId, 'message' => "{$actor->name} assigned " . implode(', ', $names) . " to {$p['code']}"]);
        log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'project.assigned', 'message' => "{$actor->name} assigned " . implode(', ', $names), 'projectId' => $projectId, 'visibility' => 'INTERNAL']);
        // notify only the people who were just added
        notify([
            'workspaceId' => $actor->workspaceId, 'userIds' => $newIds, 'exclude' => [$actor->userId], 'category' => 'PROJECT', 'type' => 'project.assigned',
            'title' => "You've been assigned to {$p['name']}", 'message' => "{$p['code']} · assigned by {$actor->name}", 'link' => "/editor/projects/{$projectId}",
            'email' => true, 'emailTemplate' => 'project_assigned',
            'emailVars' => ['project_name' => $p['name'], 'project_id' => $p['code'], 'project_url' => absolute_url("/editor/projects/{$projectId}")],
        ]);
        emit('project.assigned', ['workspaceId' => $actor->workspaceId, 'actorId' => $actor->userId, 'projectId' => $projectId, 'clientId' => $p['clientId']]);
    }
    return ['assigned' => $names];
}

function list_assignable(Actor $actor): array
{
    assert_can($actor, 'projects:assign');
    $users = Db::rows("SELECT `id`, `name` FROM `users` WHERE `workspaceId` = ? AND `isStaff` = 1 AND `status` <> 'SUSPENDED' ORDER BY `name` ASC", [$actor->workspaceId]);
    $roles = [];
    foreach (Db::rows('SELECT ur.`userId`, r.`key`, r.`name` FROM `user_roles` ur JOIN `roles` r ON r.`id` = ur.`roleId`') as $r) {
        $roles[$r['userId']][] = $r;
    }
    return array_map(fn($u) => [
        'id' => $u['id'], 'name' => $u['name'],
        'roles' => array_column($roles[$u['id']] ?? [], 'key'), 'roleNames' => array_column($roles[$u['id']] ?? [], 'name'),
    ], $users);
}

// ───────────────────────────── timeline & milestones ─────────────────────────────

function project_timeline(Actor $actor, string $projectId, array $opts = []): array
{
    require_project($actor, $projectId);
    $rows = Db::rows(
        'SELECT a.*, u.`name` AS a_name FROM `activity_logs` a LEFT JOIN `users` u ON u.`id` = a.`actorId` WHERE a.`projectId` = ?' . ($actor->isStaff ? '' : " AND a.`visibility` = 'CLIENT'") . ' ORDER BY a.`createdAt` DESC LIMIT ' . (int)($opts['limit'] ?? 60),
        [$projectId],
    );
    return array_map(fn($r) => ['id' => $r['id'], 'type' => $r['type'], 'message' => $r['message'], 'at' => iso_dt(ts_ms($r['createdAt'])), 'by' => $r['a_name'] ?? 'System', 'internal' => $r['visibility'] === 'INTERNAL'], $rows);
}

/** Visual milestone tracker, derived from real status history, versions and revision rounds. */
function project_milestones(Actor $actor, string $projectId): array
{
    require_project($actor, $projectId);
    $changes = Db::rows('SELECT h.*, u.`name` AS a_name FROM `project_status_changes` h LEFT JOIN `users` u ON u.`id` = h.`actorId` WHERE h.`projectId` = ? ORDER BY h.`createdAt` ASC', [$projectId]);
    $versions = Db::rows('SELECT v.*, u.`name` AS c_name FROM `video_versions` v LEFT JOIN `users` u ON u.`id` = v.`createdById` WHERE v.`projectId` = ?' . ($actor->isStaff ? '' : ' AND v.`releasedAt` IS NOT NULL') . ' ORDER BY v.`versionNumber` ASC', [$projectId]);
    $revisions = Db::rows('SELECT r.*, u.`name` AS s_name FROM `revision_requests` r JOIN `users` u ON u.`id` = r.`submittedById` WHERE r.`projectId` = ? ORDER BY r.`createdAt` ASC', [$projectId]);
    $firstAsset = Db::rowRaw(
        "SELECT a.`createdAt`, u.`name` AS u_name FROM `assets` a JOIN `asset_folders` f ON f.`id` = a.`folderId` LEFT JOIN `users` u ON u.`id` = a.`uploadedById`
         WHERE a.`projectId` = ? AND a.`status` = 'READY' AND a.`deletedAt` IS NULL AND f.`key` IN ('raw-footage','audio') ORDER BY a.`createdAt` ASC LIMIT 1",
        [$projectId],
    );
    $firstTo = function (string $s) use ($changes) {
        foreach ($changes as $c) {
            if ($c['toStatus'] === $s) {
                return $c;
            }
        }
        return null;
    };
    $iso = fn($v) => $v ? iso_dt(ts_ms($v)) : null;
    $m = fn(string $key, string $label, $at = null, $by = null, $comment = null) => ['key' => $key, 'label' => $label, 'done' => (bool)$at, 'at' => $at ? $iso($at) : null, 'by' => $by, 'comment' => $comment];
    $started = $firstTo('ONBOARDING') ?? $firstTo('QUEUED');
    $editing = $firstTo('EDITING');
    $firstDraft = null;
    foreach ($versions as $v) {
        if ($v['releasedAt']) {
            $firstDraft = $v;
            break;
        }
    }
    $clientReview = $firstTo('CLIENT_REVIEW');
    $approved = $firstTo('APPROVED');
    $delivered = $firstTo('DELIVERED');
    $out = [
        $m('started', 'Project Started', $started['createdAt'] ?? null, $started ? ($started['a_name'] ?? 'System') : null, $started['comment'] ?? null),
        $m('assets', 'Assets Received', $firstAsset['createdAt'] ?? null, $firstAsset['u_name'] ?? null),
        $m('editing', 'Editing Started', $editing['createdAt'] ?? null, $editing ? ($editing['a_name'] ?? 'System') : null, $editing['comment'] ?? null),
        $m('draft', 'First Draft', $firstDraft['releasedAt'] ?? null, $firstDraft['c_name'] ?? null, $firstDraft['notes'] ?? null),
        $m('review', 'Client Review', $clientReview['createdAt'] ?? null, $clientReview ? ($clientReview['a_name'] ?? 'System') : null),
    ];
    foreach ($revisions as $i => $r) {
        $out[] = $m('rev-' . $r['id'], 'Revision ' . ($i + 1), $r['resolvedAt'] ?? $r['createdAt'], $r['s_name'], $r['resolvedAt'] ? 'Completed' : 'Requested');
    }
    $out[] = $m('approved', 'Approved', $approved['createdAt'] ?? null, $approved['a_name'] ?? null, $approved['comment'] ?? null);
    $out[] = $m('delivered', 'Delivered', $delivered['createdAt'] ?? null, $delivered ? ($delivered['a_name'] ?? 'System') : null);
    return $out;
}
