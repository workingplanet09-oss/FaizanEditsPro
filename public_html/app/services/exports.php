<?php
/** CSV exports and reports. Formula-injection safe (cells starting with = + - @ are neutralised), Excel-friendly (BOM + CRLF). */
defined('FEP') or exit;

function to_csv(array $columns, array $rows, bool $excel = true): string
{
    $esc = function ($v): string {
        $s = $v === null ? '' : (is_bool($v) ? ($v ? 'true' : 'false') : (string)$v);
        if (preg_match('/^[=+\-@\t\r]/', $s)) {
            $s = "'" . $s;
        }
        return preg_match('/[",\r\n]/', $s) ? '"' . str_replace('"', '""', $s) . '"' : $s;
    };
    $eol = $excel ? "\r\n" : "\n";
    $lines = array_map(fn($r) => implode(',', array_map($esc, $r)), array_merge([$columns], $rows));
    return ($excel ? "\xEF\xBB\xBF" : '') . implode($eol, $lines) . $eol;
}

function export_range_sql(array $r, string $col = 'createdAt', string $alias = ''): array
{
    $a = $alias !== '' ? "{$alias}." : '';
    $sql = '';
    $p = [];
    if (!empty($r['from'])) {
        $sql .= " AND {$a}`{$col}` >= ?";
        $p[] = to_db_dt($r['from']);
    }
    if (!empty($r['to'])) {
        $sql .= " AND {$a}`{$col}` <= ?";
        $p[] = to_db_dt($r['to']);
    }
    return [$sql, $p];
}

function export_amount(mixed $minor): string { return number_format(((int)$minor) / 100, 2, '.', ''); }
function export_iso(mixed $v): string { return $v ? iso_dt(ts_ms($v)) : ''; }

