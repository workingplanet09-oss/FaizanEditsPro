<?php
/** Retainers: monthly plans with an allowance of videos / shorts / hours, auto-renewed and invoiced by the daily sweep. */
defined('FEP') or exit;

function scoped_retainer_row(Actor $actor, string $id): array
{
    [$s, $p] = scope_retainer($actor, 'r');
    $row = Db::rowRaw("SELECT r.* FROM `retainers` r WHERE r.`id` = ? AND {$s}", [$id, ...$p]);
    if (!$row) {
        throw not_found('Retainer');
    }
    return Db::hydrate('retainers', $row);
}

/** $in: clientId, planId?, name, monthlyPrice, currency?, videosIncluded?, shortsIncluded?, hoursIncluded?, turnaroundDays?, revisionsIncluded?, startDate?, notes? */
function create_retainer(Actor $actor, array $in): array
{
    assert_can($actor, 'retainers:manage');
    $client = Db::first('clients', ['id' => $in['clientId'], 'workspaceId' => $actor->workspaceId]);
    if (!$client) {
        throw not_found('Client');
    }
    if (!empty($in['planId']) && !Db::exists('pricing_plans', ['id' => $in['planId'], 'workspaceId' => $actor->workspaceId])) {
        throw not_found('Plan');
    }
    $business = get_setting($actor->workspaceId, 'business');
    $start = ts_ms($in['startDate'] ?? null) ?? now_ms();
    $r = Db::insert('retainers', [
        'workspaceId' => $actor->workspaceId, 'organizationId' => $client['organizationId'], 'clientId' => $client['id'], 'planId' => $in['planId'] ?? null, 'name' => $in['name'],
        'monthlyPrice' => (int)$in['monthlyPrice'], 'currency' => strtoupper($in['currency'] ?? $business['defaultCurrency']), 'videosIncluded' => $in['videosIncluded'] ?? 0,
        'shortsIncluded' => $in['shortsIncluded'] ?? 0, 'hoursIncluded' => $in['hoursIncluded'] ?? 0, 'turnaroundDays' => $in['turnaroundDays'] ?? 5, 'revisionsIncluded' => $in['revisionsIncluded'] ?? 2,
        'startDate' => $start, 'renewalDate' => add_months_ms($start, 1), 'notes' => $in['notes'] ?? null, 'isDemo' => $client['isDemo'],
    ]);
    Db::update('clients', ['id' => $client['id']], ['status' => 'RETAINER']);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'retainer.created', 'entityType' => 'retainer', 'entityId' => $r['id'], 'message' => "{$actor->name} started retainer “{$r['name']}” for {$client['companyName']} (" . money($r['monthlyPrice'], $r['currency']) . '/mo)']);
    return $r;
}

/** $patch keys present are applied: planId, name, monthlyPrice, currency, videosIncluded, shortsIncluded, hoursIncluded, turnaroundDays, revisionsIncluded, startDate, notes, status, renewalDate */
function update_retainer(Actor $actor, string $id, array $patch): array
{
    assert_can($actor, 'retainers:manage');
    $r = scoped_retainer_row($actor, $id);
    $data = [];
    foreach (['name', 'monthlyPrice', 'videosIncluded', 'shortsIncluded', 'hoursIncluded', 'turnaroundDays', 'revisionsIncluded', 'startDate', 'notes', 'status', 'renewalDate'] as $k) {
        if (array_key_exists($k, $patch)) {
            $data[$k] = $patch[$k];
        }
    }
    if (!empty($patch['currency'])) {
        $data['currency'] = strtoupper($patch['currency']);
    }
    if (array_key_exists('planId', $patch)) {
        if ($patch['planId'] && !Db::exists('pricing_plans', ['id' => $patch['planId'], 'workspaceId' => $actor->workspaceId])) {
            throw not_found('Plan');
        }
        $data['planId'] = $patch['planId'];
    }
    Db::update('retainers', ['id' => $id], $data);
    if (!empty($patch['status']) && $patch['status'] !== $r['status']) {
        audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'retainer.status_changed', 'entityType' => 'retainer', 'entityId' => $id, 'message' => "{$actor->name} set retainer “{$r['name']}” to {$patch['status']}"]);
        $active = Db::count('retainers', ['clientId' => $r['clientId'], 'status' => 'ACTIVE']);
        Db::update('clients', ['id' => $r['clientId']], ['status' => $active ? 'RETAINER' : 'ACTIVE']);
    }
    return Db::first('retainers', ['id' => $id]);
}

