<?php
/** Contracts: drafted from the accepted quote, versioned on every edit after sending, e-signed by the client with a content hash. */
defined('FEP') or exit;

/** SHA-256 of the sections exactly as they were shown (a fingerprint of what the client agreed to). */
function hash_sections(array $sections): string
{
    $norm = array_map(fn($s) => ['key' => $s['key'], 'title' => $s['title'], 'body' => $s['body']], array_values($sections));
    return hash('sha256', json_enc($norm));
}

function build_contract_sections(string $projectId, ?string $quoteId = null): array
{
    $project = Db::first('projects', ['id' => $projectId]);
    $client = Db::first('clients', ['id' => $project['clientId']]);
    $business = get_setting($project['workspaceId'], 'business');
    $quote = $quoteId ? Db::first('quotes', ['id' => $quoteId]) : Db::first('quotes', ['projectId' => $projectId, 'status' => 'ACCEPTED'], ['order' => '`createdAt` DESC']);
    $scope = $project['scope'] ?? FEP_DEFAULT_SCOPE;
    $cur = $quote['currency'] ?? $project['currency'];
    $deliverables = !empty($scope['deliverables'])
        ? implode("\n", array_map(fn($d) => '• ' . $d['quantity'] . ' × ' . $d['label'], $scope['deliverables']))
        : '• As described in the accepted quote';
    $asQuoted = 'as per the accepted quote';
    $vars = [
        'studio_name' => ($business['legalName'] ?? '') ?: $business['name'],
        'client_name' => $client['name'],
        'company' => $client['companyName'],
        'project_name' => $project['name'],
        'scope' => ($project['description'] ?? '') ?: (($scope['notes'] ?? '') ?: 'As described in the accepted quote and project brief.'),
        'deliverables' => $deliverables,
        'turnaround' => ($scope['turnaroundBusinessDays'] ?? 5) . ' business days',
        'total' => $quote ? money($quote['total'], $cur) : $asQuoted,
        'deposit' => $quote ? money($quote['deposit'], $cur) : $asQuoted,
        'balance' => $quote ? money($quote['balance'], $cur) : $asQuoted,
        'revision_rounds' => (string)($scope['revisionRounds'] ?? 2),
    ];
    $sections = array_map(fn($s) => ['key' => $s['key'], 'title' => $s['title'], 'body' => fill_vars($s['body'], $vars)], app_data('site-defaults')['CONTRACT_TEMPLATE']);
    return [$sections, $vars];
}

function scoped_contract_row(Actor $actor, string $id): array
{
    [$s, $p] = scope_contract($actor, 'ct');
    $row = Db::rowRaw("SELECT ct.* FROM `contracts` ct WHERE ct.`id` = ? AND {$s}", [$id, ...$p]);
    if (!$row) {
        throw not_found('Contract');
    }
    return Db::hydrate('contracts', $row);
}

function create_contract_draft(mixed $who, string $projectId, ?string $quoteId = null): array
{
    if (is_actor($who)) {
        [$s, $p] = scope_project($who, 'p');
        $project = Db::rowRaw("SELECT p.* FROM `projects` p WHERE p.`id` = ? AND {$s}", [$projectId, ...$p]);
        $project = $project ? Db::hydrate('projects', $project) : null;
    } else {
        $project = Db::first('projects', ['id' => $projectId]);
    }
    if (!$project) {
        throw not_found('Project');
    }
    if (is_actor($who)) {
        assert_can($who, 'contracts:write');
    }
    $existing = Db::first('contracts', ['sql' => "`projectId` = ? AND `status` IN ('DRAFT','SENT','VIEWED','SIGNED')", 'params' => [$projectId]]);
    if ($existing) {
        return $existing;
    }
    [$sections, $vars] = build_contract_sections($projectId, $quoteId);
    $number = 'C-' . next_number($project['workspaceId'], 'contract', 1000);
    $contract = Db::tx(function () use ($project, $projectId, $quoteId, $number, $who, $sections, $vars) {
        $c = Db::insert('contracts', [
            'workspaceId' => $project['workspaceId'], 'organizationId' => $project['organizationId'], 'clientId' => $project['clientId'], 'projectId' => $projectId, 'quoteId' => $quoteId,
            'number' => $number, 'title' => "Editing agreement — {$project['name']}", 'createdById' => who_id($who), 'isDemo' => $project['isDemo'],
        ]);
        Db::insert('contract_versions', ['contractId' => $c['id'], 'version' => 1, 'sections' => $sections, 'variables' => $vars, 'contentHash' => hash_sections($sections), 'createdById' => who_id($who)], false);
        return $c;
    });
    audit($who, ['workspaceId' => $project['workspaceId'], 'action' => 'contract.created', 'entityType' => 'contract', 'entityId' => $contract['id'], 'message' => "Contract {$number} drafted for {$project['code']}"]);
    return $contract;
}

