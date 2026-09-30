<?php
/** Video review: versions, timestamped comments, revision rounds and version-pinned approval. */
defined('FEP') or exit;

/** @param array $v version row + optional joined: createdBy_name, approvedBy_name, asset_thumb, counts */
function version_dto(array $v): array
{
    return [
        'id' => $v['id'], 'projectId' => $v['projectId'], 'versionNumber' => $v['versionNumber'], 'label' => $v['label'], 'notes' => $v['notes'], 'changeSummary' => $v['changeSummary'],
        'durationMs' => $v['durationMs'], 'reviewStatus' => $v['reviewStatus'], 'isFinal' => $v['isFinal'], 'releasedAt' => $v['releasedAt'], 'approvedAt' => $v['approvedAt'],
        'approvedBy' => $v['approvedBy_name'] ?? null, 'approvalNotes' => $v['approvalNotes'], 'createdAt' => $v['createdAt'], 'createdBy' => $v['createdBy_name'] ?? null,
        'hasThumbnail' => (bool)($v['thumbnailKey'] || ($v['asset_thumb'] ?? null)), 'hasVideo' => (bool)($v['assetId'] || $v['videoUrl']), 'externalUrl' => $v['videoUrl'] ?? null,
    ] + (isset($v['counts']) ? ['counts' => $v['counts']] : []);
}

function version_row_dto(string $versionId): array
{
    $row = Db::rowRaw(
        'SELECT v.*, cu.`name` AS createdBy_name, au.`name` AS approvedBy_name, a.`thumbnailKey` AS asset_thumb FROM `video_versions` v
         LEFT JOIN `users` cu ON cu.`id` = v.`createdById` LEFT JOIN `users` au ON au.`id` = v.`approvedById` LEFT JOIN `assets` a ON a.`id` = v.`assetId` WHERE v.`id` = ?',
        [$versionId],
    );
    return version_dto(Db::hydrate('video_versions', $row) + array_diff_key($row, Db::table('video_versions')['cols']));
}

function scoped_version_row(Actor $actor, string $versionId): array
{
    [$s, $p] = scope_version($actor, 'v');
    $row = Db::rowRaw("SELECT v.* FROM `video_versions` v WHERE v.`id` = ? AND {$s}", [$versionId, ...$p]);
    if (!$row) {
        throw not_found('Version');
    }
    return Db::hydrate('video_versions', $row);
}

