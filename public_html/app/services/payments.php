<?php
/**
 * Payment providers. 'demo' never moves money (a clearly labelled "Simulate payment" step, only while the site is in demo mode);
 * 'stripe' creates a Stripe Checkout session over HTTPS and confirms payments only from a signed webhook — the browser is never trusted.
 */
defined('FEP') or exit;

function payment_provider_name(): string
{
    return cfg('payments.provider', 'demo') === 'stripe' ? 'stripe' : 'demo';
}

/** True when a client can pay online: Stripe with a key, or the demo checkout while the site is in demo mode. */
function online_payments_available(): bool
{
    return payment_provider_name() === 'stripe' ? (bool)cfg('payments.secret_key') : is_demo_mode();
}

/** @return array{kind:string,url:string,reference:?string} */
function payment_create_checkout(array $in): array
{
    if (payment_provider_name() !== 'stripe') {
        return ['kind' => 'demo', 'url' => "/dashboard/invoices/{$in['invoiceId']}?checkout=demo", 'reference' => "demo_{$in['invoiceId']}"];
    }
    $key = (string)cfg('payments.secret_key');
    if ($key === '') {
        throw new AppError('NOT_CONFIGURED', 'Stripe is selected but the secret key is not set.');
    }
    $body = http_build_query([
        'mode' => 'payment',
        'line_items[0][price_data][currency]' => strtolower($in['currency']),
        'line_items[0][price_data][unit_amount]' => (string)$in['amount'],
        'line_items[0][price_data][product_data][name]' => $in['description'],
        'line_items[0][quantity]' => '1',
        'success_url' => $in['successUrl'],
        'cancel_url' => $in['cancelUrl'],
        'customer_email' => $in['customerEmail'],
        'client_reference_id' => $in['invoiceId'],
        'metadata[invoice_id]' => $in['invoiceId'],
        'metadata[invoice_number]' => $in['invoiceNumber'],
        'payment_intent_data[metadata][invoice_id]' => $in['invoiceId'],
    ], '', '&', PHP_QUERY_RFC3986);
    $res = http_request('POST', 'https://api.stripe.com/v1/checkout/sessions', ['Authorization' => "Bearer {$key}", 'Content-Type' => 'application/x-www-form-urlencoded'], $body, 15);
    if ($res['status'] === 0) {
        throw new AppError('BAD_REQUEST', "The payment provider didn't respond. Please try again in a moment.");
    }
    $json = json_decode($res['body'], true) ?: [];
    if ($res['status'] < 200 || $res['status'] >= 300) {
        throw new AppError('BAD_REQUEST', 'Payment provider error: ' . ($json['error']['message'] ?? $res['status']));
    }
    return ['kind' => 'redirect', 'url' => (string)$json['url'], 'reference' => $json['id'] ?? null];
}

/**
 * Verifies a Stripe webhook (HMAC over "t.body", 10-minute replay window) and returns a normalised event, or null when the
 * signature is missing/invalid or the event is not one we act on.
 * @return array{type:string,invoiceId:string,transactionId:string,amount:int,currency:string,method?:string}|null
 */
function payment_parse_webhook(string $raw, array $headers): ?array
{
    if (payment_provider_name() !== 'stripe') {
        return null;
    }
    $secret = (string)cfg('payments.webhook_secret');
    $sig = $headers['stripe-signature'] ?? null;
    if ($secret === '' || !$sig) {
        return null;
    }
    $t = null;
    $candidates = [];
    foreach (explode(',', $sig) as $part) {
        $eq = strpos($part, '=');
        if ($eq === false) {
            continue;
        }
        $k = trim(substr($part, 0, $eq));
        $v = trim(substr($part, $eq + 1));
        if ($k === 't') {
            $t = $v;
        } elseif ($k === 'v1') {
            $candidates[] = $v;
        }
    }
    if ($t === null || !$candidates || !is_numeric($t) || abs(time() - (float)$t) > 600) {
        return null;
    }
    $expected = hash_hmac('sha256', "{$t}.{$raw}", $secret);
    $valid = false;
    foreach ($candidates as $c) {
        $valid = hash_equals($expected, $c) || $valid;
    }
    if (!$valid) {
        return null;
    }
    $event = json_decode($raw, true);
    if (!is_array($event)) {
        return null;
    }
    $s = $event['data']['object'] ?? [];
    if (($event['type'] ?? '') === 'checkout.session.completed') {
        if (($s['payment_status'] ?? '') !== 'paid') {
            return null;
        }
        return ['type' => 'payment.succeeded', 'invoiceId' => (string)($s['metadata']['invoice_id'] ?? $s['client_reference_id'] ?? ''), 'transactionId' => (string)($s['payment_intent'] ?? $s['id']), 'amount' => (int)$s['amount_total'], 'currency' => strtoupper((string)$s['currency']), 'method' => 'card'];
    }
    if (($event['type'] ?? '') === 'checkout.session.async_payment_failed') {
        return ['type' => 'payment.failed', 'invoiceId' => (string)($s['metadata']['invoice_id'] ?? $s['client_reference_id'] ?? ''), 'transactionId' => (string)$s['id'], 'amount' => (int)($s['amount_total'] ?? 0), 'currency' => strtoupper((string)($s['currency'] ?? 'usd'))];
    }
    return null;
}
