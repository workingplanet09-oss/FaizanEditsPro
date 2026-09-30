<?php
/** Project briefs: composed from the client record, brand kit, inquiry and the detailed onboarding answers; locked once production starts. */
defined('FEP') or exit;

const FEP_PROJECT_FORM = 'project_onboarding';

const FEP_BRIEF_SECTIONS = [
    ['key' => 'client', 'title' => 'Client information'],
    ['key' => 'project', 'title' => 'Project information'],
    ['key' => 'creative', 'title' => 'Creative direction'],
    ['key' => 'technical', 'title' => 'Technical specifications'],
    ['key' => 'deliverables', 'title' => 'Deliverables'],
    ['key' => 'references', 'title' => 'References'],
    ['key' => 'deadline', 'title' => 'Deadline & schedule'],
    ['key' => 'brand', 'title' => 'Brand requirements'],
    ['key' => 'revisions', 'title' => 'Revision policy'],
    ['key' => 'special', 'title' => 'Special instructions'],
];

/** @return array<string,array> question key → question definition */
function form_questions_by_key(?array $form): array
{
    $m = [];
    foreach ($form['sections'] ?? [] as $s) {
        foreach ($s['questions'] as $q) {
            $m[$q['key']] = $q;
        }
    }
    return $m;
}

/** Composes the clean, editor-facing brief from the client record, brand kit, inquiry and onboarding answers. */
function generate_brief(string $projectId): array
{
    $project = Db::first('projects', ['id' => $projectId]) ?? throw not_found('Project');
    $ws = $project['workspaceId'];
    $client = Db::first('clients', ['id' => $project['clientId']]);
    $kit = Db::first('client_brand_kits', ['clientId' => $client['id']]);
    $service = $project['serviceId'] ? Db::first('services', ['id' => $project['serviceId']]) : null;
    $ptype = $project['projectTypeId'] ? Db::first('project_types', ['id' => $project['projectTypeId']]) : null;
    $existing = Db::first('project_briefs', ['projectId' => $projectId]);
    $form = get_form_def($ws, FEP_PROJECT_FORM);
    $inquiry = get_form_def($ws, 'inquiry');
    $projectAnswers = load_responses('PROJECT', $projectId)['answers'];
    $leadId = $project['leadId'] ?: Db::val('SELECT `id` FROM `leads` WHERE `convertedClientId` = ? OR `existingClientId` = ? ORDER BY `createdAt` DESC LIMIT 1', [$project['clientId'], $project['clientId']]);
    $leadAnswers = $leadId ? load_responses('LEAD', $leadId)['answers'] : [];
    $business = get_setting($ws, 'business');
    $scope = $project['scope'] ?? FEP_DEFAULT_SCOPE;
    $qs = form_questions_by_key($form);
    $iqs = form_questions_by_key($inquiry);
    $sections = [];
    foreach (FEP_BRIEF_SECTIONS as $s) {
        $sections[$s['key']] = [];
    }
    $add = function (string $key, string $label, $value) use (&$sections) {
        if ($value !== null && trim((string)$value) !== '') {
            $sections[$key][] = ['label' => $label, 'value' => (string)$value];
        }
    };
    $add('client', 'Name', $client['name']);
    $add('client', 'Company', $client['companyName']);
    $add('client', 'Email', $client['email']);
    $add('client', 'Phone', $client['phone']);
    $add('client', 'Website', $client['website']);
    foreach (is_array($client['socialLinks']) ? $client['socialLinks'] : [] as $k => $v) {
        $add('client', ucfirst((string)$k), $v);
    }
    $add('project', 'Project', "{$project['name']} ({$project['code']})");
    $add('project', 'Service', $service['title'] ?? null);
    $add('project', 'Project type', $ptype['name'] ?? null);
    if ($project['description']) {
        $add('project', 'Summary', $project['description']);
    }
    // answers from the detailed onboarding form, placed by each question's `meta.briefSection`
    foreach ($projectAnswers as $key => $value) {
        $q = $qs[$key] ?? null;
        if (!$q || !is_answered($value)) {
            continue;
        }
        $add($q['meta']['briefSection'] ?? 'project', $q['meta']['briefLabel'] ?? $q['text'], display_answer($q, $value));
    }
    // carry over any useful inquiry answers that weren't asked again
    foreach (['project_description', 'style'] as $key) {
        $v = $leadAnswers[$key] ?? null;
        $q = $iqs[$key] ?? null;
        if (is_answered($v) && $q && !array_key_exists($key, $projectAnswers)) {
            $add($key === 'style' ? 'creative' : 'special', $key === 'style' ? 'Preferred style' : 'Original request', display_answer($q, $v));
        }
    }
    foreach ($scope['deliverables'] ?? [] as $d) {
        $add('deliverables', $d['label'], '× ' . $d['quantity']);
    }
    $add('deadline', 'Deadline', $project['deadline'] ? fmt_date($project['deadline']) : null);
    $add('deadline', 'Turnaround', ($scope['turnaroundBusinessDays'] ?? 5) . ' business days from complete assets');
    if ($kit) {
        $colors = is_array($kit['colors']) ? $kit['colors'] : [];
        $fonts = is_array($kit['fonts']) ? $kit['fonts'] : [];
        if ($colors) {
            $add('brand', 'Brand colors', implode(', ', array_map(fn($x) => "{$x['name']} {$x['hex']}", $colors)));
        }
        if ($fonts) {
            $add('brand', 'Fonts', implode(', ', array_map(fn($f) => $f['name'] . (!empty($f['usage']) ? " ({$f['usage']})" : ''), $fonts)));
        }
        if ($kit['typographyRules']) {
            $add('brand', 'Typography rules', $kit['typographyRules']);
        }
        if ($kit['musicPreference']) {
            $add('brand', 'Music preference', $kit['musicPreference']);
        }
    }
    foreach (is_array($project['brandOverrides']) ? $project['brandOverrides'] : [] as $k => $v) {
        $add('brand', "Project override · {$k}", $v);
    }
    foreach (Db::rows("SELECT a.`displayName` FROM `assets` a JOIN `asset_folders` f ON f.`id` = a.`folderId` WHERE a.`projectId` = ? AND a.`deletedAt` IS NULL AND a.`status` = 'READY' AND f.`key` = 'references' LIMIT 20", [$projectId]) as $r) {
        $add('references', 'Reference file', $r['displayName']);
    }
    $add('revisions', 'Included revision rounds', (string)($scope['revisionRounds'] ?? 2));
    $add('revisions', 'Policy', $business['revisionPolicy'] ?? null);
    if (!empty($scope['notes'])) {
        $add('special', 'Scope notes', $scope['notes']);
    }
    $content = ['sections' => []];
    foreach (FEP_BRIEF_SECTIONS as $s) {
        if ($sections[$s['key']]) {
            $content['sections'][] = $s + ['items' => $sections[$s['key']]];
        }
    }
    if ($existing) {
        Db::update('project_briefs', ['projectId' => $projectId], ['content' => $content, 'version' => new DbInc(1), 'status' => $existing['status'] === 'LOCKED' ? 'LOCKED' : 'DRAFT']);
    } else {
        Db::insert('project_briefs', ['projectId' => $projectId, 'content' => $content, 'status' => 'DRAFT'], false);
    }
    return Db::first('project_briefs', ['projectId' => $projectId]);
}

