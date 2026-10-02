<?php
/** Dashboards and analytics: admin command center, real-data analytics, profitability, team workload, calendar, client & editor home. */
defined('FEP') or exit;

function money_map_add(array &$m, string $cur, int|float $n): void { $m[$cur] = ($m[$cur] ?? 0) + $n; }

function open_status_sql(): string { return "('" . implode("','", open_statuses()) . "')"; }

/** UTC midnight (ms) of the day $offset days from now. */
function utc_day_start(int $offset = 0, ?int $nowMs = null): int
{
    $t = intdiv($nowMs ?? now_ms(), 1000);
    return gmmktime(0, 0, 0, (int)gmdate('n', $t), (int)gmdate('j', $t) + $offset, (int)gmdate('Y', $t)) * 1000;
}

// ═══════════════════════════ ADMIN COMMAND CENTER ═══════════════════════════

function admin_home(Actor $actor): array
{
    assert_can($actor, 'admin:access');
    $ws = $actor->workspaceId;
    $now = now_ms();
    $monthStart = start_of_month_ms($now);
    $canLeads = $actor->can('leads:read');
    $canProjects = $actor->can('projects:read_all');
    $canInvoices = $actor->can('invoices:read');
    $canQuotes = $actor->can('quotes:read');
    [$ps, $pp] = scope_project($actor, 'p');
    $open = open_status_sql();
    $cnt = fn(string $sql, array $params) => (int)Db::val($sql, $params);
    $dt = fn(int $ms) => db_dt($ms);

    $newLeads = $canLeads ? $cnt("SELECT COUNT(*) FROM `leads` WHERE `workspaceId` = ? AND `status` = 'NEW' AND `createdAt` >= ?", [$ws, $dt($now - 14 * 86400000)]) : 0;
    $unassignedNew = $canLeads ? $cnt("SELECT COUNT(*) FROM `leads` WHERE `workspaceId` = ? AND `status` = 'NEW'", [$ws]) : 0;
    $activeClients = $actor->can('clients:read') ? $cnt("SELECT COUNT(*) FROM `clients` WHERE `workspaceId` = ? AND `status` IN ('ACTIVE','RETAINER','ONBOARDING')", [$ws]) : 0;
    $pcount = fn(string $extra, array $params = []) => $canProjects ? $cnt("SELECT COUNT(*) FROM `projects` p WHERE {$ps} AND {$extra}", [...$pp, ...$params]) : 0;
    $activeProjects = $pcount("p.`status` IN ('ONBOARDING','AWAITING_ASSETS','QUEUED','EDITING','INTERNAL_REVIEW','CLIENT_REVIEW','REVISION','FINAL_REVIEW')");
    $dueSoon = $pcount("p.`status` IN {$open} AND p.`deadline` >= ? AND p.`deadline` <= ?", [$dt($now), $dt($now + 3 * 86400000)]);
    $pendingReviews = $pcount("p.`status` IN ('CLIENT_REVIEW','FINAL_REVIEW')");
    $tomorrow = $pcount("p.`status` IN {$open} AND p.`deadline` >= ? AND p.`deadline` < ?", [$dt(utc_day_start(1, $now)), $dt(utc_day_start(2, $now))]);
    $late = $pcount("p.`status` IN {$open} AND p.`deadline` < ?", [$dt($now)]);
    $monthlyRevenue = [];
    $pendingPayments = [];
    $retainerRevenue = [];
    $overdueInvoices = 0;
    if ($canInvoices) {
        foreach (Db::rows("SELECT `currency`, SUM(`amount`) AS s FROM `payments` WHERE `workspaceId` = ? AND `status` = 'SUCCEEDED' AND `paidAt` >= ? GROUP BY `currency`", [$ws, $dt($monthStart)]) as $r) {
            money_map_add($monthlyRevenue, $r['currency'], (int)$r['s']);
        }
        foreach (Db::rows("SELECT `currency`, SUM(`total` - `amountPaid`) AS s FROM `invoices` WHERE `workspaceId` = ? AND `status` IN ('SENT','VIEWED','PARTIALLY_PAID','OVERDUE') GROUP BY `currency`", [$ws]) as $r) {
            money_map_add($pendingPayments, $r['currency'], (int)$r['s']);
        }
        foreach (Db::rows("SELECT `currency`, SUM(`monthlyPrice`) AS s FROM `retainers` WHERE `workspaceId` = ? AND `status` = 'ACTIVE' GROUP BY `currency`", [$ws]) as $r) {
            money_map_add($retainerRevenue, $r['currency'], (int)$r['s']);
        }
        $overdueInvoices = $cnt("SELECT COUNT(*) FROM `invoices` WHERE `workspaceId` = ? AND `status` = 'OVERDUE'", [$ws]);
    }
    $openRevisions = $canProjects ? $cnt("SELECT COUNT(*) FROM `revision_requests` r JOIN `projects` p ON p.`id` = r.`projectId` WHERE r.`workspaceId` = ? AND r.`status` IN ('OPEN','IN_PROGRESS') AND {$ps}", [$ws, ...$pp]) : 0;
    $awaitingQuotes = $canQuotes ? $cnt("SELECT COUNT(*) FROM `quotes` WHERE `workspaceId` = ? AND `status` IN ('SENT','VIEWED')", [$ws]) : 0;
    $byStatus = [];
    if ($canProjects) {
        foreach (Db::rows("SELECT p.`status`, COUNT(*) AS n FROM `projects` p WHERE {$ps} GROUP BY p.`status`", $pp) as $r) {
            $byStatus[$r['status']] = (int)$r['n'];
        }
    }
    $pipeline = array_map(fn($stage) => ['key' => $stage['key'], 'label' => $stage['label'], 'count' => array_sum(array_map(fn($s) => $byStatus[$s] ?? 0, $stage['statuses']))], pipeline_stages());

    $alerts = [];
    $push = function (array $a) use (&$alerts) {
        if ($a['count'] > 0) {
            $alerts[] = $a;
        }
    };
    $is = fn(int $n) => $n === 1 ? 'is' : 'are';
    $push(['key' => 'review', 'tone' => 'warning', 'count' => $pendingReviews, 'text' => pluralize($pendingReviews, 'project') . ' ' . ($pendingReviews === 1 ? 'needs' : 'need') . ' client review', 'href' => '/admin/projects?status=CLIENT_REVIEW,FINAL_REVIEW']);
    $push(['key' => 'overdue-inv', 'tone' => 'danger', 'count' => $overdueInvoices, 'text' => pluralize($overdueInvoices, 'invoice') . ' ' . $is($overdueInvoices) . ' overdue', 'href' => '/admin/invoices?status=OVERDUE']);
    $push(['key' => 'leads', 'tone' => 'info', 'count' => $unassignedNew, 'text' => pluralize($unassignedNew, 'new lead') . ' ' . ($unassignedNew === 1 ? 'requires' : 'require') . ' a response', 'href' => '/admin/leads?section=leads']);
    $push(['key' => 'tomorrow', 'tone' => 'warning', 'count' => $tomorrow, 'text' => pluralize($tomorrow, 'project deadline') . ' ' . $is($tomorrow) . ' tomorrow', 'href' => '/admin/projects?deadline=week&sort=deadline']);
    $push(['key' => 'late', 'tone' => 'danger', 'count' => $late, 'text' => pluralize($late, 'project') . ' ' . $is($late) . ' past deadline', 'href' => '/admin/projects?deadline=overdue']);
    $push(['key' => 'revisions', 'tone' => 'info', 'count' => $openRevisions, 'text' => pluralize($openRevisions, 'revision request') . ' ' . $is($openRevisions) . ' open', 'href' => '/admin/projects?status=REVISION']);
    $push(['key' => 'quotes', 'tone' => 'info', 'count' => $awaitingQuotes, 'text' => pluralize($awaitingQuotes, 'quote') . ' ' . $is($awaitingQuotes) . ' awaiting acceptance', 'href' => '/admin/quotes?status=SENT']);

    $recent = Db::rows(
        'SELECT a.`id`, a.`message`, a.`createdAt`, u.`name` AS by_name, p.`id` AS p_id, p.`name` AS p_name, p.`code` AS p_code FROM `activity_logs` a LEFT JOIN `users` u ON u.`id` = a.`actorId` LEFT JOIN `projects` p ON p.`id` = a.`projectId`
         WHERE a.`workspaceId` = ?' . ($canProjects ? '' : ' AND a.`projectId` IS NULL') . ' ORDER BY a.`createdAt` DESC LIMIT 12',
        [$ws],
    );
    $deadlines = $canProjects ? Db::rows("SELECT p.`id`, p.`name`, p.`code`, p.`deadline`, p.`status`, c.`companyName` FROM `projects` p JOIN `clients` c ON c.`id` = p.`clientId` WHERE {$ps} AND p.`status` IN {$open} AND p.`deadline` IS NOT NULL ORDER BY p.`deadline` ASC LIMIT 8", $pp) : [];
    $unpaid = $canInvoices ? Db::rows("SELECT i.`id`, i.`number`, i.`total`, i.`amountPaid`, i.`currency`, i.`dueDate`, i.`status`, c.`companyName` FROM `invoices` i JOIN `clients` c ON c.`id` = i.`clientId` WHERE i.`workspaceId` = ? AND i.`status` IN ('SENT','VIEWED','PARTIALLY_PAID','OVERDUE') ORDER BY i.`dueDate` ASC LIMIT 6", [$ws]) : [];
    return [
        'metrics' => ['newLeads' => $newLeads, 'activeClients' => $activeClients, 'activeProjects' => $activeProjects, 'dueSoon' => $dueSoon, 'pendingReviews' => $pendingReviews, 'pendingPayments' => (object)$pendingPayments, 'monthlyRevenue' => (object)$monthlyRevenue, 'retainerRevenue' => (object)$retainerRevenue],
        'pipeline' => $pipeline,
        'alerts' => $alerts,
        'recent' => array_map(fn($r) => ['id' => $r['id'], 'message' => $r['message'], 'at' => iso_dt(ts_ms($r['createdAt'])), 'by' => $r['by_name'] ?? 'System', 'project' => $r['p_id'] ? ['id' => $r['p_id'], 'name' => $r['p_name'], 'code' => $r['p_code']] : null], $recent),
        'deadlines' => array_map(fn($d) => ['id' => $d['id'], 'name' => $d['name'], 'code' => $d['code'], 'deadline' => iso_dt(ts_ms($d['deadline'])), 'status' => $d['status'], 'client' => ['companyName' => $d['companyName']], 'label' => relative_deadline($d['deadline'])], $deadlines),
        'unreadMessages' => $actor->can('messages:read') ? recent_unread($actor, 5) : [],
        'unpaid' => array_map(fn($i) => ['id' => $i['id'], 'number' => $i['number'], 'total' => (int)$i['total'], 'amountPaid' => (int)$i['amountPaid'], 'currency' => $i['currency'], 'dueDate' => $i['dueDate'] ? iso_dt(ts_ms($i['dueDate'])) : null, 'status' => $i['status'], 'client' => ['companyName' => $i['companyName']]], $unpaid),
        'perms' => ['leads' => $canLeads, 'projects' => $canProjects, 'invoices' => $canInvoices],
    ];
}