/** $in: assetId?, videoUrl?, notes?, changeSummary?, durationMs?, revisionId?, release? (auto|client|internal|draft), final? */
function create_version(Actor $actor, string $projectId, array $in): array
{
    assert_can($actor, 'versions:upload');
    $project = require_project($actor, $projectId);
    if (!in_array($project['status'], ['QUEUED', 'EDITING', 'INTERNAL_REVIEW', 'REVISION', 'AWAITING_ASSETS', 'CLIENT_REVIEW', 'FINAL_REVIEW'], true)) {
        throw new AppError('GATED', "This project isn't in production yet — versions can be uploaded once it's queued or being edited.");
    }
    if (empty($in['assetId']) && empty($in['videoUrl'])) {
        throw bad_request('Attach a video file or paste a video link.');
    }
    if (!empty($in['videoUrl']) && !preg_match('#^https?://#i', $in['videoUrl'])) {
        throw bad_request('The video link must start with http:// or https://', ['videoUrl' => 'Invalid URL.']);
    }
    if (!empty($in['assetId'])) {
        $a = Db::first('assets', ['sql' => "`id` = ? AND `projectId` = ? AND `deletedAt` IS NULL AND `status` = 'READY'", 'params' => [$in['assetId'], $projectId]]);
        if (!$a) {
            throw bad_request("That video file isn't available. Finish the upload first.");
        }
        if (!str_starts_with($a['mimeType'], 'video/')) {
            throw bad_request("The attached file isn't a video.");
        }
        if (Db::count('video_versions', ['assetId' => $a['id']])) {
            throw bad_request('That file is already attached to another version.');
        }
    }
    $wf = get_setting($actor->workspaceId, 'workflow');
    $releaseMode = $in['release'] ?? 'auto';
    $toInternal = $releaseMode === 'internal' || ($releaseMode === 'auto' && !empty($wf['requireInternalReview']));
    $draftOnly = $releaseMode === 'draft';
    $n = (int)Db::val('SELECT COALESCE(MAX(`versionNumber`), 0) FROM `video_versions` WHERE `projectId` = ?', [$projectId]) + 1;
    $label = !empty($in['final']) ? 'Final' : "V{$n}";
    $now = now_ms();
    $version = Db::tx(function () use ($actor, $projectId, $in, $n, $label, $draftOnly, $toInternal, $now, $project) {
        $v = Db::insert('video_versions', [
            'workspaceId' => $actor->workspaceId, 'projectId' => $projectId, 'versionNumber' => $n, 'label' => $label, 'assetId' => $in['assetId'] ?? null, 'videoUrl' => $in['videoUrl'] ?? null,
            'notes' => $in['notes'] ?? null, 'changeSummary' => $in['changeSummary'] ?? null, 'durationMs' => $in['durationMs'] ?? null, 'createdById' => $actor->userId, 'isFinal' => !empty($in['final']),
            'reviewStatus' => $draftOnly ? 'DRAFT' : ($toInternal ? 'INTERNAL_REVIEW' : 'PENDING_CLIENT'), 'releasedAt' => ($draftOnly || $toInternal) ? null : $now, 'isDemo' => $project['isDemo'],
        ]);
        if (!$draftOnly && !$toInternal) {
            Db::exec("UPDATE `video_versions` SET `reviewStatus` = 'SUPERSEDED' WHERE `projectId` = ? AND `id` <> ? AND `reviewStatus` IN ('PENDING_CLIENT','CHANGES_REQUESTED')", [$projectId, $v['id']]);
        }
        return $v;
    });
    // walk the project through the legal states rather than jumping
    $status = $project['status'];
    $step = function (string $to) use (&$status, $actor, $projectId, $label) {
        if ($status !== $to) {
            apply_transition($actor, $projectId, $to, ['comment' => "{$label} uploaded", 'quiet' => true]);
            $status = $to;
        }
    };
    if (!$draftOnly) {
        if ($status === 'AWAITING_ASSETS') {
            $step('QUEUED');
        }
        if ($status === 'QUEUED') {
            $step('EDITING');
        }
        if ($toInternal) {
            if (in_array($status, ['EDITING', 'REVISION'], true)) {
                $step('INTERNAL_REVIEW');
            }
        } elseif (in_array($status, ['EDITING', 'REVISION', 'INTERNAL_REVIEW'], true)) {
            $step('CLIENT_REVIEW');
        }
    } elseif ($status === 'QUEUED') {
        $step('EDITING');
    }
    if (!empty($in['revisionId'])) {
        complete_revision_internal($actor, $in['revisionId'], $version['id'], ['quiet' => true]);
    }
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'version.uploaded', 'entityType' => 'video_version', 'entityId' => $version['id'], 'message' => "{$actor->name} uploaded {$label} to {$project['code']}"]);
    log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'version.uploaded', 'message' => "{$actor->name} uploaded {$label}" . ($draftOnly ? ' (team only)' : ($toInternal ? ' for internal review' : '')), 'projectId' => $projectId, 'clientId' => $project['clientId'], 'visibility' => ($draftOnly || $toInternal) ? 'INTERNAL' : 'CLIENT', 'entityType' => 'video_version', 'entityId' => $version['id']]);
    $base = ['workspaceId' => $actor->workspaceId, 'actorId' => $actor->userId, 'projectId' => $projectId, 'clientId' => $project['clientId'], 'versionId' => $version['id']];
    if (!$draftOnly && !$toInternal) {
        // one clear notification per upload: "revision completed" when it answers a revision, otherwise "draft ready"
        emit(!empty($in['revisionId']) ? 'revision.completed' : 'draft.uploaded', $base + (!empty($in['revisionId']) ? ['revisionId' => $in['revisionId']] : []));
    } elseif ($toInternal) {
        $reviewers = Db::col("SELECT `userId` FROM `project_members` WHERE `projectId` = ? AND `role` IN ('REVIEWER','MANAGER')", [$projectId]);
        notify(['workspaceId' => $actor->workspaceId, 'userIds' => $reviewers, 'exclude' => [$actor->userId], 'category' => 'REVIEW', 'type' => 'version.internal_review', 'title' => "{$label} needs internal review", 'message' => "{$project['name']} ({$project['code']})", 'link' => "/admin/projects/{$projectId}/review/{$version['id']}", 'email' => false]);
    }
    return version_row_dto($version['id']);
}