// ───────────────────────────── project onboarding (after payment) ─────────────────────────────

function project_onboarding_prefill(string $projectId): array
{
    $project = Db::first('projects', ['id' => $projectId]);
    $out = ['project_name' => $project['name']];
    $kit = Db::first('client_brand_kits', ['clientId' => $project['clientId']]);
    if ($kit) {
        $colors = is_array($kit['colors']) ? $kit['colors'] : [];
        if (!empty($colors[0])) {
            $out['brand_color_primary'] = $colors[0]['hex'];
        }
        $fonts = is_array($kit['fonts']) ? $kit['fonts'] : [];
        if ($fonts) {
            $out['fonts'] = implode(', ', array_map(fn($f) => $f['name'], $fonts));
        }
        if ($kit['musicPreference']) {
            $out['music_preference'] = $kit['musicPreference'];
        }
    }
    $leadId = $project['leadId'] ?: Db::val('SELECT `id` FROM `leads` WHERE `convertedClientId` = ? OR `existingClientId` = ? ORDER BY `createdAt` DESC LIMIT 1', [$project['clientId'], $project['clientId']]);
    if ($leadId) {
        $answers = load_responses('LEAD', $leadId)['answers'];
        foreach (['platforms', 'target_audience', 'cta', 'video_length'] as $k) {
            if (array_key_exists($k, $answers)) {
                $out[$k] = $answers[$k];
            }
        }
    }
    return $out;
}

