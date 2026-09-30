<?php
/** Change requests (scope control after production starts) and file requests ("Action required" for the client). */
defined('FEP') or exit;

// ───────────────────────────── change requests ─────────────────────────────

/** $in: whatChanged, why?, additionalRequirements?, referenceAssetIds? */
function create_change_request(Actor $actor, string $projectId, array $in): array
{
    $project = require_project($actor, $projectId);
    assert_org_action($actor, $project['organizationId'], 'manage_projects');
    $refs = array_values(array_unique($in['referenceAssetIds'] ?? []));
    if ($refs) {
        [$ph, $pp] = Db::in($refs);
        $ok = (int)Db::val("SELECT COUNT(*) FROM `assets` WHERE `id` IN {$ph} AND `projectId` = ? AND `deletedAt` IS NULL", [...$pp, $projectId]);
        if ($ok !== count($refs)) {
            throw bad_request("One of the attached files doesn't belong to this project.");
        }
    }
    $cr = Db::insert('change_requests', [
        'workspaceId' => $actor->workspaceId, 'projectId' => $projectId, 'submittedById' => $actor->userId, 'whatChanged' => $in['whatChanged'], 'why' => $in['why'] ?? null,
        'additionalRequirements' => $in['additionalRequirements'] ?? null, 'referenceAssetIds' => $refs,
    ]);
    log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'change_request.created', 'message' => "{$actor->name} submitted a change request", 'projectId' => $projectId, 'clientId' => $project['clientId'], 'visibility' => 'CLIENT']);
    emit('change_request.created', ['workspaceId' => $actor->workspaceId, 'actorId' => $actor->userId, 'projectId' => $projectId, 'clientId' => $project['clientId'], 'changeRequestId' => $cr['id']]);
    return $cr;
}

function list_change_requests(Actor $actor, string $projectId): array
{
    require_project($actor, $projectId);
    [$s, $p] = scope_change_request($actor, 'cr');
    $rows = Db::rows("SELECT cr.*, u.`name` AS sb_name FROM `change_requests` cr JOIN `users` u ON u.`id` = cr.`submittedById` WHERE cr.`projectId` = ? AND {$s} ORDER BY cr.`createdAt` DESC", [$projectId, ...$p]);
    return array_map(function ($r) use ($actor) {
        $x = Db::hydrate('change_requests', array_intersect_key($r, Db::table('change_requests')['cols']));
        $x['submittedBy'] = ['name' => $r['sb_name']];
        // staff-only note stays internal until the request has been reviewed
        $x['staffNote'] = $actor->isStaff ? $x['staffNote'] : ($x['classification'] === 'PENDING' ? null : $x['staffNote']);
        return $x;
    }, $rows);
}

/** $in: classification, staffNote?, createQuote? {title, amount, description?} */
function classify_change_request(Actor $actor, string $id, array $in): array
{
    assert_can($actor, 'projects:write');
    [$s, $p] = scope_change_request($actor, 'cr');
    $row = Db::rowRaw("SELECT cr.* FROM `change_requests` cr WHERE cr.`id` = ? AND {$s}", [$id, ...$p]);
    if (!$row) {
        throw not_found('Change request');
    }
    $cr = Db::hydrate('change_requests', $row);
    $project = Db::first('projects', ['id' => $cr['projectId']]);
    $quoteId = null;
    if ($in['classification'] === 'ADDITIONAL_COST' && !empty($in['createQuote'])) {
        $q = create_change_order_quote($actor, $cr['projectId'], ['changeRequestId' => $id, 'title' => $in['createQuote']['title'], 'amount' => $in['createQuote']['amount'], 'description' => $in['createQuote']['description'] ?? $cr['whatChanged']]);
        $quoteId = $q['id'];
    }
    $pending = $in['classification'] === 'PENDING';
    $data = ['classification' => $in['classification'], 'resolvedById' => $pending ? null : $actor->userId, 'resolvedAt' => $pending ? null : now_ms()];
    if (array_key_exists('staffNote', $in)) {
        $data['staffNote'] = $in['staffNote'];
    }
    if ($quoteId) {
        $data['quoteId'] = $quoteId;
    }
    Db::update('change_requests', ['id' => $id], $data);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'change_request.classified', 'entityType' => 'change_request', 'entityId' => $id, 'message' => "{$actor->name} classified a change request as " . strtolower(str_replace('_', ' ', $in['classification']))]);
    $label = $in['classification'] === 'INCLUDED' ? 'Included in your scope' : ($in['classification'] === 'OUT_OF_SCOPE' ? 'Out of scope' : 'Needs an additional quote');
    notify([
        'workspaceId' => $actor->workspaceId, 'userIds' => [$cr['submittedById']], 'category' => 'PROJECT', 'type' => 'change_request.reviewed', 'title' => "Your change request was reviewed: {$label}",
        'message' => $in['staffNote'] ?? $project['name'], 'link' => $quoteId ? "/dashboard/quotes/{$quoteId}" : "/dashboard/projects/{$cr['projectId']}", 'email' => true,
    ]);
    return Db::first('change_requests', ['id' => $id]);
}

