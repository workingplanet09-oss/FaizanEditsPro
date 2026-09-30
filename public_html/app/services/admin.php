<?php
/** Admin tools: audit-log viewer, email outbox, background-job monitor. */
defined('FEP') or exit;

/** $q: q, entityType, actorId, action (prefix), page, pageSize */
function list_audit_log(Actor $actor, array $q = []): array
{
    assert_can($actor, 'audit:read');
    ['page' => $page, 'pageSize' => $pageSize, 'skip' => $skip, 'take' => $take] = page_args($q, 40, 200);
    $where = ['`workspaceId` = ?'];
    $p = [$actor->workspaceId];
    if (!empty($q['entityType'])) {
        $where[] = '`entityType` = ?';
        $p[] = $q['entityType'];
    }
    if (!empty($q['actorId'])) {
        $where[] = '`actorId` = ?';
        $p[] = $q['actorId'];
    }
    if (!empty($q['action'])) {
        $where[] = '`action` LIKE ?';
        $p[] = addcslashes((string)$q['action'], '%_\\') . '%';
    }
    if (!empty($q['q'])) {
        $like = like_pattern((string)$q['q']);
        $where[] = '(`message` LIKE ? OR `action` LIKE ? OR `actorLabel` LIKE ?)';
        array_push($p, $like, $like, $like);
    }
    $w = implode(' AND ', $where);
    $rows = Db::hydrateAll('audit_logs', Db::rows("SELECT * FROM `audit_logs` WHERE {$w} ORDER BY `createdAt` DESC LIMIT " . (int)$take . ' OFFSET ' . (int)$skip, $p));
    $total = (int)Db::val("SELECT COUNT(*) FROM `audit_logs` WHERE {$w}", $p);
    return paged($rows, $total, $page, $pageSize);
}

/** Outbox of every email the platform generated (also the demo-mode "sent mail" viewer). $q: q, status, page, pageSize */
function list_emails(Actor $actor, array $q = []): array
{
    assert_can($actor, 'automations:manage');
    ['page' => $page, 'pageSize' => $pageSize, 'skip' => $skip, 'take' => $take] = page_args($q, 30, 100);
    $where = ['`workspaceId` = ?'];
    $p = [$actor->workspaceId];
    if (!empty($q['status'])) {
        $where[] = '`status` = ?';
        $p[] = $q['status'];
    }
    if (!empty($q['q'])) {
        $like = like_pattern((string)$q['q']);
        $where[] = '(`toEmail` LIKE ? OR `subject` LIKE ?)';
        array_push($p, $like, $like);
    }
    $w = implode(' AND ', $where);
    $rows = Db::hydrateAll('email_logs', Db::rows("SELECT `id`,`workspaceId`,`toEmail`,`toUserId`,`subject`,`templateKey`,`status`,`provider`,`providerMessageId`,`error`,`createdAt`,`sentAt` FROM `email_logs` WHERE {$w} ORDER BY `createdAt` DESC LIMIT " . (int)$take . ' OFFSET ' . (int)$skip, $p));
    $total = (int)Db::val("SELECT COUNT(*) FROM `email_logs` WHERE {$w}", $p);
    // Bodies are never returned: magic-link, invite and reset emails contain live sign-in tokens.
    return paged($rows, $total, $page, $pageSize);
}

function job_stats(Actor $actor): array
{
    assert_can($actor, 'settings:manage');
    $counts = [];
    foreach (Db::rows('SELECT `status`, COUNT(*) AS n FROM `jobs` GROUP BY `status`') as $g) {
        $counts[$g['status']] = (int)$g['n'];
    }
    return [
        'counts' => (object)$counts,
        'failed' => Db::hydrateAll('jobs', Db::rows("SELECT `id`, `type`, `lastError`, `attempts`, `createdAt` FROM `jobs` WHERE `status` = 'FAILED' ORDER BY `createdAt` DESC LIMIT 10")),
        'recent' => Db::hydrateAll('jobs', Db::rows('SELECT `id`, `type`, `status`, `attempts`, `createdAt`, `completedAt` FROM `jobs` ORDER BY `createdAt` DESC LIMIT 15')),
    ];
}

function retry_failed_jobs(Actor $actor): array
{
    assert_can($actor, 'settings:manage');
    $n = Db::exec("UPDATE `jobs` SET `status` = 'PENDING', `attempts` = 0, `runAt` = ?, `lockedAt` = NULL, `lockedBy` = NULL WHERE `status` = 'FAILED'", [db_dt()]);
    return ['retried' => $n];
}