/** $q: status?, clientId? */
function list_retainers(Actor $actor, array $q = []): array
{
    if ($actor->isStaff && !$actor->can('retainers:manage') && !$actor->can('clients:read')) {
        throw forbidden();
    }
    [$s, $p] = scope_retainer($actor, 'r');
    $where = [$s];
    foreach (['status' => 'r.`status`', 'clientId' => 'r.`clientId`'] as $k => $col) {
        if (!empty($q[$k])) {
            $where[] = "{$col} = ?";
            $p[] = $q[$k];
        }
    }
    $w = implode(' AND ', array_map(fn($x) => "({$x})", $where));
    $rows = Db::rows("SELECT r.*, c.`id` AS c_id, c.`companyName` AS c_companyName, c.`name` AS c_name FROM `retainers` r JOIN `clients` c ON c.`id` = r.`clientId` WHERE {$w} ORDER BY r.`status` ASC, r.`renewalDate` ASC", $p);
    return array_map(function ($row) {
        $r = Db::hydrate('retainers', array_intersect_key($row, Db::table('retainers')['cols']));
        $r['client'] = ['id' => $row['c_id'], 'companyName' => $row['c_companyName'], 'name' => $row['c_name']];
        $r['usage'] = retainer_allowance($r['id']);
        return $r;
    }, $rows);
}

/** Scope-checked usage view for a single retainer (the API entry point). */
function get_retainer_usage(Actor $actor, string $id): array
{
    scoped_retainer_row($actor, $id);
    return retainer_allowance($id);
}

function retainer_period_start(string $renewalDate): int { return add_months_ms((int)ts_ms($renewalDate), -1); }

/** "You have used 7 of 12 included edits this month." (internal — callers must have authorised the retainer first) */
function retainer_allowance(string $retainerId): array
{
    $r = Db::first('retainers', ['id' => $retainerId]) ?? throw not_found('Retainer');
    $periodStart = retainer_period_start($r['renewalDate']);
    $sum = [];
    foreach (Db::rows('SELECT `kind`, SUM(`quantity`) AS q FROM `retainer_usage` WHERE `retainerId` = ? AND `periodStart` = ? GROUP BY `kind`', [$retainerId, db_dt($periodStart)]) as $u) {
        $sum[$u['kind']] = (float)$u['q'];
    }
    $upcoming = Db::rows("SELECT `id`, `name`, `code`, `status`, `deadline` FROM `projects` WHERE `retainerId` = ? AND `status` NOT IN ('DELIVERED','ARCHIVED','CANCELLED') ORDER BY `deadline` IS NULL, `deadline` ASC LIMIT 10", [$retainerId]);
    $used = ['videos' => $sum['VIDEO'] ?? 0, 'shorts' => $sum['SHORT'] ?? 0, 'hours' => $sum['HOURS'] ?? 0];
    $num = fn($v) => $v == (int)$v ? (int)$v : $v;
    return [
        'periodStart' => iso_dt($periodStart), 'renewalDate' => $r['renewalDate'],
        'included' => ['videos' => $r['videosIncluded'], 'shorts' => $r['shortsIncluded'], 'hours' => $r['hoursIncluded']],
        'used' => array_map($num, $used),
        'remaining' => ['videos' => max(0, $num($r['videosIncluded'] - $used['videos'])), 'shorts' => max(0, $num($r['shortsIncluded'] - $used['shorts'])), 'hours' => max(0, $num($r['hoursIncluded'] - $used['hours']))],
        'upcoming' => array_map(fn($u) => Db::hydrate('projects', $u), $upcoming),
    ];
}

/** $in: retainerId, projectId?, kind (VIDEO|SHORT|HOURS), quantity?, note? */
function record_retainer_usage(array $in): array
{
    $r = Db::first('retainers', ['id' => $in['retainerId']]) ?? throw not_found('Retainer');
    return Db::insert('retainer_usage', ['retainerId' => $r['id'], 'projectId' => $in['projectId'] ?? null, 'periodStart' => retainer_period_start($r['renewalDate']), 'kind' => $in['kind'], 'quantity' => $in['quantity'] ?? 1, 'note' => $in['note'] ?? null]);
}

/**
 * Starts a project against a retainer's allowance. Within allowance it skips quote/contract/payment (already covered by the
 * monthly fee); beyond allowance it becomes a normal quoted project. $in: name, description?, kind?, deadline?
 */
