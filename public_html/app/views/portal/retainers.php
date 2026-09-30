<?php /** Vars: $list, $canManage */ ?>
<?= ui_page_header('Retainers', 'A monthly allowance of edits with a dedicated turnaround. See what you\'ve used and start new work in one click.') ?>
<?php if (!$list): ?>
  <?= card(ui_empty('No retainer yet', 'Retainers suit teams with regular content: a fixed number of videos or shorts every month at a lower per-video cost.', 'repeat', ui_link('/pricing', 'See retainer plans', ['variant' => 'outline']))) ?>
<?php else: ?>
  <div class="space-y-6">
  <?php foreach ($list as $r): ?>
    <?php ob_start(); ?>
      <div class="grid grid-cols-1 gap-6 px-5 pb-6 md:grid-cols-2">
        <div class="space-y-4"><h3 class="text-xs font-bold uppercase tracking-wider text-subtle">This month</h3>
          <?= $r['videosIncluded'] ? progress_row('Videos', $r['usage']['used']['videos'], $r['videosIncluded']) : '' ?>
          <?= $r['shortsIncluded'] ? progress_row('Short-form', $r['usage']['used']['shorts'], $r['shortsIncluded']) : '' ?>
          <?= $r['hoursIncluded'] ? progress_row('Hours', $r['usage']['used']['hours'], $r['hoursIncluded']) : '' ?></div>
        <div><h3 class="mb-3 text-xs font-bold uppercase tracking-wider text-subtle">In progress</h3>
          <?php if ($r['usage']['upcoming']): ?><ul class="divide-y divide-line rounded-xl border border-line"><?php foreach ($r['usage']['upcoming'] as $p): ?>
            <li><a href="/dashboard/projects/<?= e($p['id']) ?>" class="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-surface-2/60"><span class="min-w-0"><span class="block truncate font-semibold"><?= e($p['name']) ?></span><span class="text-xs text-subtle"><?= e($p['deadline'] ? 'Due ' . fmt_date_short($p['deadline']) : $p['code']) ?></span></span><?= status_badge($p['status'], 'STATUS', true) ?></a></li>
          <?php endforeach; ?></ul>
          <?php else: ?><p class="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">Nothing in progress. Start a project to use your allowance.</p><?php endif; ?></div>
      </div>
    <?= card(ob_get_clean(), '', $r['name'], money((int)$r['monthlyPrice'], $r['currency']) . ' / month · renews ' . fmt_date($r['renewalDate']) . " · {$r['turnaroundDays']}-day turnaround · {$r['revisionsIncluded']} revisions per video", ($r['status'] === 'ACTIVE' && $canManage) ? retainer_start($r['id']) : meta_badge('RETAINER_STATUS', $r['status'])) ?>
  <?php endforeach; ?>
  </div>
<?php endif; ?>