/** Team-only → client. Used after internal review passes. */
function release_version(Actor $actor, string $versionId): array
{
    assert_can($actor, 'versions:review');
    $v = scoped_version_row($actor, $versionId);
    if ($v['releasedAt']) {
        throw new AppError('CONFLICT', 'This version has already been released.');
    }
    $project = require_project($actor, $v['projectId']);
    Db::exec("UPDATE `video_versions` SET `reviewStatus` = 'SUPERSEDED' WHERE `projectId` = ? AND `id` <> ? AND `reviewStatus` IN ('PENDING_CLIENT','CHANGES_REQUESTED')", [$v['projectId'], $v['id']]);
    Db::update('video_versions', ['id' => $versionId], ['reviewStatus' => 'PENDING_CLIENT', 'releasedAt' => now_ms()]);
    if ($project['status'] === 'INTERNAL_REVIEW') {
        apply_transition($actor, $v['projectId'], 'CLIENT_REVIEW', ['comment' => "{$v['label']} approved internally", 'quiet' => true]);
    }
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'version.released', 'entityType' => 'video_version', 'entityId' => $versionId, 'message' => "{$actor->name} released {$v['label']} to the client"]);
    log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'version.released', 'message' => "{$v['label']} is ready for client review", 'projectId' => $v['projectId'], 'clientId' => $project['clientId'], 'visibility' => 'CLIENT']);
    emit('draft.uploaded', ['workspaceId' => $actor->workspaceId, 'actorId' => $actor->userId, 'projectId' => $v['projectId'], 'clientId' => $project['clientId'], 'versionId' => $versionId]);
    return ['ok' => true];
}

function list_versions(Actor $actor, string $projectId): array
{
    require_project($actor, $projectId);
    [$s, $p] = scope_version($actor, 'v');
    $rows = Db::rows(
        "SELECT v.*, cu.`name` AS createdBy_name, au.`name` AS approvedBy_name, a.`thumbnailKey` AS asset_thumb FROM `video_versions` v
         LEFT JOIN `users` cu ON cu.`id` = v.`createdById` LEFT JOIN `users` au ON au.`id` = v.`approvedById` LEFT JOIN `assets` a ON a.`id` = v.`assetId`
         WHERE v.`projectId` = ? AND {$s} ORDER BY v.`versionNumber` DESC",
        [$projectId, ...$p],
    );
    $ids = array_column($rows, 'id');
    $counts = [];
    if ($ids) {
        [$ph, $pp] = Db::in($ids);
        foreach (Db::rows("SELECT `versionId`, `status` FROM `video_comments` WHERE `versionId` IN {$ph} AND `parentId` IS NULL", $pp) as $c) {
            $counts[$c['versionId']]['total'] = ($counts[$c['versionId']]['total'] ?? 0) + 1;
            if (in_array($c['status'], ['OPEN', 'IN_PROGRESS'], true)) {
                $counts[$c['versionId']]['open'] = ($counts[$c['versionId']]['open'] ?? 0) + 1;
            } elseif ($c['status'] === 'RESOLVED') {
                $counts[$c['versionId']]['resolved'] = ($counts[$c['versionId']]['resolved'] ?? 0) + 1;
            }
        }
    }
    return array_map(function ($r) use ($counts) {
        $extra = array_diff_key($r, Db::table('video_versions')['cols']);
        $c = $counts[$r['id']] ?? [];
        return version_dto(Db::hydrate('video_versions', $r) + $extra + ['counts' => ['open' => $c['open'] ?? 0, 'resolved' => $c['resolved'] ?? 0, 'total' => $c['total'] ?? 0]]);
    }, $rows);
}

function get_version_playback(Actor $actor, string $versionId, array $opts = []): array
{
    $v = scoped_version_row($actor, $versionId);
    $asset = $v['assetId'] ? Db::first('assets', ['id' => $v['assetId']]) : null;
    if ($v['videoUrl'] && !$asset) {
        return ['url' => $v['videoUrl'], 'external' => true, 'filename' => null, 'mimeType' => 'text/html'];
    }
    if (!$asset || $asset['status'] !== 'READY') {
        throw new AppError('GATED', 'This video is still processing.');
    }
    $url = storage()->downloadUrl($asset['storageKey'], ['filename' => "{$v['label']}-{$asset['displayName']}", 'contentType' => $asset['mimeType'], 'inline' => empty($opts['download'])]);
    return ['url' => $url, 'external' => false, 'filename' => $asset['displayName'], 'mimeType' => $asset['mimeType']];
}

