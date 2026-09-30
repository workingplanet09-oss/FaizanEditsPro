<?php
/** Admin console: quotes, contracts, invoices, payments, retainers. */
defined('FEP') or exit;

function doc_filters(Ctx $c): array
{
    return ['q' => q_str($c, 'q'), 'status' => q_str($c, 'status')];
}

// ── quotes ──
staff_get('admin', '/admin/quotes', 'quotes:read', 'Quotes', 'admin/quotes', function (Actor $a, Ctx $c) {
    $f = doc_filters($c);
    return ['f' => $f, 'res' => list_quotes($a, array_filter($f) + ['page' => page_num($c->query['page'] ?? 1)])];
});

staff_get('admin', '/admin/quotes/new', 'quotes:write', 'New quote', 'admin/quote-new', function (Actor $a, Ctx $c) {
    $d = builder_data($a);
    return ['d' => $d, 'initial' => ['clientId' => q_str($c, 'clientId'), 'projectId' => q_str($c, 'projectId'), 'leadId' => q_str($c, 'leadId'), 'currency' => $d['business']['defaultCurrency']],
        'defaults' => ['taxRateBps' => $d['quote']['taxRateBps'], 'depositPercent' => $d['quote']['defaultDepositPercent'], 'validDays' => $d['quote']['validDays'], 'terms' => $d['quote']['terms'], 'dueDays' => $d['invoice']['dueDays']]];
});

staff_get('admin', '/admin/quotes/{id}', 'quotes:read', 'Quote', 'admin/quote', function (Actor $a, Ctx $c) {
    $q = get_quote($a, $c->params['id']);
    $canWrite = $a->can('quotes:write');
    $editable = $canWrite && !in_array($q['status'], ['ACCEPTED', 'REJECTED', 'EXPIRED'], true);
    $v = ['_title' => $q['number'], 'q' => $q, 'canWrite' => $canWrite, 'editable' => $editable, 'edit' => false];
    if (!empty($c->query['edit']) && $editable) {
        $d = builder_data($a);
        $v += ['d' => $d, 'initial' => [
            'id' => $q['id'], 'clientId' => $q['clientId'], 'projectId' => $q['projectId'], 'currency' => $q['currency'], 'items' => $q['items'], 'discount' => $q['discount'], 'taxRateBps' => $q['taxRateBps'], 'depositPercent' => $q['depositPercent'],
            'validUntil' => $q['validUntil'] ? substr(iso_dt(ts_ms($q['validUntil'])), 0, 10) : null, 'notes' => $q['notes'] ?? '', 'terms' => $q['terms'] ?? '', 'title' => $q['title'] ?? '',
        ], 'defaults' => ['taxRateBps' => $d['quote']['taxRateBps'], 'depositPercent' => $d['quote']['defaultDepositPercent'], 'validDays' => $d['quote']['validDays'], 'terms' => $d['quote']['terms'], 'dueDays' => $d['invoice']['dueDays']]];
        $v['edit'] = true;
    }
    return $v;
});

// ── contracts ──
staff_get('admin', '/admin/contracts', 'contracts:read', 'Contracts', 'admin/contracts', function (Actor $a, Ctx $c) {
    $f = doc_filters($c);
    return ['f' => $f, 'res' => list_contracts($a, array_filter($f) + ['page' => page_num($c->query['page'] ?? 1)])];
});

staff_get('admin', '/admin/contracts/{id}', 'contracts:read', 'Contract', 'admin/contract', function (Actor $a, Ctx $c) {
    $ct = get_contract($a, $c->params['id']);
    return ['_title' => $ct['number'], 'c' => $ct, 'canWrite' => $a->can('contracts:write')];
});

// ── invoices ──
staff_get('admin', '/admin/invoices', 'invoices:read', 'Invoices', 'admin/invoices', function (Actor $a, Ctx $c) {
    $f = doc_filters($c);
    return ['f' => $f, 'res' => list_invoices($a, array_filter($f) + ['page' => page_num($c->query['page'] ?? 1)])];
});

staff_get('admin', '/admin/invoices/new', 'invoices:write', 'New invoice', 'admin/invoice-new', function (Actor $a, Ctx $c) {
    $d = builder_data($a);
    return ['d' => $d, 'initial' => ['clientId' => q_str($c, 'clientId'), 'projectId' => q_str($c, 'projectId'), 'currency' => $d['business']['defaultCurrency'], 'notes' => $d['invoice']['notes']],
        'defaults' => ['taxRateBps' => $d['invoice']['taxRateBps'], 'depositPercent' => 100, 'validDays' => 14, 'terms' => '', 'dueDays' => $d['invoice']['dueDays']]];
});

staff_get('admin', '/admin/invoices/{id}', 'invoices:read', 'Invoice', 'admin/invoice', function (Actor $a, Ctx $c) {
    $inv = get_invoice($a, $c->params['id']);
    return ['_title' => $inv['number'], 'inv' => $inv, 'notes' => $a->can('notes:read') ? list_notes($a, 'INVOICE', $inv['id']) : []];
});

// ── payments ──
staff_get('admin', '/admin/payments', 'payments:read', 'Payments', 'admin/payments', fn(Actor $a, Ctx $c) => ['res' => list_payments($a, ['page' => page_num($c->query['page'] ?? 1)])]);

// ── retainers ──
staff_get('admin', '/admin/retainers', ['retainers:manage', 'invoices:read'], 'Retainers', 'admin/retainers', function (Actor $a) {
    $manage = $a->can('retainers:manage');
    $v = ['list' => list_retainers($a), 'manage' => $manage, 'clients' => [], 'business' => null, 'plans' => []];
    if ($manage) {
        $v['clients'] = list_clients($a, ['pageSize' => 200, 'sort' => 'name'])['items'];
        $v['business'] = get_setting($a->workspaceId, 'business');
        $v['plans'] = Db::rows("SELECT * FROM `pricing_plans` WHERE `workspaceId` = ? AND `billingType` = 'MONTHLY_RETAINER' ORDER BY `sortOrder` ASC", [$a->workspaceId]);
    }
    return $v;
});
