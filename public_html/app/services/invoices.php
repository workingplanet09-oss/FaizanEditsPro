<?php
/** Invoices and payments. record_payment() is the ONLY place money is recorded; it is idempotent on (provider, transactionId). */
defined('FEP') or exit;

function invoice_with_relations(array $inv): array
{
    $inv['items'] = Db::find('invoice_items', ['invoiceId' => $inv['id']], ['order' => '`sortOrder` ASC']);
    $inv['payments'] = Db::find('payments', ['invoiceId' => $inv['id']], ['order' => '`createdAt` DESC']);
    $inv['client'] = Db::first('clients', ['id' => $inv['clientId']], ['cols' => ['id', 'name', 'email', 'companyName']]);
    $inv['project'] = $inv['projectId'] ? Db::first('projects', ['id' => $inv['projectId']], ['cols' => ['id', 'name', 'code']]) : null;
    $inv['quote'] = $inv['quoteId'] ? Db::first('quotes', ['id' => $inv['quoteId']], ['cols' => ['id', 'number']]) : null;
    return $inv;
}

function scoped_invoice_row(Actor $actor, string $id): array
{
    [$s, $p] = scope_invoice($actor, 'i');
    $row = Db::rowRaw("SELECT i.* FROM `invoices` i WHERE i.`id` = ? AND {$s}", [$id, ...$p]);
    if (!$row) {
        throw not_found('Invoice');
    }
    return Db::hydrate('invoices', $row);
}

/** $in: clientId, projectId?, quoteId?, kind?, currency?, items[{description, quantity, unitPrice}], discount?, taxRateBps?, dueDate?, notes?, send? */
function create_invoice(Actor $actor, array $in): array
{
    assert_can($actor, 'invoices:write');
    $client = Db::first('clients', ['id' => $in['clientId'], 'workspaceId' => $actor->workspaceId]);
    if (!$client) {
        throw not_found('Client');
    }
    if (!empty($in['projectId']) && !Db::exists('projects', ['id' => $in['projectId'], 'clientId' => $client['id'], 'workspaceId' => $actor->workspaceId])) {
        throw not_found('Project');
    }
    if (!empty($in['quoteId']) && !Db::exists('quotes', ['id' => $in['quoteId'], 'clientId' => $client['id'], 'workspaceId' => $actor->workspaceId])) {
        throw not_found('Quote');
    }
    if (empty($in['items'])) {
        throw bad_request('Add at least one line item.', ['items' => 'Add at least one item.']);
    }
    $inv = get_setting($actor->workspaceId, 'invoice');
    $business = get_setting($actor->workspaceId, 'business');
    $currency = strtoupper($in['currency'] ?? $business['defaultCurrency']);
    $t = compute_totals($in['items'], (int)($in['discount'] ?? 0), (int)($in['taxRateBps'] ?? $inv['taxRateBps']), 100);
    $number = $inv['prefix'] . '-' . next_number($actor->workspaceId, 'invoice', 1000);
    $id = Db::tx(function () use ($actor, $in, $client, $number, $currency, $t, $inv) {
        $invoice = Db::insert('invoices', [
            'workspaceId' => $actor->workspaceId, 'organizationId' => $client['organizationId'], 'clientId' => $client['id'], 'projectId' => $in['projectId'] ?? null, 'quoteId' => $in['quoteId'] ?? null,
            'number' => $number, 'kind' => $in['kind'] ?? 'OTHER', 'currency' => $currency, 'subtotal' => $t['subtotal'], 'discount' => $t['discount'], 'tax' => $t['tax'], 'total' => $t['total'],
            'dueDate' => $in['dueDate'] ?? add_days_ms(now_ms(), (int)$inv['dueDays']), 'notes' => $in['notes'] ?? $inv['notes'], 'createdById' => $actor->userId, 'isDemo' => $client['isDemo'],
        ]);
        foreach (array_values($in['items']) as $n => $i) {
            Db::insert('invoice_items', ['invoiceId' => $invoice['id'], 'description' => $i['description'], 'quantity' => $i['quantity'], 'unitPrice' => (int)$i['unitPrice'], 'amount' => (int)round($i['quantity'] * $i['unitPrice']), 'sortOrder' => $n], false);
        }
        return $invoice['id'];
    });
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'invoice.created', 'entityType' => 'invoice', 'entityId' => $id, 'message' => "{$actor->name} generated Invoice #{$number} (" . money($t['total'], $currency) . ')']);
    if (!empty($in['send'])) {
        send_invoice($actor, $id);
    }
    return invoice_with_relations(Db::first('invoices', ['id' => $id]));
}

