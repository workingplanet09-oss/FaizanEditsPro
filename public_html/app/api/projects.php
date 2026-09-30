<?php
/** /api/projects/*, versions, revisions, comments, change/file requests, tasks, time, notes, meetings, recurring work, retainers. */
defined('FEP') or exit;

$pageQ = fn() => V::coerceNum()->optional();
$prio = fn() => V::enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);

// ── projects ──
api('GET', '/api/projects', fn(Ctx $c) => list_projects($c->actor, $c->query), ['query' => V::obj([
    'q' => V::str()->optional(), 'status' => V::str()->optional(), 'clientId' => V::str()->optional(), 'editorId' => V::str()->optional(), 'type' => V::str()->optional(), 'priority' => V::str()->optional(),
    'payment' => V::str()->optional(), 'deadline' => V::str()->optional(), 'sort' => V::str()->optional(), 'view' => V::enum(['open', 'all'])->optional(), 'page' => $pageQ(), 'pageSize' => $pageQ(),
])]);
api('POST', '/api/projects', function (Ctx $c) {
    $b = $c->body;
    if (!empty($b['managerId']) && !Db::exists('users', ['sql' => "`id` = ? AND `workspaceId` = ? AND `isStaff` = 1 AND `status` <> 'SUSPENDED'", 'params' => [$b['managerId'], $c->actor->workspaceId]])) {
        throw bad_request('Choose an active team member as manager.', ['managerId' => 'Invalid.']);
    }
    return create_project($c->actor, $b + ['status' => 'AWAITING_QUOTE']);
}, ['status' => 201, 'body' => V::obj([
    'clientId' => V::str(), 'name' => V::str()->trim()->min(2)->max(200), 'description' => V::str()->max(4000)->nullish(), 'serviceId' => V::str()->nullish(), 'projectTypeKey' => V::str()->max(60)->nullish(),
    'priority' => $prio()->optional(), 'deadline' => V::date()->nullish(), 'managerId' => V::str()->nullish(), 'templateId' => V::str()->nullish(), 'currency' => V::str()->length(3)->optional(),
    'revisionLimit' => V::num()->int()->min(0)->max(20)->optional(), 'clientVisible' => V::bool()->optional(),
])]);
api('GET', '/api/projects/{id}', fn(Ctx $c) => get_project_detail($c->actor, $c->params['id']));
api('PATCH', '/api/projects/{id}', fn(Ctx $c) => update_project($c->actor, $c->params['id'], $c->body), ['body' => V::obj([
    'name' => V::str()->trim()->min(2)->max(200)->optional(), 'description' => V::str()->max(4000)->nullish(), 'priority' => $prio()->optional(), 'deadline' => V::date()->nullish(),
    'revisionLimit' => V::num()->int()->min(0)->max(20)->optional(), 'tags' => V::arr(V::str()->max(40))->max(20)->optional(), 'serviceId' => V::str()->nullish(),
    'internalCost' => V::num()->int()->min(0)->nullish(), 'rushFee' => V::num()->int()->min(0)->nullish(),
    'scope' => V::obj([
        'deliverables' => V::arr(V::obj(['label' => V::str()->max(150), 'quantity' => V::num()->int()->min(1)->max(999)]))->max(40)->optional(),
        'revisionRounds' => V::num()->int()->min(0)->max(20)->optional(), 'turnaroundBusinessDays' => V::num()->int()->min(1)->max(120)->optional(), 'notes' => V::str()->max(2000)->optional(),
    ])->optional(),
])]);
api('POST', '/api/projects/{id}/transition', function (Ctx $c) {
    $b = $c->body;
    $p = transition_project($c->actor, $c->params['id'], $b['to'], ['comment' => $b['comment'] ?? null, 'override' => $b['override'] ?? false]);
    return ['id' => $p['id'], 'status' => $p['status']];
}, ['body' => V::obj(['to' => V::enum(project_statuses()), 'comment' => V::str()->max(500)->optional(), 'override' => V::bool()->optional()])]);
api('POST', '/api/projects/{id}/assign', fn(Ctx $c) => assign_project($c->actor, $c->params['id'], $c->body), ['body' => V::obj([
    'managerId' => V::str()->nullish(), 'editorIds' => V::arr(V::str())->max(20)->optional(), 'motionDesignerIds' => V::arr(V::str())->max(20)->optional(), 'reviewerIds' => V::arr(V::str())->max(20)->optional(),
])]);
api('GET', '/api/assignable', fn(Ctx $c) => list_assignable($c->actor));
api('POST', '/api/projects/{id}/duplicate', function (Ctx $c) {
    $p = duplicate_project($c->actor, $c->params['id'], $c->body);
    return ['id' => $p['id'], 'code' => $p['code']];
}, ['status' => 201, 'body' => V::obj(['name' => V::str()->max(200)->optional(), 'copyOnboarding' => V::bool()->optional()])->default([])]);
api('GET', '/api/projects/{id}/milestones', fn(Ctx $c) => project_milestones($c->actor, $c->params['id']));
api('GET', '/api/projects/{id}/timeline', fn(Ctx $c) => ['milestones' => project_milestones($c->actor, $c->params['id']), 'events' => project_timeline($c->actor, $c->params['id'])]);
api('GET', '/api/projects/{id}/time', fn(Ctx $c) => list_time($c->actor, ['projectId' => $c->params['id']]));

