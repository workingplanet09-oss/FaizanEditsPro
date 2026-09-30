<?php /** Vars: $res */ ?>
<?= ui_page_header('Payments', 'Every payment received or attempted. Recording is idempotent, so webhook retries never double-count.') ?>
<?php ob_start(); ?>
<?= ui_table([
    ['key' => 'd', 'header' => 'Date', 'primary' => true, 'render' => fn($p) => '<span class="font-semibold">' . e(fmt_datetime($p['paidAt'] ?: $p['createdAt'])) . '</span>'],
    ['key' => 'i', 'header' => 'Invoice', 'render' => fn($p) => '<a class="font-bold hover:underline" href="/admin/invoices/' . e($p['invoiceId']) . '">' . e($p['invoice']['number']) . '</a>'],
    ['key' => 'c', 'header' => 'Client', 'hideOnMobile' => true, 'render' => fn($p) => e($p['client']['companyName'])],
    ['key' => 'm', 'header' => 'Method', 'hideOnMobile' => true, 'render' => fn($p) => e($p['method'] ?? $p['provider'])],
    ['key' => 's', 'header' => 'Status', 'render' => fn($p) => ui_badge(strtolower($p['status']), $p['status'] === 'SUCCEEDED' ? 'success' : ($p['status'] === 'FAILED' ? 'danger' : 'neutral'))],
    ['key' => 'a', 'header' => 'Amount', 'align' => 'right', 'render' => fn($p) => '<span class="font-semibold tabular-nums">' . e(money((int)$p['amount'], $p['currency'])) . '</span>'],
], $res['items'], fn($p) => $p['id'], null, ui_empty('No payments yet', 'Payments appear here as clients pay their invoices.', 'wallet')) ?>
<?= ui_pagination($res['page'], $res['pages'], '/admin/payments', [], $res['total']) ?>
<?= card(ob_get_clean(), 'overflow-visible') ?>