// ═══════════════════════════ ANALYTICS (real data only) ═══════════════════════════

function month_keys(int $from, int $to): array
{
    $out = [];
    $t = intdiv($from, 1000);
    $y = (int)gmdate('Y', $t);
    $m = (int)gmdate('n', $t);
    while (gmmktime(0, 0, 0, $m, 1, $y) * 1000 < $to) {
        $out[] = sprintf('%04d-%02d', $y, $m);
        if (++$m > 12) {
            $m = 1;
            $y++;
        }
    }
    return $out;
}

function monthly_counts(string $table, string $ws, int $from, int $to, array $keys): array
{
    $map = [];
    foreach (Db::rows("SELECT DATE_FORMAT(`createdAt`, '%Y-%m') AS m, COUNT(*) AS n FROM `{$table}` WHERE `workspaceId` = ? AND `createdAt` >= ? AND `createdAt` < ? GROUP BY m", [$ws, db_dt($from), db_dt($to)]) as $r) {
        $map[$r['m']] = (int)$r['n'];
    }
    return array_map(fn($k) => ['month' => $k, 'value' => $map[$k] ?? 0], $keys);
}

/** $range: from?, to? (date-like) */
function analytics_report(Actor $actor, array $range = []): array
{
    assert_can($actor, 'analytics:read');
    $ws = $actor->workspaceId;
    $to = ts_ms($range['to'] ?? null) ?? (now_ms() + 86400000);
    $fromDefault = (function () use ($to) {
        $t = intdiv($to, 1000);
        return gmmktime(0, 0, 0, (int)gmdate('n', $t) - 11, 1, (int)gmdate('Y', $t)) * 1000;
    })();
    $from = ts_ms($range['from'] ?? null) ?? $fromDefault;
    $keys = month_keys($from, $to);
    $business = get_setting($ws, 'business');
    $f = db_dt($from);
    $t = db_dt($to);
    $open = open_status_sql();

    $leadSources = [];
    $labels = array_column(Db::rows('SELECT `id`, `label` FROM `lead_sources`'), 'label', 'id');
    foreach (Db::rows('SELECT `sourceId`, COUNT(*) AS n FROM `leads` WHERE `workspaceId` = ? AND `createdAt` >= ? AND `createdAt` < ? GROUP BY `sourceId`', [$ws, $f, $t]) as $r) {
        $leadSources[] = ['label' => $r['sourceId'] ? ($labels[$r['sourceId']] ?? 'Unknown') : 'Unknown', 'value' => (int)$r['n']];
    }
    usort($leadSources, fn($a, $b) => $b['value'] <=> $a['value']);
    $typeNames = array_column(Db::rows('SELECT `id`, `name` FROM `project_types` WHERE `workspaceId` = ?', [$ws]), 'name', 'id');
    $projectTypes = [];
    foreach (Db::rows('SELECT `projectTypeId`, COUNT(*) AS n FROM `projects` WHERE `workspaceId` = ? AND `createdAt` >= ? AND `createdAt` < ? GROUP BY `projectTypeId`', [$ws, $f, $t]) as $r) {
        $projectTypes[] = ['label' => $r['projectTypeId'] ? ($typeNames[$r['projectTypeId']] ?? 'Other') : 'Unclassified', 'value' => (int)$r['n']];
    }
    usort($projectTypes, fn($a, $b) => $b['value'] <=> $a['value']);

    $payments = Db::rows(
        "SELECT pay.`amount`, pay.`currency`, pay.`paidAt`, s.`title` AS svc FROM `payments` pay JOIN `invoices` i ON i.`id` = pay.`invoiceId` LEFT JOIN `projects` p ON p.`id` = i.`projectId` LEFT JOIN `services` s ON s.`id` = p.`serviceId`
         WHERE pay.`workspaceId` = ? AND pay.`status` = 'SUCCEEDED' AND pay.`paidAt` >= ? AND pay.`paidAt` < ?",
        [$ws, $f, $t],
    );
    $revenueTotals = [];
    $paymentsCount = [];
    $revenueByMonth = [];
    $revenueByService = [];
    foreach ($payments as $p) {
        money_map_add($revenueTotals, $p['currency'], (int)$p['amount']);
        money_map_add($paymentsCount, $p['currency'], 1);
        if ($p['currency'] === $business['defaultCurrency'] && $p['paidAt']) {
            $k = substr(iso_dt(ts_ms($p['paidAt'])), 0, 7);
            $revenueByMonth[$k] = ($revenueByMonth[$k] ?? 0) + (int)$p['amount'];
            $svc = $p['svc'] ?? 'Other';
            $revenueByService[$svc] = ($revenueByService[$svc] ?? 0) + (int)$p['amount'];
        }
    }
    $aov = [];
    foreach ($revenueTotals as $cur => $total) {
        $aov[$cur] = (int)round($total / max(1, $paymentsCount[$cur] ?? 1));
    }
    $delivered = Db::rows("SELECT `startDate`, `deliveredAt` FROM `projects` WHERE `workspaceId` = ? AND `status` IN ('DELIVERED','ARCHIVED') AND `deliveredAt` >= ? AND `deliveredAt` < ?", [$ws, $f, $t]);
    $turnaround = [];
    foreach ($delivered as $d) {
        if ($d['startDate'] && $d['deliveredAt']) {
            $turnaround[] = ((int)ts_ms($d['deliveredAt']) - (int)ts_ms($d['startDate'])) / 86400000;
        }
    }
    $statusMap = [];
    foreach (Db::rows('SELECT `status`, COUNT(*) AS n FROM `projects` WHERE `workspaceId` = ? GROUP BY `status`', [$ws]) as $r) {
        $statusMap[$r['status']] = (int)$r['n'];
    }
    $leadStatus = [];
    foreach (Db::rows('SELECT `status`, COUNT(*) AS n FROM `leads` WHERE `workspaceId` = ? AND `createdAt` >= ? AND `createdAt` < ? GROUP BY `status`', [$ws, $f, $t]) as $r) {
        $leadStatus[$r['status']] = (int)$r['n'];
    }
    $leadTotal = array_sum($leadStatus);
    $leadConverted = $leadStatus['CONVERTED'] ?? 0;
    $inv = Db::rowRaw("SELECT COALESCE(SUM(`total`), 0) AS t, COALESCE(SUM(`amountPaid`), 0) AS p FROM `invoices` WHERE `workspaceId` = ? AND `status` IN ('SENT','VIEWED','PARTIALLY_PAID','OVERDUE')", [$ws]);
    $projectsCreated = (int)Db::val('SELECT COUNT(*) FROM `projects` WHERE `workspaceId` = ? AND `createdAt` >= ? AND `createdAt` < ?', [$ws, $f, $t]);
    $repeat = (int)Db::val('SELECT COUNT(*) FROM (SELECT c.`id` FROM `clients` c JOIN `projects` p ON p.`clientId` = c.`id` WHERE c.`workspaceId` = ? GROUP BY c.`id` HAVING COUNT(p.`id`) > 1) x', [$ws]);
    $rows = [];
    foreach (status_data('STATUS_META') as $key => $meta) {
        if (($statusMap[$key] ?? 0) > 0) {
            $rows[] = ['key' => $key, 'label' => $meta['label'], 'value' => $statusMap[$key]];
        }
    }
    arsort($revenueByService);
    $rbs = [];
    foreach ($revenueByService as $label => $value) {
        $rbs[] = ['label' => $label, 'value' => $value];
    }
    return [
        'range' => ['from' => iso_dt($from), 'to' => iso_dt($to)],
        'defaultCurrency' => $business['defaultCurrency'],
        'leadsByMonth' => monthly_counts('leads', $ws, $from, $to, $keys),
        'clientGrowth' => monthly_counts('clients', $ws, $from, $to, $keys),
        'revenueByMonth' => array_map(fn($k) => ['month' => $k, 'value' => $revenueByMonth[$k] ?? 0], $keys),
        'leadSources' => $leadSources, 'projectTypes' => $projectTypes, 'revenueByService' => $rbs,
        'revenueTotals' => (object)$revenueTotals, 'averageOrderValue' => (object)$aov,
        'activeClients' => (int)Db::val("SELECT COUNT(*) FROM `clients` WHERE `workspaceId` = ? AND `status` IN ('ACTIVE','RETAINER','ONBOARDING')", [$ws]),
        'repeatClients' => $repeat,
        'retainerClients' => (int)Db::val("SELECT COUNT(*) FROM `clients` WHERE `workspaceId` = ? AND `status` = 'RETAINER'", [$ws]),
        'averageTurnaroundDays' => $turnaround ? round(array_sum($turnaround) / count($turnaround), 1) : null,
        'revisionCount' => (int)Db::val('SELECT COUNT(*) FROM `revision_requests` WHERE `workspaceId` = ? AND `createdAt` >= ? AND `createdAt` < ?', [$ws, $f, $t]),
        'projectsCreated' => $projectsCreated, 'projectsCompleted' => count($delivered),
        'overdueProjects' => (int)Db::val("SELECT COUNT(*) FROM `projects` WHERE `workspaceId` = ? AND `status` IN {$open} AND `deadline` < ?", [$ws, db_dt()]),
        'outstanding' => (int)$inv['t'] - (int)$inv['p'],
        'leadConversion' => ['total' => $leadTotal, 'converted' => $leadConverted, 'rate' => $leadTotal ? round(($leadConverted / $leadTotal) * 1000) / 10 : null],
        'statusDistribution' => $rows,
        'hasData' => $leadTotal + $projectsCreated + count($payments) > 0,
    ];
}