function get_version_poster(Actor $actor, string $versionId): array
{
    $v = scoped_version_row($actor, $versionId);
    $asset = $v['assetId'] ? Db::first('assets', ['id' => $v['assetId']]) : null;
    $key = $v['thumbnailKey'] ?? ($asset['thumbnailKey'] ?? null);
    return ['url' => $key ? storage()->downloadUrl($key, ['inline' => true, 'contentType' => 'image/jpeg']) : null];
}

// ───────────────────────────── comments ─────────────────────────────

function comment_dto(array $c): array
{
    return [
        'id' => $c['id'], 'versionId' => $c['versionId'], 'parentId' => $c['parentId'], 'timecodeMs' => $c['timecodeMs'], 'timecode' => fmt_timecode($c['timecodeMs']), 'comment' => $c['comment'],
        'status' => $c['status'], 'isStaff' => $c['isStaff'], 'author' => $c['user_name'] ?? 'Unknown', 'authorId' => $c['userId'], 'revisionId' => $c['revisionId'],
        'createdAt' => $c['createdAt'], 'resolvedAt' => $c['resolvedAt'],
    ];
}

function comment_row_dto(string $id): array
{
    $row = Db::rowRaw('SELECT c.*, u.`name` AS user_name FROM `video_comments` c LEFT JOIN `users` u ON u.`id` = c.`userId` WHERE c.`id` = ?', [$id]);
    return comment_dto(Db::hydrate('video_comments', $row) + ['user_name' => $row['user_name']]);
}

function list_comments(Actor $actor, string $versionId): array
{
    scoped_version_row($actor, $versionId);
    $rows = Db::rows('SELECT c.*, u.`name` AS user_name FROM `video_comments` c LEFT JOIN `users` u ON u.`id` = c.`userId` WHERE c.`versionId` = ? ORDER BY c.`timecodeMs` ASC, c.`createdAt` ASC', [$versionId]);
    return array_map(fn($r) => comment_dto(Db::hydrate('video_comments', $r) + ['user_name' => $r['user_name']]), $rows);
}

/** $in: timecodeMs, comment, parentId? */
function add_comment(Actor $actor, string $versionId, array $in): array
{
    $v = scoped_version_row($actor, $versionId);
    $project = Db::first('projects', ['id' => $v['projectId']]);
    if ($actor->isStaff) {
        if (!$actor->can('revisions:manage') && !$actor->can('versions:review') && !$actor->can('messages:write')) {
            throw forbidden();
        }
    } else {
        assert_org_action($actor, $project['organizationId'], 'message');
        if (!in_array($v['reviewStatus'], ['PENDING_CLIENT', 'CHANGES_REQUESTED'], true)) {
            throw new AppError('GATED', $v['reviewStatus'] === 'APPROVED' ? "This version is approved, so it's closed for new notes." : 'This version has been replaced by a newer one. Add notes on the latest version.');
        }
    }
    $text = trim($in['comment']);
    if ($text === '') {
        throw bad_request('Write a comment first.', ['comment' => 'Required.']);
    }
    if (mb_strlen($text) > 2000) {
        throw bad_request('Please keep comments under 2,000 characters.', ['comment' => 'Too long.']);
    }
    if ($in['timecodeMs'] < 0) {
        throw bad_request('Invalid timecode.');
    }
    $parent = null;
    if (!empty($in['parentId'])) {
        $parent = Db::first('video_comments', ['id' => $in['parentId'], 'versionId' => $versionId]);
        if (!$parent) {
            throw not_found('Comment');
        }
    }
    $c = Db::insert('video_comments', [
        'workspaceId' => $actor->workspaceId, 'projectId' => $v['projectId'], 'versionId' => $versionId, 'userId' => $actor->userId, 'parentId' => $parent['id'] ?? null,
        'timecodeMs' => $parent['timecodeMs'] ?? (int)round($in['timecodeMs']), 'comment' => $text, 'isStaff' => $actor->isStaff, 'isDemo' => $project['isDemo'],
    ]);
    if ($parent && $parent['userId'] !== $actor->userId) {
        notify([
            'workspaceId' => $actor->workspaceId, 'userIds' => [$parent['userId']], 'category' => 'REVIEW', 'type' => 'comment.reply',
            'title' => "{$actor->name} replied to your note at " . fmt_timecode($parent['timecodeMs']), 'message' => mb_substr($text, 0, 140),
            'link' => ($actor->isStaff ? '/dashboard' : '/admin') . "/projects/{$v['projectId']}/review/{$versionId}", 'email' => false,
        ]);
    }
    return comment_row_dto($c['id']);
}