/** @return array<string,array{perm:string,build:callable}> */
function export_builders(): array
{
    return [
        'leads' => ['perm' => 'leads:read', 'build' => function (Actor $a, array $r) {
            [$rs, $rp] = export_range_sql($r, 'createdAt', 'l');
            $rows = Db::rows("SELECT l.*, s.`label` AS src, u.`name` AS assignee FROM `leads` l LEFT JOIN `lead_sources` s ON s.`id` = l.`sourceId` LEFT JOIN `users` u ON u.`id` = l.`assignedToId` WHERE l.`workspaceId` = ?{$rs} ORDER BY l.`createdAt` DESC LIMIT 20000", [$a->workspaceId, ...$rp]);
            return [['Request ID', 'Name', 'Company', 'Email', 'Phone', 'Status', 'Temperature', 'Budget', 'Looking for', 'Source', 'UTM source', 'UTM medium', 'UTM campaign', 'Assigned to', 'Created'],
                array_map(fn($l) => [$l['requestCode'], $l['name'], $l['company'], $l['email'], $l['phone'], $l['status'], $l['temperatureOverride'] ?? $l['temperature'], $l['budgetRange'], $l['lookingFor'], $l['src'], $l['utmSource'], $l['utmMedium'], $l['utmCampaign'], $l['assignee'], export_iso($l['createdAt'])], $rows)];
        }],
        'clients' => ['perm' => 'clients:read', 'build' => function (Actor $a, array $r) {
            [$rs, $rp] = export_range_sql($r, 'createdAt', 'c');
            $rows = Db::rows("SELECT c.*, (SELECT COUNT(*) FROM `projects` p WHERE p.`clientId` = c.`id`) AS pc FROM `clients` c WHERE c.`workspaceId` = ?{$rs} ORDER BY c.`createdAt` DESC LIMIT 20000", [$a->workspaceId, ...$rp]);
            return [['Company', 'Contact', 'Email', 'Phone', 'Industry', 'Website', 'Country', 'Status', 'Source', 'Projects', 'Created'],
                array_map(fn($c) => [$c['companyName'], $c['name'], $c['email'], $c['phone'], $c['industry'], $c['website'], $c['country'], $c['status'], $c['source'], $c['pc'], export_iso($c['createdAt'])], $rows)];
        }],
        'projects' => ['perm' => 'projects:read_all', 'build' => function (Actor $a, array $r) {
            [$rs, $rp] = export_range_sql($r, 'createdAt', 'p');
            $rows = Db::rows("SELECT p.*, c.`companyName`, m.`name` AS mname, s.`title` AS stitle FROM `projects` p JOIN `clients` c ON c.`id` = p.`clientId` LEFT JOIN `users` m ON m.`id` = p.`managerId` LEFT JOIN `services` s ON s.`id` = p.`serviceId` WHERE p.`workspaceId` = ?{$rs} ORDER BY p.`createdAt` DESC LIMIT 20000", [$a->workspaceId, ...$rp]);
            return [['Code', 'Project', 'Client', 'Service', 'Status', 'Priority', 'Manager', 'Deadline', 'Revisions used', 'Created', 'Delivered'],
                array_map(fn($p) => [$p['code'], $p['name'], $p['companyName'], $p['stitle'], $p['status'], $p['priority'], $p['mname'], export_iso($p['deadline']), $p['revisionsUsed'], export_iso($p['createdAt']), export_iso($p['deliveredAt'])], $rows)];
        }],
        'invoices' => ['perm' => 'invoices:read', 'build' => function (Actor $a, array $r) {
            [$rs, $rp] = export_range_sql($r, 'createdAt', 'i');
            $rows = Db::rows("SELECT i.*, c.`companyName`, p.`code` AS pcode FROM `invoices` i JOIN `clients` c ON c.`id` = i.`clientId` LEFT JOIN `projects` p ON p.`id` = i.`projectId` WHERE i.`workspaceId` = ?{$rs} ORDER BY i.`createdAt` DESC LIMIT 20000", [$a->workspaceId, ...$rp]);
            return [['Invoice', 'Client', 'Project', 'Kind', 'Currency', 'Total', 'Paid', 'Status', 'Issued', 'Due', 'Paid at'],
                array_map(fn($i) => [$i['number'], $i['companyName'], $i['pcode'], $i['kind'], $i['currency'], export_amount($i['total']), export_amount($i['amountPaid']), $i['status'], export_iso($i['issuedAt']), export_iso($i['dueDate']), export_iso($i['paidAt'])], $rows)];
        }],
        'payments' => ['perm' => 'payments:read', 'build' => function (Actor $a, array $r) {
            [$rs, $rp] = export_range_sql($r, 'createdAt', 'pay');
            $rows = Db::rows("SELECT pay.*, i.`number`, c.`companyName` FROM `payments` pay JOIN `invoices` i ON i.`id` = pay.`invoiceId` JOIN `clients` c ON c.`id` = pay.`clientId` WHERE pay.`workspaceId` = ?{$rs} ORDER BY pay.`createdAt` DESC LIMIT 20000", [$a->workspaceId, ...$rp]);
            return [['Payment ID', 'Invoice', 'Client', 'Amount', 'Currency', 'Provider', 'Transaction', 'Status', 'Paid at'],
                array_map(fn($p) => [$p['id'], $p['number'], $p['companyName'], export_amount($p['amount']), $p['currency'], $p['provider'], $p['transactionId'], $p['status'], export_iso($p['paidAt'])], $rows)];
        }],
        'testimonials' => ['perm' => 'cms:manage', 'build' => function (Actor $a, array $r) {
            [$rs, $rp] = export_range_sql($r, 'createdAt');
            $rows = Db::rows("SELECT * FROM `testimonials` WHERE `workspaceId` = ?{$rs} ORDER BY `createdAt` DESC LIMIT 20000", [$a->workspaceId, ...$rp]);
            return [['Name', 'Role', 'Company', 'Rating', 'Quote', 'Status', 'Permission to publish', 'Created'],
                array_map(fn($t) => [$t['name'], $t['role'], $t['company'], $t['rating'], $t['quote'], $t['status'], $t['permissionToPublish'] ? 'yes' : 'no', export_iso($t['createdAt'])], $rows)];
        }],
        // ── reports ──
        'report-monthly-revenue' => ['perm' => 'analytics:read', 'build' => function (Actor $a, array $r) {
            [$rs, $rp] = export_range_sql($r, 'paidAt');
            $rows = Db::rows("SELECT DATE_FORMAT(`paidAt`, '%Y-%m') AS m, `currency`, COUNT(*) AS n, SUM(`amount`) AS total FROM `payments` WHERE `workspaceId` = ? AND `status` = 'SUCCEEDED'{$rs} GROUP BY m, `currency` ORDER BY m, `currency`", [$a->workspaceId, ...$rp]);
            return [['Month', 'Currency', 'Payments', 'Revenue'], array_map(fn($x) => [$x['m'], $x['currency'], $x['n'], export_amount($x['total'])], $rows)];
        }],
        'report-client-acquisition' => ['perm' => 'analytics:read', 'build' => function (Actor $a, array $r) {
            [$rs, $rp] = export_range_sql($r, 'createdAt', 'l');
            $rows = Db::rows("SELECT DATE_FORMAT(l.`createdAt`, '%Y-%m') AS m, COALESCE(s.`label`, 'Unknown') AS src, COUNT(*) AS leads, SUM(l.`status` = 'CONVERTED') AS converted FROM `leads` l LEFT JOIN `lead_sources` s ON s.`id` = l.`sourceId` WHERE l.`workspaceId` = ?{$rs} GROUP BY m, src ORDER BY m, src", [$a->workspaceId, ...$rp]);
            return [['Month', 'Source', 'Leads', 'Converted', 'Conversion %'], array_map(fn($x) => [$x['m'], $x['src'], $x['leads'], $x['converted'], $x['leads'] ? number_format(($x['converted'] / $x['leads']) * 100, 1, '.', '') : '0'], $rows)];
        }],
        'report-project-performance' => ['perm' => 'analytics:read', 'build' => function (Actor $a, array $r) {
            [$rs, $rp] = export_range_sql($r, 'createdAt', 'p');
            $rows = Db::rows("SELECT p.*, c.`companyName`, s.`title` AS stitle, (SELECT COUNT(*) FROM `video_versions` v WHERE v.`projectId` = p.`id`) AS vc FROM `projects` p JOIN `clients` c ON c.`id` = p.`clientId` LEFT JOIN `services` s ON s.`id` = p.`serviceId` WHERE p.`workspaceId` = ?{$rs}", [$a->workspaceId, ...$rp]);
            return [['Code', 'Project', 'Client', 'Service', 'Status', 'Started', 'Delivered', 'Days to deliver', 'Versions', 'Revision rounds', 'Deadline met'], array_map(function ($p) {
                $days = ($p['startDate'] && $p['deliveredAt']) ? number_format(((int)ts_ms($p['deliveredAt']) - (int)ts_ms($p['startDate'])) / 86400000, 1, '.', '') : '';
                $met = ($p['deadline'] && $p['deliveredAt']) ? ((int)ts_ms($p['deliveredAt']) <= (int)ts_ms($p['deadline']) + 86400000 ? 'yes' : 'no') : '';
                return [$p['code'], $p['name'], $p['companyName'], $p['stitle'], $p['status'], export_iso($p['startDate']), export_iso($p['deliveredAt']), $days, $p['vc'], $p['revisionsUsed'], $met];
            }, $rows)];
        }],
        'report-editing-services' => ['perm' => 'analytics:read', 'build' => function (Actor $a, array $r) {
            [$rs, $rp] = export_range_sql($r, 'createdAt', 'p');
            $rows = Db::rows("SELECT COALESCE(s.`title`, 'Unspecified') AS svc, COUNT(*) AS n FROM `projects` p LEFT JOIN `services` s ON s.`id` = p.`serviceId` WHERE p.`workspaceId` = ?{$rs} GROUP BY p.`serviceId`, svc", [$a->workspaceId, ...$rp]);
            return [['Service', 'Projects'], array_map(fn($x) => [$x['svc'], $x['n']], $rows)];
        }],
        'report-outstanding-invoices' => ['perm' => 'invoices:read', 'build' => function (Actor $a, array $r) {
            $rows = Db::rows("SELECT i.*, c.`companyName` FROM `invoices` i JOIN `clients` c ON c.`id` = i.`clientId` WHERE i.`workspaceId` = ? AND i.`status` IN ('SENT','VIEWED','PARTIALLY_PAID','OVERDUE') ORDER BY i.`dueDate` ASC", [$a->workspaceId]);
            $now = now_ms();
            return [['Invoice', 'Client', 'Status', 'Currency', 'Total', 'Paid', 'Outstanding', 'Due', 'Days overdue'], array_map(function ($i) use ($now) {
                $due = $i['dueDate'] ? (int)ts_ms($i['dueDate']) : null;
                return [$i['number'], $i['companyName'], $i['status'], $i['currency'], export_amount($i['total']), export_amount($i['amountPaid']), export_amount($i['total'] - $i['amountPaid']), export_iso($i['dueDate']), ($due !== null && $due < $now) ? (int)floor(($now - $due) / 86400000) : 0];
            }, $rows)];
        }],
        'report-team-workload' => ['perm' => 'analytics:read', 'build' => function (Actor $a, array $r) {
            $rows = [];
            foreach (Db::rows("SELECT `id`, `name` FROM `users` WHERE `workspaceId` = ? AND `isStaff` = 1 AND `status` = 'ACTIVE'", [$a->workspaceId]) as $u) {
                $p = (int)Db::val("SELECT COUNT(*) FROM `projects` p WHERE p.`workspaceId` = ? AND p.`status` NOT IN ('DELIVERED','ARCHIVED','CANCELLED') AND EXISTS (SELECT 1 FROM `project_members` pm WHERE pm.`projectId` = p.`id` AND pm.`userId` = ?)", [$a->workspaceId, $u['id']]);
                $t = (int)Db::val("SELECT COUNT(*) FROM `tasks` WHERE `workspaceId` = ? AND `assigneeId` = ? AND `status` <> 'COMPLETE'", [$a->workspaceId, $u['id']]);
                $h = (int)Db::val('SELECT COALESCE(SUM(`seconds`), 0) FROM `time_entries` WHERE `workspaceId` = ? AND `userId` = ?', [$a->workspaceId, $u['id']]);
                $rows[] = [$u['name'], $p, $t, number_format($h / 3600, 1, '.', '')];
            }
            return [['Team member', 'Open projects', 'Open tasks', 'Tracked hours (all time)'], $rows];
        }],
    ];
}

function export_keys(): array { return array_keys(export_builders()); }

/** @return array{csv:string,filename:string,rows:int} */
function run_export(Actor $actor, string $key, array $range = [], bool $excel = true): array
{
    $b = export_builders()[$key] ?? null;
    if (!$b) {
        throw new AppError('NOT_FOUND', 'Unknown export.');
    }
    assert_can($actor, 'reports:export');
    assert_can($actor, $b['perm']);
    [$columns, $rows] = ($b['build'])($actor, $range);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'export.run', 'entityType' => 'export', 'entityId' => $key, 'message' => "{$actor->name} exported {$key} (" . count($rows) . ' rows)']);
    return ['csv' => to_csv($columns, $rows, $excel), 'filename' => $key . '-' . gmdate('Y-m-d') . '.csv', 'rows' => count($rows)];
}