function start_retainer_project(Actor $actor, string $retainerId, array $in): array
{
    $r = scoped_retainer_row($actor, $retainerId);
    if ($actor->isStaff) {
        assert_can($actor, 'projects:write');
    } else {
        assert_org_action($actor, $r['organizationId'], 'manage_projects');
    }
    if ($r['status'] !== 'ACTIVE') {
        throw new AppError('CONFLICT', 'This retainer is ' . strtolower($r['status']) . '.');
    }
    $allowance = retainer_allowance($retainerId);
    $kind = $in['kind'] ?? 'VIDEO';
    $left = $kind === 'SHORT' ? $allowance['remaining']['shorts'] : $allowance['remaining']['videos'];
    if ($left <= 0) {
        throw new AppError('CONFLICT', "You've used this month's included edits. Message me and I’ll quote the extra work, or wait for your renewal.");
    }
    $project = create_project($actor->isStaff ? $actor : system_actor($actor->name), [
        'clientId' => $r['clientId'], 'name' => $in['name'], 'description' => $in['description'] ?? null, 'status' => 'ONBOARDING', 'clientVisible' => true, 'retainerId' => $retainerId,
        'revisionLimit' => $r['revisionsIncluded'], 'currency' => $r['currency'],
        'scope' => ['turnaroundBusinessDays' => $r['turnaroundDays'], 'revisionRounds' => $r['revisionsIncluded'], 'deliverables' => [['label' => $kind === 'SHORT' ? 'Short-form video' : 'Video edit', 'quantity' => 1]]],
        'deadline' => $in['deadline'] ?? null, 'workspaceId' => $r['workspaceId'],
    ]);
    Db::update('projects', ['id' => $project['id']], ['startDate' => now_ms()]);
    Db::insert('project_status_changes', ['projectId' => $project['id'], 'fromStatus' => 'INQUIRY', 'toStatus' => 'ONBOARDING', 'actorId' => $actor->userId, 'comment' => "Started from retainer “{$r['name']}”"], false);
    emit('project.activated', ['workspaceId' => $r['workspaceId'], 'actorId' => $actor->userId, 'projectId' => $project['id'], 'clientId' => $r['clientId']]);
    return Db::first('projects', ['id' => $project['id']]);
}

/** Sweep: renew retainers on their renewal date and invoice the next month. */
function sweep_retainers(): int
{
    $due = Db::find('retainers', ['sql' => "`status` = 'ACTIVE' AND `renewalDate` <= ?", 'params' => [db_dt()]]);
    foreach ($due as $r) {
        $inv = get_setting($r['workspaceId'], 'invoice');
        $number = $inv['prefix'] . '-' . next_number($r['workspaceId'], 'invoice', 1000);
        $now = now_ms();
        $invoiceId = Db::tx(function () use ($r, $inv, $number, $now) {
            $invoice = Db::insert('invoices', [
                'workspaceId' => $r['workspaceId'], 'organizationId' => $r['organizationId'], 'clientId' => $r['clientId'], 'retainerId' => $r['id'], 'number' => $number, 'kind' => 'RETAINER',
                'currency' => $r['currency'], 'subtotal' => $r['monthlyPrice'], 'total' => $r['monthlyPrice'], 'status' => 'SENT', 'issuedAt' => $now, 'sentAt' => $now,
                'dueDate' => add_days_ms($now, (int)$inv['dueDays']), 'isDemo' => $r['isDemo'],
            ]);
            Db::insert('invoice_items', ['invoiceId' => $invoice['id'], 'description' => "{$r['name']} — monthly retainer", 'quantity' => 1, 'unitPrice' => $r['monthlyPrice'], 'amount' => $r['monthlyPrice'], 'sortOrder' => 0], false);
            Db::update('retainers', ['id' => $r['id']], ['renewalDate' => add_months_ms((int)ts_ms($r['renewalDate']), 1)]);
            return $invoice['id'];
        });
        emit('retainer.renewed', ['workspaceId' => $r['workspaceId'], 'clientId' => $r['clientId'], 'retainerId' => $r['id'], 'invoiceId' => $invoiceId]);
        audit(system_actor('System'), ['workspaceId' => $r['workspaceId'], 'action' => 'retainer.renewed', 'entityType' => 'retainer', 'entityId' => $r['id'], 'message' => "Retainer “{$r['name']}” renewed and invoiced"]);
    }
    return count($due);
}
