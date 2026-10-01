<?php defined('FEP') or exit; ?><?= ui_page_header('Contracts', 'Your signed agreements are stored here for good.') ?>
<?php ob_start();
echo ui_table([
    ['key' => 'n', 'header' => 'Contract', 'primary' => true, 'render' => fn($c) => '<span class="font-bold">' . e($c['number']) . '</span>'],
    ['key' => 'p', 'header' => 'Project', 'render' => fn($c) => e($c['project']['name'] ?? '—')],
    ['key' => 's', 'header' => 'Status', 'render' => fn($c) => meta_badge('CONTRACT_STATUS', $c['status'])],
    ['key' => 'd', 'header' => 'Signed', 'hideOnMobile' => true, 'render' => fn($c) => $c['signedAt'] ? e(fmt_date_short($c['signedAt'])) : '—'],
], $res['items'], fn($c) => $c['id'], fn($c) => '/dashboard/contracts/' . $c['id'], ui_empty('No contracts yet', 'After you accept a quote, your agreement will appear here to sign.', 'sign'));
echo ui_pagination($res['page'], $res['pages'], '/dashboard/contracts', [], $res['total']);
echo card(ob_get_clean()); ?>