// ── brief & onboarding ──
api('GET', '/api/projects/{id}/brief', fn(Ctx $c) => get_brief($c->actor, $c->params['id']));
api('PATCH', '/api/projects/{id}/brief', fn(Ctx $c) => update_brief_answers($c->actor, $c->params['id'], $c->body['answers']), ['body' => V::obj(['answers' => V::rec(V::any())])]);
api('POST', '/api/projects/{id}/brief', fn(Ctx $c) => confirm_brief($c->actor, $c->params['id']));
api('GET', '/api/projects/{id}/onboarding', fn(Ctx $c) => get_project_onboarding($c->actor, $c->params['id']));
/** Debounced autosave from the setup wizard. */
api('PUT', '/api/projects/{id}/onboarding', fn(Ctx $c) => autosave_project_onboarding($c->actor, $c->params['id'], $c->body), ['body' => V::obj(['answers' => V::rec(V::any()), 'step' => V::num()->int()->min(0)->max(50)])]);
api('POST', '/api/projects/{id}/onboarding', fn(Ctx $c) => submit_project_onboarding($c->actor, $c->params['id'], $c->body), ['body' => V::obj(['answers' => V::rec(V::any())])]);

// ── versions, review, approval ──
$versionBody = fn() => [
    'assetId' => V::str()->optional(), 'videoUrl' => V::str()->url()->max(500)->optional(), 'notes' => V::str()->max(3000)->optional(), 'changeSummary' => V::str()->max(2000)->optional(),
    'durationMs' => V::num()->int()->min(0)->optional(), 'revisionId' => V::str()->optional(), 'release' => V::enum(['auto', 'client', 'internal', 'draft'])->optional(), 'final' => V::bool()->optional(),
];
api('GET', '/api/projects/{id}/versions', fn(Ctx $c) => list_versions($c->actor, $c->params['id']));
api('POST', '/api/projects/{id}/versions', fn(Ctx $c) => create_version($c->actor, $c->params['id'], $c->body), ['status' => 201, 'body' => V::obj($versionBody())]);
/** Upload a new edit (V1, V2…). Previous versions are never overwritten. */
api('POST', '/api/video-versions', function (Ctx $c) {
    $b = $c->body;
    $pid = $b['projectId'];
    unset($b['projectId']);
    return create_version($c->actor, $pid, $b);
}, ['status' => 201, 'body' => V::obj(['projectId' => V::str()] + $versionBody())]);
api('POST', '/api/video-versions/{id}/release', fn(Ctx $c) => release_version($c->actor, $c->params['id']));
api('GET', '/api/video-versions/{id}/playback', fn(Ctx $c) => get_version_playback($c->actor, $c->params['id'], ['download' => ($c->query['download'] ?? null) === '1']), ['query' => V::obj(['download' => V::str()->optional()])]);
api('GET', '/api/video-versions/{id}/poster', fn(Ctx $c) => get_version_poster($c->actor, $c->params['id']));
api('GET', '/api/video-versions/{id}/comments', fn(Ctx $c) => list_comments($c->actor, $c->params['id']));
/** Timestamped feedback (milliseconds from start). */
api('POST', '/api/video-versions/{id}/comments', fn(Ctx $c) => add_comment($c->actor, $c->params['id'], $c->body), ['status' => 201, 'body' => V::obj([
    'timecodeMs' => V::num()->int()->min(0)->max(86400000), 'comment' => V::str()->min(1)->max(2000), 'parentId' => V::str()->nullish(),
])]);
api('PATCH', '/api/video-comments/{id}', fn(Ctx $c) => set_comment_status($c->actor, $c->params['id'], $c->body['status'], $c->body['response'] ?? null), ['body' => V::obj([
    'status' => V::enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'CLOSED']), 'response' => V::str()->max(2000)->optional(),
])]);
/** Pinned to a specific version; the caller must echo its number. */
api('POST', '/api/projects/{id}/approve', fn(Ctx $c) => approve_version($c->actor, $c->params['id'], $c->body), ['body' => V::obj([
    'versionId' => V::str(), 'confirmVersionNumber' => V::num()->int()->min(1), 'notes' => V::str()->max(1000)->optional(),
])]);
api('GET', '/api/revisions', fn(Ctx $c) => list_revisions($c->actor, $c->query), ['query' => V::obj(['projectId' => V::str()->optional(), 'status' => V::str()->optional()])]);
/** The client sends their timestamped notes as a revision round. */
api('POST', '/api/revisions', fn(Ctx $c) => submit_revision($c->actor, $c->body['projectId'], $c->body), ['status' => 201, 'body' => V::obj([
    'projectId' => V::str(), 'versionId' => V::str(), 'description' => V::str()->max(3000)->optional(), 'priority' => $prio()->optional(),
])]);
api('PATCH', '/api/revisions/{id}', fn(Ctx $c) => set_revision_status($c->actor, $c->params['id'], $c->body['status']), ['body' => V::obj(['status' => V::enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'CLOSED'])])]);

