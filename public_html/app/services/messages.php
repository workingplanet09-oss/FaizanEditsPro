<?php
/** Messaging: one thread per project plus a general/support thread per client. Every read/write goes through scope_message(). */
defined('FEP') or exit;

/** @param array $m message row with sender_* columns; $me the viewer's user id; $read whether the viewer has read it */
function message_dto(array $m, string $me, array $attachments, bool $read): array
{
    return [
        'id' => $m['id'], 'projectId' => $m['projectId'], 'body' => $m['body'], 'links' => $m['links'] ?? [], 'recipientGroup' => $m['recipientGroup'], 'mentionUserIds' => $m['mentionUserIds'] ?? [],
        'createdAt' => $m['createdAt'], 'sender' => ['id' => $m['senderId'], 'name' => $m['sender_name'], 'isStaff' => (bool)$m['sender_isStaff'], 'avatarUrl' => $m['sender_avatarUrl'] ?? null],
        'mine' => $m['senderId'] === $me, 'read' => $m['senderId'] === $me || $read,
        'attachments' => array_map(fn($a) => ['assetId' => $a['assetId'], 'name' => $a['displayName'], 'mimeType' => $a['mimeType'], 'sizeBytes' => (int)$a['sizeBytes']], $attachments),
    ];
}

function message_rows_dto(array $rows, string $me, bool $forceRead = false): array
{
    if (!$rows) {
        return [];
    }
    $ids = array_column($rows, 'id');
    [$ph, $pp] = Db::in($ids);
    $atts = [];
    foreach (Db::rows("SELECT ma.`messageId`, ma.`assetId`, a.`displayName`, a.`mimeType`, a.`sizeBytes` FROM `message_attachments` ma JOIN `assets` a ON a.`id` = ma.`assetId` WHERE ma.`messageId` IN {$ph}", $pp) as $a) {
        $atts[$a['messageId']][] = $a;
    }
    $reads = array_flip(Db::col("SELECT `messageId` FROM `message_reads` WHERE `userId` = ? AND `messageId` IN {$ph}", [$me, ...$pp]));
    return array_map(function ($r) use ($me, $atts, $reads, $forceRead) {
        return message_dto(Db::hydrate('messages', array_intersect_key($r, Db::table('messages')['cols'])) + ['sender_name' => $r['sender_name'], 'sender_isStaff' => $r['sender_isStaff'], 'sender_avatarUrl' => $r['sender_avatarUrl']], $me, $atts[$r['id']] ?? [], $forceRead || isset($reads[$r['id']]));
    }, $rows);
}

const FEP_MSG_SELECT = 'm.*, s.`name` AS sender_name, s.`isStaff` AS sender_isStaff, s.`avatarUrl` AS sender_avatarUrl';

