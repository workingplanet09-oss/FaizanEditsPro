<?php
/** /api/quotes, contracts, invoices, payments and the payment-provider webhook. */
defined('FEP') or exit;

$pageQ = fn() => V::coerceNum()->optional();

// ── quotes ──
function quote_body_shape(): array
{
    return [
        'clientId' => V::str(), 'projectId' => V::str()->nullish(), 'leadId' => V::str()->nullish(), 'title' => V::str()->max(200)->optional(), 'currency' => V::str()->length(3)->optional(),
        'items' => V::arr(V::obj(['description' => V::str()->trim()->min(1)->max(300), 'serviceId' => V::str()->nullish(), 'quantity' => V::num()->positive()->max(10000), 'unitPrice' => V::num()->int()->min(0)]))->min(1)->max(40),
        'discount' => V::num()->int()->min(0)->optional(), 'taxRateBps' => V::num()->int()->min(0)->max(10000)->optional(), 'depositPercent' => V::num()->int()->min(0)->max(100)->optional(),
        'validUntil' => V::date()->nullish(), 'notes' => V::str()->max(3000)->nullish(), 'terms' => V::str()->max(6000)->nullish(), 'projectName' => V::str()->max(200)->optional(),
        'serviceId' => V::str()->nullish(), 'projectTypeKey' => V::str()->max(60)->nullish(),
    ];
}
api('GET', '/api/quotes', fn(Ctx $c) => list_quotes($c->actor, $c->query), ['query' => V::obj(['q' => V::str()->optional(), 'status' => V::str()->optional(), 'clientId' => V::str()->optional(), 'page' => $pageQ(), 'pageSize' => $pageQ()])]);
api('POST', '/api/quotes', fn(Ctx $c) => create_quote($c->actor, $c->body), ['status' => 201, 'body' => V::obj(quote_body_shape())]);
api('GET', '/api/quotes/{id}', fn(Ctx $c) => get_quote($c->actor, $c->params['id'], ['markViewed' => true]));
api('PATCH', '/api/quotes/{id}', fn(Ctx $c) => update_quote($c->actor, $c->params['id'], $c->body), ['body' => V::obj(array_map(fn(V $r) => $r->optional(), array_diff_key(quote_body_shape(), ['clientId' => 1, 'projectId' => 1, 'leadId' => 1])))]);
api('POST', '/api/quotes/{id}/send', fn(Ctx $c) => send_quote($c->actor, $c->params['id']));
/** The client accepts from the portal; acceptance (who/when/IP) is logged. */
api('POST', '/api/quotes/{id}/accept', fn(Ctx $c) => accept_quote($c->actor, $c->params['id']));
api('POST', '/api/quotes/{id}/reject', fn(Ctx $c) => reject_quote($c->actor, $c->params['id'], $c->body['reason'] ?? null), ['body' => V::obj(['reason' => V::str()->max(500)->optional()])->default([])]);

// ── contracts ──
api('GET', '/api/contracts', fn(Ctx $c) => list_contracts($c->actor, $c->query), ['query' => V::obj(['q' => V::str()->optional(), 'status' => V::str()->optional(), 'page' => $pageQ(), 'pageSize' => $pageQ()])]);
api('POST', '/api/contracts', function (Ctx $c) {
    assert_can($c->actor, 'contracts:write');
    return create_contract_draft($c->actor, $c->body['projectId'], $c->body['quoteId'] ?? null);
}, ['status' => 201, 'body' => V::obj(['projectId' => V::str(), 'quoteId' => V::str()->nullish()])]);
api('GET', '/api/contracts/{id}', fn(Ctx $c) => get_contract($c->actor, $c->params['id'], ['markViewed' => true]));
api('PATCH', '/api/contracts/{id}', fn(Ctx $c) => update_contract($c->actor, $c->params['id'], $c->body), ['body' => V::obj([
    'title' => V::str()->trim()->min(2)->max(200)->optional(),
    'sections' => V::arr(V::obj(['key' => V::str()->max(40), 'title' => V::str()->max(200), 'body' => V::str()->max(8000)]))->min(1)->max(30)->optional(),
])]);
api('POST', '/api/contracts/{id}/send', fn(Ctx $c) => send_contract($c->actor, $c->params['id']));
api('POST', '/api/contracts/{id}/sign', fn(Ctx $c) => sign_contract($c->actor, $c->params['id'], $c->body), ['body' => V::obj([
    'signerName' => V::str()->trim()->min(2)->max(120), 'signature' => V::str()->min(2)->max(200000), 'kind' => V::enum(['typed', 'drawn']), 'accept' => V::bool(), 'version' => V::num()->int()->min(1),
]), 'rate' => ['sign', 20, 600, 'user']]);
api('GET', '/api/contracts/{id}/download', function (Ctx $c) {
    $r = render_contract_html($c->actor, $c->params['id']);
    return new RawResponse(function () use ($r) {
        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: ' . content_disposition($r['filename']));
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'; img-src data:; style-src 'unsafe-inline'");
        echo $r['html'];
    });
});

