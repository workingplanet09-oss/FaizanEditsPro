<?php
/** Leads & CRM: the public inquiry submission, lead pipeline, conversion to clients, contact-form messages. */
defined('FEP') or exit;

const FEP_LEAD_FIELDS = ['name', 'email', 'phone', 'company', 'website', 'instagram', 'youtube', 'linkedin', 'budgetRange', 'clientType', 'lookingFor', 'industry', 'description', 'stylePrefs'];
const FEP_LOOKING_TO_TYPE = ['short_form' => 'short_form', 'long_form' => 'long_form', 'podcast' => 'podcast', 'real_estate' => 'real_estate', 'motion_graphics' => 'motion_graphics', 'vsl' => 'vsl', 'ads' => 'ads', 'social_media' => 'short_form', 'video_editing' => 'long_form'];
const FEP_LEAD_SECTIONS = ['leads' => ['NEW', 'CONTACTED', 'CALL_SCHEDULED'], 'prospects' => ['QUALIFIED', 'QUOTED'], 'lost' => ['LOST', 'ARCHIVED'], 'converted' => ['CONVERTED']];

function extract_lead_fields(array $form, array $clean): array
{
    $out = [];
    foreach ($form['sections'] as $s) {
        foreach ($s['questions'] as $q) {
            $f = $q['meta']['leadField'] ?? null;
            if ($f && in_array($f, FEP_LEAD_FIELDS, true) && array_key_exists($q['key'], $clean)) {
                $out[$f] = $clean[$q['key']];
            }
        }
    }
    return $out;
}

function detect_lead_source(array $in): string
{
    $hints = [['/instagram|^ig$/i', 'instagram'], ['/linkedin/i', 'linkedin'], ['/youtube|^yt$/i', 'youtube'], ['/google|adwords/i', 'google'], ['/newsletter|email|mailchimp/i', 'email'], ['/facebook|meta|tiktok|ads?$|cpc|paid/i', 'advertisement']];
    if (!empty($in['actor'])) {
        return 'portal';
    }
    if (!empty($in['referralCode'])) {
        return 'referral';
    }
    $raw = ($in['utm']['source'] ?? '') . ' ' . ($in['utm']['medium'] ?? '');
    foreach ($hints as [$re, $key]) {
        if (preg_match($re, $raw)) {
            return $key;
        }
    }
    if (!empty($in['utm']['source'])) {
        return 'other';
    }
    $ref = $in['referrer'] ?? '';
    if ($ref) {
        $host = (string)parse_url($ref, PHP_URL_HOST);
        foreach ($hints as [$re, $key]) {
            if ($host && preg_match($re, $host)) {
                return $key;
            }
        }
        if ($host) {
            return 'website';
        }
    }
    return 'direct';
}

function contact_prefill_fields(array $client): array
{
    return ['name' => $client['name'], 'email' => $client['email'], 'phone' => $client['phone'], 'company' => $client['companyName'], 'website' => $client['website']];
}

function first_client_for_orgs(array $orgIds): ?array
{
    [$ph, $p] = Db::in($orgIds);
    return Db::first('clients', ['sql' => "`organizationId` IN {$ph}", 'params' => $p], ['order' => '`createdAt` ASC']);
}

/**
 * Public inquiry submission (the Start Project wizard). Validates against the DB-defined form, scores the lead, stores every answer,
 * attaches uploads and notifies the studio. Nothing internal is returned to the visitor.
 * $in: answers, serviceSlug?, draftToken?, utm?, referrer?, referralCode?, ip, actor?
 */