// ───────────────────────────── file requests ─────────────────────────────

/** $in: title, description?, acceptedTypes? */
function create_file_request(Actor $actor, string $projectId, array $in): array
{
    assert_can($actor, 'files:write');
    $project = require_project($actor, $projectId);
    $fr = Db::insert('file_requests', ['workspaceId' => $actor->workspaceId, 'projectId' => $projectId, 'requestedById' => $actor->userId, 'title' => $in['title'], 'description' => $in['description'] ?? null, 'acceptedTypes' => $in['acceptedTypes'] ?? []]);
    log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'file_request.created', 'message' => "{$actor->name} requested: {$in['title']}", 'projectId' => $projectId, 'clientId' => $project['clientId'], 'visibility' => 'CLIENT']);
    emit('file_request.created', ['workspaceId' => $actor->workspaceId, 'actorId' => $actor->userId, 'projectId' => $projectId, 'clientId' => $project['clientId'], 'fileRequestId' => $fr['id'], 'data' => ['detail' => $in['title']]]);
    return $fr;
}

function list_file_requests(Actor $actor, string $projectId, array $opts = []): array
{
    require_project($actor, $projectId);
    [$s, $p] = scope_file_request($actor, 'fr');
    $rows = Db::rows("SELECT fr.*, u.`name` AS rb_name FROM `file_requests` fr JOIN `users` u ON u.`id` = fr.`requestedById` WHERE fr.`projectId` = ? AND {$s}" . (!empty($opts['openOnly']) ? " AND fr.`status` = 'OPEN'" : '') . ' ORDER BY fr.`createdAt` DESC', [$projectId, ...$p]);
    return array_map(function ($r) {
        $x = Db::hydrate('file_requests', array_intersect_key($r, Db::table('file_requests')['cols']));
        $x['requestedBy'] = ['name' => $r['rb_name']];
        return $x;
    }, $rows);
}

function cancel_file_request(Actor $actor, string $id): array
{
    assert_can($actor, 'files:write');
    [$s, $p] = scope_file_request($actor, 'fr');
    if (!Db::rowRaw("SELECT fr.`id` FROM `file_requests` fr WHERE fr.`id` = ? AND {$s}", [$id, ...$p])) {
        throw not_found('Request');
    }
    Db::update('file_requests', ['id' => $id], ['status' => 'CANCELLED']);
    return Db::first('file_requests', ['id' => $id]);
}

/** Called by the upload pipeline once the requested file has been uploaded. */
function fulfil_file_request(Actor $actor, string $fileRequestId, string $assetId): array
{
    [$s, $p] = scope_file_request($actor, 'fr');
    $row = Db::rowRaw("SELECT fr.* FROM `file_requests` fr WHERE fr.`id` = ? AND fr.`status` = 'OPEN' AND {$s}", [$fileRequestId, ...$p]);
    if (!$row) {
        throw not_found('Request');
    }
    $fr = Db::hydrate('file_requests', $row);
    Db::update('file_requests', ['id' => $fr['id']], ['status' => 'COMPLETED', 'fulfilledAssetId' => $assetId, 'fulfilledAt' => now_ms()]);
    log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'file_request.completed', 'message' => "{$actor->name} provided: {$fr['title']}", 'projectId' => $fr['projectId'], 'visibility' => 'CLIENT']);
    notify(['workspaceId' => $fr['workspaceId'], 'userIds' => [$fr['requestedById']], 'exclude' => [$actor->userId], 'category' => 'PROJECT', 'type' => 'file_request.completed', 'title' => "Requested file received: {$fr['title']}", 'link' => "/admin/projects/{$fr['projectId']}", 'email' => false]);
    return ['ok' => true];
}