/** Editors/admins triage feedback; clients can withdraw (CLOSED) or reopen their own notes. */
function set_comment_status(Actor $actor, string $commentId, string $status, ?string $response = null): array
{
    [$s, $p] = scope_comment($actor, 'vc');
    $row = Db::rowRaw("SELECT vc.* FROM `video_comments` vc WHERE vc.`id` = ? AND {$s}", [$commentId, ...$p]);
    if (!$row) {
        throw not_found('Comment');
    }
    $c = Db::hydrate('video_comments', $row);
    $version = Db::first('video_versions', ['id' => $c['versionId']]);
    if ($actor->isStaff) {
        if (!$actor->can('revisions:manage')) {
            throw forbidden();
        }
    } else {
        if ($c['userId'] !== $actor->userId) {
            throw forbidden('You can only change your own notes.');
        }
        if (!in_array($status, ['OPEN', 'CLOSED'], true)) {
            throw forbidden();
        }
        if ($version['reviewStatus'] === 'APPROVED') {
            throw new AppError('GATED', 'This version is already approved.');
        }
    }
    $resolved = $status === 'RESOLVED';
    Db::update('video_comments', ['id' => $commentId], ['status' => $status, 'resolvedAt' => $resolved ? now_ms() : null, 'resolvedById' => $resolved ? $actor->userId : null]);
    if ($response !== null && trim($response) !== '' && $actor->isStaff) {
        Db::insert('video_comments', [
            'workspaceId' => $actor->workspaceId, 'projectId' => $c['projectId'], 'versionId' => $c['versionId'], 'userId' => $actor->userId, 'parentId' => $c['parentId'] ?? $c['id'],
            'timecodeMs' => $c['timecodeMs'], 'comment' => mb_substr(trim($response), 0, 2000), 'isStaff' => true, 'status' => 'OPEN', 'isDemo' => $c['isDemo'],
        ], false);
    }
    return comment_row_dto($commentId);
}

// ───────────────────────────── revisions ─────────────────────────────

function revision_dto(array $r): array
{
    return [
        'id' => $r['id'], 'projectId' => $r['projectId'], 'versionId' => $r['versionId'], 'versionLabel' => $r['version_label'] ?? null, 'description' => $r['description'], 'status' => $r['status'],
        'priority' => $r['priority'], 'roundNumber' => $r['roundNumber'], 'submittedBy' => $r['submittedBy_name'] ?? null, 'createdAt' => $r['createdAt'], 'resolvedAt' => $r['resolvedAt'],
    ] + (isset($r['commentCount']) ? ['commentCount' => $r['commentCount']] : []) + (isset($r['project']) ? ['project' => $r['project']] : []);
}

function revision_row_dto(string $id): array
{
    $row = Db::rowRaw('SELECT r.*, u.`name` AS submittedBy_name, v.`label` AS version_label FROM `revision_requests` r JOIN `users` u ON u.`id` = r.`submittedById` JOIN `video_versions` v ON v.`id` = r.`versionId` WHERE r.`id` = ?', [$id]);
    return revision_dto(Db::hydrate('revision_requests', $row) + array_diff_key($row, Db::table('revision_requests')['cols']));
}

