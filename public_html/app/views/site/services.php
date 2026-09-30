<?= page_hero('Services', 'Editing for every kind of content.', 'Each service comes with defined deliverables, a clear turnaround and a brief that adapts to your niche.',
    '<div class="flex flex-wrap gap-3">' . ui_link('/start-project', 'Start a project', ['iconRight' => 'arrow']) . ghost_link('/book', 'Talk to us first') . '</div>') ?>
<?= sec_open() ?>
  <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"><?php foreach ($services as $i => $s): ?><div<?= rv(($i % 3) * 60) ?>><?= service_card($s) ?></div><?php endforeach; ?></div>
  <div class="mt-16 flex flex-col items-start justify-between gap-6 rounded-[var(--radius-card)] border border-line bg-surface p-8 sm:flex-row sm:items-center">
    <div><h2 class="text-xl font-extrabold">Not sure which service fits?</h2><p class="mt-1 text-sm text-muted">Describe what you're making and we'll recommend the right setup — no commitment.</p></div>
    <?= ui_link('/start-project', 'Describe your project', ['iconRight' => 'arrow']) ?>
  </div>
<?= sec_close() ?>