function profitability(Actor $actor): array
{
    assert_can($actor, 'profitability:read');
    $ws = $actor->workspaceId;
    $projects = Db::rows(
        "SELECT p.`id`, p.`name`, p.`code`, p.`currency`, p.`internalCost`, c.`companyName` FROM `projects` p JOIN `clients` c ON c.`id` = p.`clientId`
         WHERE p.`workspaceId` = ? AND p.`status` NOT IN ('INQUIRY','AWAITING_QUOTE','CANCELLED') ORDER BY p.`createdAt` DESC LIMIT 60",
        [$ws],
    );
    return array_map(function ($p) {
        $revenue = (int)Db::val('SELECT COALESCE(SUM(`amountPaid`), 0) FROM `invoices` WHERE `projectId` = ? AND `currency` = ?', [$p['id'], $p['currency']]);
        $time = Db::rows('SELECT te.`seconds`, u.`hourlyCost` FROM `time_entries` te JOIN `users` u ON u.`id` = te.`userId` WHERE te.`projectId` = ?', [$p['id']]);
        $seconds = array_sum(array_column($time, 'seconds'));
        $labor = (int)round(array_sum(array_map(fn($t) => ($t['seconds'] / 3600) * ((int)($t['hourlyCost'] ?? 0)), $time)));
        $cost = $labor + (int)($p['internalCost'] ?? 0);
        return [
            'id' => $p['id'], 'code' => $p['code'], 'name' => $p['name'], 'client' => $p['companyName'], 'currency' => $p['currency'], 'revenue' => $revenue, 'cost' => $cost,
            'hours' => round(($seconds / 3600) * 10) / 10, 'margin' => $revenue - $cost, 'marginPct' => $revenue > 0 ? round((($revenue - $cost) / $revenue) * 1000) / 10 : null,
        ];
    }, $projects);
}