/** $in: projectId?, clientId?, body, recipientGroup?, mentionUserIds?, attachmentAssetIds? */
function send_message(Actor $actor, array $in): array
{
    rate_limit("msg:{$actor->userId}", 60, 60000, "You're sending messages very quickly. Give it a second.");
    $body = trim($in['body'] ?? '');
    $attIds = array_values(array_unique($in['attachmentAssetIds'] ?? []));
    if ($body === '' && !$attIds) {
        throw bad_request('Write a message first.', ['body' => 'Required.']);
    }
    if (mb_strlen($body) > 5000) {
        throw bad_request('Messages are limited to 5,000 characters.', ['body' => 'Too long.']);
    }
    $projectId = null;
    $projectName = null;
    if (!empty($in['projectId'])) {
        $p = require_project($actor, $in['projectId']);
        $projectId = $p['id'];
        $clientId = $p['clientId'];
        $organizationId = $p['organizationId'];
        $projectName = $p['name'];
    } elseif ($actor->isStaff) {
        if (empty($in['clientId'])) {
            throw bad_request('Choose a client or project to message.');
        }
        $c = Db::first('clients', ['id' => $in['clientId'], 'workspaceId' => $actor->workspaceId]);
        if (!$c) {
            throw not_found('Client');
        }
        $clientId = $c['id'];
        $organizationId = $c['organizationId'];
    } else {
        $c = primary_client_for($actor);
        if (!$c) {
            throw new AppError('NOT_FOUND', 'No company is linked to your account yet.');
        }
        $clientId = $c['id'];
        $organizationId = $c['organizationId'];
    }
    if ($actor->isStaff) {
        assert_can($actor, 'messages:write');
        $group = 'CLIENT';
    } else {
        assert_org_action($actor, $organizationId, 'message');
        $g = $in['recipientGroup'] ?? null;
        $group = ($g && $g !== 'CLIENT') ? $g : ($projectId ? 'PROJECT_MANAGER' : 'SUPPORT');
    }
    if ($attIds) {
        [$ph, $pp] = Db::in($attIds);
        $ok = (int)Db::val("SELECT COUNT(*) FROM `assets` WHERE `id` IN {$ph} AND `uploadedById` = ? AND `deletedAt` IS NULL AND `status` = 'READY'" . ($projectId ? ' AND `projectId` = ?' : ''), [...$pp, $actor->userId, ...($projectId ? [$projectId] : [])]);
        if ($ok !== count($attIds)) {
            throw bad_request("One of the attachments isn't available.");
        }
    }
    // mentions must be people who can actually see this conversation
    $mentions = [];
    if (!empty($in['mentionUserIds']) && $actor->isStaff) {
        [$ph, $pp] = Db::in($in['mentionUserIds']);
        $mentions = Db::col("SELECT `id` FROM `users` WHERE `id` IN {$ph} AND `workspaceId` = ? AND `isStaff` = 1", [...$pp, $actor->workspaceId]);
    }
    preg_match_all('#https?://[^\s<>()]+#i', $body, $mm);
    $links = array_slice(array_values(array_unique($mm[0])), 0, 10);
    $m = Db::tx(function () use ($actor, $organizationId, $clientId, $projectId, $group, $body, $links, $mentions, $attIds) {
        $m = Db::insert('messages', [
            'workspaceId' => $actor->workspaceId, 'organizationId' => $organizationId, 'clientId' => $clientId, 'projectId' => $projectId, 'senderId' => $actor->userId,
            'recipientGroup' => $group, 'body' => $body, 'links' => $links, 'mentionUserIds' => $mentions, 'isDemo' => $actor->isDemo,
        ]);
        foreach ($attIds as $aid) {
            Db::insert('message_attachments', ['messageId' => $m['id'], 'assetId' => $aid], false);
        }
        Db::insert('message_reads', ['messageId' => $m['id'], 'userId' => $actor->userId], false);
        return $m;
    });
    $preview = $body !== '' ? mb_substr($body, 0, 140) : 'Sent an attachment';
    if ($actor->isStaff) {
        // notify the client's team (owners / managers)
        $members = Db::col("SELECT `userId` FROM `organization_members` WHERE `organizationId` = ? AND `role` IN ('OWNER','MANAGER')", [$organizationId]);
        notify([
            'workspaceId' => $actor->workspaceId, 'userIds' => $members, 'category' => 'MESSAGE', 'type' => 'message.reply', 'title' => "New message from {$actor->name}", 'message' => $preview,
            'link' => $projectId ? "/dashboard/projects/{$projectId}?tab=messages" : '/dashboard/messages', 'email' => true, 'emailTemplate' => 'new_message',
            'emailVars' => ['message_preview' => $preview, 'project_name' => $projectName ?? 'your account'],
        ]);
        if ($mentions) {
            notify(['workspaceId' => $actor->workspaceId, 'userIds' => $mentions, 'exclude' => [$actor->userId], 'category' => 'MESSAGE', 'type' => 'message.mention', 'title' => "{$actor->name} mentioned you", 'message' => $preview, 'link' => $projectId ? "/admin/projects/{$projectId}" : '/admin/messages', 'email' => false]);
        }
    } else {
        $staff = [];
        if ($projectId) {
            $members = Db::find('project_members', ['projectId' => $projectId]);
            $p = Db::first('projects', ['id' => $projectId], ['cols' => ['managerId']]);
            if ($group === 'PROJECT_MANAGER') {
                $staff = array_values(array_filter(array_merge([$p['managerId'] ?? null], array_column(array_filter($members, fn($x) => $x['role'] === 'MANAGER'), 'userId'))));
            } elseif ($group === 'EDITOR') {
                $staff = array_column(array_filter($members, fn($x) => in_array($x['role'], ['EDITOR', 'MOTION_DESIGNER'], true)), 'userId');
            }
        }
        if (!$staff) {
            $staff = Db::col("SELECT u.`id` FROM `users` u WHERE u.`workspaceId` = ? AND u.`isStaff` = 1 AND u.`status` <> 'SUSPENDED' AND EXISTS (SELECT 1 FROM `user_roles` ur JOIN `roles` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = u.`id` AND r.`key` IN ('super_admin','admin','support','project_manager'))", [$actor->workspaceId]);
        }
        notify(['workspaceId' => $actor->workspaceId, 'userIds' => $staff, 'category' => 'MESSAGE', 'type' => 'message.received', 'title' => "{$actor->name} sent a message" . ($projectName ? " on {$projectName}" : ''), 'message' => $preview, 'link' => $projectId ? "/admin/projects/{$projectId}?tab=messages" : '/admin/messages', 'email' => false]);
        emit('message.received', ['workspaceId' => $actor->workspaceId, 'actorId' => $actor->userId, 'projectId' => $projectId, 'clientId' => $clientId, 'messageId' => $m['id']]);
        Db::update('clients', ['id' => $clientId], ['lastContactAt' => now_ms()]);
    }
    $row = Db::rowRaw('SELECT ' . FEP_MSG_SELECT . ' FROM `messages` m JOIN `users` s ON s.`id` = m.`senderId` WHERE m.`id` = ?', [$m['id']]);
    return message_rows_dto([$row], $actor->userId, true)[0];
}

