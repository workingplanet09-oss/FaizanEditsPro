<?php /** Vars: $scope, $f, $res, $filtered */
$params = array_filter($f) + ($scope === 'open' ? [] : ['scope' => $scope]);
$isLate = fn(array $p) => $p['deadline'] && days_until($p['deadline']) < 0 && !in_array($p['status'], ['DELIVERED', 'APPROVED', 'ARCHIVED', 'CANCELLED'], true); ?>
<?= ui_page_header('My projects', "Projects you're assigned to. Open one for the brief, files, versions and revisions.") ?>
<?= ui_tabs([['open', 'Open'], ['all', 'All (incl. delivered)']], $scope, '/editor/projects', 'scope', array_filter($f)) ?>
<?php ob_start(); ?>
<?= ui_filter_bar('/editor/projects', [
    ['name' => 'q', 'label' => 'Search projects', 'placeholder' => 'Search name, code, client…'],
    ['name' => 'status', 'label' => 'Status', 'type' => 'select', 'options' => array_map(fn($s) => ['value' => $s, 'label' => status_meta($s)['label']], project_statuses())],
    ['name' => 'sort', 'label' => 'Sort', 'type' => 'select', 'options' => [['value' => 'deadline', 'label' => 'Deadline'], ['value' => 'priority', 'label' => 'Priority'], ['value' => 'updated', 'label' => 'Recently updated'], ['value' => 'oldest', 'label' => 'Oldest']]],
], $f, '<input type="hidden" name="scope" value="' . e($scope) . '">') ?>
<?= ui_table([
    ['key' => 'n', 'header' => 'Project', 'primary' => true, 'render' => fn($p) => '<span><span class="font-bold">' . e($p['name']) . '</span><span class="block text-xs font-normal text-muted">' . e($p['code'] . ' · ' . $p['client']['companyName']) . '</span></span>'],
    ['key' => 's', 'header' => 'Status', 'render' => fn($p) => status_badge($p['status'])],
    ['key' => 'pr', 'header' => 'Priority', 'hideOnMobile' => true, 'render' => fn($p) => $p['priority'] === 'NORMAL' ? '<span class="text-subtle">Normal</span>' : priority_badge($p['priority'])],
    ['key' => 'd', 'header' => 'Deadline', 'render' => fn($p) => $p['deadline'] ? '<span class="' . ($isLate($p) ? 'font-bold text-danger' : '') . '" title="' . e(fmt_date_short($p['deadline'])) . '">' . e(relative_deadline($p['deadline'])) . '</span>' : '—'],
    ['key' => 'e', 'header' => 'Team', 'hideOnMobile' => true, 'render' => fn($p) => $p['editors'] ? e(implode(', ', array_column($p['editors'], 'name'))) : '<span class="text-subtle">—</span>'],
    ['key' => 'r', 'header' => 'Open rev.', 'hideOnMobile' => true, 'align' => 'right', 'render' => fn($p) => $p['openRevisions'] ? (string)(int)$p['openRevisions'] : '—'],
], $res['items'], fn($p) => $p['id'], fn($p) => '/editor/projects/' . $p['id'], ui_empty($filtered ? 'No projects match these filters' : 'No projects assigned to you yet', $filtered ? 'Try clearing a filter.' : 'When the studio assigns you to a project it will appear here.', 'film')) ?>
<?= ui_pagination($res['page'], $res['pages'], '/editor/projects', $params, $res['total']) ?>
<?= card(ob_get_clean(), 'overflow-visible') ?>
