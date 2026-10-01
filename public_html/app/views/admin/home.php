<?php defined('FEP') or exit; /** Vars: $h (admin_home), $report, $hello, $first, $actor */
$perms = $h['perms']; $m = $h['metrics'];
$total = array_sum(array_column($h['pipeline'], 'count'));
$revenue = $report ? array_map(fn($r) => ['label' => $r['month'], 'value' => $r['value']], array_slice($report['revenueByMonth'], -6)) : [];
$actions = ($actor->can('projects:write') ? ui_link('/admin/projects/new', 'New project', ['icon' => 'plus', 'variant' => 'dark']) : '')
    . ($actor->can('quotes:write') ? ui_link('/admin/quotes/new', 'New quote', ['icon' => 'clipboard', 'variant' => 'outline']) : '')
    . ($actor->can('invoices:write') ? ui_link('/admin/invoices/new', 'New invoice', ['icon' => 'receipt', 'variant' => 'outline']) : '');
$more = fn(string $href, string $label) => text_link($href, $label);
?>
<?= ui_page_header("{$hello}, {$first}", 'Everything that needs you today, in one place.', $actions) ?>

<?php if ($h['alerts']): ?>
  <ul class="mb-6 flex flex-wrap gap-2" aria-label="Alerts"><?php foreach ($h['alerts'] as $al): ?>
    <li><a href="<?= e($al['href']) ?>" class="inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition hover:-translate-y-px hover:shadow-soft <?= $al['tone'] === 'danger' ? 'border-danger/30 bg-danger-soft text-danger' : ($al['tone'] === 'warning' ? 'border-warning/30 bg-warning-soft text-warning' : 'border-info/30 bg-info-soft text-info') ?>"><?= icon($al['tone'] === 'info' ? 'info' : 'alert', 15) ?><?= e($al['text']) ?><?= icon('chevron-right', 13) ?></a></li>
  <?php endforeach; ?></ul>
<?php else: ?>
  <p class="mb-6 flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft/50 px-4 py-3 text-sm font-semibold text-success"><?= icon('check-circle', 16) ?> Nothing urgent right now.</p>
<?php endif; ?>

<div class="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
  <?= $perms['leads'] ? ui_stat('New leads (14 days)', (string)(int)$m['newLeads'], null, null, 'inbox', '/admin/leads?section=leads') : '' ?>
  <?= ui_stat('Active clients', (string)(int)$m['activeClients'], null, null, 'building', '/admin/clients') ?>
  <?= $perms['projects'] ? ui_stat('Active projects', (string)(int)$m['activeProjects'], null, null, 'film', '/admin/projects') : '' ?>
  <?= $perms['projects'] ? ui_stat('Due within 3 days', (string)(int)$m['dueSoon'], null, $m['dueSoon'] ? 'warning' : null, 'clock', '/admin/projects?deadline=week') : '' ?>
  <?= $perms['projects'] ? ui_stat('Waiting on client review', (string)(int)$m['pendingReviews'], null, null, 'eye', '/admin/projects?status=CLIENT_REVIEW,FINAL_REVIEW') : '' ?>
  <?= $perms['invoices'] ? ui_stat('Pending payments', money_map($m['pendingPayments'], true), null, (array)$m['pendingPayments'] ? 'warning' : null, 'wallet', '/admin/invoices') : '' ?>
  <?= $perms['invoices'] ? ui_stat('Revenue this month', money_map($m['monthlyRevenue'], true), null, 'success', 'trending', '/admin/payments') : '' ?>
  <?= $perms['invoices'] ? ui_stat('Retainer revenue / mo', money_map($m['retainerRevenue'], true), null, null, 'repeat', '/admin/retainers') : '' ?>
</div>