/** Client sends their notes as a revision round. All open notes on that version are attached. $in: versionId, description?, priority? */
function submit_revision(Actor $actor, string $projectId, array $in): array
{
    $project = require_project($actor, $projectId);
    assert_org_action($actor, $project['organizationId'], 'approve');
    $v = scoped_version_row($actor, $in['versionId']);
    if ($v['projectId'] !== $projectId) {
        throw not_found('Version');
    }
    if ($v['reviewStatus'] !== 'PENDING_CLIENT') {
        throw new AppError('CONFLICT', $v['reviewStatus'] === 'CHANGES_REQUESTED' ? "You've already requested changes on this version." : 'Revisions can only be requested on the version currently waiting for your review.');
    }
    if (!in_array($project['status'], ['CLIENT_REVIEW', 'FINAL_REVIEW'], true)) {
        throw new AppError('GATED', "This project isn't waiting for your review.");
    }
    $open = Db::find('video_comments', ['versionId' => $v['id'], 'parentId' => null, 'revisionId' => null, 'status' => 'OPEN']);
    $desc = trim((string)($in['description'] ?? ''));
    if (!$open && $desc === '') {
        throw bad_request('Add at least one timestamped note or describe what should change.', ['description' => 'Required.']);
    }
    $round = $project['revisionsUsed'] + 1;
    $rev = Db::tx(function () use ($actor, $projectId, $v, $desc, $open, $round, $in, $project) {
        $r = Db::insert('revision_requests', [
            'workspaceId' => $actor->workspaceId, 'projectId' => $projectId, 'versionId' => $v['id'], 'submittedById' => $actor->userId,
            'description' => $desc !== '' ? $desc : count($open) . ' timestamped note' . (count($open) === 1 ? '' : 's') . " on {$v['label']}",
            'priority' => $in['priority'] ?? 'NORMAL', 'roundNumber' => $round, 'isDemo' => $project['isDemo'],
        ]);
        if ($open) {
            [$ph, $pp] = Db::in(array_column($open, 'id'));
            Db::exec("UPDATE `video_comments` SET `revisionId` = ? WHERE `id` IN {$ph}", [$r['id'], ...$pp]);
        }
        Db::update('video_versions', ['id' => $v['id']], ['reviewStatus' => 'CHANGES_REQUESTED']);
        Db::update('projects', ['id' => $projectId], ['revisionsUsed' => $round]);
        return $r;
    });
    apply_transition($actor, $projectId, 'REVISION', ['comment' => "Revision {$round} requested on {$v['label']}", 'quiet' => true]);
    $over = $round > $project['revisionLimit'];
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'revision.submitted', 'entityType' => 'revision', 'entityId' => $rev['id'], 'message' => "{$actor->name} requested revision {$round} on {$v['label']}" . ($over ? ' (exceeds included rounds)' : '')]);
    log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'revision.submitted', 'message' => "{$actor->name} requested changes on {$v['label']} (round {$round} of {$project['revisionLimit']} included)", 'projectId' => $projectId, 'clientId' => $project['clientId'], 'visibility' => 'CLIENT']);
    emit('revision.submitted', ['workspaceId' => $actor->workspaceId, 'actorId' => $actor->userId, 'projectId' => $projectId, 'clientId' => $project['clientId'], 'versionId' => $v['id'], 'revisionId' => $rev['id'], 'data' => ['round' => $round, 'over' => $over]]);
    if ($over) {
        notify(['workspaceId' => $actor->workspaceId, 'userIds' => $project['managerId'] ? [$project['managerId']] : [], 'category' => 'PROJECT', 'type' => 'scope.exceeded', 'title' => "{$project['code']}: revision {$round} exceeds the {$project['revisionLimit']} included rounds", 'message' => 'Consider a change-order quote before doing extra work.', 'link' => "/admin/projects/{$projectId}", 'email' => false]);
    }
    return revision_row_dto($rev['id']);
}

function complete_revision_internal(Actor $actor, string $revisionId, ?string $resolvedInVersionId, array $opts = []): void
{
    $rev = Db::first('revision_requests', ['id' => $revisionId]);
    if (!$rev) {
        throw not_found('Revision');
    }
    // never let a caller complete a revision belonging to a project they cannot see
    require_project($actor, $rev['projectId']);
    $project = Db::first('projects', ['id' => $rev['projectId']]);
    Db::tx(function () use ($revisionId, $resolvedInVersionId, $actor) {
        Db::update('revision_requests', ['id' => $revisionId], ['status' => 'RESOLVED', 'resolvedAt' => now_ms(), 'resolvedInVersionId' => $resolvedInVersionId]);
        Db::exec("UPDATE `video_comments` SET `status` = 'RESOLVED', `resolvedAt` = ?, `resolvedById` = ? WHERE `revisionId` = ? AND `status` IN ('OPEN','IN_PROGRESS')", [db_dt(), $actor->userId, $revisionId]);
    });
    log_activity($actor, ['workspaceId' => $rev['workspaceId'], 'type' => 'revision.completed', 'message' => "{$actor->name} completed revision {$rev['roundNumber']}", 'projectId' => $rev['projectId'], 'clientId' => $project['clientId'], 'visibility' => 'CLIENT']);
    if (empty($opts['quiet'])) {
        emit('revision.completed', ['workspaceId' => $rev['workspaceId'], 'actorId' => $actor->userId, 'projectId' => $rev['projectId'], 'clientId' => $project['clientId'], 'revisionId' => $revisionId]);
    }
}