function team_workload(Actor $actor): array
{
    assert_can($actor, 'analytics:read');
    $ws = $actor->workspaceId;
    $open = open_status_sql();
    $users = Db::rows(
        "SELECT u.`id`, u.`name` FROM `users` u WHERE u.`workspaceId` = ? AND u.`isStaff` = 1 AND u.`status` = 'ACTIVE'
         AND EXISTS (SELECT 1 FROM `user_roles` ur JOIN `roles` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = u.`id` AND r.`key` IN ('editor','senior_editor','motion_designer','reviewer','project_manager'))",
        [$ws],
    );
    $roles = [];
    foreach (Db::rows('SELECT ur.`userId`, r.`name` FROM `user_roles` ur JOIN `roles` r ON r.`id` = ur.`roleId`') as $r) {
        $roles[$r['userId']][] = $r['name'];
    }
    $rows = array_map(function ($u) use ($ws, $open, $roles) {
        $projects = (int)Db::val("SELECT COUNT(*) FROM `projects` p WHERE p.`workspaceId` = ? AND p.`status` IN {$open} AND EXISTS (SELECT 1 FROM `project_members` pm WHERE pm.`projectId` = p.`id` AND pm.`userId` = ?)", [$ws, $u['id']]);
        $tasks = (int)Db::val("SELECT COUNT(*) FROM `tasks` WHERE `workspaceId` = ? AND `assigneeId` = ? AND `status` <> 'COMPLETE'", [$ws, $u['id']]);
        $secs = (int)Db::val('SELECT COALESCE(SUM(`seconds`), 0) FROM `time_entries` WHERE `workspaceId` = ? AND `userId` = ? AND `startedAt` >= ?', [$ws, $u['id'], db_dt(now_ms() - 30 * 86400000)]);
        return ['id' => $u['id'], 'name' => $u['name'], 'role' => implode(', ', $roles[$u['id']] ?? []), 'projects' => $projects, 'openTasks' => $tasks, 'hours30d' => round(($secs / 3600) * 10) / 10];
    }, $users);
    usort($rows, fn($a, $b) => ($b['projects'] + $b['openTasks']) <=> ($a['projects'] + $a['openTasks']));
    return $rows;
}