<div class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
  <div class="space-y-6">
    <?php if ($perms['projects']): ?>
      <?php ob_start(); ?><div class="grid grid-cols-2 gap-3 px-5 pb-5 sm:grid-cols-3 lg:grid-cols-6"><?php foreach ($h['pipeline'] as $st): ?>
        <a href="/admin/projects?stage=<?= e($st['key']) ?>" class="group rounded-xl border border-line p-3.5 transition hover:border-line-strong hover:bg-surface-2/50"><div class="text-2xl font-extrabold tabular-nums"><?= (int)$st['count'] ?></div>
          <div class="mt-0.5 text-xs font-semibold text-muted group-hover:text-fg"><?= e($st['label']) ?></div><div class="mt-2 h-1 overflow-hidden rounded-full bg-surface-2"><div class="h-full rounded-full bg-accent" style="width:<?= $total ? round($st['count'] / $total * 100, 1) : 0 ?>%"></div></div></a>
      <?php endforeach; ?></div>
      <?= card(ob_get_clean(), '', 'Project pipeline', $total . ' project' . ($total === 1 ? '' : 's') . ' across all stages', $more('/admin/projects?view=board', 'Open board')) ?>
    <?php endif; ?>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <?php if ($perms['projects']): ?>
        <?php ob_start(); ?>
        <?php if ($h['deadlines']): ?><ul class="divide-y divide-line"><?php foreach ($h['deadlines'] as $d): $late = days_until($d['deadline']) !== null && days_until($d['deadline']) < 0; ?>
          <li><a href="/admin/projects/<?= e($d['id']) ?>" class="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2/60"><div class="min-w-0 flex-1"><div class="truncate text-sm font-bold"><?= e($d['name']) ?></div><div class="truncate text-xs text-muted"><?= e($d['client']['companyName'] . ' · ' . $d['code']) ?></div></div>
            <div class="text-right"><div class="text-xs font-bold <?= $late ? 'text-danger' : '' ?>"><?= e($d['label']) ?></div><div class="text-[11px] text-subtle"><?= e(fmt_date_short($d['deadline'])) ?></div></div></a></li>
        <?php endforeach; ?></ul><?php else: ?><?= ui_empty('No deadlines', 'Open projects with deadlines will show up here.', 'calendar') ?><?php endif; ?>
        <?= card(ob_get_clean(), '', 'Upcoming deadlines', null, $more('/admin/calendar', 'Calendar')) ?>
      <?php endif; ?>
      <?php if ($perms['invoices']): ?>
        <?php ob_start(); ?>
        <?php if ($h['unpaid']): ?><ul class="divide-y divide-line"><?php foreach ($h['unpaid'] as $i): ?>
          <li><a href="/admin/invoices/<?= e($i['id']) ?>" class="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2/60"><div class="min-w-0 flex-1"><div class="truncate text-sm font-bold"><?= e($i['number'] . ' · ' . $i['client']['companyName']) ?></div><div class="text-xs text-muted"><?= $i['dueDate'] ? 'Due ' . e(fmt_date_short($i['dueDate'])) : 'No due date' ?></div></div>
            <div class="text-right"><div class="text-sm font-bold tabular-nums"><?= e(money($i['total'] - $i['amountPaid'], $i['currency'])) ?></div><?= meta_badge('INVOICE_STATUS', $i['status']) ?></div></a></li>
        <?php endforeach; ?></ul><?php else: ?><?= ui_empty('Nothing outstanding', 'Every invoice sent so far has been paid.', 'receipt') ?><?php endif; ?>
        <?= card(ob_get_clean(), '', 'Outstanding invoices', null, $more('/admin/invoices', 'All invoices')) ?>
      <?php endif; ?>
    </div>

    <?php if ($report): ?>
      <?= chart_card('Revenue — last 6 months', bar_chart($revenue, 'Revenue by month', fn($n) => money((int)$n, $report['defaultCurrency'], true), 180), 'Received payments in ' . $report['defaultCurrency']) ?>
    <?php endif; ?>
  </div>

  <aside class="space-y-6">
    <?php if ($actor->can('messages:read')): ?>
      <?php ob_start(); ?>
      <?php if ($h['unreadMessages']): ?><ul class="divide-y divide-line"><?php foreach ($h['unreadMessages'] as $msg): ?>
        <li><a href="<?= e($msg['projectId'] ? '/admin/messages?thread=' . $msg['projectId'] : '/admin/messages') ?>" class="block px-5 py-3 transition hover:bg-surface-2/60"><div class="flex justify-between gap-2 text-xs"><b><?= e($msg['from']) ?><?= $msg['projectName'] ? '<span class="font-normal text-subtle"> · ' . e($msg['projectName']) . '</span>' : '' ?></b><span class="shrink-0 text-subtle"><?= ago($msg['at']) ?></span></div><p class="mt-0.5 line-clamp-2 text-sm text-muted"><?= e($msg['body']) ?></p></a></li>
      <?php endforeach; ?></ul><?php else: ?><p class="px-5 pb-5 text-sm text-muted">Inbox zero. Nice.</p><?php endif; ?>
      <?= card(ob_get_clean(), '', 'Unread messages', null, $more('/admin/messages', 'Inbox')) ?>
    <?php endif; ?>
    <?= card(activity_feed($h['recent'], false, 'Activity appears here as work happens.'), '', 'Recent activity') ?>
  </aside>
</div>