function set_revision_status(Actor $actor, string $revisionId, string $status): array
{
    assert_can($actor, 'revisions:manage');
    [$s, $p] = scope_project($actor, 'p');
    $rev = Db::rowRaw("SELECT r.* FROM `revision_requests` r JOIN `projects` p ON p.`id` = r.`projectId` WHERE r.`id` = ? AND {$s}", [$revisionId, ...$p]);
    if (!$rev) {
        throw not_found('Revision');
    }
    if ($status === 'RESOLVED') {
        complete_revision_internal($actor, $revisionId, null);
    } else {
        Db::update('revision_requests', ['id' => $revisionId], ['status' => $status, 'resolvedAt' => in_array($status, ['REJECTED', 'CLOSED'], true) ? now_ms() : null]);
        if ($status === 'IN_PROGRESS') {
            Db::exec("UPDATE `video_comments` SET `status` = 'IN_PROGRESS' WHERE `revisionId` = ? AND `status` = 'OPEN'", [$revisionId]);
        }
    }
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'revision.status_changed', 'entityType' => 'revision', 'entityId' => $revisionId, 'message' => "{$actor->name} set a revision to {$status}"]);
    return revision_row_dto($revisionId);
}

/** $opts: projectId, status (open|<status>) */
function list_revisions(Actor $actor, array $opts = []): array
{
    [$s, $p] = scope_project($actor, 'p');
    $where = [$s];
    if (!empty($opts['projectId'])) {
        $where[] = 'r.`projectId` = ?';
        $p[] = $opts['projectId'];
    }
    if (($opts['status'] ?? null) === 'open') {
        $where[] = "r.`status` IN ('OPEN','IN_PROGRESS')";
    } elseif (!empty($opts['status'])) {
        $where[] = 'r.`status` = ?';
        $p[] = $opts['status'];
    }
    $w = implode(' AND ', array_map(fn($x) => "({$x})", $where));
    $rows = Db::rows(
        "SELECT r.*, u.`name` AS submittedBy_name, v.`label` AS version_label, p.`id` AS p_id, p.`name` AS p_name, p.`code` AS p_code,
           (SELECT COUNT(*) FROM `video_comments` c WHERE c.`revisionId` = r.`id`) AS commentCount
         FROM `revision_requests` r JOIN `projects` p ON p.`id` = r.`projectId` JOIN `users` u ON u.`id` = r.`submittedById` JOIN `video_versions` v ON v.`id` = r.`versionId`
         WHERE {$w} ORDER BY r.`createdAt` DESC LIMIT 100",
        $p,
    );
    return array_map(function ($r) {
        $extra = ['submittedBy_name' => $r['submittedBy_name'], 'version_label' => $r['version_label'], 'commentCount' => (int)$r['commentCount'], 'project' => ['id' => $r['p_id'], 'name' => $r['p_name'], 'code' => $r['p_code']]];
        return revision_dto(Db::hydrate('revision_requests', array_intersect_key($r, Db::table('revision_requests')['cols'])) + $extra);
    }, $rows);
}

// ───────────────────────────── approval ─────────────────────────────

/**
 * Approval is pinned to a specific version and the caller must echo its number — the client can never
 * accidentally approve "whatever is latest". Records who/when/which version/notes. $in: versionId, confirmVersionNumber, notes?
 */
