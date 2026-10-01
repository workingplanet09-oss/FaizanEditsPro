<?php defined('FEP') or exit; /** Vars: $section, $q, $sort, $res, $actor */
$canWrite = $actor->can('clients:write');
$params = array_filter(['q' => $q, 'sort' => $sort, 'section' => $section === 'active' ? null : $section]);
?>
<?= ui_page_header('Clients', 'Everyone you work with, in one place.', $canWrite ? ui_link('/admin/clients/new', 'New client', ['icon' => 'plus', 'variant' => 'dark']) : null) ?>
<?= ui_tabs([['active', 'Active'], ['prospects', 'Prospects'], ['retainers', 'Retainers'], ['inactive', 'Inactive'], ['all', 'All']], $section, '/admin/clients', 'section', array_filter(['q' => $q, 'sort' => $sort])) ?>
<?php ob_start(); ?>
<?= ui_filter_bar('/admin/clients', [['name' => 'q', 'label' => 'Search clients', 'placeholder' => 'Search name, company, email…'], ['name' => 'sort', 'label' => 'Sort', 'type' => 'select', 'options' => [['value' => 'name', 'label' => 'Company A–Z'], ['value' => 'oldest', 'label' => 'Oldest first']]]], ['q' => $q, 'sort' => $sort], '<input type="hidden" name="section" value="' . e($section) . '">') ?>
<?= ui_table([
    ['key' => 'c', 'header' => 'Company', 'primary' => true, 'render' => fn($c) => '<span><span class="font-bold">' . e($c['companyName']) . '</span><span class="block text-xs font-normal text-muted">' . e($c['name'] . ' · ' . $c['email']) . '</span></span>'],
    ['key' => 's', 'header' => 'Status', 'render' => fn($c) => meta_badge('CLIENT_STATUS', $c['status'])],
    ['key' => 'i', 'header' => 'Industry', 'hideOnMobile' => true, 'render' => fn($c) => e($c['industry'] ?? '—')],
    ['key' => 'p', 'header' => 'Projects', 'hideOnMobile' => true, 'render' => fn($c) => e("{$c['activeProjects']} active · {$c['totalProjects']} total")],
    ['key' => 'm', 'header' => 'Manager', 'hideOnMobile' => true, 'render' => fn($c) => $c['manager'] ? e($c['manager']['name']) : '<span class="text-subtle">—</span>'],
    ['key' => 'u', 'header' => 'Updated', 'align' => 'right', 'render' => fn($c) => '<span class="text-muted">' . ago($c['updatedAt']) . '</span>'],
], $res['items'], fn($c) => $c['id'], fn($c) => '/admin/clients/' . $c['id'],
    ui_empty($q ? 'No clients match your search' : 'No clients here yet', $q ? 'Try a different search.' : 'Clients appear when you convert a lead or add one manually.', 'building', $canWrite && !$q ? ui_link('/admin/clients/new', 'Add a client') : null)) ?>
<?= ui_pagination($res['page'], $res['pages'], '/admin/clients', $params, $res['total']) ?>
<?= card(ob_get_clean(), 'overflow-visible') ?>