function submit_inquiry(array $in): array
{
    rate_limit("inquiry:{$in['ip']}", 6, 15 * 60000, "You've sent several requests recently. Please wait a few minutes or email us directly.");
    $ws = workspace_id();
    $form = get_form_def($ws, 'inquiry');
    if (!$form) {
        throw new AppError('NOT_CONFIGURED', "The inquiry form isn't configured yet.");
    }
    // signed-in clients don't re-enter contact details
    $answers = $in['answers'];
    $existingClientId = null;
    $actor = $in['actor'] ?? null;
    if ($actor && !$actor->isStaff) {
        $client = first_client_for_orgs($actor->orgIds());
        if ($client) {
            $existingClientId = $client['id'];
            $fields = contact_prefill_fields($client);
            foreach ($form['sections'] as $s) {
                foreach ($s['questions'] as $q) {
                    $f = $q['meta']['leadField'] ?? null;
                    if ($f && !empty($fields[$f])) {
                        $answers[$q['key']] = $fields[$f];
                    }
                }
            }
        }
    }
    ['clean' => $clean, 'errors' => $errors] = validate_submission($form, $answers, []);
    assert_valid($errors); // attachments are validated by the asset pipeline, so an unanswered optional FILE is fine
    $f = extract_lead_fields($form, $clean);
    if (empty($f['name']) || empty($f['email'])) {
        throw new AppError('VALIDATION', 'Name and email are required.', ['name' => !empty($f['name']) ? '' : 'Required', 'email' => !empty($f['email']) ? '' : 'Required']);
    }
    $budgetKey = js_str(is_array($f['budgetRange'] ?? null) ? ($f['budgetRange'][0] ?? '') : ($f['budgetRange'] ?? ''));
    $budget = null;
    foreach (app_data('site-defaults')['BUDGET_RANGES'] as $b) {
        if ($b['value'] === $budgetKey) {
            $budget = $b;
        }
    }
    $scoreInput = ['budget' => $budgetKey, 'client_type' => $f['clientType'] ?? ($clean['client_type'] ?? null), 'looking_for' => $f['lookingFor'] ?? ($clean['looking_for'] ?? null), 'company' => $f['company'] ?? null, 'website' => $f['website'] ?? null];
    $scored = score_lead(array_merge($clean, $scoreInput));

    $sourceKey = detect_lead_source($in);
    $source = Db::first('lead_sources', ['key' => $sourceKey]);
    $year = (int)gmdate('Y');
    $seq = next_number($ws, "lead-{$year}", 0);
    $requestCode = sprintf('REQ-%d-%04d', $year, $seq);
    $trim = fn($v, $n) => $v !== null && $v !== '' ? mb_substr((string)$v, 0, $n) : null;
    $sp = $f['stylePrefs'] ?? null;
    $lead = Db::insert('leads', [
        'workspaceId' => $ws, 'requestCode' => $requestCode, 'name' => trim((string)$f['name']), 'email' => strtolower(trim((string)$f['email'])),
        'phone' => $f['phone'] ?? null, 'company' => $f['company'] ?? null, 'website' => $f['website'] ?? null, 'instagram' => $f['instagram'] ?? null,
        'youtube' => $f['youtube'] ?? null, 'linkedin' => $f['linkedin'] ?? null, 'industry' => !empty($f['industry']) ? (string)$f['industry'] : null,
        'clientType' => !empty($f['clientType']) ? (string)$f['clientType'] : null, 'lookingFor' => !empty($f['lookingFor']) ? (string)$f['lookingFor'] : null,
        'serviceSlug' => $in['serviceSlug'] ?? null, 'projectType' => !empty($f['lookingFor']) ? (string)$f['lookingFor'] : null,
        'budgetRange' => $budgetKey ?: null, 'budgetMax' => $budget ? $budget['maxUsd'] * 100 : null,
        'stylePrefs' => is_array($sp) ? array_map('strval', $sp) : ($sp ? [(string)$sp] : []),
        'description' => !empty($f['description']) ? (string)$f['description'] : null, 'answers' => $clean, 'sourceId' => $source['id'] ?? null,
        'utmSource' => $trim($in['utm']['source'] ?? null, 120), 'utmMedium' => $trim($in['utm']['medium'] ?? null, 120), 'utmCampaign' => $trim($in['utm']['campaign'] ?? null, 120),
        'utmTerm' => $trim($in['utm']['term'] ?? null, 120), 'utmContent' => $trim($in['utm']['content'] ?? null, 120), 'referrer' => $trim($in['referrer'] ?? null, 300),
        'referralCode' => !empty($in['referralCode']) ? mb_substr(strtoupper($in['referralCode']), 0, 24) : null, 'existingClientId' => $existingClientId,
        'status' => $existingClientId ? 'QUALIFIED' : 'NEW', 'score' => $scored['score'], 'scoreBreakdown' => $scored['breakdown'], 'temperature' => $scored['temperature'],
    ]);
    save_responses(['workspaceId' => $ws, 'formKey' => 'inquiry', 'subjectType' => 'LEAD', 'subjectId' => $lead['id'], 'form' => $form, 'answers' => $clean]);
    if (!empty($in['draftToken'])) {
        attach_draft_assets_to_lead($in['draftToken'], $lead['id']);
        mark_draft_submitted($in['draftToken']);
    }
    Db::insert('lead_activities', ['leadId' => $lead['id'], 'type' => 'inquiry_submitted', 'title' => 'Inquiry submitted', 'metadata' => ['source' => $sourceKey, 'requestCode' => $requestCode]], false);
    if (!empty($in['referralCode'])) {
        $referrer = Db::first('clients', ['workspaceId' => $ws, 'referralCode' => strtoupper($in['referralCode'])]);
        if ($referrer) {
            Db::insert('referrals', ['workspaceId' => $ws, 'code' => $referrer['referralCode'], 'referrerClientId' => $referrer['id'], 'referredLeadId' => $lead['id']], false);
        }
    }
    // confirmation email to the visitor (through the queue)
    $looking = null;
    foreach ($form['sections'] as $s) {
        foreach ($s['questions'] as $q) {
            if ($q['key'] === 'looking_for') {
                $looking = $q;
            }
        }
    }
    $projectLabel = $looking ? display_answer($looking, $clean['looking_for'] ?? null) : 'Video editing';
    $contact = get_setting($ws, 'contactInfo');
    queue_email(['workspaceId' => $ws, 'toEmail' => $lead['email'], 'templateKey' => 'lead_received', 'vars' => ['client_name' => $lead['name'], 'request_id' => $requestCode, 'project_type' => $projectLabel, 'response_time' => $contact['responseTime'], 'dashboard_url' => absolute_url('/dashboard')]]);
    emit('lead.created', ['workspaceId' => $ws, 'leadId' => $lead['id'], 'data' => ['temperature' => $scored['temperature']]]);
    return [
        'requestCode' => $requestCode, 'projectType' => $projectLabel, 'responseTime' => $contact['responseTime'],
        'nextStep' => $existingClientId ? "We'll prepare a quote and share it in your portal." : "We'll review your request and reply by email with next steps — usually a short call or a quote.",
    ];
}

