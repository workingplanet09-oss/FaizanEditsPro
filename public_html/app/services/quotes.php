<?php
/** Quotes: build, revise, send, view, accept/decline (the acceptance is what lets a project move on to the contract stage). */
defined('FEP') or exit;

/** Attaches the relations the UI needs to a hydrated quote row. */
function quote_with_relations(array $q): array
{
    $q['items'] = Db::find('quote_items', ['quoteId' => $q['id']], ['order' => '`sortOrder` ASC']);
    $q['client'] = Db::first('clients', ['id' => $q['clientId']], ['cols' => ['id', 'name', 'email', 'companyName']]);
    $q['project'] = $q['projectId'] ? Db::first('projects', ['id' => $q['projectId']], ['cols' => ['id', 'name', 'code', 'status']]) : null;
    $q['createdBy'] = $q['createdById'] ? Db::first('users', ['id' => $q['createdById']], ['cols' => ['name']]) : null;
    $q['contracts'] = Db::find('contracts', ['quoteId' => $q['id']], ['cols' => ['id', 'status', 'number']]);
    $q['invoices'] = Db::find('invoices', ['quoteId' => $q['id']], ['cols' => ['id', 'number', 'status', 'kind', 'total']]);
    return $q;
}

function quote_totals_for(array $items, ?int $discount, ?int $taxRateBps, ?int $depositPercent): array
{
    if (!$items) {
        throw bad_request('Add at least one line item.', ['items' => 'Add at least one item.']);
    }
    return compute_totals($items, (int)($discount ?? 0), (int)($taxRateBps ?? 0), $depositPercent ?? 100);
}

function scoped_quote_row(Actor $actor, string $id): array
{
    [$s, $p] = scope_quote($actor, 'q');
    $row = Db::rowRaw("SELECT q.* FROM `quotes` q WHERE q.`id` = ? AND {$s}", [$id, ...$p]);
    if (!$row) {
        throw not_found('Quote');
    }
    return Db::hydrate('quotes', $row);
}

function insert_quote_items(string $quoteId, array $items): void
{
    foreach (array_values($items) as $i => $it) {
        Db::insert('quote_items', [
            'quoteId' => $quoteId, 'description' => $it['description'], 'serviceId' => $it['serviceId'] ?? null, 'quantity' => $it['quantity'],
            'unitPrice' => (int)$it['unitPrice'], 'amount' => (int)round($it['quantity'] * $it['unitPrice']), 'sortOrder' => $i,
        ], false);
    }
}

/**
 * $in: clientId, projectId?, leadId?, title?, currency?, items[{description, serviceId?, quantity, unitPrice}], discount?, taxRateBps?, depositPercent?,
 * validUntil?, notes?, terms?, projectName?, serviceId?, projectTypeKey?
 */
