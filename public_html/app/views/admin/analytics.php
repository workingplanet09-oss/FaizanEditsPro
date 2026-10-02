<?php defined('FEP') or exit; /** Vars: $key, $r, $workload, $profit */
$cur = $r['defaultCurrency'];
$m = fn($n) => money((int)$n, $cur, true);
$ranges = [];
foreach (array_reverse(ANALYTICS_RANGES, true) as $k => $v) { $ranges[] = [$k, 'Last ' . $v[0]]; }
$ser = fn(array $x, string $v = 'value') => array_map(fn($d) => ['label' => $d['month'], 'value' => $d[$v]], $x);
?>
<?= ui_page_header('Analytics', "Real numbers from your database — nothing is estimated or invented. Empty charts mean there's no data yet.", ui_link('/admin/exports', 'Exports', ['icon' => 'download', 'variant' => 'outline'])) ?>
<?= ui_tabs($ranges, $key, '/admin/analytics', 'range') ?>
<?php if (!$r['hasData']): ?>
  <?= card(ui_empty('No data available yet', 'As leads arrive, projects are delivered and invoices are paid, your charts fill in automatically.', 'chart')) ?>
<?php else: $lc = $r['leadConversion']; ?>
  <div class="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <?= ui_stat('Revenue collected', money_map($r['revenueTotals'], true), null, 'success', 'trending') ?>
    <?= ui_stat('Outstanding invoices', e(money((int)$r['outstanding'], $cur, true)), null, $r['outstanding'] ? 'warning' : null, 'wallet') ?>
    <?= ui_stat('Average payment', money_map($r['averageOrderValue'], true), null, null, 'receipt') ?>
    <?= ui_stat('Lead → client rate', $lc['rate'] === null ? '—' : e($lc['rate'] . '%'), e("{$lc['converted']} of {$lc['total']} leads"), null, 'target') ?>
    <?= ui_stat('Projects completed', (string)(int)$r['projectsCompleted'], e($r['projectsCreated'] . ' created'), null, 'film') ?>
    <?= ui_stat('Avg. turnaround', $r['averageTurnaroundDays'] === null ? '—' : e($r['averageTurnaroundDays'] . ' days'), 'start → delivery', null, 'timer') ?>
    <?= ui_stat('Active / repeat clients', e("{$r['activeClients']} / {$r['repeatClients']}"), e($r['retainerClients'] . ' on retainer'), null, 'users') ?>
    <?= ui_stat('Revision requests', (string)(int)$r['revisionCount'], $r['overdueProjects'] ? e($r['overdueProjects'] . ' projects overdue') : 'none overdue', $r['overdueProjects'] ? 'danger' : null, 'refresh') ?>
  </div>
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <?= chart_card('Revenue by month', bar_chart($ser($r['revenueByMonth']), 'Revenue by month', $m), "Payments received in {$cur}") ?>
    <?= chart_card('New leads by month', line_chart($ser($r['leadsByMonth']), 'New leads by month')) ?>
    <?= chart_card('Client growth', line_chart($ser($r['clientGrowth']), 'New clients by month', null, 180, 'var(--info)'), 'New clients per month') ?>
    <?= chart_card('Revenue by service', hbar_chart($r['revenueByService'], 'Revenue by service', $m), "In {$cur}") ?>
    <?= chart_card('Where leads come from', hbar_chart($r['leadSources'], 'Lead sources')) ?>
    <?= chart_card('Project types', donut_chart($r['projectTypes'], 'Projects by type', '<span class="text-2xl font-bold">' . (int)$r['projectsCreated'] . '</span><span class="text-xs text-subtle">projects</span>')) ?>
    <?= chart_card('Projects by status', donut_chart(array_map(fn($s) => ['label' => $s['label'], 'value' => $s['value']], $r['statusDistribution']), 'Projects by status'), null, null, 'lg:col-span-2') ?>
  </div>
<?php endif; ?>

<?= card(ui_table([
    ['key' => 'n', 'header' => 'Person', 'primary' => true, 'render' => fn($w) => '<span class="font-bold">' . e($w['name']) . '<span class="block text-xs font-normal text-muted">' . e($w['role']) . '</span></span>'],
    ['key' => 'p', 'header' => 'Open projects', 'align' => 'right', 'render' => fn($w) => (string)(int)$w['projects']],
    ['key' => 't', 'header' => 'Open tasks', 'align' => 'right', 'render' => fn($w) => (string)(int)$w['openTasks']],
    ['key' => 'h', 'header' => 'Hours (30d)', 'align' => 'right', 'render' => fn($w) => e((string)$w['hours30d'])],
], $workload, fn($w) => $w['id'], null, '<p class="px-6 pb-6 text-sm text-muted">No editors or project managers yet.</p>'), 'mt-6', 'Team workload', 'Open projects, tasks and tracked hours (last 30 days).') ?>
<?php if ($profit !== null): ?>
  <?= card(ui_table([
      ['key' => 'n', 'header' => 'Project', 'primary' => true, 'render' => fn($p) => '<span class="font-bold">' . e($p['name']) . '<span class="block text-xs font-normal text-muted">' . e($p['code'] . ' · ' . $p['client']) . '</span></span>'],
      ['key' => 'r', 'header' => 'Revenue', 'align' => 'right', 'render' => fn($p) => e(money((int)$p['revenue'], $p['currency']))],
      ['key' => 'c', 'header' => 'Cost', 'align' => 'right', 'render' => fn($p) => e(money((int)$p['cost'], $p['currency']))],
      ['key' => 'h', 'header' => 'Hours', 'hideOnMobile' => true, 'align' => 'right', 'render' => fn($p) => e((string)$p['hours'])],
      ['key' => 'm', 'header' => 'Margin', 'align' => 'right', 'render' => fn($p) => '<span class="' . ($p['margin'] < 0 ? 'font-bold text-danger' : 'font-semibold') . '">' . e(money((int)$p['margin'], $p['currency']) . ($p['marginPct'] !== null ? " ({$p['marginPct']}%)" : '')) . '</span>'],
  ], $profit, fn($p) => $p['id'], null, '<p class="px-6 pb-6 text-sm text-muted">No projects with revenue yet.</p>'), 'mt-6', 'Project profitability', 'Revenue collected minus internal cost and tracked labour. Visible to admins only.') ?>
<?php endif; ?>