// ───────────────────────────── wizard helpers (signed-in clients) ─────────────────────────────

function inquiry_prefill(?Actor $actor): array
{
    $empty = ['skipContact' => false, 'answers' => (object)[], 'previousProjects' => []];
    if (!$actor || $actor->isStaff) {
        return $empty;
    }
    $client = first_client_for_orgs($actor->orgIds());
    if (!$client) {
        return $empty;
    }
    $form = get_form_def($actor->workspaceId, 'inquiry');
    $answers = [];
    $fields = contact_prefill_fields($client);
    foreach ($form['sections'] ?? [] as $s) {
        foreach ($s['questions'] as $q) {
            $f = $q['meta']['leadField'] ?? null;
            if ($f && !empty($fields[$f])) {
                $answers[$q['key']] = $fields[$f];
            }
        }
    }
    [$ph, $p] = Db::in($actor->orgIds());
    $projects = Db::rows("SELECT `id`, `name` FROM `projects` WHERE `organizationId` IN {$ph} AND `clientVisible` = 1 AND `leadId` IS NOT NULL ORDER BY `createdAt` DESC LIMIT 10", $p);
    return ['skipContact' => true, 'answers' => $answers ?: (object)[], 'previousProjects' => $projects];
}

/** Answers from the request that started one of the client's earlier projects (minus one-off fields). */
function previous_answers_for_project(Actor $actor, string $projectId): array
{
    [$ps, $pp] = scope_project($actor, 'p');
    $leadId = Db::val("SELECT p.`leadId` FROM `projects` p WHERE p.`id` = ? AND {$ps}", [$projectId, ...$pp]);
    $lead = $leadId ? Db::first('leads', ['id' => $leadId], ['cols' => ['answers']]) : null;
    if (!$lead) {
        throw not_found('Project');
    }
    $answers = $lead['answers'] ?? [];
    foreach (['project_description', 'deadline', 'special_requests', 'reference_links', 'reference_files', 'examples', 'deadline_date'] as $k) {
        unset($answers[$k]);
    }
    return $answers;
}

// ───────────────────────────── admin CRM ─────────────────────────────

function effective_temp(array $l): string { return $l['temperatureOverride'] ?: $l['temperature']; }

