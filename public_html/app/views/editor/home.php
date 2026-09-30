<?php /** Vars: $h, $timer, $hello, $first, $actor */
$now = now_ms();
$overdue = count(array_filter($h['tasksToday'], fn($t) => $t['dueDate'] && ts_ms($t['dueDate']) < $now));
$more = fn($href, $label) => text_link($href, $label);
?>
<?= ui_page_header("{$hello}, {$first}", "What's on your plate today.") ?>
<div class="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
  <?= ui_stat('Active projects', (string)count($h['projects']), null, null, 'film', '/editor/projects') ?>
  <?= ui_stat('Tasks due today', (string)count($h['tasksToday']), $overdue ? e("{$overdue} overdue") : null, $overdue ? 'danger' : null, 'checklist', '/editor/tasks') ?>
  <?= ui_stat('Open revisions', (string)count($h['revisions']), null, $h['revisions'] ? 'warning' : null, 'refresh', '/editor/revisions') ?>
  <?= ui_stat('Deadlines in 10 days', (string)count($h['deadlines']), null, null, 'clock', '/editor/projects?sort=deadline') ?>
</div>
<?= $actor->can('time:track') ? '<div class="mb-6 max-w-xl">' . timer_widget($timer, '/editor') . '</div>' : '' ?>
<div class="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
  <div class="space-y-6">
    <?php ob_start(); if ($h['tasksToday']): ?><ul class="divide-y divide-line"><?php foreach ($h['tasksToday'] as $t): $late = $t['dueDate'] && ts_ms($t['dueDate']) < $now; $pr = meta_for('PRIORITY', $t['priority']); ?>
      <li class="flex items-center gap-3 px-5 py-3"><span class="h-2 w-2 shrink-0 rounded-full <?= $t['status'] === 'IN_PROGRESS' ? 'bg-info' : ($t['status'] === 'BLOCKED' ? 'bg-danger' : 'bg-line-strong') ?>" aria-hidden="true"></span>
        <div class="min-w-0 flex-1"><div class="truncate text-sm font-semibold"><?= e($t['title']) ?></div><?= $t['project'] ? '<a href="/editor/projects/' . e($t['project']['id']) . '?tab=tasks" class="text-xs text-muted hover:underline">' . e($t['project']['code'] . ' · ' . $t['project']['name']) . '</a>' : '' ?></div>
        <?= $t['priority'] !== 'NORMAL' ? '<span class="text-xs font-bold ' . ($pr['tone'] === 'danger' ? 'text-danger' : '') . '">' . e($pr['label']) . '</span>' : '' ?>
        <?= $t['dueDate'] ? '<span class="text-xs ' . ($late ? 'font-bold text-danger' : 'text-subtle') . '">' . e(relative_deadline($t['dueDate'])) . '</span>' : '' ?></li>
    <?php endforeach; ?></ul><?php else: ?><?= ui_empty("You're all caught up", 'No tasks due today.', 'check-circle') ?><?php endif; ?>
    <?= card(ob_get_clean(), '', "Today's tasks", 'Due today, overdue or in progress.', $more('/editor/tasks', 'All tasks')) ?>

    <?php ob_start(); if ($h['projects']): ?><ul class="divide-y divide-line"><?php foreach ($h['projects'] as $p): ?>
      <li><a href="/editor/projects/<?= e($p['id']) ?>" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 transition hover:bg-surface-2/60"><div class="min-w-0 flex-1 basis-48"><div class="truncate text-sm font-bold"><?= e($p['name']) ?></div><div class="truncate text-xs text-muted"><?= e($p['code'] . ' · ' . $p['client']['companyName']) ?></div></div>
        <?= status_badge($p['status']) ?><?= $p['priority'] !== 'NORMAL' ? priority_badge($p['priority']) : '' ?><span class="w-24 text-right text-xs <?= $p['deadline'] && ts_ms($p['deadline']) < $now ? 'font-bold text-danger' : 'text-subtle' ?>"><?= $p['deadline'] ? e(relative_deadline($p['deadline'])) : 'No deadline' ?></span></a></li>
    <?php endforeach; ?></ul><?php else: ?><?= ui_empty('No active projects', 'When a project is assigned to you it will show up here.', 'film') ?><?php endif; ?>
    <?= card(ob_get_clean(), '', 'My projects', 'Everything currently assigned to you.', $more('/editor/projects', 'View all')) ?>
  </div>
  <div class="space-y-6">
    <?php ob_start(); if ($h['revisions']): ?><ul class="divide-y divide-line"><?php foreach ($h['revisions'] as $r): ?>
      <li><a href="/editor/projects/<?= e($r['project']['id']) ?>?tab=revisions" class="block px-5 py-3 transition hover:bg-surface-2/60"><div class="flex items-center justify-between gap-2"><span class="truncate text-sm font-semibold">Round <?= (int)$r['roundNumber'] ?> · <?= e($r['version']['label'] ?? 'latest version') ?></span><span class="shrink-0 text-xs text-subtle"><?= ago($r['createdAt']) ?></span></div>
        <div class="text-xs text-muted"><?= e($r['project']['code'] . ' · ' . $r['project']['name']) . ($r['_count']['comments'] ? e(' · ' . $r['_count']['comments'] . ' comment' . ($r['_count']['comments'] === 1 ? '' : 's')) : '') ?></div></a></li>
    <?php endforeach; ?></ul><?php else: ?><p class="px-5 pb-5 text-sm text-muted">No open revision requests.</p><?php endif; ?>
    <?= card(ob_get_clean(), '', 'Revision requests', 'Feedback waiting for a new version.', $more('/editor/revisions', 'Board')) ?>

    <?php ob_start(); if ($h['deadlines']): ?><ul class="divide-y divide-line"><?php foreach ($h['deadlines'] as $d): ?>
      <li><a href="/editor/projects/<?= e($d['id']) ?>" class="flex items-center justify-between gap-3 px-5 py-3 text-sm transition hover:bg-surface-2/60"><span class="min-w-0 truncate font-semibold"><?= e($d['name']) ?></span><span class="shrink-0 text-xs font-semibold text-warning"><?= $d['deadline'] ? e(relative_deadline($d['deadline'])) : '' ?></span></a></li>
    <?php endforeach; ?></ul><?php else: ?><p class="px-5 pb-5 text-sm text-muted">Nothing due in the next 10 days.</p><?php endif; ?>
    <?= card(ob_get_clean(), '', 'Upcoming deadlines', 'Next 10 days.') ?>

    <?php ob_start(); if ($h['newFiles']): ?><ul class="divide-y divide-line"><?php foreach ($h['newFiles'] as $f): ?>
      <li><a href="<?= e($f['project'] ? '/editor/projects/' . $f['project']['id'] . '?tab=files' : '/editor/files') ?>" class="block px-5 py-3 transition hover:bg-surface-2/60"><div class="truncate text-sm font-semibold"><?= e($f['displayName']) ?></div><div class="text-xs text-muted"><?= e($f['project']['name'] ?? 'Unassigned') ?> · <?= ago($f['createdAt']) ?></div></a></li>
    <?php endforeach; ?></ul><?php else: ?><p class="px-5 pb-5 text-sm text-muted">No new uploads from clients.</p><?php endif; ?>
    <?= card(ob_get_clean(), '', 'New client files', 'Uploaded in the last 3 days.') ?>

    <?php if ($h['awaitingReview']): ob_start(); ?><ul class="divide-y divide-line"><?php foreach ($h['awaitingReview'] as $p): ?>
      <li><a href="/editor/projects/<?= e($p['id']) ?>" class="flex items-center justify-between gap-3 px-5 py-3 text-sm transition hover:bg-surface-2/60"><span class="min-w-0 truncate font-semibold"><?= e($p['name']) ?></span><?= status_badge($p['status']) ?></a></li><?php endforeach; ?></ul>
      <?= card(ob_get_clean(), '', 'Waiting on review', 'Out of your hands for now.') ?><?php endif; ?>
  </div>
</div>
