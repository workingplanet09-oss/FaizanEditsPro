<?php /** Vars: $threads, $current, $items */ ?>
<?= ui_page_header('Messages', 'Client conversations by project. Replies notify the client by email and in their portal.') ?>
<?php if (!$threads): ?>
  <?= card(ui_empty('No conversations yet', 'When clients message you from their portal, threads appear here.', 'message')) ?>
<?php else: ?>
  <div class="grid grid-cols-1 gap-5 lg:grid-cols-[22rem_1fr]">
    <?php ob_start(); ?><ul class="divide-y divide-line" aria-label="Conversations"><?php foreach ($threads as $t): $on = $current && $current['key'] === $t['key']; ?>
      <li><a href="/admin/messages?thread=<?= e(rawurlencode($t['key'])) ?>"<?= $on ? ' aria-current="page"' : '' ?> class="flex items-start gap-3 px-4 py-3.5 transition hover:bg-surface-2/60 <?= $on ? 'bg-surface-2' : '' ?>">
        <span class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2"><?= icon($t['projectId'] ? 'film' : 'help', 16) ?></span>
        <span class="min-w-0 flex-1"><span class="flex items-center justify-between gap-2"><span class="truncate text-sm font-bold"><?= e($t['title']) ?></span><span class="shrink-0 text-[11px] text-subtle"><?= ago($t['lastAt']) ?></span></span>
          <span class="block truncate text-xs text-muted"><?= e($t['client'] . ($t['code'] ? ' · ' . $t['code'] : '')) ?></span><span class="mt-0.5 block truncate text-xs text-subtle"><?= e($t['lastPreview']) ?></span></span>
        <?= $t['unread'] ? '<span class="mt-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-accent-fg">' . (int)$t['unread'] . '</span>' : '' ?></a></li>
    <?php endforeach; ?></ul>
    <?= card(ob_get_clean(), 'max-h-[38rem] overflow-y-auto') ?>
    <?php if ($current): ?><div>
      <h2 class="mb-3 flex flex-wrap items-baseline gap-2 text-base font-extrabold"><?= e($current['title']) ?><span class="text-sm font-medium text-muted"><?= e($current['client']) ?></span><?= $current['projectId'] ? '<a class="text-sm font-semibold text-accent-text hover:underline" href="/admin/projects/' . e($current['projectId']) . '">Open project →</a>' : '' ?></h2>
      <?= message_thread($items, ['projectId' => $current['projectId'], 'clientId' => $current['projectId'] ? null : $current['clientId'], 'staff' => true, 'placeholder' => 'Reply to the client…']) ?>
    </div><?php endif; ?>
  </div>
<?php endif; ?>
