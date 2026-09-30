<?php
/**
 * Internal notes live in their own table and are only reachable through staff endpoints that require notes:read / notes:write.
 * Portal (client) users can't authenticate against any route that touches this table.
 */
defined('FEP') or exit;

function assert_note_entity_access(Actor $actor, string $type, string $id): void
{
    assert_can($actor, 'notes:read');
    $check = function (array $scope, string $table, string $alias) use ($id): bool {
        [$s, $p] = $scope;
        return Db::val("SELECT 1 FROM `{$table}` {$alias} WHERE {$alias}.`id` = ? AND {$s} LIMIT 1", [$id, ...$p]) !== null;
    };
    $ok = match ($type) {
        'LEAD' => $check(scope_lead($actor, 'l'), 'leads', 'l'),
        'CLIENT' => $check(scope_client($actor, 'c'), 'clients', 'c'),
        'PROJECT' => $check(scope_project($actor, 'p'), 'projects', 'p'),
        'TASK' => $check(scope_task($actor, 'tk'), 'tasks', 'tk'),
        'INVOICE' => $check(scope_invoice($actor, 'i'), 'invoices', 'i'),
        default => false,
    };
    if (!$ok) {
        throw not_found('Record');
    }
}

function note_dto(array $n, string $me, ?string $authorName = null): array
{
    return ['id' => $n['id'], 'body' => $n['body'], 'pinned' => $n['pinned'], 'createdAt' => $n['createdAt'], 'author' => ['id' => $n['authorId'], 'name' => $authorName ?? $n['author_name']], 'mine' => $n['authorId'] === $me, 'mentions' => $n['mentionUserIds'] ?? []];
}

function list_notes(Actor $actor, string $type, string $id): array
{
    assert_note_entity_access($actor, $type, $id);
    $rows = Db::rows('SELECT n.*, u.`name` AS author_name FROM `internal_notes` n JOIN `users` u ON u.`id` = n.`authorId` WHERE n.`workspaceId` = ? AND n.`entityType` = ? AND n.`entityId` = ? ORDER BY n.`pinned` DESC, n.`createdAt` DESC', [$actor->workspaceId, $type, $id]);
    return array_map(fn($r) => note_dto(Db::hydrate('internal_notes', array_intersect_key($r, Db::table('internal_notes')['cols'])) + ['author_name' => $r['author_name']], $actor->userId), $rows);
}

/** $in: entityType, entityId, body, mentionUserIds?, pinned? */
function add_note(Actor $actor, array $in): array
{
    assert_note_entity_access($actor, $in['entityType'], $in['entityId']);
    assert_can($actor, 'notes:write');
    $body = trim($in['body']);
    if ($body === '') {
        throw bad_request('Write a note first.', ['body' => 'Required.']);
    }
    if (mb_strlen($body) > 5000) {
        throw bad_request('Notes are limited to 5,000 characters.');
    }
    $mentions = [];
    if (!empty($in['mentionUserIds'])) {
        [$ph, $pp] = Db::in($in['mentionUserIds']);
        $mentions = Db::col("SELECT `id` FROM `users` WHERE `id` IN {$ph} AND `workspaceId` = ? AND `isStaff` = 1", [...$pp, $actor->workspaceId]);
    }
    $n = Db::insert('internal_notes', ['workspaceId' => $actor->workspaceId, 'entityType' => $in['entityType'], 'entityId' => $in['entityId'], 'authorId' => $actor->userId, 'body' => $body, 'mentionUserIds' => $mentions, 'pinned' => !empty($in['pinned'])]);
    if ($mentions) {
        $base = match ($in['entityType']) {
            'PROJECT' => "/admin/projects/{$in['entityId']}", 'LEAD' => "/admin/leads/{$in['entityId']}", 'CLIENT' => "/admin/clients/{$in['entityId']}", 'INVOICE' => "/admin/invoices/{$in['entityId']}", default => '/admin/tasks',
        };
        notify(['workspaceId' => $actor->workspaceId, 'userIds' => $mentions, 'exclude' => [$actor->userId], 'category' => 'PROJECT', 'type' => 'note.mention', 'title' => "{$actor->name} mentioned you in an internal note", 'message' => mb_substr($body, 0, 140), 'link' => $base, 'email' => false]);
    }
    return note_dto($n, $actor->userId, $actor->name) + ['mentions' => $mentions];
}

function delete_note(Actor $actor, string $id): array
{
    $n = Db::first('internal_notes', ['id' => $id, 'workspaceId' => $actor->workspaceId]);
    if (!$n) {
        throw not_found('Note');
    }
    assert_can($actor, 'notes:write');
    // the note must belong to something the actor can still see
    assert_note_entity_access($actor, $n['entityType'], $n['entityId']);
    if ($n['authorId'] !== $actor->userId && !$actor->can('settings:manage')) {
        throw forbidden('You can only delete your own notes.');
    }
    Db::delete('internal_notes', ['id' => $id]);
    return ['ok' => true];
}

function pin_note(Actor $actor, string $id, bool $pinned): array
{
    assert_can($actor, 'notes:write');
    $n = Db::first('internal_notes', ['id' => $id, 'workspaceId' => $actor->workspaceId]);
    if (!$n) {
        throw not_found('Note');
    }
    assert_note_entity_access($actor, $n['entityType'], $n['entityId']);
    Db::update('internal_notes', ['id' => $id], ['pinned' => $pinned]);
    return ['ok' => true];
}