function create_quote(Actor $actor, array $in): array
{
    assert_can($actor, 'quotes:write');
    $client = Db::first('clients', ['id' => $in['clientId'], 'workspaceId' => $actor->workspaceId]);
    if (!$client) {
        throw not_found('Client');
    }
    $settings = get_setting($actor->workspaceId, 'quote');
    $business = get_setting($actor->workspaceId, 'business');
    $currency = strtoupper($in['currency'] ?? $business['defaultCurrency']);
    $taxBps = $in['taxRateBps'] ?? $settings['taxRateBps'];
    $depositPct = $in['depositPercent'] ?? $settings['defaultDepositPercent'];
    $t = quote_totals_for($in['items'], $in['discount'] ?? null, $taxBps, $depositPct);

    $projectId = $in['projectId'] ?? null;
    if ($projectId) {
        if (!Db::exists('projects', ['id' => $projectId, 'clientId' => $client['id'], 'workspaceId' => $actor->workspaceId])) {
            throw not_found('Project');
        }
    } else {
        $serviceId = $in['serviceId'] ?? null;
        foreach ($in['items'] as $it) {
            if (!$serviceId && !empty($it['serviceId'])) {
                $serviceId = $it['serviceId'];
            }
        }
        $project = create_project($actor, [
            'clientId' => $client['id'], 'name' => ($in['projectName'] ?? '') ?: (($in['title'] ?? '') ?: $in['items'][0]['description']),
            'serviceId' => $serviceId, 'projectTypeKey' => $in['projectTypeKey'] ?? null, 'status' => 'AWAITING_QUOTE', 'currency' => $currency,
        ]);
        $projectId = $project['id'];
    }
    $number = $settings['prefix'] . '-' . next_number($actor->workspaceId, 'quote', 1000);
    $quoteId = Db::tx(function () use ($actor, $in, $client, $projectId, $number, $currency, $t, $taxBps, $depositPct, $settings) {
        $quote = Db::insert('quotes', [
            'workspaceId' => $actor->workspaceId, 'organizationId' => $client['organizationId'], 'clientId' => $client['id'], 'projectId' => $projectId, 'leadId' => $in['leadId'] ?? null,
            'number' => $number, 'title' => $in['title'] ?? null, 'currency' => $currency, 'subtotal' => $t['subtotal'], 'discount' => $t['discount'], 'taxRateBps' => $taxBps,
            'tax' => $t['tax'], 'total' => $t['total'], 'depositPercent' => $depositPct, 'deposit' => $t['deposit'], 'balance' => $t['balance'],
            'validUntil' => $in['validUntil'] ?? add_days_ms(now_ms(), (int)$settings['validDays']), 'notes' => $in['notes'] ?? null, 'terms' => $in['terms'] ?? $settings['terms'],
            'createdById' => $actor->userId, 'isDemo' => $client['isDemo'],
        ]);
        insert_quote_items($quote['id'], $in['items']);
        return $quote['id'];
    });
    $p = Db::first('projects', ['id' => $projectId]);
    if ($p['status'] === 'INQUIRY') {
        apply_transition($actor, $projectId, 'AWAITING_QUOTE', ['quiet' => true]);
    }
    Db::update('projects', ['id' => $projectId], ['currency' => $currency]);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'quote.created', 'entityType' => 'quote', 'entityId' => $quoteId, 'message' => "{$actor->name} created quote {$number} (" . money($t['total'], $currency) . ')']);
    log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'quote.created', 'message' => "Quote {$number} created", 'projectId' => $projectId, 'clientId' => $client['id'], 'leadId' => $in['leadId'] ?? null, 'visibility' => 'INTERNAL']);
    if (!empty($in['leadId'])) {
        Db::insert('lead_activities', ['leadId' => $in['leadId'], 'type' => 'quote_created', 'title' => "Quote {$number} created", 'actorId' => $actor->userId, 'metadata' => ['quoteId' => $quoteId]], false);
    }
    return quote_with_relations(Db::first('quotes', ['id' => $quoteId]));
}

/** $patch may hold any of: title, currency, items, discount, taxRateBps, depositPercent, validUntil, notes, terms (key presence matters for the nullable ones). */
function update_quote(Actor $actor, string $id, array $patch): array
{
    assert_can($actor, 'quotes:write');
    $q = scoped_quote_row($actor, $id);
    if (in_array($q['status'], ['ACCEPTED', 'REJECTED', 'EXPIRED'], true)) {
        throw new AppError('CONFLICT', "This quote is " . strtolower($q['status']) . " and can't be edited. Create a new quote instead.");
    }
    $items = $patch['items'] ?? array_map(fn($i) => ['description' => $i['description'], 'serviceId' => $i['serviceId'], 'quantity' => $i['quantity'], 'unitPrice' => $i['unitPrice']], Db::find('quote_items', ['quoteId' => $id], ['order' => '`sortOrder` ASC']));
    $discount = $patch['discount'] ?? $q['discount'];
    $taxBps = $patch['taxRateBps'] ?? $q['taxRateBps'];
    $depositPct = $patch['depositPercent'] ?? $q['depositPercent'];
    $t = quote_totals_for($items, $discount, $taxBps, $depositPct);
    Db::tx(function () use ($patch, $id, $items, $t, $taxBps, $depositPct) {
        if (isset($patch['items'])) {
            Db::delete('quote_items', ['quoteId' => $id]);
            insert_quote_items($id, $items);
        }
        $data = ['subtotal' => $t['subtotal'], 'discount' => $t['discount'], 'taxRateBps' => $taxBps, 'tax' => $t['tax'], 'total' => $t['total'], 'depositPercent' => $depositPct, 'deposit' => $t['deposit'], 'balance' => $t['balance'], 'status' => 'DRAFT'];
        if (isset($patch['title'])) {
            $data['title'] = $patch['title'];
        }
        if (isset($patch['currency'])) {
            $data['currency'] = strtoupper($patch['currency']);
        }
        foreach (['validUntil', 'notes', 'terms'] as $k) {
            if (array_key_exists($k, $patch)) {
                $data[$k] = $patch[$k];
            }
        }
        Db::update('quotes', ['id' => $id], $data);
    });
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'quote.updated', 'entityType' => 'quote', 'entityId' => $id, 'message' => "{$actor->name} edited quote {$q['number']}"]);
    return quote_with_relations(Db::first('quotes', ['id' => $id]));
}