/** $q: q, section (leads|prospects|lost|converted|all), status, temperature, source, assignedTo (me|none|id), sort, page, pageSize */
function list_leads(Actor $actor, array $q = []): array
{
    assert_can($actor, 'leads:read');
    ['page' => $page, 'pageSize' => $pageSize, 'skip' => $skip, 'take' => $take] = page_args($q);
    [$scope, $params] = scope_lead($actor, 'l');
    $where = [$scope];
    if (!empty($q['status'])) {
        $where[] = 'l.`status` = ?';
        $params[] = $q['status'];
    } elseif (!empty($q['section']) && $q['section'] !== 'all' && isset(FEP_LEAD_SECTIONS[$q['section']])) {
        [$ph, $p] = Db::in(FEP_LEAD_SECTIONS[$q['section']]);
        $where[] = "l.`status` IN {$ph}";
        array_push($params, ...$p);
    }
    if (!empty($q['temperature'])) {
        $where[] = '(l.`temperatureOverride` = ? OR (l.`temperatureOverride` IS NULL AND l.`temperature` = ?))';
        array_push($params, $q['temperature'], $q['temperature']);
    }
    if (!empty($q['source'])) {
        $where[] = 'ls.`key` = ?';
        $params[] = $q['source'];
    }
    if (($q['assignedTo'] ?? '') === 'me') {
        $where[] = 'l.`assignedToId` = ?';
        $params[] = $actor->userId;
    } elseif (($q['assignedTo'] ?? '') === 'none') {
        $where[] = 'l.`assignedToId` IS NULL';
    } elseif (!empty($q['assignedTo'])) {
        $where[] = 'l.`assignedToId` = ?';
        $params[] = $q['assignedTo'];
    }
    if (!empty($q['q'])) {
        $like = like_pattern($q['q']);
        $where[] = '(l.`name` LIKE ? OR l.`company` LIKE ? OR l.`email` LIKE ? OR l.`requestCode` LIKE ?)';
        array_push($params, $like, $like, $like, $like);
    }
    $order = match ($q['sort'] ?? '') {
        'score' => 'l.`score` DESC',
        'followup' => '(l.`nextFollowUpAt` IS NULL) ASC, l.`nextFollowUpAt` ASC',
        'oldest' => 'l.`createdAt` ASC',
        default => 'l.`createdAt` DESC',
    };
    $w = implode(' AND ', $where);
    $from = 'FROM `leads` l LEFT JOIN `lead_sources` ls ON ls.`id` = l.`sourceId` LEFT JOIN `users` au ON au.`id` = l.`assignedToId`';
    $rows = Db::rows("SELECT l.*, ls.`label` AS src_label, au.`id` AS au_id, au.`name` AS au_name {$from} WHERE {$w} ORDER BY {$order} LIMIT " . (int)$take . ' OFFSET ' . (int)$skip, $params);
    $total = (int)Db::val("SELECT COUNT(*) {$from} WHERE {$w}", $params);
    $items = array_map(function ($r) {
        $src = $r['src_label'];
        $au = $r['au_id'] ? ['id' => $r['au_id'], 'name' => $r['au_name']] : null;
        unset($r['src_label'], $r['au_id'], $r['au_name']);
        $l = Db::hydrate('leads', $r);
        return [
            'id' => $l['id'], 'requestCode' => $l['requestCode'], 'name' => $l['name'], 'company' => $l['company'], 'email' => $l['email'], 'status' => $l['status'],
            'temperature' => effective_temp($l), 'overridden' => (bool)$l['temperatureOverride'], 'budgetRange' => $l['budgetRange'], 'lookingFor' => $l['lookingFor'],
            'source' => $src, 'assignedTo' => $au, 'nextFollowUpAt' => $l['nextFollowUpAt'], 'lastContactAt' => $l['lastContactAt'], 'createdAt' => $l['createdAt'],
            'tags' => $l['tags'], 'existingClient' => (bool)$l['existingClientId'],
        ];
    }, $rows);
    return paged($items, $total, $page, $pageSize);
}

function lead_counts(Actor $actor): array
{
    [$scope, $params] = scope_lead($actor, 'l');
    $by = [];
    foreach (Db::rows("SELECT l.`status`, COUNT(*) AS n FROM `leads` l WHERE {$scope} GROUP BY l.`status`", $params) as $r) {
        $by[$r['status']] = (int)$r['n'];
    }
    $sum = fn($k) => array_sum(array_map(fn($st) => $by[$st] ?? 0, FEP_LEAD_SECTIONS[$k]));
    return ['leads' => $sum('leads'), 'prospects' => $sum('prospects'), 'lost' => $sum('lost'), 'converted' => $sum('converted')];
}

