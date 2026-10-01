<?php defined('FEP') or exit; /** Vars: $f, $res */ $has = (bool)array_filter($f); ?>
<?= ui_page_header('Contracts', 'Agreements are drafted automatically when a quote is accepted. Review, send and track signatures here.') ?>
<?php ob_start(); ?>
<?= ui_filter_bar('/admin/contracts', [['name' => 'q', 'label' => 'Search contracts', 'placeholder' => 'Search number, title, client…'], ['name' => 'status', 'label' => 'Status', 'type' => 'select', 'options' => enum_options('CONTRACT_STATUS')]], $f) ?>
<?= ui_table([
    ['key' => 'n', 'header' => 'Contract', 'primary' => true, 'render' => fn($c) => '<span><span class="font-bold">' . e($c['number']) . '</span><span class="block text-xs font-normal text-muted">' . e($c['title']) . '</span></span>'],
    ['key' => 'c', 'header' => 'Client', 'render' => fn($c) => e($c['client']['companyName'])],
    ['key' => 'p', 'header' => 'Project', 'hideOnMobile' => true, 'render' => fn($c) => e($c['project']['code'])],
    ['key' => 's', 'header' => 'Status', 'render' => fn($c) => meta_badge('CONTRACT_STATUS', $c['status'])],
    ['key' => 'd', 'header' => 'Signed', 'hideOnMobile' => true, 'align' => 'right', 'render' => fn($c) => $c['signedAt'] ? e(fmt_date_short($c['signedAt'])) : '—'],
], $res['items'], fn($c) => $c['id'], fn($c) => '/admin/contracts/' . $c['id'], ui_empty($has ? 'No contracts match' : 'No contracts yet', 'A draft contract is created the moment a client accepts a quote.', 'sign')) ?>
<?= ui_pagination($res['page'], $res['pages'], '/admin/contracts', array_filter($f), $res['total']) ?>
<?= card(ob_get_clean(), 'overflow-visible') ?>