function send_quote(Actor $actor, string $id): array
{
    assert_can($actor, 'quotes:write');
    $q = scoped_quote_row($actor, $id);
    if (in_array($q['status'], ['ACCEPTED', 'REJECTED'], true)) {
        throw new AppError('CONFLICT', 'This quote is already closed.');
    }
    $settings = get_setting($actor->workspaceId, 'quote');
    $now = now_ms();
    $valid = ($q['validUntil'] && ts_ms($q['validUntil']) > $now) ? $q['validUntil'] : add_days_ms($now, (int)$settings['validDays']);
    Db::update('quotes', ['id' => $id], ['status' => 'SENT', 'sentAt' => $now, 'validUntil' => $valid]);
    if ($q['projectId']) {
        Db::update('projects', ['id' => $q['projectId']], ['clientVisible' => true]);
    }
    Db::update('clients', ['id' => $q['clientId']], ['lastContactAt' => $now]);
    if ($q['leadId']) {
        Db::update('leads', ['id' => $q['leadId']], ['status' => 'QUOTED', 'lastContactAt' => $now]);
    }
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'quote.sent', 'entityType' => 'quote', 'entityId' => $id, 'message' => "{$actor->name} sent quote {$q['number']}"]);
    log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'quote.sent', 'message' => "Quote {$q['number']} sent to the client", 'projectId' => $q['projectId'], 'clientId' => $q['clientId'], 'visibility' => 'CLIENT']);
    if ($q['leadId']) {
        Db::insert('lead_activities', ['leadId' => $q['leadId'], 'type' => 'quote_sent', 'title' => "Quote {$q['number']} sent", 'actorId' => $actor->userId], false);
    }
    emit('quote.sent', ['workspaceId' => $actor->workspaceId, 'actorId' => $actor->userId, 'projectId' => $q['projectId'], 'clientId' => $q['clientId'], 'quoteId' => $id, 'leadId' => $q['leadId']]);
    return Db::first('quotes', ['id' => $id]);
}