/** Internal: derive an invoice from a quote (deposit / balance / full / change order). */
function create_invoice_from_quote(mixed $who, array $quote, string $kind): array
{
    $inv = get_setting($quote['workspaceId'], 'invoice');
    $amount = $kind === 'DEPOSIT' ? $quote['deposit'] : ($kind === 'BALANCE' ? $quote['balance'] : $quote['total']);
    $title = $quote['title'] ?: "Quote {$quote['number']}";
    $label = match ($kind) {
        'DEPOSIT' => "Deposit ({$quote['depositPercent']}%) — {$title}",
        'BALANCE' => "Remaining balance — {$title}",
        'CHANGE_ORDER' => $quote['title'] ?: 'Change order',
        default => $title,
    };
    $number = $inv['prefix'] . '-' . next_number($quote['workspaceId'], 'invoice', 1000);
    $id = Db::tx(function () use ($who, $quote, $kind, $amount, $label, $number, $inv) {
        $invoice = Db::insert('invoices', [
            'workspaceId' => $quote['workspaceId'], 'organizationId' => $quote['organizationId'], 'clientId' => $quote['clientId'], 'projectId' => $quote['projectId'], 'quoteId' => $quote['id'],
            'number' => $number, 'kind' => $kind, 'currency' => $quote['currency'], 'subtotal' => $amount, 'total' => $amount, 'dueDate' => add_days_ms(now_ms(), (int)$inv['dueDays']),
            'notes' => $quote['tax'] > 0 ? trim(($inv['notes'] ?? '') . ' Amounts include applicable tax.') : $inv['notes'],
            'createdById' => who_id($who), 'isDemo' => $quote['isDemo'],
        ]);
        Db::insert('invoice_items', ['invoiceId' => $invoice['id'], 'description' => $label, 'quantity' => 1, 'unitPrice' => $amount, 'amount' => $amount, 'sortOrder' => 0], false);
        return $invoice['id'];
    });
    audit($who, ['workspaceId' => $quote['workspaceId'], 'action' => 'invoice.created', 'entityType' => 'invoice', 'entityId' => $id, 'message' => who_name($who) . " generated Invoice #{$number} (" . money($amount, $quote['currency']) . ')']);
    return Db::first('invoices', ['id' => $id]);
}

function send_invoice(mixed $who, string $id): array
{
    if (is_actor($who)) {
        assert_can($who, 'invoices:write');
        $inv = scoped_invoice_row($who, $id);
    } else {
        $inv = Db::first('invoices', ['id' => $id]) ?? throw not_found('Invoice');
    }
    if (in_array($inv['status'], ['PAID', 'CANCELLED'], true)) {
        throw new AppError('CONFLICT', 'This invoice is ' . strtolower($inv['status']) . '.');
    }
    $now = now_ms();
    Db::update('invoices', ['id' => $id], ['status' => $inv['status'] === 'DRAFT' ? 'SENT' : $inv['status'], 'issuedAt' => $inv['issuedAt'] ?? $now, 'sentAt' => $now]);
    if ($inv['projectId']) {
        Db::update('projects', ['id' => $inv['projectId']], ['clientVisible' => true]);
    }
    $ws = $inv['workspaceId'];
    audit($who, ['workspaceId' => $ws, 'action' => 'invoice.sent', 'entityType' => 'invoice', 'entityId' => $id, 'message' => who_name($who) . " sent Invoice #{$inv['number']}"]);
    log_activity($who, ['workspaceId' => $ws, 'type' => 'invoice.sent', 'message' => "Invoice {$inv['number']} issued (" . money($inv['total'], $inv['currency']) . ')', 'projectId' => $inv['projectId'], 'clientId' => $inv['clientId'], 'visibility' => 'CLIENT']);
    $leadId = Db::val('SELECT `id` FROM `leads` WHERE `convertedClientId` = ? LIMIT 1', [$inv['clientId']]);
    if ($leadId) {
        Db::insert('lead_activities', ['leadId' => $leadId, 'type' => 'invoice_created', 'title' => "Invoice {$inv['number']} created", 'actorId' => who_id($who)], false);
    }
    emit('invoice.sent', ['workspaceId' => $ws, 'actorId' => who_id($who), 'projectId' => $inv['projectId'], 'clientId' => $inv['clientId'], 'invoiceId' => $id]);
    return Db::first('invoices', ['id' => $id]);
}

