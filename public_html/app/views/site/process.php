<?php defined('FEP') or exit; ?><?= page_hero('Process', $process['heading'], $process['intro'], ui_link('/start-project', 'Discuss your project', ['size' => 'lg', 'iconRight' => 'arrow'])) ?>
<?= sec_open() ?>
  <ol class="max-w-4xl space-y-6 sm:space-y-8">
    <?php foreach ($process['steps'] as $i => $s): ?>
      <li<?= rv(40, 'grid grid-cols-1 gap-4 sm:grid-cols-[64px_minmax(0,1fr)] sm:gap-6') ?>>
        <span class="flex h-14 w-14 items-center justify-center rounded-full bg-accent font-display text-xl font-bold text-accent-fg sm:h-16 sm:w-16 sm:text-2xl"><?= $i + 1 ?></span>
        <div class="rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-8">
          <h2 class="h-card"><?= e($s['title']) ?></h2><p class="mt-1 text-base font-semibold text-accent-text"><?= e($s['summary']) ?></p><p class="mt-4 text-base leading-relaxed text-muted"><?= e($s['detail']) ?></p>
          <div class="mt-6 grid grid-cols-1 gap-5 border-t border-line pt-5 sm:grid-cols-2">
            <div class="flex gap-3"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2"><?= icon('user', 20) ?></span><div><div class="text-sm font-semibold">You</div><p class="mt-0.5 text-base text-muted"><?= e($s['youDo']) ?></p></div></div>
            <div class="flex gap-3"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2"><?= icon('clapperboard', 20) ?></span><div><div class="text-sm font-semibold">Me</div><p class="mt-0.5 text-base text-muted"><?= e($s['weDo']) ?></p></div></div>
          </div>
        </div>
      </li>
    <?php endforeach; ?>
  </ol>
<?= sec_close() ?>
