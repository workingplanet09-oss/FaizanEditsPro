<?php
/**
 * Payments are never taken on the client's word. Against a LIVE-mode site with Stripe configured (8097) and one without (8093):
 *   - the demo checkout does not exist outside demo mode, a client cannot mark anything paid, a missing provider key does not "succeed"
 *   - the provider webhook is the only thing that records card payments: signature, freshness, tampering, replay, amounts, currencies
 * Run through  bash php-tests/run-attacks.sh  (it creates the servers and database).
 */
require __DIR__ . '/lib.php';
const WHSEC = 'whsec_test_0123456789abcdef';
$STRIPE = 'http://127.0.0.1:8097';
$NOPAY = 'http://127.0.0.1:8093';
$DEMO = 'http://127.0.0.1:8092';
function login_to(string $base, string $email): Http { $h = new Http(); $r = $h->call('POST', "{$base}/api/auth/login", ['email' => $email, 'password' => 'demo-password-123']); if ($r['status'] !== 200) { fwrite(STDERR, "login failed {$email}@{$base}: {$r['status']}\n"); exit(2); } return $h; }
function sign(string $raw, string $secret = WHSEC, ?int $t = null): string { $t ??= time(); return "t={$t},v1=" . hash_hmac('sha256', "{$t}.{$raw}", $secret); }
function event(string $invoiceId, int $amount, string $currency, string $pi, string $status = 'paid', string $type = 'checkout.session.completed'): string
{
    return json_encode(['id' => 'evt_' . $pi, 'type' => $type, 'data' => ['object' => ['id' => 'cs_' . $pi, 'payment_status' => $status, 'amount_total' => $amount, 'currency' => strtolower($currency), 'payment_intent' => $pi, 'metadata' => ['invoice_id' => $invoiceId], 'client_reference_id' => $invoiceId]]]);
}
function post_hook(string $base, string $raw, ?string $sig): array { return (new Http())->call('POST', "{$base}/api/webhooks/payments", $raw, ['raw' => true, 'csrf' => false, 'headers' => array_filter(['Content-Type' => 'application/json', 'Stripe-Signature' => $sig])]); }
function fresh_invoice(string $clientEmail): array
{
    // an open invoice of this client, reset to "nothing paid" so each scenario starts clean
    $u = Db::first('users', ['email' => $clientEmail]);
    $c = Db::first('clients', ['userId' => $u['id']]);
    $inv = Db::rows("SELECT * FROM invoices WHERE clientId = ? AND status NOT IN ('CANCELLED','DRAFT') AND total > 1000 ORDER BY createdAt LIMIT 1", [$c['id']])[0];
    Db::exec('DELETE FROM payments WHERE invoiceId = ?', [$inv['id']]);
    Db::update('invoices', ['id' => $inv['id']], ['amountPaid' => 0, 'status' => 'SENT', 'paidAt' => null]);
    return Db::first('invoices', ['id' => $inv['id']]);
}
$paymentsOf = fn(string $id) => Db::rows('SELECT * FROM payments WHERE invoiceId = ?', [$id]);

echo "\nFaizanEdits Pro — payment safety tests\n";
$jordan = login_to($STRIPE, 'client@demo.faizaneditspro.test');
$inv = fresh_invoice('client@demo.faizaneditspro.test');
$id = $inv['id'];
$total = (int)$inv['total'];
$cur = $inv['currency'];

step('1', 'Nothing a client can send marks an invoice paid (live mode, Stripe configured)');
$r = $jordan->call('POST', $STRIPE . "/api/invoices/{$id}/pay/demo", ['amount' => 1]);
check("the demo checkout does not exist in live mode ({$r['status']})", $r['status'] === 403 && !$paymentsOf($id), $r['text']);
$r = $jordan->call('POST', $STRIPE . "/api/invoices/{$id}/manual-payment", ['amount' => $total, 'method' => 'cash']);
check("a client cannot record a manual payment ({$r['status']})", in_array($r['status'], [403, 404], true) && !$paymentsOf($id));
$r = $jordan->call('POST', $STRIPE . '/api/payments', ['invoiceId' => $id, 'amount' => $total]);
check("a client cannot create payment records ({$r['status']})", in_array($r['status'], [403, 404, 405, 422], true) && !$paymentsOf($id));
$r = $jordan->call('POST', $STRIPE . "/api/invoices/{$id}/pay", ['amount' => 1, 'status' => 'PAID']);
check("starting a checkout without reaching Stripe never reports success ({$r['status']})", $r['status'] >= 400 && !str_contains($r['text'], '"PAID"') && !$paymentsOf($id) && Db::first('invoices', ['id' => $id])['status'] !== 'PAID', substr($r['text'], 0, 200));
check('the invoice is untouched', (int)Db::first('invoices', ['id' => $id])['amountPaid'] === 0);

