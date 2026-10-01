<?php defined('FEP') or exit; ?><?= page_hero('Process', $process['heading'], $process['intro'], ui_link('/start-project', 'Start step one', ['size' => 'lg', 'iconRight' => 'arrow'])) ?>
<?= sec_open() ?>
  <ol class="relative mx-auto max-w-4xl space-y-6 before:absolute before:bottom-6 before:left-[27px] before:top-6 before:w-px before:bg-line max-sm:before:hidden">
    <?php foreach ($process['steps'] as $i => $s): ?>
      <li<?= rv(40, 'relative grid grid-cols-1 gap-5 sm:grid-cols-[56px_minmax(0,1fr)]') ?>>
        <span class="relative z-10 flex h-14 w-14 items-center justify-center rounded-full border border-line-strong bg-bg font-display text-xl font-extrabold"><?= $i + 1 ?></span>
        <div class="rounded-[var(--radius-card)] border border-line bg-surface p-7 shadow-soft">
          <h2 class="text-xl font-extrabold tracking-tight sm:text-2xl"><?= e($s['title']) ?></h2><p class="mt-1 text-sm font-semibold text-accent-text"><?= e($s['summary']) ?></p><p class="mt-4 leading-relaxed text-muted"><?= e($s['detail']) ?></p>
          <div class="mt-6 grid grid-cols-1 gap-4 border-t border-line pt-5 sm:grid-cols-2">
            <div class="flex gap-3"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2"><?= icon('user', 15) ?></span><div><div class="text-xs font-bold uppercase tracking-wide text-subtle">You</div><p class="mt-0.5 text-sm"><?= e($s['youDo']) ?></p></div></div>
            <div class="flex gap-3"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft"><?= icon('clapperboard', 15) ?></span><div><div class="text-xs font-bold uppercase tracking-wide text-subtle">The studio</div><p class="mt-0.5 text-sm"><?= e($s['weDo']) ?></p></div></div>
          </div>
        </div>
      </li>
    <?php endforeach; ?>
  </ol>
<?= sec_close() ?>