function get_project_onboarding(Actor $actor, string $projectId): array
{
    $project = require_project($actor, $projectId);
    assert_org_action($actor, $project['organizationId'], 'view');
    $form = get_form_def($actor->workspaceId, FEP_PROJECT_FORM);
    if (!$form) {
        throw new AppError('NOT_FOUND', "Project onboarding form isn't configured.");
    }
    $stored = load_responses('PROJECT', $projectId)['answers'];
    $draft = get_draft(['userId' => $actor->userId, 'formKey' => FEP_PROJECT_FORM, 'subjectType' => 'PROJECT', 'subjectId' => $projectId]);
    $seed = project_onboarding_prefill($projectId);
    $scope = $project['scope'] ?? FEP_DEFAULT_SCOPE;
    $client = Db::first('clients', ['id' => $project['clientId']], ['cols' => ['firstTime']]);
    $brief = Db::first('project_briefs', ['projectId' => $projectId]);
    return [
        'form' => $form,
        'answers' => array_merge($seed, $stored, $draft['data'] ?? []),
        'step' => $draft['step'] ?? 0,
        'draftToken' => $draft['token'] ?? null,
        'extraCategories' => $scope['categories'] ?? [],
        'completed' => (bool)$brief,
        'locked' => ($brief['status'] ?? null) === 'LOCKED',
        'firstTime' => $client['firstTime'] ?? true,
        'project' => ['id' => $project['id'], 'name' => $project['name'], 'status' => $project['status'], 'code' => $project['code']],
    ];
}

function autosave_project_onboarding(Actor $actor, string $projectId, array $in): array
{
    $project = require_project($actor, $projectId);
    assert_org_action($actor, $project['organizationId'], 'manage_projects');
    return save_draft(['workspaceId' => $actor->workspaceId, 'userId' => $actor->userId, 'formKey' => FEP_PROJECT_FORM, 'data' => $in['answers'], 'step' => $in['step'], 'subjectType' => 'PROJECT', 'subjectId' => $projectId]);
}

function submit_project_onboarding(Actor $actor, string $projectId, array $in): array
{
    $project = require_project($actor, $projectId);
    assert_org_action($actor, $project['organizationId'], 'manage_projects');
    if (!in_array($project['status'], ['ONBOARDING', 'AWAITING_ASSETS', 'QUEUED'], true)) {
        throw new AppError('GATED', 'Project setup opens once your quote is accepted, the contract is signed and payment is received.');
    }
    $brief0 = Db::first('project_briefs', ['projectId' => $projectId]);
    if (($brief0['status'] ?? null) === 'LOCKED') {
        throw new AppError('GATED', 'Production has started, so the brief is locked. Submit a change request instead.');
    }
    $form = get_form_def($actor->workspaceId, FEP_PROJECT_FORM);
    if (!$form) {
        throw bad_request("Onboarding form isn't configured.");
    }
    $scope = $project['scope'] ?? FEP_DEFAULT_SCOPE;
    ['clean' => $clean, 'errors' => $errors] = validate_submission($form, $in['answers'], ['extraCategories' => $scope['categories'] ?? []]);
    assert_valid($errors);

    save_responses(['workspaceId' => $actor->workspaceId, 'formKey' => FEP_PROJECT_FORM, 'subjectType' => 'PROJECT', 'subjectId' => $projectId, 'form' => $form, 'answers' => $clean]);
    if (!empty($clean['project_name']) && $clean['project_name'] !== $project['name']) {
        Db::update('projects', ['id' => $projectId], ['name' => (string)$clean['project_name']]);
    }
    if (!empty($clean['deadline_date'])) {
        $ms = ts_ms((string)$clean['deadline_date']);
        if ($ms !== null) {
            Db::update('projects', ['id' => $projectId], ['deadline' => $ms]);
        }
    }
    $brief = generate_brief($projectId);
    Db::update('clients', ['id' => $project['clientId']], ['firstTime' => false, 'status' => 'ACTIVE']);
    $draft = get_draft(['userId' => $actor->userId, 'formKey' => FEP_PROJECT_FORM, 'subjectType' => 'PROJECT', 'subjectId' => $projectId]);
    mark_draft_submitted($draft['token'] ?? null);

    if ($project['status'] === 'ONBOARDING') {
        apply_transition($actor, $projectId, 'AWAITING_ASSETS', ['comment' => 'Project brief submitted', 'quiet' => true]);
    }
    log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'onboarding.completed', 'message' => "{$actor->name} completed the project brief", 'projectId' => $projectId, 'clientId' => $project['clientId'], 'visibility' => 'CLIENT']);
    emit('onboarding.completed', ['workspaceId' => $actor->workspaceId, 'actorId' => $actor->userId, 'projectId' => $projectId, 'clientId' => $project['clientId']]);
    return ['briefVersion' => $brief['version']];
}