/** $query: q, status, clientId, page, pageSize */
function list_quotes(Actor $actor, array $query = []): array
{
    if ($actor->isStaff) {
        assert_can($actor, 'quotes:read');
    }
    ['page' => $page, 'pageSize' => $pageSize, 'skip' => $skip, 'take' => $take] = page_args($query);
    [$scope, $params] = scope_quote($actor, 'q');
    $where = [$scope];
    if (!empty($query['status'])) {
        $where[] = 'q.`status` = ?';
        $params[] = $query['status'];
    }
    if (!empty($query['clientId'])) {
        $where[] = 'q.`clientId` = ?';
        $params[] = $query['clientId'];
    }
    if (!empty($query['q'])) {
        $like = like_pattern((string)$query['q']);
        $where[] = '(q.`number` LIKE ? OR q.`title` LIKE ? OR c.`companyName` LIKE ?)';
        array_push($params, $like, $like, $like);
    }
    $w = implode(' AND ', array_map(fn($x) => "({$x})", $where));
    $from = 'FROM `quotes` q JOIN `clients` c ON c.`id` = q.`clientId` LEFT JOIN `projects` p ON p.`id` = q.`projectId`';
    $rows = Db::rows("SELECT q.*, c.`companyName` AS c_companyName, c.`name` AS c_name, p.`id` AS p_id, p.`name` AS p_name, p.`code` AS p_code {$from} WHERE {$w} ORDER BY q.`createdAt` DESC LIMIT " . (int)$take . ' OFFSET ' . (int)$skip, $params);
    $total = (int)Db::val("SELECT COUNT(*) {$from} WHERE {$w}", $params);
    $items = array_map(function ($r) {
        $q = Db::hydrate('quotes', array_intersect_key($r, Db::table('quotes')['cols']));
        $q['client'] = ['companyName' => $r['c_companyName'], 'name' => $r['c_name']];
        $q['project'] = $r['p_id'] ? ['id' => $r['p_id'], 'name' => $r['p_name'], 'code' => $r['p_code']] : null;
        return $q;
    }, $rows);
    return paged($items, $total, $page, $pageSize);
}

function get_quote(Actor $actor, string $id, array $opts = []): array
{
    $q = scoped_quote_row($actor, $id);
    if (!empty($opts['markViewed']) && !$actor->isStaff && $q['status'] === 'SENT') {
        $now = now_ms();
        Db::update('quotes', ['id' => $id], ['status' => 'VIEWED', 'viewedAt' => $now]);
        log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'quote.viewed', 'message' => "{$actor->name} viewed quote {$q['number']}", 'projectId' => $q['projectId'], 'clientId' => $q['clientId'], 'visibility' => 'INTERNAL']);
        if ($q['leadId']) {
            Db::insert('lead_activities', ['leadId' => $q['leadId'], 'type' => 'quote_viewed', 'title' => "Quote {$q['number']} viewed by {$actor->name}"], false);
        }
        $q['status'] = 'VIEWED';
        $q['viewedAt'] = iso_dt($now);
    }
    return quote_with_relations($q);
}