function scoped_lead_row(Actor $actor, string $id): array
{
    [$scope, $sp] = scope_lead($actor, 'l');
    $row = Db::rowRaw("SELECT l.* FROM `leads` l WHERE l.`id` = ? AND {$scope}", [$id, ...$sp]);
    if (!$row) {
        throw not_found('Lead');
    }
    return Db::hydrate('leads', $row);
}

function get_lead(Actor $actor, string $id): array
{
    $lead = scoped_lead_row($actor, $id);
    $lead['source'] = $lead['sourceId'] ? Db::first('lead_sources', ['id' => $lead['sourceId']]) : null;
    $lead['assignedTo'] = $lead['assignedToId'] ? Db::first('users', ['id' => $lead['assignedToId']], ['cols' => ['id', 'name']]) : null;
    $acts = Db::rows('SELECT a.*, u.`name` AS actor_name FROM `lead_activities` a LEFT JOIN `users` u ON u.`id` = a.`actorId` WHERE a.`leadId` = ? ORDER BY a.`createdAt` DESC', [$id]);
    $lead['activities'] = array_map(function ($r) {
        $n = $r['actor_name'];
        unset($r['actor_name']);
        return Db::hydrate('lead_activities', $r) + ['actor' => $n !== null ? ['name' => $n] : null];
    }, $acts);
    $lead['meetings'] = Db::find('meetings', ['leadId' => $id], ['order' => '`startsAt` DESC']);
    $lead['quotes'] = Db::find('quotes', ['leadId' => $id], ['cols' => ['id', 'number', 'status', 'total', 'currency', 'createdAt'], 'order' => '`createdAt` DESC']);
    $form = get_form_def($lead['workspaceId'], 'inquiry');
    $qMap = [];
    foreach ($form['sections'] ?? [] as $s) {
        foreach ($s['questions'] as $q) {
            $qMap[$q['key']] = $q;
        }
    }
    $answers = [];
    foreach ($lead['answers'] ?? [] as $k => $v) {
        if (isset($qMap[$k])) {
            $answers[] = ['key' => $k, 'question' => $qMap[$k]['text'], 'section' => $qMap[$k]['sectionKey'], 'answer' => display_answer($qMap[$k], $v)];
        }
    }
    $attachments = Db::find('assets', ['sql' => "`leadId` = ? AND `deletedAt` IS NULL AND `status` = 'READY'", 'params' => [$id]], ['cols' => ['id', 'displayName', 'mimeType', 'sizeBytes', 'createdAt']]);
    $cid = $lead['convertedClientId'] ?? $lead['existingClientId'];
    $client = $cid ? Db::first('clients', ['id' => $cid], ['cols' => ['id', 'companyName', 'status']]) : null;
    $project = Db::first('projects', ['leadId' => $id], ['cols' => ['id', 'name', 'code', 'status']]);
    return array_merge($lead, [
        'temperature' => effective_temp($lead), 'computedTemperature' => $lead['temperature'], 'overridden' => (bool)$lead['temperatureOverride'],
        'answers' => $answers, 'attachments' => array_map(fn($a) => $a, $attachments), 'client' => $client, 'project' => $project,
    ]);
}

