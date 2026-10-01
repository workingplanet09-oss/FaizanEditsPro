<?php defined('FEP') or exit; /** Vars: $active, $threads, $projects, $items */
$byKey = [];
foreach ($threads as $t) {
    $byKey[$t['projectId'] ?? 'general'] = $t;
}
$rows = [['id' => 'general', 'title' => 'General & support', 'sub' => $byKey['general']['lastPreview'] ?? 'Ask anything about billing, scope or your account', 'unread' => $byKey['general']['unread'] ?? 0, 'at' => $byKey['general']['lastAt'] ?? null]];
foreach ($projects as $p) {
    $rows[] = ['id' => $p['id'], 'title' => $p['name'], 'sub' => $byKey[$p['id']]['lastPreview'] ?? $p['code'], 'unread' => $byKey[$p['id']]['unread'] ?? 0, 'at' => $byKey[$p['id']]['lastAt'] ?? null];
}
$current = array_values(array_filter($rows, fn($r) => $r['id'] === $active))[0] ?? $rows[0];
?>
<?= ui_page_header('Messages', 'One conversation per project, plus a general thread. Replies also reach you by email.') ?>
<div class="grid grid-cols-1 gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
  <?php ob_start(); ?>
  <ul class="divide-y divide-line" aria-label="Conversations">
    <?php foreach ($rows as $r): ?>
      <li><a href="/dashboard/messages?thread=<?= e($r['id']) ?>"<?= $current['id'] === $r['id'] ? ' aria-current="page"' : '' ?> class="flex items-start gap-3 px-4 py-3.5 transition hover:bg-surface-2/60 <?= $current['id'] === $r['id'] ? 'bg-surface-2' : '' ?>">
        <span class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2"><?= icon($r['id'] === 'general' ? 'help' : 'film', 16) ?></span>
        <span class="min-w-0 flex-1"><span class="flex items-center justify-between gap-2"><span class="truncate text-sm font-bold"><?= e($r['title']) ?></span><?= $r['at'] ? '<span class="shrink-0 text-[11px] text-subtle">' . ago($r['at']) . '</span>' : '' ?></span><span class="mt-0.5 block truncate text-xs text-muted"><?= e($r['sub']) ?></span></span>
        <?= $r['unread'] ? '<span class="mt-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-accent-fg">' . (int)$r['unread'] . '</span>' : '' ?></a></li>
    <?php endforeach; ?>
  </ul>
  <?= card(ob_get_clean(), 'max-h-[36rem] overflow-y-auto') ?>
  <div>
    <h2 class="mb-3 flex items-center gap-2 text-base font-extrabold"><?= e($current['title']) ?></h2>
    <?= message_thread($items, ['projectId' => $current['id'] === 'general' ? null : $current['id'], 'placeholder' => $current['id'] === 'general' ? 'Ask us anything…' : 'Message your project team…']) ?>
  </div>
</div>
<?php if (!$projects && !$threads): ?><div class="mt-5"><?= card(ui_empty('Say hello', 'Your project team will be here once a project starts. Until then, use the general thread for any question.', 'message')) ?></div><?php endif; ?>