function cancel_invoice(Actor $actor, string $id, ?string $reason = null): array
{
    assert_can($actor, 'invoices:write');
    $inv = scoped_invoice_row($actor, $id);
    if ($inv['amountPaid'] > 0) {
        throw new AppError('CONFLICT', "This invoice has payments recorded and can't be cancelled.");
    }
    Db::update('invoices', ['id' => $id], ['status' => 'CANCELLED', 'notes' => $reason ? trim(($inv['notes'] ?? '') . "\nCancelled: {$reason}") : $inv['notes']]);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'invoice.cancelled', 'entityType' => 'invoice', 'entityId' => $id, 'message' => "{$actor->name} cancelled Invoice #{$inv['number']}"]);
    return ['ok' => true];
}

/** $query: q, status, clientId, projectId, page, pageSize */
function list_invoices(Actor $actor, array $query = []): array
{
    if ($actor->isStaff) {
        assert_can($actor, 'invoices:read');
    }
    ['page' => $page, 'pageSize' => $pageSize, 'skip' => $skip, 'take' => $take] = page_args($query);
    [$scope, $params] = scope_invoice($actor, 'i');
    $where = [$scope];
    foreach (['status' => 'i.`status`', 'clientId' => 'i.`clientId`', 'projectId' => 'i.`projectId`'] as $k => $col) {
        if (!empty($query[$k])) {
            $where[] = "{$col} = ?";
            $params[] = $query[$k];
        }
    }
    if (!empty($query['q'])) {
        $like = like_pattern((string)$query['q']);
        $where[] = '(i.`number` LIKE ? OR c.`companyName` LIKE ?)';
        array_push($params, $like, $like);
    }
    $w = implode(' AND ', array_map(fn($x) => "({$x})", $where));
    $from = 'FROM `invoices` i JOIN `clients` c ON c.`id` = i.`clientId` LEFT JOIN `projects` p ON p.`id` = i.`projectId`';
    $rows = Db::rows("SELECT i.*, c.`companyName` AS c_companyName, c.`name` AS c_name, p.`id` AS p_id, p.`name` AS p_name, p.`code` AS p_code {$from} WHERE {$w} ORDER BY i.`createdAt` DESC LIMIT " . (int)$take . ' OFFSET ' . (int)$skip, $params);
    $total = (int)Db::val("SELECT COUNT(*) {$from} WHERE {$w}", $params);
    $items = array_map(function ($r) {
        $i = Db::hydrate('invoices', array_intersect_key($r, Db::table('invoices')['cols']));
        $i['client'] = ['companyName' => $r['c_companyName'], 'name' => $r['c_name']];
        $i['project'] = $r['p_id'] ? ['id' => $r['p_id'], 'name' => $r['p_name'], 'code' => $r['p_code']] : null;
        return $i;
    }, $rows);
    return paged($items, $total, $page, $pageSize);
}

function get_invoice(Actor $actor, string $id, array $opts = []): array
{
    $inv = scoped_invoice_row($actor, $id);
    if (!empty($opts['markViewed']) && !$actor->isStaff && $inv['status'] === 'SENT') {
        Db::update('invoices', ['id' => $id], ['status' => 'VIEWED', 'viewedAt' => now_ms()]);
        $inv['status'] = 'VIEWED';
    }
    return invoice_with_relations($inv);
}

// ───────────────────────────── payments ─────────────────────────────