function update_lead(Actor $actor, string $id, array $patch): array
{
    assert_can($actor, 'leads:write');
    $before = scoped_lead_row($actor, $id);
    if ($before['status'] === 'CONVERTED' && !empty($patch['status']) && $patch['status'] !== 'CONVERTED') {
        throw new AppError('CONFLICT', "A converted lead can't change status.");
    }
    if (!empty($patch['assignedToId'])) {
        if (!Db::exists('users', ['sql' => "`id` = ? AND `workspaceId` = ? AND `isStaff` = 1 AND `status` <> 'SUSPENDED'", 'params' => [$patch['assignedToId'], $actor->workspaceId]])) {
            throw bad_request('You can only assign leads to active team members.');
        }
    }
    $allowed = ['status', 'assignedToId', 'nextFollowUpAt', 'tags', 'temperatureOverride', 'lostReason', 'phone', 'company'];
    Db::update('leads', ['id' => $id], array_intersect_key($patch, array_flip($allowed)));
    $log = fn(string $type, string $title, ?array $meta = null) => Db::insert('lead_activities', ['leadId' => $id, 'type' => $type, 'title' => $title, 'actorId' => $actor->userId, 'metadata' => $meta], false);
    $nice = fn(string $s) => str_replace('_', ' ', strtolower($s));
    if (!empty($patch['status']) && $patch['status'] !== $before['status']) {
        $log('status_changed', 'Status changed from ' . $nice($before['status']) . ' to ' . $nice($patch['status']));
        audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'lead.status_changed', 'entityType' => 'lead', 'entityId' => $id, 'message' => "{$actor->name} moved lead {$before['requestCode']} to {$patch['status']}"]);
    }
    if (array_key_exists('assignedToId', $patch) && $patch['assignedToId'] !== $before['assignedToId']) {
        $name = $patch['assignedToId'] ? Db::val('SELECT `name` FROM `users` WHERE `id` = ?', [$patch['assignedToId']]) : null;
        $log('assigned', $name ? "Assigned to {$name}" : 'Unassigned');
        if ($patch['assignedToId']) {
            emit('lead.assigned', ['workspaceId' => $actor->workspaceId, 'actorId' => $actor->userId, 'leadId' => $id]);
        }
    }
    if (array_key_exists('nextFollowUpAt', $patch)) {
        $log('follow_up_set', $patch['nextFollowUpAt'] ? 'Follow-up set for ' . gmdate('D M d Y', intdiv(ts_ms($patch['nextFollowUpAt']), 1000)) : 'Follow-up cleared');
    }
    if (array_key_exists('temperatureOverride', $patch)) {
        $log('temperature_override', $patch['temperatureOverride'] ? 'Marked ' . $nice($patch['temperatureOverride']) . ' (manual override)' : 'Reverted to automatic score');
        audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'lead.temperature_override', 'entityType' => 'lead', 'entityId' => $id, 'message' => "{$actor->name} overrode the score label on {$before['requestCode']}"]);
    }
    return Db::first('leads', ['id' => $id]);
}

const FEP_CONTACT_TYPES = ['email_sent', 'call_made', 'call_scheduled', 'contacted', 'meeting'];

function add_lead_activity(Actor $actor, string $id, array $in): array
{
    assert_can($actor, 'leads:write');
    $lead = scoped_lead_row($actor, $id);
    if (!in_array($in['type'], array_merge(['note'], FEP_CONTACT_TYPES), true)) {
        throw bad_request('Unsupported activity type.');
    }
    $a = Db::insert('lead_activities', ['leadId' => $id, 'type' => $in['type'], 'title' => mb_substr($in['title'], 0, 200), 'metadata' => !empty($in['note']) ? ['note' => mb_substr($in['note'], 0, 2000)] : null, 'actorId' => $actor->userId]);
    $patch = [];
    if (in_array($in['type'], FEP_CONTACT_TYPES, true)) {
        $patch['lastContactAt'] = db_dt();
        if ($lead['status'] === 'NEW') {
            $patch['status'] = $in['type'] === 'call_scheduled' ? 'CALL_SCHEDULED' : 'CONTACTED';
        }
    }
    if (array_key_exists('nextFollowUpAt', $in)) {
        $patch['nextFollowUpAt'] = $in['nextFollowUpAt'];
    }
    if ($patch) {
        Db::update('leads', ['id' => $id], $patch);
    }
    return $a;
}

