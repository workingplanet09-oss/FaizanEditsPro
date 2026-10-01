<?php defined('FEP') or exit; /** Vars: $f, $res, $actor */
$canWrite = $actor->can('quotes:write'); $has = (bool)array_filter($f); ?>
<?= ui_page_header('Quotes', 'Proposals from draft to accepted.', $canWrite ? ui_link('/admin/quotes/new', 'New quote', ['icon' => 'plus', 'variant' => 'dark']) : null) ?>
<?php ob_start(); ?>
<?= ui_filter_bar('/admin/quotes', [['name' => 'q', 'label' => 'Search quotes', 'placeholder' => 'Search number, client, title…'], ['name' => 'status', 'label' => 'Status', 'type' => 'select', 'options' => enum_options('QUOTE_STATUS')]], $f) ?>
<?= ui_table([
    ['key' => 'n', 'header' => 'Quote', 'primary' => true, 'render' => fn($q) => '<span><span class="font-bold">' . e($q['number']) . '</span><span class="block text-xs font-normal text-muted">' . e($q['title'] ?? $q['project']['name'] ?? '') . '</span></span>'],
    ['key' => 'c', 'header' => 'Client', 'render' => fn($q) => e($q['client']['companyName'])],
    ['key' => 's', 'header' => 'Status', 'render' => fn($q) => meta_badge('QUOTE_STATUS', $q['status'])],
    ['key' => 'v', 'header' => 'Valid until', 'hideOnMobile' => true, 'render' => fn($q) => $q['validUntil'] ? e(fmt_date_short($q['validUntil'])) : '—'],
    ['key' => 'a', 'header' => 'Total', 'align' => 'right', 'render' => fn($q) => '<span class="font-semibold tabular-nums">' . e(money((int)$q['total'], $q['currency'])) . '</span>'],
], $res['items'], fn($q) => $q['id'], fn($q) => '/admin/quotes/' . $q['id'], ui_empty($has ? 'No quotes match' : 'No quotes yet', 'Create a quote from a lead, client or project.', 'clipboard', $canWrite ? ui_link('/admin/quotes/new', 'New quote') : null)) ?>
<?= ui_pagination($res['page'], $res['pages'], '/admin/quotes', array_filter($f), $res['total']) ?>
<?= card(ob_get_clean(), 'overflow-visible') ?>