/** $opts: projectId?, clientId?, limit?, markRead? */
function list_messages(Actor $actor, array $opts): array
{
    [$s, $p] = scope_message($actor, 'm');
    $where = [$s];
    if (!empty($opts['projectId'])) {
        require_project($actor, $opts['projectId']);
        $where[] = 'm.`projectId` = ?';
        $p[] = $opts['projectId'];
    } elseif (!empty($opts['clientId'])) {
        $where[] = 'm.`clientId` = ? AND m.`projectId` IS NULL';
        $p[] = $opts['clientId'];
    } elseif (!$actor->isStaff) {
        $where[] = 'm.`projectId` IS NULL';
    }
    $w = implode(' AND ', array_map(fn($x) => "({$x})", $where));
    $limit = (int)($opts['limit'] ?? 200) ?: 200;
    // the newest N, shown oldest-first
    $rows = array_reverse(Db::rows('SELECT ' . FEP_MSG_SELECT . " FROM `messages` m JOIN `users` s ON s.`id` = m.`senderId` WHERE {$w} ORDER BY m.`createdAt` DESC LIMIT {$limit}", $p));
    $dto = message_rows_dto($rows, $actor->userId);
    if (!empty($opts['markRead'])) {
        foreach ($rows as $i => $r) {
            if ($r['senderId'] !== $actor->userId && !$dto[$i]['read']) {
                Db::exec('INSERT IGNORE INTO `message_reads` (`messageId`, `userId`, `readAt`) VALUES (?, ?, ?)', [$r['id'], $actor->userId, db_dt()]);
                $dto[$i]['read'] = true;
            }
        }
    }
    return $dto;
}