// ── change requests, file requests, feedback ──
api('GET', '/api/projects/{id}/change-requests', fn(Ctx $c) => list_change_requests($c->actor, $c->params['id']));
api('POST', '/api/projects/{id}/change-requests', fn(Ctx $c) => create_change_request($c->actor, $c->params['id'], $c->body), ['status' => 201, 'body' => V::obj([
    'whatChanged' => V::str()->trim()->min(5)->max(3000), 'why' => V::str()->max(2000)->optional(), 'additionalRequirements' => V::str()->max(3000)->optional(), 'referenceAssetIds' => V::arr(V::str())->max(10)->optional(),
])]);
api('PATCH', '/api/change-requests/{id}', fn(Ctx $c) => classify_change_request($c->actor, $c->params['id'], $c->body), ['body' => V::obj([
    'classification' => V::enum(['PENDING', 'INCLUDED', 'OUT_OF_SCOPE', 'ADDITIONAL_COST']), 'staffNote' => V::str()->max(2000)->optional(),
    'createQuote' => V::obj(['title' => V::str()->max(200), 'amount' => V::num()->int()->min(1), 'description' => V::str()->max(1000)->optional()])->optional(),
])]);
api('GET', '/api/projects/{id}/file-requests', fn(Ctx $c) => list_file_requests($c->actor, $c->params['id'], ['openOnly' => ($c->query['open'] ?? null) === '1']), ['query' => V::obj(['open' => V::str()->optional()])]);
api('POST', '/api/projects/{id}/file-requests', fn(Ctx $c) => create_file_request($c->actor, $c->params['id'], $c->body), ['status' => 201, 'body' => V::obj([
    'title' => V::str()->trim()->min(3)->max(200), 'description' => V::str()->max(1000)->optional(), 'acceptedTypes' => V::arr(V::str()->max(20))->max(10)->optional(),
])]);
api('DELETE', '/api/file-requests/{id}', fn(Ctx $c) => cancel_file_request($c->actor, $c->params['id']));
api('GET', '/api/projects/{id}/feedback', fn(Ctx $c) => get_feedback_state($c->actor, $c->params['id']));
api('POST', '/api/projects/{id}/feedback', fn(Ctx $c) => submit_testimonial($c->actor, $c->params['id'], $c->body), ['status' => 201, 'body' => V::obj([
    'rating' => V::num()->int()->min(1)->max(5), 'quote' => V::str()->trim()->min(10)->max(2000), 'permissionToPublish' => V::bool(), 'name' => V::str()->trim()->min(2)->max(100),
    'role' => V::str()->max(100)->optional(), 'company' => V::str()->max(100)->optional(), 'imageUrl' => V::str()->url()->max(500)->optional(),
])]);

