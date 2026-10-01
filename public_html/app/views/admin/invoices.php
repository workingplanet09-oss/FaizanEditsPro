<?php defined('FEP') or exit; /** Vars: $f, $res, $actor */
$canWrite = $actor->can('invoices:write'); $has = (bool)array_filter($f); ?>
<?= ui_page_header('Invoices', "Track what's been billed and what's been paid.", $canWrite ? ui_link('/admin/invoices/new', 'New invoice', ['icon' => 'plus', 'variant' => 'dark']) : null) ?>
<?php ob_start(); ?>
<?= ui_filter_bar('/admin/invoices', [['name' => 'q', 'label' => 'Search invoices', 'placeholder' => 'Search number or client…'], ['name' => 'status', 'label' => 'Status', 'type' => 'select', 'options' => enum_options('INVOICE_STATUS')]], $f) ?>
<?= ui_table([
    ['key' => 'n', 'header' => 'Invoice', 'primary' => true, 'render' => fn($i) => '<span><span class="font-bold">' . e($i['number']) . '</span><span class="block text-xs font-normal capitalize text-muted">' . e(strtolower(humanize($i['kind']))) . '</span></span>'],
    ['key' => 'c', 'header' => 'Client', 'render' => fn($i) => e($i['client']['companyName'])],
    ['key' => 'p', 'header' => 'Project', 'hideOnMobile' => true, 'render' => fn($i) => e($i['project']['code'] ?? '—')],
    ['key' => 'd', 'header' => 'Due', 'hideOnMobile' => true, 'render' => fn($i) => $i['dueDate'] ? e(fmt_date_short($i['dueDate'])) : '—'],
    ['key' => 's', 'header' => 'Status', 'render' => fn($i) => meta_badge('INVOICE_STATUS', $i['status'])],
    ['key' => 'a', 'header' => 'Amount', 'align' => 'right', 'render' => fn($i) => '<span class="font-semibold tabular-nums">' . e(money((int)$i['total'], $i['currency'])) . '</span>'],
], $res['items'], fn($i) => $i['id'], fn($i) => '/admin/invoices/' . $i['id'], ui_empty($has ? 'No invoices match' : 'No invoices yet', 'Invoices are created automatically from accepted quotes, or manually here.', 'receipt', $canWrite ? ui_link('/admin/invoices/new', 'New invoice') : null)) ?>
<?= ui_pagination($res['page'], $res['pages'], '/admin/invoices', array_filter($f), $res['total']) ?>
<?= card(ob_get_clean(), 'overflow-visible') ?>