/** Lead → client (+ project shell). Idempotent: converting twice returns the same client. */
function convert_lead(Actor $actor, string $id, array $opts = []): array
{
    assert_can($actor, 'leads:convert');
    assert_can($actor, 'clients:write');
    $lead = scoped_lead_row($actor, $id);
    if (in_array($lead['status'], ['LOST', 'ARCHIVED'], true)) {
        throw new AppError('CONFLICT', 'Reopen this lead before converting it.');
    }
    $clientId = $lead['convertedClientId'] ?? $lead['existingClientId'];
    $created = false;
    if (!$clientId) {
        $social = array_filter(['instagram' => $lead['instagram'], 'youtube' => $lead['youtube'], 'linkedin' => $lead['linkedin']]);
        $client = create_client_record([
            'workspaceId' => $actor->workspaceId, 'name' => $lead['name'], 'email' => $lead['email'], 'companyName' => $lead['company'] ?: $lead['name'], 'phone' => $lead['phone'],
            'industry' => $lead['industry'], 'website' => $lead['website'], 'socialLinks' => $social ?: null, 'status' => 'PROSPECT',
            'source' => $lead['sourceId'] ? Db::val('SELECT `key` FROM `lead_sources` WHERE `id` = ?', [$lead['sourceId']]) : 'website',
            'tags' => $lead['tags'], 'managerId' => $lead['assignedToId'], 'isDemo' => $lead['isDemo'], 'referralCode' => $lead['referralCode'],
        ]);
        $clientId = $client['id'];
        $created = true;
    }
    $projectId = null;
    $existingProject = Db::val('SELECT `id` FROM `projects` WHERE `leadId` = ? LIMIT 1', [$id]);
    if ($existingProject) {
        $projectId = $existingProject;
    } elseif (($opts['createProject'] ?? true) !== false) {
        $service = $lead['serviceSlug'] ? Db::first('services', ['workspaceId' => $actor->workspaceId, 'slug' => $lead['serviceSlug']]) : null;
        $form = get_form_def($actor->workspaceId, 'inquiry');
        $cats = $form ? array_values(array_diff(array_keys(active_categories($form, $lead['answers'] ?? [])), ['COMMON'])) : [];
        $lookingLabel = null;
        foreach ($form['sections'] ?? [] as $s) {
            foreach ($s['questions'] as $q) {
                if ($q['key'] === 'looking_for') {
                    foreach ($q['options'] as $o) {
                        if ($o['value'] === $lead['lookingFor']) {
                            $lookingLabel = $o['label'];
                        }
                    }
                }
            }
        }
        $company = $lead['company'] ?: $lead['name'];
        $project = create_project($actor, [
            'clientId' => $clientId, 'name' => !empty($opts['projectName']) ? $opts['projectName'] : "{$company} — " . ($service['title'] ?? $lookingLabel ?? 'Video project'),
            'description' => $lead['description'], 'serviceId' => $service['id'] ?? null, 'projectTypeKey' => ($lead['lookingFor'] && isset(FEP_LOOKING_TO_TYPE[$lead['lookingFor']])) ? FEP_LOOKING_TO_TYPE[$lead['lookingFor']] : null,
            'status' => 'AWAITING_QUOTE', 'leadId' => $lead['id'], 'managerId' => $lead['assignedToId'] ?? $actor->userId, 'scope' => ['categories' => $cats],
        ]);
        $projectId = $project['id'];
        Db::insert('lead_activities', ['leadId' => $id, 'type' => 'project_created', 'title' => "Project {$project['code']} created", 'actorId' => $actor->userId], false);
    }
    Db::update('leads', ['id' => $id], ['status' => 'CONVERTED', 'convertedClientId' => $clientId, 'lastContactAt' => db_dt()]);
    Db::insert('lead_activities', ['leadId' => $id, 'type' => 'converted', 'title' => $created ? 'Converted to client' : 'Linked to existing client', 'actorId' => $actor->userId], false);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'lead.converted', 'entityType' => 'lead', 'entityId' => $id, 'message' => "{$actor->name} converted lead {$lead['requestCode']} to a client", 'metadata' => ['clientId' => $clientId, 'projectId' => $projectId]]);
    if (!empty($opts['invite'])) {
        invite_client_user($actor, $clientId);
    }
    return ['clientId' => $clientId, 'projectId' => $projectId, 'created' => $created];
}

function reject_lead(Actor $actor, string $id, ?string $reason = null): array
{
    assert_can($actor, 'leads:write');
    $lead = scoped_lead_row($actor, $id);
    if ($lead['status'] === 'CONVERTED') {
        throw new AppError('CONFLICT', "A converted lead can't be rejected.");
    }
    Db::update('leads', ['id' => $id], ['status' => 'LOST', 'lostReason' => $reason]);
    Db::insert('lead_activities', ['leadId' => $id, 'type' => 'rejected', 'title' => 'Marked as lost' . ($reason ? ": {$reason}" : ''), 'actorId' => $actor->userId], false);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'lead.rejected', 'entityType' => 'lead', 'entityId' => $id, 'message' => "{$actor->name} rejected lead {$lead['requestCode']}"]);
    return ['ok' => true];
}

function archive_lead(Actor $actor, string $id, bool $archive = true): array
{
    assert_can($actor, 'leads:write');
    scoped_lead_row($actor, $id);
    Db::update('leads', ['id' => $id], ['status' => $archive ? 'ARCHIVED' : 'NEW']);
    Db::insert('lead_activities', ['leadId' => $id, 'type' => $archive ? 'archived' : 'reopened', 'title' => $archive ? 'Archived' : 'Reopened', 'actorId' => $actor->userId], false);
    return ['ok' => true];
}

// ───────────────────────────── contact form ─────────────────────────────