// ═══════════════════════════ CALENDAR ═══════════════════════════

/** @return array<int,array{id:string,title:string,kind:string,at:string,end?:string,href?:?string,allDay?:bool}> */
function calendar_events(Actor $actor, mixed $from, mixed $to): array
{
    [$ps, $pp] = scope_project($actor, 'p');
    $ws = $actor->workspaceId;
    $f = (int)ts_ms($from);
    $t = (int)ts_ms($to);
    $fd = db_dt($f);
    $td = db_dt($t);
    $staffAll = $actor->can('leads:read');
    $base = ($actor->isStaff && $actor->can('admin:access')) ? '/admin' : '/editor';
    $iso = fn($v) => iso_dt(ts_ms($v));
    $ev = [];
    foreach (Db::rows("SELECT p.`id`, p.`name`, p.`deadline` FROM `projects` p WHERE {$ps} AND p.`deadline` >= ? AND p.`deadline` <= ? AND p.`status` NOT IN ('CANCELLED','ARCHIVED')", [...$pp, $fd, $td]) as $p) {
        $ev[] = ['id' => "d-{$p['id']}", 'title' => "Deadline: {$p['name']}", 'kind' => 'deadline', 'at' => $iso($p['deadline']), 'allDay' => true, 'href' => "{$base}/projects/{$p['id']}"];
    }
    foreach (Db::rows("SELECT p.`id`, p.`name`, p.`startDate` FROM `projects` p WHERE {$ps} AND p.`startDate` >= ? AND p.`startDate` <= ?", [...$pp, $fd, $td]) as $p) {
        $ev[] = ['id' => "s-{$p['id']}", 'title' => "Project start: {$p['name']}", 'kind' => 'start', 'at' => $iso($p['startDate']), 'allDay' => true, 'href' => "{$base}/projects/{$p['id']}"];
    }
    if ($staffAll) {
        foreach (Db::rows("SELECT `id`, `title`, `type`, `startsAt`, `endsAt`, `leadId` FROM `meetings` WHERE `workspaceId` = ? AND `startsAt` >= ? AND `startsAt` <= ? AND `status` <> 'CANCELLED'", [$ws, $fd, $td]) as $m) {
            $ev[] = ['id' => "m-{$m['id']}", 'title' => $m['title'], 'kind' => $m['type'] === 'CLIENT_REVIEW_CALL' ? 'meeting' : 'call', 'at' => $iso($m['startsAt']), 'end' => $iso($m['endsAt']), 'href' => $m['leadId'] ? "/admin/leads/{$m['leadId']}" : null];
        }
    }
    if ($actor->can('retainers:manage') || $actor->can('clients:read')) {
        foreach (Db::rows("SELECT r.`id`, r.`renewalDate`, c.`companyName` FROM `retainers` r JOIN `clients` c ON c.`id` = r.`clientId` WHERE r.`workspaceId` = ? AND r.`status` = 'ACTIVE' AND r.`renewalDate` >= ? AND r.`renewalDate` <= ?", [$ws, $fd, $td]) as $r) {
            $ev[] = ['id' => "r-{$r['id']}", 'title' => "Retainer renewal: {$r['companyName']}", 'kind' => 'retainer', 'at' => $iso($r['renewalDate']), 'allDay' => true, 'href' => '/admin/retainers'];
        }
    }
    foreach (Db::find('calendar_events', ['sql' => '`workspaceId` = ? AND `startsAt` >= ? AND `startsAt` <= ?', 'params' => [$ws, $fd, $td]]) as $c) {
        $ev[] = ['id' => "c-{$c['id']}", 'title' => $c['title'], 'kind' => 'custom', 'at' => $c['startsAt'], 'end' => $c['endsAt'], 'allDay' => $c['allDay']];
    }
    $taskWhere = $actor->can('projects:read_all') ? '' : ' AND `assigneeId` = ?';
    foreach (Db::rows("SELECT `id`, `title`, `dueDate` FROM `tasks` WHERE `workspaceId` = ? AND `dueDate` >= ? AND `dueDate` <= ? AND `status` <> 'COMPLETE' AND `parentId` IS NULL{$taskWhere} LIMIT 100", [$ws, $fd, $td, ...($taskWhere ? [$actor->userId] : [])]) as $tk) {
        $ev[] = ['id' => "t-{$tk['id']}", 'title' => "Task: {$tk['title']}", 'kind' => 'task', 'at' => $iso($tk['dueDate']), 'allDay' => true, 'href' => "{$base}/tasks"];
    }
    foreach (Db::rows("SELECT r.`id`, r.`roundNumber`, r.`createdAt`, r.`projectId`, p.`name` FROM `revision_requests` r JOIN `projects` p ON p.`id` = r.`projectId` WHERE r.`workspaceId` = ? AND r.`status` IN ('OPEN','IN_PROGRESS') AND {$ps} AND r.`createdAt` >= ? AND r.`createdAt` <= ?", [$ws, ...$pp, db_dt($f - 30 * 86400000), $td]) as $r) {
        $ev[] = ['id' => "rv-{$r['id']}", 'title' => "Revision {$r['roundNumber']} due: {$r['name']}", 'kind' => 'revision', 'at' => iso_dt((int)ts_ms($r['createdAt']) + 2 * 86400000), 'allDay' => true, 'href' => "{$base}/projects/{$r['projectId']}"];
    }
    usort($ev, fn($a, $b) => strcmp($a['at'], $b['at']));
    return array_map(fn($e) => array_filter($e, fn($v) => $v !== null), $ev);
}