// ── invoices & payments ──
api('GET', '/api/invoices', fn(Ctx $c) => list_invoices($c->actor, $c->query), ['query' => V::obj([
    'q' => V::str()->optional(), 'status' => V::str()->optional(), 'clientId' => V::str()->optional(), 'projectId' => V::str()->optional(), 'page' => $pageQ(), 'pageSize' => $pageQ(),
])]);
api('POST', '/api/invoices', fn(Ctx $c) => create_invoice($c->actor, $c->body), ['status' => 201, 'body' => V::obj([
    'clientId' => V::str(), 'projectId' => V::str()->nullish(), 'quoteId' => V::str()->nullish(), 'kind' => V::enum(['DEPOSIT', 'BALANCE', 'FULL', 'RETAINER', 'CHANGE_ORDER', 'OTHER'])->optional(), 'currency' => V::str()->length(3)->optional(),
    'items' => V::arr(V::obj(['description' => V::str()->trim()->min(1)->max(300), 'quantity' => V::num()->positive()->max(10000), 'unitPrice' => V::num()->int()->min(0)]))->min(1)->max(40),
    'discount' => V::num()->int()->min(0)->optional(), 'taxRateBps' => V::num()->int()->min(0)->max(10000)->optional(), 'dueDate' => V::date()->nullish(), 'notes' => V::str()->max(2000)->nullish(), 'send' => V::bool()->optional(),
])]);
api('GET', '/api/invoices/{id}', fn(Ctx $c) => get_invoice($c->actor, $c->params['id'], ['markViewed' => true]));
api('POST', '/api/invoices/{id}/send', fn(Ctx $c) => send_invoice($c->actor, $c->params['id']));
api('POST', '/api/invoices/{id}/cancel', fn(Ctx $c) => cancel_invoice($c->actor, $c->params['id'], $c->body['reason'] ?? null), ['body' => V::obj(['reason' => V::str()->max(300)->optional()])->default([])]);
/** Creates a hosted checkout with the configured provider (Stripe) or a demo checkout. */
api('POST', '/api/invoices/{id}/pay', fn(Ctx $c) => start_checkout($c->actor, $c->params['id']), ['rate' => ['checkout', 20, 600, 'user']]);
api('POST', '/api/invoices/{id}/pay/demo', function (Ctx $c) {
    $r = demo_pay($c->actor, $c->params['id']);
    return ['status' => $r['invoice']['status'], 'paymentId' => $r['payment']['id']];
});
api('POST', '/api/invoices/{id}/manual-payment', function (Ctx $c) {
    $r = record_manual_payment($c->actor, $c->params['id'], $c->body);
    return ['status' => $r['invoice']['status'], 'paymentId' => $r['payment']['id']];
}, ['status' => 201, 'body' => V::obj(['amount' => V::num()->int()->min(1), 'method' => V::str()->trim()->min(2)->max(60), 'reference' => V::str()->max(120)->optional()])]);
api('GET', '/api/payments', fn(Ctx $c) => list_payments($c->actor, $c->query), ['query' => V::obj(['invoiceId' => V::str()->optional(), 'page' => $pageQ()])]);
/** Staff records an offline payment against an invoice. */
api('POST', '/api/payments', function (Ctx $c) {
    $r = record_manual_payment($c->actor, $c->body['invoiceId'], $c->body);
    return ['status' => $r['invoice']['status'], 'paymentId' => $r['payment']['id']];
}, ['status' => 201, 'body' => V::obj(['invoiceId' => V::str(), 'amount' => V::num()->int()->min(1), 'method' => V::str()->trim()->min(2)->max(60), 'reference' => V::str()->max(120)->optional()])]);

/** Signature-verified provider webhook. The raw body is needed for HMAC verification, and it is the ONLY thing that can mark a card payment as paid. */
api_public('POST', '/api/webhooks/payments', function (Ctx $c) {
    $headers = [];
    foreach ($_SERVER as $k => $v) {
        if (str_starts_with($k, 'HTTP_')) {
            $headers[strtolower(str_replace('_', '-', substr($k, 5)))] = (string)$v;
        }
    }
    $event = payment_parse_webhook($c->req->raw(), $headers);
    if (!$event) {
        throw new AppError('BAD_REQUEST', 'Invalid or unsigned webhook.');
    }
    return handle_payment_webhook($event);
}, ['csrf' => false]);