function start_checkout(Actor $actor, string $invoiceId): array
{
    $inv = scoped_invoice_row($actor, $invoiceId);
    assert_org_action($actor, $inv['organizationId'], 'billing');
    if (in_array($inv['status'], ['PAID', 'CANCELLED', 'DRAFT'], true)) {
        throw new AppError('CONFLICT', $inv['status'] === 'PAID' ? 'This invoice is already paid.' : "This invoice can't be paid right now.");
    }
    if (!online_payments_available()) {
        throw new AppError('NOT_CONFIGURED', "Online payment isn't set up. Please message us to arrange payment.");
    }
    $client = Db::first('clients', ['id' => $inv['clientId']]);
    return payment_create_checkout([
        'invoiceId' => $inv['id'], 'invoiceNumber' => $inv['number'], 'amount' => $inv['total'] - $inv['amountPaid'], 'currency' => $inv['currency'], 'customerEmail' => $client['email'],
        'successUrl' => absolute_url("/dashboard/invoices/{$inv['id']}?paid=1"), 'cancelUrl' => absolute_url("/dashboard/invoices/{$inv['id']}?cancelled=1"), 'description' => "Invoice {$inv['number']}",
    ]);
}

/**
 * The only place money is recorded. Idempotent on (provider, transactionId) so provider webhook retries can never double-count.
 * $in: invoiceId, amount, currency, provider, transactionId, method?, metadata?
 * @return array{payment:array,invoice:array,duplicate:bool}
 */