function approve_version(Actor $actor, string $projectId, array $in): array
{
    $project = require_project($actor, $projectId);
    assert_org_action($actor, $project['organizationId'], 'approve');
    $v = scoped_version_row($actor, $in['versionId']);
    if ($v['projectId'] !== $projectId) {
        throw not_found('Version');
    }
    if ($v['versionNumber'] !== (int)$in['confirmVersionNumber']) {
        throw new AppError('CONFLICT', "You confirmed Version {$in['confirmVersionNumber']}, but this is Version {$v['versionNumber']}. Please review and confirm again.");
    }
    if ($v['reviewStatus'] !== 'PENDING_CLIENT') {
        throw new AppError('CONFLICT', $v['reviewStatus'] === 'APPROVED' ? 'This version is already approved.' : 'Only the version currently waiting for your review can be approved.');
    }
    if (!in_array($project['status'], ['CLIENT_REVIEW', 'FINAL_REVIEW'], true)) {
        throw new AppError('GATED', "This project isn't waiting for your approval.");
    }
    $now = now_ms();
    Db::tx(function () use ($v, $actor, $in, $now, $projectId) {
        // atomic: two concurrent approvals cannot both win
        if (Db::exec("UPDATE `video_versions` SET `reviewStatus` = 'APPROVED', `approvedById` = ?, `approvedAt` = ?, `approvalNotes` = ?, `isFinal` = 1 WHERE `id` = ? AND `reviewStatus` = 'PENDING_CLIENT'", [$actor->userId, db_dt($now), trim((string)($in['notes'] ?? '')) ?: null, $v['id']]) !== 1) {
            throw new AppError('CONFLICT', 'This version is already approved.');
        }
        Db::exec("UPDATE `video_versions` SET `reviewStatus` = 'SUPERSEDED' WHERE `projectId` = ? AND `id` <> ? AND `reviewStatus` IN ('PENDING_CLIENT','CHANGES_REQUESTED')", [$projectId, $v['id']]);
        Db::exec("UPDATE `revision_requests` SET `status` = 'CLOSED', `resolvedAt` = ? WHERE `projectId` = ? AND `status` IN ('OPEN','IN_PROGRESS')", [db_dt($now), $projectId]);
    });
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'version.approved', 'entityType' => 'video_version', 'entityId' => $v['id'], 'message' => "{$actor->name} approved Video {$v['label']}", 'metadata' => ['versionNumber' => $v['versionNumber'], 'notes' => $in['notes'] ?? null]]);
    log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'version.approved', 'message' => "{$actor->name} approved {$v['label']}", 'projectId' => $projectId, 'clientId' => $project['clientId'], 'visibility' => 'CLIENT']);
    apply_transition($actor, $projectId, 'APPROVED', ['comment' => "{$v['label']} approved by {$actor->name}", 'quiet' => true]);
    ensure_balance_invoice(system_actor('System'), $projectId);
    emit('project.status_changed', ['workspaceId' => $actor->workspaceId, 'actorId' => $actor->userId, 'projectId' => $projectId, 'clientId' => $project['clientId'], 'data' => ['from' => $project['status'], 'to' => 'APPROVED', 'toStatus' => 'APPROVED', 'toStatusLabel' => 'Approved']]);
    return ['approved' => $v['label'], 'versionNumber' => $v['versionNumber']];
}

// ───────────────────────────── review page payload ─────────────────────────────

function get_review_data(Actor $actor, string $projectId, ?string $versionId = null): array
{
    $project = require_project($actor, $projectId);
    $versions = list_versions($actor, $projectId);
    $pinfo = ['id' => $project['id'], 'name' => $project['name'], 'code' => $project['code'], 'status' => $project['status'], 'revisionLimit' => $project['revisionLimit'], 'revisionsUsed' => $project['revisionsUsed']];
    if (!$versions) {
        return ['project' => $pinfo, 'versions' => [], 'current' => null, 'comments' => [], 'revisions' => [], 'perms' => ['canComment' => false, 'canApprove' => false, 'canRequestRevision' => false, 'canTriage' => false]];
    }
    $current = $versions[0];
    foreach ($versions as $v) {
        if ($v['id'] === $versionId) {
            $current = $v;
        }
    }
    $comments = list_comments($actor, $current['id']);
    $revisions = list_revisions($actor, ['projectId' => $projectId]);
    $orgOk = function (string $action) use ($actor, $project) {
        try {
            assert_org_action($actor, $project['organizationId'], $action);
            return true;
        } catch (Throwable) {
            return false;
        }
    };
    $openForClient = in_array($current['reviewStatus'], ['PENDING_CLIENT', 'CHANGES_REQUESTED'], true);
    $reviewable = in_array($project['status'], ['CLIENT_REVIEW', 'FINAL_REVIEW'], true);
    return [
        'project' => $pinfo, 'versions' => $versions, 'current' => $current, 'comments' => $comments, 'revisions' => $revisions,
        'perms' => [
            'canComment' => $actor->isStaff ? ($actor->can('revisions:manage') || $actor->can('versions:review')) : ($orgOk('message') && $openForClient),
            'canApprove' => !$actor->isStaff && $orgOk('approve') && $current['reviewStatus'] === 'PENDING_CLIENT' && $reviewable,
            'canRequestRevision' => !$actor->isStaff && $orgOk('approve') && $current['reviewStatus'] === 'PENDING_CLIENT' && $reviewable,
            'canTriage' => $actor->isStaff && $actor->can('revisions:manage'),
            'canRelease' => $actor->isStaff && $actor->can('versions:review') && !$current['releasedAt'],
        ],
    ];
}