function get_brief(Actor $actor, string $projectId): ?array
{
    require_project($actor, $projectId);
    $b = Db::first('project_briefs', ['projectId' => $projectId]);
    return $b ? ['status' => $b['status'], 'version' => $b['version'], 'confirmedAt' => $b['confirmedAt'], 'lockedAt' => $b['lockedAt'], 'content' => $b['content']] : null;
}

/** Client edits brief answers before production starts. After that, changes must go through a Change Request. */
function update_brief_answers(Actor $actor, string $projectId, array $answers): array
{
    $project = require_project($actor, $projectId);
    if (!$actor->isStaff) {
        assert_org_action($actor, $project['organizationId'], 'manage_projects');
    } elseif (!$actor->can('projects:write')) {
        throw new AppError('FORBIDDEN', "You can't edit briefs.");
    }
    $brief = Db::first('project_briefs', ['projectId' => $projectId]);
    if (($brief['status'] ?? null) === 'LOCKED') {
        throw new AppError('GATED', "Production has started, so the brief is locked. Submit a change request and we'll review it.");
    }
    $form = get_form_def($actor->workspaceId, FEP_PROJECT_FORM);
    if (!$form) {
        throw bad_request("Onboarding form isn't configured.");
    }
    $scope = $project['scope'] ?? FEP_DEFAULT_SCOPE;
    $merged = array_merge(load_responses('PROJECT', $projectId)['answers'], $answers);
    ['clean' => $clean, 'errors' => $errors] = validate_submission($form, $merged, ['extraCategories' => $scope['categories'] ?? []]);
    assert_valid($errors);
    save_responses(['workspaceId' => $actor->workspaceId, 'formKey' => FEP_PROJECT_FORM, 'subjectType' => 'PROJECT', 'subjectId' => $projectId, 'form' => $form, 'answers' => $clean]);
    $b = generate_brief($projectId);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'brief.updated', 'entityType' => 'project', 'entityId' => $projectId, 'message' => "{$actor->name} updated the brief for {$project['code']}"]);
    return ['version' => $b['version']];
}

function confirm_brief(Actor $actor, string $projectId): array
{
    $project = require_project($actor, $projectId);
    assert_org_action($actor, $project['organizationId'], 'approve');
    if (!Db::exists('project_briefs', ['projectId' => $projectId])) {
        throw bad_request("The brief hasn't been created yet.");
    }
    Db::update('project_briefs', ['projectId' => $projectId], ['confirmedAt' => now_ms()]);
    log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'brief.confirmed', 'message' => "{$actor->name} approved the project brief", 'projectId' => $projectId, 'clientId' => $project['clientId'], 'visibility' => 'CLIENT']);
    return ['ok' => true];
}