function update_contract(Actor $actor, string $id, array $patch): array
{
    assert_can($actor, 'contracts:write');
    $c = scoped_contract_row($actor, $id);
    if ($c['status'] === 'SIGNED') {
        throw new AppError('CONFLICT', "A signed contract can't be edited.");
    }
    $latest = Db::first('contract_versions', ['contractId' => $id], ['order' => '`version` DESC']);
    if (!empty($patch['sections'])) {
        if (hash_sections($patch['sections']) !== $latest['contentHash']) {
            $wasSent = $c['status'] !== 'DRAFT';
            $version = $wasSent ? $c['currentVersion'] + 1 : $c['currentVersion'];
            if ($wasSent) {
                Db::insert('contract_versions', ['contractId' => $id, 'version' => $version, 'sections' => $patch['sections'], 'variables' => $latest['variables'] ?? new stdClass(), 'contentHash' => hash_sections($patch['sections']), 'createdById' => $actor->userId], false);
            } else {
                Db::update('contract_versions', ['contractId' => $id, 'version' => $version], ['sections' => $patch['sections'], 'contentHash' => hash_sections($patch['sections'])]);
            }
            Db::update('contracts', ['id' => $id], ['currentVersion' => $version, 'status' => 'DRAFT', 'title' => $patch['title'] ?? $c['title']]);
        }
    } elseif (!empty($patch['title'])) {
        Db::update('contracts', ['id' => $id], ['title' => $patch['title']]);
    }
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'contract.updated', 'entityType' => 'contract', 'entityId' => $id, 'message' => "{$actor->name} edited contract {$c['number']}"]);
    return get_contract($actor, $id);
}

function send_contract(Actor $actor, string $id): array
{
    assert_can($actor, 'contracts:write');
    $c = scoped_contract_row($actor, $id);
    if ($c['status'] === 'SIGNED') {
        throw new AppError('CONFLICT', 'This contract is already signed.');
    }
    Db::update('contracts', ['id' => $id], ['status' => 'SENT', 'sentAt' => now_ms()]);
    Db::update('projects', ['id' => $c['projectId']], ['clientVisible' => true]);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'contract.sent', 'entityType' => 'contract', 'entityId' => $id, 'message' => "{$actor->name} sent contract {$c['number']}"]);
    log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'contract.sent', 'message' => "Contract {$c['number']} sent for signature", 'projectId' => $c['projectId'], 'clientId' => $c['clientId'], 'visibility' => 'CLIENT']);
    $leadId = Db::val('SELECT `id` FROM `leads` WHERE `convertedClientId` = ? LIMIT 1', [$c['clientId']]);
    if ($leadId) {
        Db::insert('lead_activities', ['leadId' => $leadId, 'type' => 'contract_sent', 'title' => "Contract {$c['number']} sent", 'actorId' => $actor->userId], false);
    }
    emit('contract.sent', ['workspaceId' => $actor->workspaceId, 'actorId' => $actor->userId, 'projectId' => $c['projectId'], 'clientId' => $c['clientId'], 'contractId' => $id]);
    return Db::first('contracts', ['id' => $id]);
}