/** Client accepts → quote ACCEPTED, project moves to the contract stage, a draft contract is prepared for the studio. */
function accept_quote(Actor $actor, string $id): array
{
    $q = scoped_quote_row($actor, $id);
    assert_org_action($actor, $q['organizationId'], 'approve');
    if (!in_array($q['status'], ['SENT', 'VIEWED'], true)) {
        throw new AppError('CONFLICT', $q['status'] === 'ACCEPTED' ? "You've already accepted this quote." : "This quote can't be accepted right now.");
    }
    if ($q['validUntil'] && ts_ms($q['validUntil']) < now_ms()) {
        Db::update('quotes', ['id' => $id], ['status' => 'EXPIRED']);
        throw new AppError('CONFLICT', "This quote has expired. Message us and we'll refresh it.");
    }
    $meta = request_meta();
    // atomic: two clicks (or two tabs) can only accept once
    if (Db::exec("UPDATE `quotes` SET `status` = 'ACCEPTED', `acceptedAt` = ?, `acceptedById` = ?, `acceptedIp` = ? WHERE `id` = ? AND `status` IN ('SENT','VIEWED')", [db_dt(), $actor->userId, $meta['ip'], $id]) !== 1) {
        throw new AppError('CONFLICT', "You've already accepted this quote.");
    }
    $accepted = Db::first('quotes', ['id' => $id]);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'quote.accepted', 'entityType' => 'quote', 'entityId' => $id, 'message' => "{$actor->name} accepted quote {$q['number']}", 'metadata' => ['ip' => $meta['ip']]]);
    log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'quote.accepted', 'message' => "{$actor->name} accepted quote {$q['number']}", 'projectId' => $q['projectId'], 'clientId' => $q['clientId'], 'visibility' => 'CLIENT']);
    if ($q['leadId']) {
        Db::insert('lead_activities', ['leadId' => $q['leadId'], 'type' => 'quote_accepted', 'title' => "Quote {$q['number']} accepted by {$actor->name}"], false);
    }
    if ($q['changeRequestId']) {
        // change orders skip the contract stage: invoice straight away
        $sys = system_actor('Change order');
        $inv = create_invoice_from_quote($sys, $accepted, 'CHANGE_ORDER');
        send_invoice($sys, $inv['id']);
        Db::update('change_requests', ['id' => $q['changeRequestId']], ['classification' => 'ADDITIONAL_COST']);
    } elseif ($q['projectId']) {
        $p = Db::first('projects', ['id' => $q['projectId']]);
        if (in_array($p['status'], ['AWAITING_QUOTE', 'INQUIRY'], true)) {
            if ($p['status'] === 'INQUIRY') {
                apply_transition($actor, $q['projectId'], 'AWAITING_QUOTE', ['quiet' => true]);
            }
            apply_transition($actor, $q['projectId'], 'AWAITING_CONTRACT', ['comment' => "Quote {$q['number']} accepted", 'quiet' => true]);
        }
        try {
            create_contract_draft(system_actor('System'), $q['projectId'], $q['id']);
        } catch (Throwable $e) {
            app_log('[quotes] contract draft failed: ' . $e->getMessage());
        }
    }
    Db::update('clients', ['id' => $q['clientId']], ['status' => 'ONBOARDING']);
    emit('quote.accepted', ['workspaceId' => $actor->workspaceId, 'actorId' => $actor->userId, 'projectId' => $q['projectId'], 'clientId' => $q['clientId'], 'quoteId' => $id, 'leadId' => $q['leadId']]);
    return $accepted;
}

function reject_quote(Actor $actor, string $id, ?string $reason = null): array
{
    $q = scoped_quote_row($actor, $id);
    assert_org_action($actor, $q['organizationId'], 'approve');
    if (!in_array($q['status'], ['SENT', 'VIEWED'], true)) {
        throw new AppError('CONFLICT', "This quote can't be declined right now.");
    }
    Db::update('quotes', ['id' => $id], ['status' => 'REJECTED', 'rejectedAt' => now_ms(), 'rejectionReason' => $reason]);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'quote.rejected', 'entityType' => 'quote', 'entityId' => $id, 'message' => "{$actor->name} declined quote {$q['number']}" . ($reason ? ": {$reason}" : '')]);
    log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'quote.rejected', 'message' => "{$actor->name} declined quote {$q['number']}", 'projectId' => $q['projectId'], 'clientId' => $q['clientId'], 'visibility' => 'INTERNAL']);
    emit('quote.rejected', ['workspaceId' => $actor->workspaceId, 'actorId' => $actor->userId, 'projectId' => $q['projectId'], 'clientId' => $q['clientId'], 'quoteId' => $id]);
    return Db::first('quotes', ['id' => $id]);
}

function create_change_order_quote(Actor $actor, string $projectId, array $in): array
{
    $p = Db::first('projects', ['id' => $projectId, 'workspaceId' => $actor->workspaceId]);
    if (!$p) {
        throw not_found('Project');
    }
    $q = create_quote($actor, [
        'clientId' => $p['clientId'], 'projectId' => $projectId, 'title' => 'Change order — ' . $in['title'], 'currency' => $p['currency'],
        'items' => [['description' => mb_substr($in['description'], 0, 300), 'quantity' => 1, 'unitPrice' => $in['amount']]], 'depositPercent' => 100, 'taxRateBps' => 0,
    ]);
    Db::update('quotes', ['id' => $q['id']], ['changeRequestId' => $in['changeRequestId']]);
    return send_quote($actor, $q['id']);
}

function expire_quotes(): int
{
    return Db::exec("UPDATE `quotes` SET `status` = 'EXPIRED' WHERE `status` IN ('SENT','VIEWED') AND `validUntil` < ?", [db_dt()]);
}