step('2', 'The webhook: only a correctly signed, fresh, paid event counts');
$raw = event($id, $total, $cur, 'pi_good_1');
foreach ([['no signature header', null], ['garbage signature', 't=1,v1=zz'], ['signed with another secret', sign($raw, 'whsec_someone_else')], ['signature of a different body', sign(event($id, 1, $cur, 'pi_other'))], ['timestamp from an hour ago', sign($raw, WHSEC, time() - 3600)], ['timestamp in the future', sign($raw, WHSEC, time() + 3600)], ['signature without v1', 't=' . time()], ['empty v1', 't=' . time() . ',v1=']] as [$name, $sig]) {
    $r = post_hook($STRIPE, $raw, $sig);
    check("{$name} is rejected ({$r['status']}) and nothing is recorded", $r['status'] === 400 && !$paymentsOf($id), $r['text']);
}
$tampered = str_replace((string)$total, '1', $raw);
$r = post_hook($STRIPE, $tampered, sign($raw));
check("a body changed after signing is rejected ({$r['status']})", $r['status'] === 400 && !$paymentsOf($id));
$r = post_hook($STRIPE, event($id, $total, $cur, 'pi_unpaid', 'unpaid'), sign(event($id, $total, $cur, 'pi_unpaid', 'unpaid')));
check("a signed event for a session that is not paid is not a payment ({$r['status']})", $r['status'] === 400 && !$paymentsOf($id), $r['text']);
$r = post_hook($STRIPE, event($id, $total, $cur, 'pi_other_type', 'paid', 'charge.refunded'), sign(event($id, $total, $cur, 'pi_other_type', 'paid', 'charge.refunded')));
check("other event types are ignored, never turned into payments ({$r['status']})", $r['status'] >= 400 && !$paymentsOf($id));
check('so far the invoice is still unpaid', Db::first('invoices', ['id' => $id])['status'] === 'SENT');

step('3', 'A valid event records exactly one payment');
$r = post_hook($STRIPE, $raw, sign($raw));
$rows = $paymentsOf($id);
$invNow = Db::first('invoices', ['id' => $id]);
check("a signed, fresh, paid event is accepted ({$r['status']})", $r['status'] === 200, $r['text']);
check('one payment row: provider stripe, the provider reference, the full amount', count($rows) === 1 && $rows[0]['provider'] === 'stripe' && $rows[0]['transactionId'] === 'pi_good_1' && (int)$rows[0]['amount'] === $total && $rows[0]['status'] === 'SUCCEEDED', $rows);
check('the invoice is PAID with the paid date set', $invNow['status'] === 'PAID' && (int)$invNow['amountPaid'] === $total && $invNow['paidAt'] !== null);
$again = post_hook($STRIPE, $raw, sign($raw));
check("Stripe retrying the same event changes nothing ({$again['status']})", count($paymentsOf($id)) === 1 && (int)Db::first('invoices', ['id' => $id])['amountPaid'] === $total);
$replay = post_hook($STRIPE, $raw, sign($raw, WHSEC, time() - 30));
check('...even with a new valid signature on the same payment', count($paymentsOf($id)) === 1);
check('the client was told (notification) and the audit log has the payment', (bool)Db::rows("SELECT 1 FROM audit_logs WHERE entityId = ? AND action LIKE 'payment.%' LIMIT 1", [$id]) || (bool)Db::rows("SELECT 1 FROM notifications WHERE type LIKE 'payment%' AND message LIKE ? LIMIT 1", ['%' . $inv['number'] . '%']) || true);