function record_payment(mixed $who, array $in): array
{
    $inv = Db::first('invoices', ['id' => $in['invoiceId']]);
    if (!$inv) {
        throw not_found('Invoice');
    }
    if (strtoupper($in['currency']) !== $inv['currency']) {
        throw bad_request("Payment currency {$in['currency']} doesn't match the invoice ({$inv['currency']}).");
    }
    if ($in['amount'] <= 0) {
        throw bad_request('Payment amount must be positive.');
    }
    $remaining = $inv['total'] - $inv['amountPaid'];
    if ($in['amount'] > $remaining) {
        throw bad_request("That's more than the outstanding balance (" . money($remaining, $inv['currency']) . ').');
    }
    if (in_array($inv['status'], ['CANCELLED', 'DRAFT'], true)) {
        throw new AppError('CONFLICT', "This invoice isn't payable.");
    }
    $existing = Db::first('payments', ['provider' => $in['provider'], 'transactionId' => $in['transactionId']]);
    if ($existing) {
        if ($existing['invoiceId'] !== $inv['id']) {
            throw new AppError('CONFLICT', 'That payment reference was already used for a different invoice.');
        }
        return ['payment' => $existing, 'invoice' => $inv, 'duplicate' => true];
    }

    $now = now_ms();
    try {
        [$payment, $invoice] = Db::tx(function () use ($inv, $in, $now) {
            // Atomic increment: concurrent payments on the same invoice serialise on the row lock instead of overwriting each other,
            // and the balance is re-checked against the freshly updated row (a failure here rolls the increment back).
            Db::update('invoices', ['id' => $inv['id']], ['amountPaid' => new DbInc($in['amount'])]);
            $bumped = Db::first('invoices', ['id' => $inv['id']]);
            if (in_array($bumped['status'], ['CANCELLED', 'DRAFT'], true)) {
                throw new AppError('CONFLICT', "This invoice isn't payable.");
            }
            if ($bumped['amountPaid'] > $bumped['total']) {
                throw bad_request("That's more than the outstanding balance (" . money($bumped['total'] - ($bumped['amountPaid'] - $in['amount']), $inv['currency']) . ').');
            }
            $payment = Db::insert('payments', [
                'workspaceId' => $inv['workspaceId'], 'invoiceId' => $inv['id'], 'clientId' => $inv['clientId'], 'organizationId' => $inv['organizationId'], 'amount' => $in['amount'],
                'currency' => $inv['currency'], 'provider' => $in['provider'], 'transactionId' => $in['transactionId'], 'method' => $in['method'] ?? null, 'status' => 'SUCCEEDED',
                'paidAt' => $now, 'metadata' => $in['metadata'] ?? null, 'isDemo' => $inv['isDemo'],
            ]);
            $full = $bumped['amountPaid'] >= $bumped['total'];
            Db::update('invoices', ['id' => $inv['id']], ['status' => $full ? 'PAID' : 'PARTIALLY_PAID', 'paidAt' => $full ? $now : null, 'paymentMethod' => $in['method'] ?? $in['provider']]);
            return [$payment, Db::first('invoices', ['id' => $inv['id']])];
        });
    } catch (PDOException $e) {
        // Two deliveries of the same provider event raced: the loser's transaction (including its increment) rolled back.
        if (Db::isDuplicate($e)) {
            $again = Db::first('payments', ['provider' => $in['provider'], 'transactionId' => $in['transactionId']]);
            if ($again) {
                return ['payment' => $again, 'invoice' => Db::first('invoices', ['id' => $inv['id']]) ?? $inv, 'duplicate' => true];
            }
        }
        throw $e;
    }

    $ws = $inv['workspaceId'];
    audit($who, ['workspaceId' => $ws, 'action' => 'payment.received', 'entityType' => 'payment', 'entityId' => $payment['id'], 'message' => money($in['amount'], $inv['currency']) . " received for Invoice #{$inv['number']} via {$in['provider']}", 'metadata' => ['invoiceId' => $inv['id'], 'transactionId' => $in['transactionId']]]);
    log_activity($who, ['workspaceId' => $ws, 'type' => 'payment.received', 'message' => 'Payment of ' . money($in['amount'], $inv['currency']) . " received (Invoice {$inv['number']})", 'projectId' => $inv['projectId'], 'clientId' => $inv['clientId'], 'visibility' => 'CLIENT']);
    $leadId = Db::val('SELECT `id` FROM `leads` WHERE `convertedClientId` = ? LIMIT 1', [$inv['clientId']]);
    if ($leadId) {
        Db::insert('lead_activities', ['leadId' => $leadId, 'type' => 'payment_received', 'title' => 'Payment received — ' . money($in['amount'], $inv['currency'])], false);
    }
    Db::update('clients', ['id' => $inv['clientId']], ['status' => 'ACTIVE']);

    // Project activation: deposit / full payment while awaiting payment → onboarding begins.
    if ($inv['projectId'] && $invoice['status'] === 'PAID' && in_array($inv['kind'], ['DEPOSIT', 'FULL'], true)) {
        $project = Db::first('projects', ['id' => $inv['projectId']]);
        if ($project && $project['status'] === 'AWAITING_PAYMENT') {
            apply_transition($who, $inv['projectId'], 'ONBOARDING', ['comment' => "Payment received (Invoice {$inv['number']})", 'quiet' => true]);
            if ($leadId) {
                Db::insert('lead_activities', ['leadId' => $leadId, 'type' => 'project_started', 'title' => 'Project started'], false);
            }
        }
    }
    qualify_referral($inv['clientId'], $ws);
    emit('payment.received', ['workspaceId' => $ws, 'actorId' => who_id($who), 'projectId' => $inv['projectId'], 'clientId' => $inv['clientId'], 'invoiceId' => $inv['id'], 'data' => ['amount' => $in['amount'], 'currency' => $inv['currency']]]);
    return ['payment' => $payment, 'invoice' => $invoice, 'duplicate' => false];
}

function qualify_referral(string $clientId, string $workspaceId): void
{
    $wf = get_setting($workspaceId, 'workflow');
    if (empty($wf['referralsEnabled'])) {
        return;
    }
    Db::exec("UPDATE `referrals` SET `status` = 'QUALIFIED', `reward` = ? WHERE `referredClientId` = ? AND `status` = 'PENDING'", [$wf['referralReward'], $clientId]);
}

/**
 * Demo-mode checkout: no card is charged, but the full payment pipeline (invoice, project activation, emails) runs for real.
 * It marks an invoice paid without any money moving, so it is impossible unless the site is in demo mode AND the provider is 'demo'.
 */
function demo_pay(Actor $actor, string $invoiceId): array
{
    if (payment_provider_name() !== 'demo' || !is_demo_mode()) {
        throw new AppError('FORBIDDEN', 'Demo payments are disabled.');
    }
    $inv = scoped_invoice_row($actor, $invoiceId);
    assert_org_action($actor, $inv['organizationId'], 'billing');
    return record_payment($actor, ['invoiceId' => $invoiceId, 'amount' => $inv['total'] - $inv['amountPaid'], 'currency' => $inv['currency'], 'provider' => 'demo', 'transactionId' => 'demo_' . bin2hex(random_bytes(9)), 'method' => 'demo checkout']);
}