// ── tasks, time ──
$taskStatus = fn() => V::enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'COMPLETE']);
api('GET', '/api/tasks', fn(Ctx $c) => list_tasks($c->actor, $c->query), ['query' => V::obj([
    'projectId' => V::str()->optional(), 'assigneeId' => V::str()->optional(), 'status' => V::str()->optional(), 'mine' => V::str()->optional(), 'due' => V::str()->optional(), 'q' => V::str()->optional(), 'page' => $pageQ(), 'pageSize' => $pageQ(),
])]);
api('POST', '/api/tasks', fn(Ctx $c) => create_task($c->actor, $c->body), ['status' => 201, 'body' => V::obj([
    'projectId' => V::str()->nullish(), 'parentId' => V::str()->nullish(), 'title' => V::str()->trim()->min(1)->max(200), 'description' => V::str()->max(3000)->optional(), 'assigneeId' => V::str()->nullish(),
    'priority' => $prio()->optional(), 'dueDate' => V::date()->nullish(), 'status' => $taskStatus()->optional(),
])]);
api('PATCH', '/api/tasks/{id}', fn(Ctx $c) => update_task($c->actor, $c->params['id'], $c->body), ['body' => V::obj([
    'title' => V::str()->trim()->min(1)->max(200)->optional(), 'description' => V::str()->max(3000)->nullish(), 'assigneeId' => V::str()->nullish(), 'priority' => $prio()->optional(),
    'dueDate' => V::date()->nullish(), 'status' => $taskStatus()->optional(), 'sortOrder' => V::num()->int()->optional(),
])]);
api('DELETE', '/api/tasks/{id}', fn(Ctx $c) => delete_task($c->actor, $c->params['id']));
api('GET', '/api/tasks/{id}/comments', fn(Ctx $c) => list_task_comments($c->actor, $c->params['id']));
api('POST', '/api/tasks/{id}/comments', fn(Ctx $c) => add_task_comment($c->actor, $c->params['id'], $c->body['body']), ['status' => 201, 'body' => V::obj(['body' => V::str()->trim()->min(1)->max(3000)])]);

api('GET', '/api/time', fn(Ctx $c) => ['running' => my_timer($c->actor), 'entries' => list_time($c->actor, $c->query)], ['query' => V::obj(['projectId' => V::str()->optional(), 'userId' => V::str()->optional()])]);
api('POST', '/api/time', function (Ctx $c) {
    $b = $c->body;
    return !empty($b['minutes']) ? add_manual_time($c->actor, ['projectId' => $b['projectId'], 'minutes' => $b['minutes'], 'note' => $b['note'] ?? null, 'date' => $b['date'] ?? null]) : start_timer($c->actor, $b);
}, ['status' => 201, 'body' => V::obj([
    'projectId' => V::str(), 'taskId' => V::str()->optional(), 'note' => V::str()->max(500)->optional(), 'minutes' => V::num()->int()->min(1)->max(1440)->optional(), 'date' => V::date()->optional(),
])]);
api('POST', '/api/time/stop', fn(Ctx $c) => stop_timer($c->actor));
api('DELETE', '/api/time/{id}', fn(Ctx $c) => delete_time($c->actor, $c->params['id']));

// ── internal notes (staff only) ──
$entity = fn() => V::enum(['LEAD', 'CLIENT', 'PROJECT', 'TASK', 'INVOICE']);
api('GET', '/api/notes', fn(Ctx $c) => list_notes($c->actor, $c->query['entityType'], $c->query['entityId']), ['query' => V::obj(['entityType' => $entity(), 'entityId' => V::str()])]);
api('POST', '/api/notes', fn(Ctx $c) => add_note($c->actor, $c->body), ['status' => 201, 'body' => V::obj([
    'entityType' => $entity(), 'entityId' => V::str(), 'body' => V::str()->max(5000), 'mentionUserIds' => V::arr(V::str())->max(10)->optional(), 'pinned' => V::bool()->optional(),
])]);
api('DELETE', '/api/notes/{id}', fn(Ctx $c) => delete_note($c->actor, $c->params['id']));
api('PATCH', '/api/notes/{id}', fn(Ctx $c) => pin_note($c->actor, $c->params['id'], $c->body['pinned']), ['body' => V::obj(['pinned' => V::bool()])]);