function get_contract(Actor $actor, string $id, array $opts = []): array
{
    $c = scoped_contract_row($actor, $id);
    if (!empty($opts['markViewed']) && !$actor->isStaff && $c['status'] === 'SENT') {
        Db::update('contracts', ['id' => $id], ['status' => 'VIEWED', 'viewedAt' => now_ms()]);
        log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'contract.viewed', 'message' => "{$actor->name} viewed contract {$c['number']}", 'projectId' => $c['projectId'], 'clientId' => $c['clientId'], 'visibility' => 'INTERNAL']);
        $c['status'] = 'VIEWED';
    }
    $client = Db::first('clients', ['id' => $c['clientId']], ['cols' => ['id', 'name', 'companyName', 'email']]);
    $project = Db::first('projects', ['id' => $c['projectId']], ['cols' => ['id', 'name', 'code', 'status']]);
    $versions = Db::find('contract_versions', ['contractId' => $id], ['order' => '`version` DESC']);
    $current = null;
    foreach ($versions as $v) {
        if ($v['version'] === $c['currentVersion']) {
            $current = $v;
        }
    }
    $current ??= $versions[0];
    $sigs = [];
    foreach ($versions as $v) {
        foreach (Db::find('contract_signatures', ['contractVersionId' => $v['id']]) as $s) {
            $row = [
                'id' => $s['id'], 'signerName' => $s['signerName'], 'signerEmail' => $s['signerEmail'], 'signatureKind' => $s['signatureKind'], 'signatureData' => $s['signatureData'],
                'signedAt' => $s['signedAt'], 'version' => $v['version'],
            ];
            if ($actor->isStaff) {
                $row += ['ip' => $s['ip'], 'userAgent' => $s['userAgent'], 'contentHash' => $s['contentHash']];
            }
            $sigs[] = $row;
        }
    }
    return [
        'id' => $c['id'], 'number' => $c['number'], 'title' => $c['title'], 'status' => $c['status'], 'currentVersion' => $c['currentVersion'], 'sentAt' => $c['sentAt'],
        'signedAt' => $c['signedAt'], 'createdAt' => $c['createdAt'], 'client' => $client, 'project' => $project, 'sections' => $current['sections'], 'contentHash' => $current['contentHash'],
        'versions' => array_map(fn($v) => ['version' => $v['version'], 'createdAt' => $v['createdAt']], $versions), 'signatures' => $sigs,
    ];
}

/** $query: status, q, page, pageSize */
function list_contracts(Actor $actor, array $query = []): array
{
    if ($actor->isStaff) {
        assert_can($actor, 'contracts:read');
    }
    ['page' => $page, 'pageSize' => $pageSize, 'skip' => $skip, 'take' => $take] = page_args($query);
    [$scope, $params] = scope_contract($actor, 'ct');
    $where = [$scope];
    if (!empty($query['status'])) {
        $where[] = 'ct.`status` = ?';
        $params[] = $query['status'];
    }
    if (!empty($query['q'])) {
        $like = like_pattern((string)$query['q']);
        $where[] = '(ct.`number` LIKE ? OR ct.`title` LIKE ? OR c.`companyName` LIKE ?)';
        array_push($params, $like, $like, $like);
    }
    $w = implode(' AND ', array_map(fn($x) => "({$x})", $where));
    $from = 'FROM `contracts` ct JOIN `clients` c ON c.`id` = ct.`clientId` JOIN `projects` p ON p.`id` = ct.`projectId`';
    $rows = Db::rows("SELECT ct.*, c.`companyName` AS c_companyName, c.`name` AS c_name, p.`id` AS p_id, p.`name` AS p_name, p.`code` AS p_code {$from} WHERE {$w} ORDER BY ct.`createdAt` DESC LIMIT " . (int)$take . ' OFFSET ' . (int)$skip, $params);
    $total = (int)Db::val("SELECT COUNT(*) {$from} WHERE {$w}", $params);
    $items = array_map(function ($r) {
        $c = Db::hydrate('contracts', array_intersect_key($r, Db::table('contracts')['cols']));
        $c['client'] = ['companyName' => $r['c_companyName'], 'name' => $r['c_name']];
        $c['project'] = ['id' => $r['p_id'], 'name' => $r['p_name'], 'code' => $r['p_code']];
        return $c;
    }, $rows);
    return paged($items, $total, $page, $pageSize);
}