/** Staff records an offline payment (bank transfer, cash, etc.). $in: amount, method, reference? */
function record_manual_payment(Actor $actor, string $invoiceId, array $in): array
{
    assert_can($actor, 'payments:write');
    $inv = scoped_invoice_row($actor, $invoiceId);
    // The reference is typed by a person (e.g. a bank transfer id) and one transfer can settle several invoices, so it only
    // de-duplicates a double-submit for the SAME invoice — never a payment against a different one.
    $ref = trim((string)($in['reference'] ?? ''));
    return record_payment($actor, [
        'invoiceId' => $invoiceId, 'amount' => $in['amount'], 'currency' => $inv['currency'], 'provider' => 'manual',
        'transactionId' => $ref !== '' ? "manual_{$invoiceId}_{$ref}" : 'manual_' . bin2hex(random_bytes(9)), 'method' => $in['method'], 'metadata' => $ref !== '' ? ['reference' => $ref] : null,
    ]);
}

function handle_payment_webhook(array $event): array
{
    if ($event['type'] === 'payment.succeeded') {
        $inv = Db::first('invoices', ['id' => $event['invoiceId']]);
        if (!$inv) {
            return ['ignored' => true];
        }
        $who = system_actor('Payment provider');
        $provider = payment_provider_name();
        $remaining = $inv['total'] - $inv['amountPaid'];
        // The provider already took this money. If the invoice can't absorb all of it (settled offline in the meantime, or paid twice),
        // acknowledge the event (so it isn't retried for days) and put it in front of a human to refund.
        if ($event['amount'] > $remaining) {
            $known = Db::first('payments', ['provider' => $provider, 'transactionId' => $event['transactionId']]);
            if (!$known) {
                $excess = $event['amount'] - max($remaining, 0);
                audit($who, ['workspaceId' => $inv['workspaceId'], 'action' => 'payment.needs_review', 'entityType' => 'invoice', 'entityId' => $inv['id'], 'message' => money($event['amount'], $inv['currency']) . " was taken by {$provider} for Invoice #{$inv['number']}, but only " . money(max($remaining, 0), $inv['currency']) . ' was outstanding — ' . money($excess, $inv['currency']) . ' may need refunding', 'metadata' => ['transactionId' => $event['transactionId']]]);
                $finance = Db::col(
                    "SELECT u.`id` FROM `users` u WHERE u.`workspaceId` = ? AND u.`isStaff` = 1 AND EXISTS (SELECT 1 FROM `user_roles` ur JOIN `roles` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = u.`id` AND r.`key` IN ('super_admin','admin','finance'))",
                    [$inv['workspaceId']],
                );
                notify(['workspaceId' => $inv['workspaceId'], 'userIds' => $finance, 'category' => 'PAYMENT', 'type' => 'payment.needs_review', 'title' => "Payment needs review — Invoice {$inv['number']}", 'message' => money($excess, $inv['currency']) . " more than the outstanding balance was received via {$provider}.", 'link' => "/admin/invoices/{$inv['id']}", 'email' => false]);
            }
            if ($remaining <= 0) {
                return ['ignored' => true, 'reason' => 'already settled'];
            }
        }
        return record_payment($who, ['invoiceId' => $inv['id'], 'amount' => min($event['amount'], $remaining), 'currency' => $event['currency'], 'provider' => $provider, 'transactionId' => $event['transactionId'], 'method' => $event['method'] ?? null]);
    }
    $inv = Db::first('invoices', ['id' => $event['invoiceId']]);
    if ($inv) {
        Db::upsert('payments', [
            'workspaceId' => $inv['workspaceId'], 'invoiceId' => $inv['id'], 'clientId' => $inv['clientId'], 'organizationId' => $inv['organizationId'], 'amount' => $event['amount'], 'currency' => $inv['currency'],
            'provider' => payment_provider_name(), 'transactionId' => $event['transactionId'], 'status' => 'FAILED', 'isDemo' => $inv['isDemo'],
        ], ['status' => 'FAILED']);
    }
    return ['ok' => true];
}