/** $in: name, email, phone?, company?, reason, message, source?, utm?, ip */
function submit_contact(array $in): array
{
    rate_limit("contact:{$in['ip']}", 5, 15 * 60000, 'Too many messages. Please wait a few minutes before sending another.');
    $ws = workspace_id();
    $row = Db::insert('contact_submissions', [
        'workspaceId' => $ws, 'name' => trim($in['name']), 'email' => strtolower(trim($in['email'])), 'phone' => $in['phone'] ?: null, 'company' => $in['company'] ?: null,
        'reason' => $in['reason'], 'message' => trim($in['message']), 'source' => $in['source'] ?? null, 'utm' => $in['utm'] ?? null, 'ip' => $in['ip'],
    ]);
    queue_email(['workspaceId' => $ws, 'toEmail' => $row['email'], 'templateKey' => 'contact_received', 'vars' => ['client_name' => $row['name']]]);
    $admins = users_with_roles($ws, ['super_admin', 'admin', 'support']);
    notify(['workspaceId' => $ws, 'userIds' => $admins, 'category' => 'SYSTEM', 'type' => 'contact.received', 'title' => 'New ' . strtolower($in['reason']) . " message from {$row['name']}", 'message' => mb_substr($row['message'], 0, 140), 'link' => '/admin/submissions', 'email' => false]);
    return ['id' => $row['id']];
}

function list_contact_submissions(Actor $actor, array $q = []): array
{
    assert_can($actor, 'leads:read');
    ['page' => $page, 'pageSize' => $pageSize, 'skip' => $skip, 'take' => $take] = page_args($q);
    $where = ['sql' => '`workspaceId` = ?' . (($q['handled'] ?? '') === 'yes' ? ' AND `handled` = 1' : (($q['handled'] ?? '') === 'no' ? ' AND `handled` = 0' : '')), 'params' => [$actor->workspaceId]];
    return paged(Db::find('contact_submissions', $where, ['order' => '`createdAt` DESC', 'limit' => $take, 'offset' => $skip]), Db::count('contact_submissions', $where), $page, $pageSize);
}

function convert_contact_to_lead(Actor $actor, string $id): array
{
    assert_can($actor, 'leads:write');
    $c = Db::first('contact_submissions', ['id' => $id, 'workspaceId' => $actor->workspaceId]);
    if (!$c) {
        throw not_found('Message');
    }
    if ($c['leadId']) {
        return ['leadId' => $c['leadId']];
    }
    $year = (int)gmdate('Y');
    $seq = next_number($actor->workspaceId, "lead-{$year}", 0);
    $source = Db::first('lead_sources', ['key' => 'website']);
    $lead = Db::insert('leads', ['workspaceId' => $actor->workspaceId, 'requestCode' => sprintf('REQ-%d-%04d', $year, $seq), 'name' => $c['name'], 'email' => $c['email'], 'phone' => $c['phone'], 'company' => $c['company'], 'description' => $c['message'], 'sourceId' => $source['id'] ?? null, 'status' => 'NEW', 'temperature' => 'NEEDS_REVIEW', 'isDemo' => $c['isDemo']]);
    Db::insert('lead_activities', ['leadId' => $lead['id'], 'type' => 'inquiry_submitted', 'title' => 'Created from contact form (' . strtolower($c['reason']) . ')', 'actorId' => $actor->userId], false);
    Db::update('contact_submissions', ['id' => $id], ['leadId' => $lead['id'], 'handled' => true]);
    return ['leadId' => $lead['id']];
}

function mark_contact_handled(Actor $actor, string $id, bool $handled = true): array
{
    assert_can($actor, 'leads:write');
    Db::update('contact_submissions', ['id' => $id, 'workspaceId' => $actor->workspaceId], ['handled' => $handled]);
    return ['ok' => true];
}

/** Lead follow-ups that are due (sweep). */
function sweep_lead_follow_ups(): int
{
    $due = Db::rows("SELECT `id`, `workspaceId` FROM `leads` WHERE `nextFollowUpAt` <= ? AND `status` NOT IN ('CONVERTED','LOST','ARCHIVED')", [db_dt()]);
    foreach ($due as $l) {
        emit('lead.follow_up_due', ['workspaceId' => $l['workspaceId'], 'leadId' => $l['id']]);
        Db::update('leads', ['id' => $l['id']], ['nextFollowUpAt' => null]);
    }
    return count($due);
}