/** Client signs the CURRENT version. I keep who/when/from where, plus a hash of exactly what they saw. $in: signerName, signature, kind (typed|drawn), accept, version */
function sign_contract(Actor $actor, string $id, array $in): array
{
    $c = scoped_contract_row($actor, $id);
    assert_org_action($actor, $c['organizationId'], 'approve');
    if ($c['status'] === 'SIGNED') {
        throw new AppError('CONFLICT', 'This contract has already been signed.');
    }
    if (!in_array($c['status'], ['SENT', 'VIEWED'], true)) {
        throw new AppError('CONFLICT', "This contract isn't open for signature.");
    }
    if (empty($in['accept'])) {
        throw bad_request('Please confirm you agree to the terms.', ['accept' => 'Required.']);
    }
    if ((int)$in['version'] !== $c['currentVersion']) {
        throw new AppError('CONFLICT', 'This contract was updated. Refresh the page to review the latest version before signing.');
    }
    $v = Db::first('contract_versions', ['contractId' => $id, 'version' => $c['currentVersion']]);
    if ($in['kind'] === 'drawn' && (!str_starts_with($in['signature'], 'data:image/png;base64,') || strlen($in['signature']) > 200000)) {
        throw bad_request('Invalid signature image.');
    }
    if ($in['kind'] === 'drawn' && !preg_match('#^data:image/png;base64,[A-Za-z0-9+/=]+$#', $in['signature'])) {
        throw bad_request('Invalid signature image.');
    }
    if ($in['kind'] === 'typed' && mb_strlen(trim($in['signature'])) < 2) {
        throw bad_request('Type your full name to sign.', ['signature' => 'Required.']);
    }
    $meta = request_meta();
    $user = Db::first('users', ['id' => $actor->userId]);
    Db::tx(function () use ($v, $actor, $in, $user, $meta, $id) {
        // atomic: only one signature can ever be recorded
        if (Db::exec("UPDATE `contracts` SET `status` = 'SIGNED', `signedAt` = ?, `signedById` = ? WHERE `id` = ? AND `status` IN ('SENT','VIEWED')", [db_dt(), $actor->userId, $id]) !== 1) {
            throw new AppError('CONFLICT', 'This contract has already been signed.');
        }
        Db::insert('contract_signatures', [
            'contractVersionId' => $v['id'], 'signerUserId' => $actor->userId, 'signerName' => trim($in['signerName']), 'signerEmail' => $user['email'], 'signatureData' => $in['signature'],
            'signatureKind' => $in['kind'], 'acceptedTerms' => true, 'ip' => $meta['ip'], 'userAgent' => $meta['userAgent'], 'contentHash' => $v['contentHash'],
        ], false);
    });
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'contract.signed', 'entityType' => 'contract', 'entityId' => $id, 'message' => "{$actor->name} signed contract {$c['number']} (v{$c['currentVersion']})", 'metadata' => ['version' => $c['currentVersion'], 'hash' => $v['contentHash'], 'ip' => $meta['ip']]]);
    log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'contract.signed', 'message' => "{$actor->name} signed contract {$c['number']}", 'projectId' => $c['projectId'], 'clientId' => $c['clientId'], 'visibility' => 'CLIENT']);
    $leadId = Db::val('SELECT `id` FROM `leads` WHERE `convertedClientId` = ? LIMIT 1', [$c['clientId']]);
    if ($leadId) {
        Db::insert('lead_activities', ['leadId' => $leadId, 'type' => 'contract_signed', 'title' => "Contract {$c['number']} signed by {$actor->name}"], false);
    }
    $project = Db::first('projects', ['id' => $c['projectId']]);
    if ($project['status'] === 'AWAITING_CONTRACT') {
        apply_transition($actor, $c['projectId'], 'AWAITING_PAYMENT', ['comment' => "Contract {$c['number']} signed", 'quiet' => true]);
    }
    $wf = get_setting($actor->workspaceId, 'workflow');
    if (!empty($wf['autoInvoiceOnContractSigned']) && $c['quoteId']) {
        $quote = Db::first('quotes', ['id' => $c['quoteId']]);
        $exists = Db::count('invoices', ['sql' => "`quoteId` = ? AND `kind` IN ('DEPOSIT','FULL') AND `status` <> 'CANCELLED'", 'params' => [$c['quoteId']]]);
        if ($quote && !$exists) {
            $sys = system_actor('System');
            $inv = create_invoice_from_quote($sys, $quote, $quote['balance'] > 0 ? 'DEPOSIT' : 'FULL');
            send_invoice($sys, $inv['id']);
        }
    }
    emit('contract.signed', ['workspaceId' => $actor->workspaceId, 'actorId' => $actor->userId, 'projectId' => $c['projectId'], 'clientId' => $c['clientId'], 'contractId' => $id]);
    return get_contract($actor, $id);
}