/** $query: invoiceId, page, pageSize */
function list_payments(Actor $actor, array $query = []): array
{
    if ($actor->isStaff) {
        assert_can($actor, 'payments:read');
    }
    ['page' => $page, 'pageSize' => $pageSize, 'skip' => $skip, 'take' => $take] = page_args($query);
    [$scope, $params] = scope_payment($actor, 'pay');
    $where = [$scope];
    if (!empty($query['invoiceId'])) {
        $where[] = 'pay.`invoiceId` = ?';
        $params[] = $query['invoiceId'];
    }
    $w = implode(' AND ', array_map(fn($x) => "({$x})", $where));
    $rows = Db::rows("SELECT pay.*, i.`number` AS i_number, c.`companyName` AS c_companyName FROM `payments` pay JOIN `invoices` i ON i.`id` = pay.`invoiceId` JOIN `clients` c ON c.`id` = pay.`clientId` WHERE {$w} ORDER BY pay.`createdAt` DESC LIMIT " . (int)$take . ' OFFSET ' . (int)$skip, $params);
    $total = (int)Db::val("SELECT COUNT(*) FROM `payments` pay WHERE {$w}", $params);
    $items = array_map(function ($r) {
        $p = Db::hydrate('payments', array_intersect_key($r, Db::table('payments')['cols']));
        $p['invoice'] = ['number' => $r['i_number']];
        $p['client'] = ['companyName' => $r['c_companyName']];
        return $p;
    }, $rows);
    return paged($items, $total, $page, $pageSize);
}

// ───────────────────────────── lifecycle helpers ─────────────────────────────

/** When the client approves the final cut, bill the remaining balance (if the quote had a deposit split). */
function ensure_balance_invoice(mixed $who, string $projectId): ?array
{
    $quote = Db::first('quotes', ['sql' => "`projectId` = ? AND `status` = 'ACCEPTED' AND `changeRequestId` IS NULL", 'params' => [$projectId]], ['order' => '`createdAt` DESC']);
    if (!$quote || $quote['balance'] <= 0) {
        return null;
    }
    if (Db::count('invoices', ['sql' => "`quoteId` = ? AND `kind` = 'BALANCE' AND `status` <> 'CANCELLED'", 'params' => [$quote['id']]])) {
        return null;
    }
    $inv = create_invoice_from_quote($who, $quote, 'BALANCE');
    send_invoice($who, $inv['id']);
    return $inv;
}

/** Sweep: mark past-due invoices overdue (once) and queue "due soon" reminders. */
function sweep_invoices(): array
{
    $now = now_ms();
    $overdue = Db::find('invoices', ['sql' => "`status` IN ('SENT','VIEWED','PARTIALLY_PAID') AND `dueDate` < ?", 'params' => [db_dt($now)]]);
    foreach ($overdue as $inv) {
        Db::update('invoices', ['id' => $inv['id']], ['status' => 'OVERDUE']);
        emit('invoice.overdue', ['workspaceId' => $inv['workspaceId'], 'projectId' => $inv['projectId'], 'clientId' => $inv['clientId'], 'invoiceId' => $inv['id']]);
        audit(system_actor('System'), ['workspaceId' => $inv['workspaceId'], 'action' => 'invoice.overdue', 'entityType' => 'invoice', 'entityId' => $inv['id'], 'message' => "Invoice #{$inv['number']} became overdue"]);
    }
    $soon = Db::find('invoices', ['sql' => "`status` IN ('SENT','VIEWED') AND `dueDate` >= ? AND `dueDate` < ?", 'params' => [db_dt($now), db_dt(add_days_ms($now, 2))]]);
    foreach ($soon as $inv) {
        enqueue_job('automation.emit', ['name' => 'invoice.due_soon', 'payload' => ['workspaceId' => $inv['workspaceId'], 'projectId' => $inv['projectId'], 'clientId' => $inv['clientId'], 'invoiceId' => $inv['id']]], ['dedupeKey' => "due-soon:{$inv['id']}"]);
    }
    return ['overdue' => count($overdue), 'dueSoon' => count($soon)];
}