// ═══════════════════════════ CLIENT HOME ═══════════════════════════

function client_home(Actor $actor): array
{
    $orgIds = $actor->orgIds();
    [$ph, $orgP] = Db::in($orgIds);
    [$ps, $pp] = scope_project($actor, 'p');
    $projects = Db::rows(
        "SELECT p.*, mu.`name` AS m_name, s.`title` AS s_title FROM `projects` p LEFT JOIN `users` mu ON mu.`id` = p.`managerId` LEFT JOIN `services` s ON s.`id` = p.`serviceId`
         WHERE {$ps} AND p.`status` NOT IN ('ARCHIVED','CANCELLED') ORDER BY p.`updatedAt` DESC",
        $pp,
    );
    $ids = array_column($projects, 'id');
    $editors = [];
    $latest = [];
    if ($ids) {
        [$iph, $ipp] = Db::in($ids);
        foreach (Db::rows("SELECT pm.`projectId`, pm.`role`, u.`name` FROM `project_members` pm JOIN `users` u ON u.`id` = pm.`userId` WHERE pm.`projectId` IN {$iph} ORDER BY pm.`createdAt` ASC", $ipp) as $m) {
            if (in_array($m['role'], ['EDITOR', 'MOTION_DESIGNER'], true) && !isset($editors[$m['projectId']])) {
                $editors[$m['projectId']] = $m['name'];
            }
        }
        foreach (Db::rows("SELECT `id`, `projectId`, `label`, `reviewStatus` FROM `video_versions` WHERE `projectId` IN {$iph} AND `releasedAt` IS NOT NULL ORDER BY `versionNumber` DESC", $ipp) as $v) {
            $latest[$v['projectId']] ??= ['id' => $v['id'], 'label' => $v['label'], 'reviewStatus' => $v['reviewStatus']];
        }
    }
    $projectNames = array_column(Db::rows("SELECT `id`, `name` FROM `projects` WHERE `organizationId` IN {$ph}", $orgP), 'name', 'id');
    $quotes = Db::rows("SELECT `id`, `number`, `projectId` FROM `quotes` WHERE `organizationId` IN {$ph} AND `status` IN ('SENT','VIEWED')", $orgP);
    $contracts = Db::rows("SELECT `id`, `number`, `projectId` FROM `contracts` WHERE `organizationId` IN {$ph} AND `status` IN ('SENT','VIEWED')", $orgP);
    $invoices = Db::rows("SELECT `id`, `number`, `projectId`, `status` FROM `invoices` WHERE `organizationId` IN {$ph} AND `status` IN ('SENT','VIEWED','PARTIALLY_PAID','OVERDUE') ORDER BY `dueDate` ASC", $orgP);
    [$fs, $fp] = scope_file_request($actor, 'fr');
    $fileReqs = Db::rows("SELECT fr.`id`, fr.`title`, p.`id` AS p_id, p.`name` AS p_name FROM `file_requests` fr JOIN `projects` p ON p.`id` = fr.`projectId` WHERE fr.`status` = 'OPEN' AND {$fs}", $fp);

    $clientIds = Db::col("SELECT `id` FROM `clients` WHERE `organizationId` IN {$ph}", $orgP);
    $activityWhere = "a.`visibility` = 'CLIENT' AND (EXISTS (SELECT 1 FROM `projects` p WHERE p.`id` = a.`projectId` AND {$ps})";
    $activityParams = $pp;
    if ($clientIds) {
        [$cph, $cpp] = Db::in($clientIds);
        $activityWhere .= " OR (a.`clientId` IN {$cph} AND a.`projectId` IS NULL)";
        array_push($activityParams, ...$cpp);
    }
    $activityWhere .= ')';
    $activity = Db::rows("SELECT a.`id`, a.`message`, a.`createdAt`, u.`name` AS by_name, p.`id` AS p_id, p.`name` AS p_name FROM `activity_logs` a LEFT JOIN `users` u ON u.`id` = a.`actorId` LEFT JOIN `projects` p ON p.`id` = a.`projectId` WHERE {$activityWhere} ORDER BY a.`createdAt` DESC LIMIT 10", $activityParams);
    $retainers = Db::find('retainers', ['sql' => "`organizationId` IN {$ph} AND `status` = 'ACTIVE'", 'params' => $orgP]);

    $attention = [];
    foreach ($quotes as $q) {
        $attention[] = ['key' => "q-{$q['id']}", 'kind' => 'quote', 'title' => 'Your quote is ready', 'detail' => $q['number'] . ($q['projectId'] ? ' · ' . ($projectNames[$q['projectId']] ?? '') : ''), 'cta' => 'Review quote', 'href' => "/dashboard/quotes/{$q['id']}", 'tone' => 'accent'];
    }
    foreach ($contracts as $c) {
        $attention[] = ['key' => "c-{$c['id']}", 'kind' => 'contract', 'title' => 'Your contract is ready to sign', 'detail' => "{$c['number']} · " . ($projectNames[$c['projectId']] ?? ''), 'cta' => 'Review & sign', 'href' => "/dashboard/contracts/{$c['id']}", 'tone' => 'accent'];
    }
    foreach ($invoices as $i) {
        $attention[] = ['key' => "i-{$i['id']}", 'kind' => 'invoice', 'title' => $i['status'] === 'OVERDUE' ? 'An invoice is overdue' : 'You have an invoice to pay', 'detail' => $i['number'] . ($i['projectId'] ? ' · ' . ($projectNames[$i['projectId']] ?? '') : ''), 'cta' => 'Pay invoice', 'href' => "/dashboard/invoices/{$i['id']}", 'tone' => 'warning'];
    }
    foreach ($projects as $p) {
        $l = $latest[$p['id']] ?? null;
        $st = $p['status'];
        if ($st === 'ONBOARDING') {
            $attention[] = ['key' => "s-{$p['id']}", 'kind' => 'setup', 'title' => 'Set up your project', 'detail' => "{$p['name']} — tell me exactly what you want", 'cta' => 'Continue project setup', 'href' => "/dashboard/projects/{$p['id']}/setup", 'tone' => 'accent'];
        }
        if ($st === 'AWAITING_ASSETS') {
            $attention[] = ['key' => "a-{$p['id']}", 'kind' => 'files', 'title' => 'Upload your files', 'detail' => "{$p['name']} — I start as soon as your footage arrives", 'cta' => 'Upload files', 'href' => "/dashboard/projects/{$p['id']}?tab=files", 'tone' => 'warning'];
        }
        if (in_array($st, ['CLIENT_REVIEW', 'FINAL_REVIEW'], true) && $l) {
            $attention[] = ['key' => "r-{$p['id']}", 'kind' => $st === 'FINAL_REVIEW' ? 'approve' : 'review', 'title' => $st === 'FINAL_REVIEW' ? 'Your final video is ready for approval' : 'Your draft is waiting for review', 'detail' => "{$p['name']} · {$l['label']}", 'cta' => 'Review video', 'href' => "/dashboard/projects/{$p['id']}/review/{$l['id']}", 'tone' => 'warning'];
        }
        if ($st === 'APPROVED') {
            $attention[] = ['key' => "dl-{$p['id']}", 'kind' => 'download', 'title' => "I’m preparing your final files", 'detail' => $p['name'], 'cta' => 'Open project', 'href' => "/dashboard/projects/{$p['id']}?tab=delivery", 'tone' => 'success'];
        }
        if ($st === 'DELIVERED' && $p['deliveredAt'] && now_ms() - (int)ts_ms($p['deliveredAt']) < 14 * 86400000) {
            $attention[] = ['key' => "dv-{$p['id']}", 'kind' => 'download', 'title' => 'Your final files are ready', 'detail' => $p['name'], 'cta' => 'Download final files', 'href' => "/dashboard/projects/{$p['id']}?tab=delivery", 'tone' => 'success'];
        }
    }
    foreach ($fileReqs as $f) {
        $attention[] = ['key' => "f-{$f['id']}", 'kind' => 'files', 'title' => 'Action required: file request', 'detail' => "{$f['title']} — {$f['p_name']}", 'cta' => 'Upload', 'href' => "/dashboard/projects/{$f['p_id']}?tab=files&request={$f['id']}", 'tone' => 'warning'];
    }
    $firstClient = Db::rowRaw("SELECT `id`, `name`, `companyName`, `firstTime` FROM `clients` WHERE `organizationId` IN {$ph} ORDER BY `createdAt` ASC LIMIT 1", $orgP);
    $checklist = null;
    if ($firstClient) {
        try {
            $checklist = onboarding_checklist($actor, $firstClient['id']);
        } catch (Throwable) {
            $checklist = null;
        }
    }
    return [
        'attention' => $attention,
        'projects' => array_map(function ($p) use ($editors, $latest) {
            $h = Db::hydrate('projects', array_intersect_key($p, Db::table('projects')['cols']));
            return [
                'id' => $h['id'], 'code' => $h['code'], 'name' => $h['name'], 'status' => $h['status'], 'deadline' => $h['deadline'], 'service' => $p['s_title'], 'editor' => $editors[$h['id']] ?? $p['m_name'] ?? null,
                'latestVersion' => $latest[$h['id']] ?? null, 'progress' => status_meta($h['status'])['progress'], 'paymentState' => 'NONE',
            ];
        }, $projects),
        'activity' => array_map(fn($a) => ['id' => $a['id'], 'message' => $a['message'], 'at' => iso_dt(ts_ms($a['createdAt'])), 'by' => $a['by_name'] ?? 'Studio', 'project' => $a['p_id'] ? ['id' => $a['p_id'], 'name' => $a['p_name']] : null], $activity),
        'retainers' => array_map(fn($r) => ['id' => $r['id'], 'name' => $r['name'], 'monthlyPrice' => $r['monthlyPrice'], 'currency' => $r['currency']] + retainer_allowance($r['id']), $retainers),
        'storage' => storage_usage($actor, $orgIds[0] ?? ''),
        'unreadMessages' => unread_message_count($actor),
        'checklist' => $checklist,
        'firstTime' => $firstClient ? (bool)$firstClient['firstTime'] : true,
        'clientId' => $firstClient['id'] ?? null,
        'hasProjects' => count($projects) > 0,
    ];
}