/** Standalone, print-friendly HTML (users can "Save as PDF"). Everything is escaped. */
function render_contract_html(Actor $actor, string $id): array
{
    $c = get_contract($actor, $id);
    $business = get_setting($actor->workspaceId, 'business');
    $sigs = array_values(array_filter($c['signatures'], fn($s) => $s['version'] === $c['currentVersion']));
    $body = '';
    foreach ($c['sections'] as $s) {
        $paras = '';
        foreach (preg_split('/\n{2,}/', $s['body']) as $p) {
            $paras .= '<p>' . str_replace("\n", '<br>', e($p)) . '</p>';
        }
        $body .= '<h2>' . e($s['title']) . '</h2>' . $paras;
    }
    if ($sigs) {
        $sig = '';
        foreach ($sigs as $s) {
            $img = $s['signatureKind'] === 'drawn' && preg_match('#^data:image/png;base64,[A-Za-z0-9+/=]+$#', $s['signatureData'])
                ? '<img src="' . e($s['signatureData']) . '" alt="Signature" style="max-height:80px">'
                : '<div class="typed">' . e($s['signatureKind'] === 'drawn' ? $s['signerName'] : $s['signatureData']) . '</div>';
            $sig .= '<div class="sig"><div>' . $img . '</div><div class="meta">Signed by ' . e($s['signerName']) . ' (' . e($s['signerEmail']) . ') on ' . gmdate('D, d M Y H:i:s', intdiv((int)ts_ms($s['signedAt']), 1000)) . ' GMT</div></div>';
        }
    } else {
        $sig = '<p class="meta">Not yet signed.</p>';
    }
    $html = '<!doctype html><html><head><meta charset="utf-8"><title>' . e($c['number']) . ' — ' . e($c['title']) . '</title><style>body{font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;max-width:760px;margin:40px auto;padding:0 24px;color:#151517}h1{font-size:26px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 6px}.meta{color:#666;font-size:13px}.sig{margin-top:24px;border-top:1px solid #ddd;padding-top:12px}.typed{font:italic 30px Georgia,serif}@media print{body{margin:0}}</style></head><body><div class="meta">'
        . e($business['name']) . '</div><h1>' . e($c['title']) . '</h1><div class="meta">Contract ' . e($c['number']) . ' · version ' . $c['currentVersion'] . ' · ' . e($c['status']) . '</div>' . $body . '<h2>Signatures</h2>' . $sig
        . '<p class="meta">Document fingerprint (SHA-256): ' . e($c['contentHash']) . '</p></body></html>';
    return ['html' => $html, 'filename' => $c['number'] . '.html'];
}
