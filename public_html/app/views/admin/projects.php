<?php defined('FEP') or exit; /** Vars: $view (table|board), $f (filters), $scope (open|all), $res, $staff, $actor */
$board = $view === 'board';
$hasFilter = (bool)array_filter($f);
$viewParams = array_filter($f) + ($scope === 'open' ? [] : ['scope' => $scope]);
$href = fn(string $v) => '/admin/projects' . ($viewParams + ($v === 'board' ? ['view' => 'board'] : []) ? '?' . http_build_query($viewParams + ($v === 'board' ? ['view' => 'board'] : [])) : '');
$stageOf = fn(string $s) => $s;
$canWrite = $actor->can('projects:write');
$fields = [
    ['name' => 'q', 'label' => 'Search projects', 'placeholder' => 'Search name, code, client…'],
    ['name' => 'status', 'label' => 'Status', 'type' => 'select', 'options' => array_map(fn($s) => ['value' => $s, 'label' => status_meta($s)['label']], project_statuses())],
    ['name' => 'priority', 'label' => 'Priority', 'type' => 'select', 'options' => array_map(fn($k) => ['value' => $k, 'label' => meta_for('PRIORITY', $k)['label']], ['URGENT', 'HIGH', 'NORMAL', 'LOW'])],
    ['name' => 'payment', 'label' => 'Payment', 'type' => 'select', 'options' => [['value' => 'paid', 'label' => 'Paid'], ['value' => 'unpaid', 'label' => 'Has unpaid invoice'], ['value' => 'none', 'label' => 'No invoice']]],
    ['name' => 'deadline', 'label' => 'Deadline', 'type' => 'select', 'options' => [['value' => 'overdue', 'label' => 'Overdue'], ['value' => 'week', 'label' => 'Next 7 days'], ['value' => 'month', 'label' => 'Next 30 days'], ['value' => 'none', 'label' => 'No deadline']]],
    ['name' => 'editorId', 'label' => 'Editor', 'type' => 'select', 'options' => array_map(fn($s) => ['value' => $s['id'], 'label' => $s['name']], $staff)],
    ['name' => 'sort', 'label' => 'Sort', 'type' => 'select', 'options' => [['value' => 'deadline', 'label' => 'Deadline'], ['value' => 'priority', 'label' => 'Priority'], ['value' => 'updated', 'label' => 'Recently updated'], ['value' => 'oldest', 'label' => 'Oldest']]],
];
$isLate = fn(array $p) => $p['deadline'] && days_until($p['deadline']) < 0 && !in_array($p['status'], ['DELIVERED', 'APPROVED', 'ARCHIVED', 'CANCELLED'], true);
?>
<?= ui_page_header('Projects', 'Every project from inquiry to delivery.', $canWrite ? ui_link('/admin/projects/new', 'New project', ['icon' => 'plus', 'variant' => 'dark']) : null) ?>
<div class="mb-4 flex flex-wrap items-end justify-between gap-3">
  <div class="min-w-0 flex-1"><?= ui_tabs([['open', 'Open'], ['all', 'All (incl. delivered)']], $scope, '/admin/projects', 'scope', array_filter($f) + ($board ? ['view' => 'board'] : [])) ?></div>
  <div class="mb-6 inline-flex rounded-xl bg-surface-2 p-1 text-sm font-semibold" role="group" aria-label="View">
    <?php foreach ([['table', 'Table'], ['board', 'Board']] as [$k, $l]): ?><a href="<?= e($href($k)) ?>"<?= $view === $k ? ' aria-current="page"' : '' ?> class="rounded-lg px-3.5 py-1.5 <?= $view === $k ? 'bg-surface shadow-soft' : 'text-muted hover:text-fg' ?>"><?= $l ?></a><?php endforeach; ?>
  </div>
