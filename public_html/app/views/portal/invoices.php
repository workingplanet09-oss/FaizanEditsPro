<?php /** Vars: $tab, $res */
$due = fn($i) => in_array($i['status'], ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'], true);
$rows = $tab === 'due' ? array_values(array_filter($res['items'], $due)) : $res['items'];
$outstanding = array_sum(array_map(fn($i) => $i['total'] - $i['amountPaid'], array_filter($res['items'], $due)));
?>
<?= ui_page_header('Invoices', $outstanding ? money($outstanding, $res['items'][0]['currency'] ?? 'USD') . ' outstanding' : "Everything you've been billed, and every receipt.") ?>
<?= ui_tabs([['all', 'All'], ['due', 'Due'], ['paid', 'Paid']], $tab, '/dashboard/invoices') ?>
<?php ob_start();
echo ui_table([
    ['key' => 'n', 'header' => 'Invoice', 'primary' => true, 'render' => fn($i) => '<span class="font-bold">' . e($i['number']) . '</span>'],
    ['key' => 'p', 'header' => 'Project', 'render' => fn($i) => e($i['project']['name'] ?? '—')],
    ['key' => 'k', 'header' => 'Type', 'hideOnMobile' => true, 'render' => fn($i) => '<span class="capitalize">' . e(strtolower($i['kind'])) . '</span>'],
    ['key' => 'd', 'header' => 'Due', 'hideOnMobile' => true, 'render' => fn($i) => $i['dueDate'] ? e(fmt_date_short($i['dueDate'])) : '—'],
    ['key' => 's', 'header' => 'Status', 'render' => fn($i) => meta_badge('INVOICE_STATUS', $i['status'])],
    ['key' => 'a', 'header' => 'Amount', 'align' => 'right', 'render' => fn($i) => '<span class="font-semibold tabular-nums">' . e(money((int)$i['total'], $i['currency'])) . '</span>'],
], $rows, fn($i) => $i['id'], fn($i) => '/dashboard/invoices/' . $i['id'], ui_empty($tab === 'due' ? 'Nothing to pay' : 'No invoices yet', $tab === 'due' ? "You're all paid up." : 'Invoices appear here once your contract is signed.', 'receipt'));
echo ui_pagination($res['page'], $res['pages'], '/dashboard/invoices', ['tab' => $tab === 'all' ? null : $tab], $res['total']);
echo card(ob_get_clean()); ?>