// ── meetings, recurring work, retainers ──
$meetingType = fn() => V::enum(['DISCOVERY_CALL', 'PROJECT_CONSULTATION', 'CLIENT_REVIEW_CALL', 'STRATEGY_CALL']);
api('GET', '/api/meetings', fn(Ctx $c) => list_meetings($c->actor, $c->query), ['query' => V::obj(['from' => V::date()->optional(), 'to' => V::date()->optional(), 'status' => V::str()->optional()])]);
api('POST', '/api/meetings', fn(Ctx $c) => create_meeting($c->actor, $c->body), ['status' => 201, 'body' => V::obj([
    'type' => $meetingType(), 'title' => V::str()->trim()->min(2)->max(200), 'startsAt' => V::date(), 'minutes' => V::num()->int()->min(10)->max(240)->optional(),
    'clientId' => V::str()->nullish(), 'leadId' => V::str()->nullish(), 'projectId' => V::str()->nullish(), 'notes' => V::str()->max(1500)->optional(),
])]);
api('PATCH', '/api/meetings/{id}', fn(Ctx $c) => update_meeting($c->actor, $c->params['id'], $c->body), ['body' => V::obj([
    'status' => V::enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])->optional(), 'notes' => V::str()->max(1500)->nullish(), 'startsAt' => V::date()->optional(),
])]);

api('GET', '/api/recurring', fn(Ctx $c) => list_schedules($c->actor, $c->query['clientId'] ?? null), ['query' => V::obj(['clientId' => V::str()->optional()])]);
api('POST', '/api/recurring', fn(Ctx $c) => create_schedule($c->actor, $c->body), ['status' => 201, 'body' => V::obj([
    'clientId' => V::str(), 'templateId' => V::str(), 'name' => V::str()->trim()->max(120), 'cadence' => V::enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']), 'firstRunAt' => V::date(),
])]);
api('PATCH', '/api/recurring/{id}', fn(Ctx $c) => set_schedule_active($c->actor, $c->params['id'], $c->body['active']), ['body' => V::obj(['active' => V::bool()])]);

api('GET', '/api/retainers', fn(Ctx $c) => list_retainers($c->actor, $c->query), ['query' => V::obj(['status' => V::str()->optional(), 'clientId' => V::str()->optional()])]);
api('POST', '/api/retainers', fn(Ctx $c) => create_retainer($c->actor, $c->body), ['status' => 201, 'body' => V::obj([
    'clientId' => V::str(), 'planId' => V::str()->nullish(), 'name' => V::str()->trim()->min(2)->max(120), 'monthlyPrice' => V::num()->int()->min(0), 'currency' => V::str()->length(3)->optional(),
    'videosIncluded' => V::num()->int()->min(0)->max(1000)->optional(), 'shortsIncluded' => V::num()->int()->min(0)->max(1000)->optional(), 'hoursIncluded' => V::num()->int()->min(0)->max(1000)->optional(),
    'turnaroundDays' => V::num()->int()->min(1)->max(60)->optional(), 'revisionsIncluded' => V::num()->int()->min(0)->max(20)->optional(), 'startDate' => V::date()->optional(), 'notes' => V::str()->max(1000)->nullish(),
])]);
api('GET', '/api/retainers/{id}', fn(Ctx $c) => get_retainer_usage($c->actor, $c->params['id']));
api('PATCH', '/api/retainers/{id}', fn(Ctx $c) => update_retainer($c->actor, $c->params['id'], $c->body), ['body' => V::obj([
    'name' => V::str()->max(120)->optional(), 'monthlyPrice' => V::num()->int()->min(0)->optional(), 'videosIncluded' => V::num()->int()->min(0)->optional(), 'shortsIncluded' => V::num()->int()->min(0)->optional(),
    'hoursIncluded' => V::num()->int()->min(0)->optional(), 'turnaroundDays' => V::num()->int()->min(1)->optional(), 'revisionsIncluded' => V::num()->int()->min(0)->optional(), 'renewalDate' => V::date()->optional(),
    'status' => V::enum(['ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED'])->optional(), 'notes' => V::str()->max(1000)->nullish(),
])]);
api('POST', '/api/retainers/{id}/projects', function (Ctx $c) {
    $p = start_retainer_project($c->actor, $c->params['id'], $c->body);
    return ['id' => $p['id'], 'code' => $p['code']];
}, ['status' => 201, 'body' => V::obj(['name' => V::str()->trim()->min(2)->max(200), 'description' => V::str()->max(3000)->optional(), 'kind' => V::enum(['VIDEO', 'SHORT'])->optional(), 'deadline' => V::date()->nullish()])]);