// ═══════════════════════════ EDITOR HOME ═══════════════════════════

function editor_home(Actor $actor): array
{
    assert_can($actor, 'editor:access');
    [$ps, $pp] = scope_project($actor, 'p');
    $now = now_ms();
    $eod = utc_day_start(1, $now);
    $open = open_status_sql();
    $projects = Db::rows(
        "SELECT p.`id`, p.`name`, p.`code`, p.`status`, p.`priority`, p.`deadline`, c.`companyName` FROM `projects` p JOIN `clients` c ON c.`id` = p.`clientId`
         WHERE {$ps} AND p.`status` IN ('QUEUED','EDITING','REVISION','INTERNAL_REVIEW','AWAITING_ASSETS','ONBOARDING','CLIENT_REVIEW','FINAL_REVIEW') ORDER BY p.`deadline` IS NULL, p.`deadline` ASC",
        $pp,
    );
    $tasks = Db::rows(
        "SELECT t.*, p.`id` AS p_id, p.`name` AS p_name, p.`code` AS p_code FROM `tasks` t LEFT JOIN `projects` p ON p.`id` = t.`projectId`
         WHERE t.`workspaceId` = ? AND t.`assigneeId` = ? AND t.`status` <> 'COMPLETE' AND t.`parentId` IS NULL AND (t.`dueDate` < ? OR t.`status` = 'IN_PROGRESS') ORDER BY t.`dueDate` ASC LIMIT 20",
        [$actor->workspaceId, $actor->userId, db_dt($eod)],
    );
    $deadlines = Db::rows("SELECT p.`id`, p.`name`, p.`code`, p.`deadline` FROM `projects` p WHERE {$ps} AND p.`status` IN {$open} AND p.`deadline` >= ? AND p.`deadline` <= ? ORDER BY p.`deadline` ASC LIMIT 6", [...$pp, db_dt($now), db_dt($now + 10 * 86400000)]);
    $revisions = Db::rows(
        "SELECT r.*, p.`id` AS p_id, p.`name` AS p_name, p.`code` AS p_code, v.`label` AS v_label, (SELECT COUNT(*) FROM `video_comments` c WHERE c.`revisionId` = r.`id`) AS cc
         FROM `revision_requests` r JOIN `projects` p ON p.`id` = r.`projectId` JOIN `video_versions` v ON v.`id` = r.`versionId` WHERE {$ps} AND r.`status` IN ('OPEN','IN_PROGRESS') ORDER BY r.`createdAt` DESC LIMIT 10",
        $pp,
    );
    $newFiles = Db::rows(
        "SELECT a.`id`, a.`displayName`, a.`createdAt`, p.`id` AS p_id, p.`name` AS p_name FROM `assets` a JOIN `projects` p ON p.`id` = a.`projectId` JOIN `users` u ON u.`id` = a.`uploadedById` JOIN `asset_folders` f ON f.`id` = a.`folderId`
         WHERE {$ps} AND a.`deletedAt` IS NULL AND a.`status` = 'READY' AND a.`createdAt` >= ? AND u.`isStaff` = 0 AND f.`key` NOT IN ('drafts','final-exports') ORDER BY a.`createdAt` DESC LIMIT 8",
        [...$pp, db_dt($now - 3 * 86400000)],
    );
    $awaiting = Db::rows("SELECT p.`id`, p.`name`, p.`code`, p.`status` FROM `projects` p WHERE {$ps} AND p.`status` IN ('INTERNAL_REVIEW','CLIENT_REVIEW','FINAL_REVIEW') LIMIT 8", $pp);
    $iso = fn($v) => $v ? iso_dt(ts_ms($v)) : null;
    return [
        'projects' => array_map(fn($p) => ['id' => $p['id'], 'name' => $p['name'], 'code' => $p['code'], 'status' => $p['status'], 'priority' => $p['priority'], 'deadline' => $iso($p['deadline']), 'client' => ['companyName' => $p['companyName']]], $projects),
        'tasksToday' => array_map(fn($t) => task_row_dto($t + ['assignee_name' => $actor->name, 'comment_count' => 0]), $tasks),
        'deadlines' => array_map(fn($d) => ['id' => $d['id'], 'name' => $d['name'], 'code' => $d['code'], 'deadline' => $iso($d['deadline'])], $deadlines),
        'revisions' => array_map(function ($r) use ($iso) {
            $x = Db::hydrate('revision_requests', array_intersect_key($r, Db::table('revision_requests')['cols']));
            return $x + ['project' => ['id' => $r['p_id'], 'name' => $r['p_name'], 'code' => $r['p_code']], 'version' => ['label' => $r['v_label']], '_count' => ['comments' => (int)$r['cc']]];
        }, $revisions),
        'newFiles' => array_map(fn($a) => ['id' => $a['id'], 'displayName' => $a['displayName'], 'createdAt' => $iso($a['createdAt']), 'project' => ['id' => $a['p_id'], 'name' => $a['p_name']]], $newFiles),
        'awaitingReview' => $awaiting,
    ];
}
