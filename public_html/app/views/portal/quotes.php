<?= ui_page_header('Quotes', 'Review and accept proposals for your projects.') ?>
<?php ob_start();
echo ui_table([
    ['key' => 'n', 'header' => 'Quote', 'primary' => true, 'render' => fn($q) => '<span class="font-bold">' . e($q['number']) . '</span>'],
    ['key' => 't', 'header' => 'Project', 'render' => fn($q) => e($q['project']['name'] ?? $q['title'] ?? '—')],
    ['key' => 's', 'header' => 'Status', 'render' => fn($q) => meta_badge('QUOTE_STATUS', $q['status'])],
    ['key' => 'v', 'header' => 'Valid until', 'hideOnMobile' => true, 'render' => fn($q) => $q['validUntil'] ? e(fmt_date_short($q['validUntil'])) : '—'],
    ['key' => 'a', 'header' => 'Total', 'align' => 'right', 'render' => fn($q) => '<span class="font-semibold tabular-nums">' . e(money((int)$q['total'], $q['currency'])) . '</span>'],
], $res['items'], fn($q) => $q['id'], fn($q) => '/dashboard/quotes/' . $q['id'], ui_empty('No quotes yet', 'When we prepare a proposal for you, it will appear here for review.', 'clipboard'));
echo ui_pagination($res['page'], $res['pages'], '/dashboard/quotes', [], $res['total']);
echo card(ob_get_clean()); ?>