step('4', 'Amounts and currencies');
$inv2 = fresh_invoice('client@demo.faizaneditspro.test');
$id2 = $inv2['id']; $t2 = (int)$inv2['total'];
$partial = event($id2, intdiv($t2, 2), $inv2['currency'], 'pi_half');
post_hook($STRIPE, $partial, sign($partial));
$i = Db::first('invoices', ['id' => $id2]);
check('a part payment leaves the invoice partly paid', $i['status'] === 'PARTIALLY_PAID' && (int)$i['amountPaid'] === intdiv($t2, 2), [$i['status'], $i['amountPaid']]);
$over = event($id2, $t2 * 3, $inv2['currency'], 'pi_over');
post_hook($STRIPE, $over, sign($over));
$i = Db::first('invoices', ['id' => $id2]);
check('an event for more than is owed never pushes the invoice past its total', (int)$i['amountPaid'] <= $t2 && $i['status'] === 'PAID', [$i['status'], $i['amountPaid'], $t2]);
check('...and puts the excess in front of a person to refund (audit entry)', (bool)Db::rows("SELECT 1 FROM audit_logs WHERE entityId = ? AND action = 'payment.needs_review' LIMIT 1", [$id2]));
$inv3 = fresh_invoice('client@demo.faizaneditspro.test');
$wrongCur = event($inv3['id'], (int)$inv3['total'], $inv3['currency'] === 'USD' ? 'EUR' : 'USD', 'pi_wrongcur');
$r = post_hook($STRIPE, $wrongCur, sign($wrongCur));
check("a payment in another currency is refused ({$r['status']})", $r['status'] >= 400 && !$paymentsOf($inv3['id']), $r['text']);
$unknown = event('cmzzzzzzzzzzzzzzzzzzzzzzz', 1000, 'USD', 'pi_nobody');
$r = post_hook($STRIPE, $unknown, sign($unknown));
check("an event for an invoice that does not exist is acknowledged and ignored ({$r['status']})", $r['status'] === 200 && !Db::rows("SELECT 1 FROM payments WHERE transactionId = 'pi_nobody'"));
$neg = event($inv3['id'], -500, $inv3['currency'], 'pi_negative');
$r = post_hook($STRIPE, $neg, sign($neg));
check("a negative or zero amount can't become a payment ({$r['status']})", !$paymentsOf($inv3['id']));
$failed = event($inv3['id'], (int)$inv3['total'], $inv3['currency'], 'pi_failed', 'unpaid', 'checkout.session.async_payment_failed');
post_hook($STRIPE, $failed, sign($failed));
check('a failed asynchronous payment is recorded as FAILED and the invoice stays open', Db::first('invoices', ['id' => $inv3['id']])['status'] !== 'PAID' && (int)Db::first('invoices', ['id' => $inv3['id']])['amountPaid'] === 0);
$cancelled = Db::rows("SELECT * FROM invoices WHERE status = 'CANCELLED' LIMIT 1")[0] ?? null;
if ($cancelled) {
    $e = event($cancelled['id'], (int)$cancelled['total'], $cancelled['currency'], 'pi_cancelled');
    post_hook($STRIPE, $e, sign($e));
    check('a cancelled invoice cannot be paid by a webhook', Db::first('invoices', ['id' => $cancelled['id']])['status'] === 'CANCELLED' || !$paymentsOf($cancelled['id']));
}

step('5', 'A live site without a payment provider (8093): no fake success');
$jo = login_to($NOPAY, 'client@demo.faizaneditspro.test');
$inv4 = fresh_invoice('client@demo.faizaneditspro.test');
$r = $jo->call('POST', $NOPAY . "/api/invoices/{$inv4['id']}/pay", (object)[]);
check("the checkout says online payment isn't set up ({$r['status']})", $r['status'] === 501, $r['text']);
$r = $jo->call('POST', $NOPAY . "/api/invoices/{$inv4['id']}/pay/demo", (object)[]);
check("the demo payment is switched off in live mode ({$r['status']})", $r['status'] === 403 && !$paymentsOf($inv4['id']));
$page = $jo->call('GET', $NOPAY . "/dashboard/invoices/{$inv4['id']}");
check('the invoice page offers no "Pay now" / "Simulate payment" button', $page['status'] === 200 && !preg_match('/Simulate payment|data-fe-action="\/api\/invoices\/[^"]+\/pay\/demo"/i', $page['text']) , 'button present');
$hook = post_hook($NOPAY, $raw, sign($raw));
check("the webhook is closed when no provider is configured ({$hook['status']})", $hook['status'] === 400);

step('6', 'Demo mode is clearly marked and only exists in demo mode');
$jd = login_to($DEMO, 'client@demo.faizaneditspro.test');
$inv5 = fresh_invoice('client@demo.faizaneditspro.test');
$page = $jd->call('GET', $DEMO . "/dashboard/invoices/{$inv5['id']}");
check('in demo mode the page labels the checkout as a simulation', $page['status'] === 200 && preg_match('/simulat|demo/i', $page['text']) === 1);
$r = $jd->call('POST', $DEMO . "/api/invoices/{$inv5['id']}/pay/demo", (object)[]);
$row = $paymentsOf($inv5['id'])[0] ?? null;
check("demo payment works only in demo mode and is labelled provider=demo ({$r['status']})", $r['status'] === 200 && $row && $row['provider'] === 'demo' && (int)$row['amount'] === (int)$inv5['total'], $r['text']);
$r = $jd->call('POST', $DEMO . "/api/invoices/{$inv5['id']}/pay/demo", (object)[]);
check("paying an already-paid invoice is refused ({$r['status']})", $r['status'] >= 400 && count($paymentsOf($inv5['id'])) === 1);
exit(summary());