</div>
<?php ob_start(); ?>
<?= ui_filter_bar('/admin/projects', $fields, $f, ($board ? '<input type="hidden" name="view" value="board">' : '') . '<input type="hidden" name="scope" value="' . e($scope) . '">') ?>
<?php if ($board): ?>
  <div class="thin-scroll flex gap-4 overflow-x-auto p-4"><?php foreach (pipeline_stages() as $col): $items = array_values(array_filter($res['items'], fn($p) => in_array($p['status'], $col['statuses'], true))); ?>
    <section aria-label="<?= e($col['label']) ?>" class="w-72 shrink-0">
      <h3 class="mb-3 flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-muted"><?= e($col['label']) ?><span class="rounded-full bg-surface-2 px-2 py-0.5 text-[11px]"><?= count($items) ?></span></h3>
      <ul class="space-y-2.5"><?php foreach ($items as $p): ?>
        <li><a href="/admin/projects/<?= e($p['id']) ?>" class="block rounded-xl border border-line bg-surface p-3.5 shadow-soft transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift">
          <div class="flex items-start justify-between gap-2"><span class="text-[11px] font-bold text-subtle"><?= e($p['code']) ?></span><?= $p['priority'] === 'NORMAL' ? '' : priority_badge($p['priority']) ?></div>
          <div class="mt-1 text-sm font-bold leading-snug"><?= e($p['name']) ?></div><div class="truncate text-xs text-muted"><?= e($p['client']['companyName']) ?></div>
          <div class="mt-2.5 flex flex-wrap items-center gap-1.5"><?= status_badge($p['status']) ?><?= $p['openRevisions'] ? '<span class="rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-bold text-info">' . (int)$p['openRevisions'] . ' rev</span>' : '' ?></div>
          <div class="mt-2.5 flex items-center justify-between text-xs text-muted"><span class="<?= $isLate($p) ? 'font-bold text-danger' : '' ?>"><?= $p['deadline'] ? e(relative_deadline($p['deadline'])) : 'No deadline' ?></span>
            <span class="flex -space-x-1.5"><?php foreach (array_slice($p['editors'], 0, 3) as $ed): ?><?= ui_avatar($ed['name'], null, 20, 'ring-2 ring-surface') ?><?php endforeach; ?></span></div></a></li>
      <?php endforeach; if (!$items): ?><li class="rounded-xl border border-dashed border-line-strong px-3 py-6 text-center text-xs text-subtle">Nothing here</li><?php endif; ?></ul>
    </section>
  <?php endforeach; ?></div>
<?php else: ?>
  <?= ui_table([
      ['key' => 'n', 'header' => 'Project', 'primary' => true, 'render' => fn($p) => '<span><span class="font-bold">' . e($p['name']) . '</span><span class="block text-xs font-normal text-muted">' . e($p['code'] . ' · ' . $p['client']['companyName']) . '</span></span>'],
      ['key' => 's', 'header' => 'Status', 'render' => fn($p) => status_badge($p['status'])],
      ['key' => 'pr', 'header' => 'Priority', 'hideOnMobile' => true, 'render' => fn($p) => $p['priority'] === 'NORMAL' ? '<span class="text-subtle">Normal</span>' : priority_badge($p['priority'])],
      ['key' => 'd', 'header' => 'Deadline', 'render' => fn($p) => $p['deadline'] ? '<span class="' . ($isLate($p) ? 'font-bold text-danger' : '') . '" title="' . e(fmt_date_short($p['deadline'])) . '">' . e(relative_deadline($p['deadline'])) . '</span>' : '—'],
      ['key' => 'e', 'header' => 'Team', 'hideOnMobile' => true, 'render' => fn($p) => $p['editors'] ? e(implode(', ', array_column($p['editors'], 'name'))) : '<span class="text-subtle">Unassigned</span>'],
      ['key' => 'pay', 'header' => 'Payment', 'hideOnMobile' => true, 'render' => fn($p) => payment_badge($p['paymentState'])],
      ['key' => 'r', 'header' => 'Rev.', 'hideOnMobile' => true, 'align' => 'right', 'render' => fn($p) => $p['openRevisions'] ? (string)(int)$p['openRevisions'] : '—'],
  ], $res['items'], fn($p) => $p['id'], fn($p) => '/admin/projects/' . $p['id'],
      ui_empty($hasFilter ? 'No projects match these filters' : 'No projects yet', $hasFilter ? 'Try clearing a filter.' : 'Convert a lead or create a project to get started.', 'film', $canWrite ? ui_link('/admin/projects/new', 'New project') : null)) ?>
  <?= ui_pagination($res['page'], $res['pages'], '/admin/projects', $viewParams, $res['total']) ?>
<?php endif; ?>
<?= card(ob_get_clean(), 'overflow-visible') ?>
