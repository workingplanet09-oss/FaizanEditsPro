<?php defined('FEP') or exit; ?><?= page_hero('Services', 'Short-form, long-form and podcast editing, and motion graphics.', 'Each service has clear deliverables, a confirmed turnaround and a brief that adapts to your type of content.',
    '<div class="flex flex-wrap gap-3">' . ui_link('/start-project', 'Discuss your project', ['size' => 'lg', 'iconRight' => 'arrow']) . ui_link('/work', 'View my work', ['size' => 'lg', 'variant' => 'outline']) . '</div>') ?>
<?= sec_open() ?>
  <div class="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-3"><?php foreach ($services as $i => $s): ?><div<?= rv(($i % 3) * 60) ?>><?= service_card($s) ?></div><?php endforeach; ?></div>
  <div class="mt-16 flex flex-col items-start justify-between gap-6 rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:flex-row sm:items-center sm:p-8">
    <div><h2 class="h-card">Not sure which service fits?</h2><p class="mt-2 max-w-xl text-base text-muted">Describe what you are making and I will recommend the right setup. No commitment.</p></div>
    <?= ui_link('/start-project', 'Discuss your project', ['iconRight' => 'arrow']) ?>
  </div>
<?= sec_close() ?>