/** Conversation list for the Messages page: one thread per project plus the general support thread. */
function list_threads(Actor $actor): array
{
    [$s, $p] = scope_message($actor, 'm');
    $grouped = Db::rows(
        "SELECT m.`projectId`, m.`clientId`, MAX(m.`createdAt`) AS lastAt, COUNT(*) AS n,
           SUM(m.`senderId` <> ? AND NOT EXISTS (SELECT 1 FROM `message_reads` mr WHERE mr.`messageId` = m.`id` AND mr.`userId` = ?)) AS unread
         FROM `messages` m WHERE {$s} GROUP BY m.`projectId`, m.`clientId` ORDER BY lastAt DESC LIMIT 60",
        [$actor->userId, $actor->userId, ...$p],
    );
    if (!$grouped) {
        return [];
    }
    $pids = array_values(array_filter(array_unique(array_column($grouped, 'projectId'))));
    $cids = array_values(array_unique(array_column($grouped, 'clientId')));
    $projects = [];
    if ($pids) {
        [$ph, $pp] = Db::in($pids);
        foreach (Db::rows("SELECT `id`, `name`, `code` FROM `projects` WHERE `id` IN {$ph}", $pp) as $r) {
            $projects[$r['id']] = $r;
        }
    }
    [$ph, $pp] = Db::in($cids);
    $clients = [];
    foreach (Db::rows("SELECT `id`, `companyName`, `name` FROM `clients` WHERE `id` IN {$ph}", $pp) as $r) {
        $clients[$r['id']] = $r;
    }
    return array_map(function ($g) use ($projects, $clients, $s, $p) {
        $last = Db::rowRaw("SELECT m.`body`, sn.`name` FROM `messages` m JOIN `users` sn ON sn.`id` = m.`senderId` WHERE {$s} AND m.`projectId` <=> ? AND m.`clientId` = ? ORDER BY m.`createdAt` DESC LIMIT 1", [...$p, $g['projectId'], $g['clientId']]);
        $pr = $g['projectId'] ? ($projects[$g['projectId']] ?? null) : null;
        return [
            'key' => ($g['projectId'] ?? 'general') . ':' . $g['clientId'], 'projectId' => $g['projectId'], 'clientId' => $g['clientId'],
            'title' => $g['projectId'] ? ($pr['name'] ?? 'Project') : 'General & support', 'code' => $pr['code'] ?? null, 'client' => $clients[$g['clientId']]['companyName'] ?? null,
            'lastAt' => iso_dt(ts_ms($g['lastAt'])), 'lastPreview' => $last ? $last['name'] . ': ' . mb_substr($last['body'], 0, 80) : '', 'unread' => (int)$g['unread'], 'count' => (int)$g['n'],
        ];
    }, $grouped);
}

function unread_message_count(Actor $actor): int
{
    [$s, $p] = scope_message($actor, 'm');
    return (int)Db::val("SELECT COUNT(*) FROM `messages` m WHERE {$s} AND m.`senderId` <> ? AND NOT EXISTS (SELECT 1 FROM `message_reads` mr WHERE mr.`messageId` = m.`id` AND mr.`userId` = ?)", [...$p, $actor->userId, $actor->userId]);
}

function recent_unread(Actor $actor, int $limit = 5): array
{
    [$s, $p] = scope_message($actor, 'm');
    $rows = Db::rows(
        "SELECT m.`id`, m.`body`, m.`createdAt`, m.`projectId`, sn.`name` AS from_name, pr.`name` AS project_name FROM `messages` m JOIN `users` sn ON sn.`id` = m.`senderId` LEFT JOIN `projects` pr ON pr.`id` = m.`projectId`
         WHERE {$s} AND m.`senderId` <> ? AND NOT EXISTS (SELECT 1 FROM `message_reads` mr WHERE mr.`messageId` = m.`id` AND mr.`userId` = ?) ORDER BY m.`createdAt` DESC LIMIT " . (int)$limit,
        [...$p, $actor->userId, $actor->userId],
    );
    return array_map(fn($r) => ['id' => $r['id'], 'from' => $r['from_name'], 'body' => mb_substr($r['body'], 0, 120), 'at' => iso_dt(ts_ms($r['createdAt'])), 'projectId' => $r['projectId'], 'projectName' => $r['project_name']], $rows);
}
