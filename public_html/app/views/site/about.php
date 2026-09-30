<?= page_hero('About ' . $site['business']['name'], $about['headline']) ?>
<?= sec_open() ?>
  <div class="grid grid-cols-1 gap-12 lg:grid-cols-[1.1fr_0.9fr]">
    <div<?= rv(0, 'space-y-5 text-lg leading-relaxed text-muted') ?>><?php foreach (preg_split('/\n{2,}/', $about['story']) as $p): ?><p><?= e($p) ?></p><?php endforeach; ?></div>
    <div<?= rv(100, 'space-y-4') ?>><?php foreach ($about['values'] as $v): ?><div class="rounded-[var(--radius-card)] border border-line bg-surface p-6"><h3 class="font-extrabold"><?= e($v['title']) ?></h3><p class="mt-1.5 text-sm text-muted"><?= e($v['body']) ?></p></div><?php endforeach; ?></div>
  </div>
<?= sec_close() ?>
<?php if (!empty($about['team'])): ?>
<?= sec_open(['tone' => 'alt']) ?>
  <?= section_heading('Team', 'The people behind the edits.') ?>
  <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
    <?php foreach ($about['team'] as $m): ?><div class="rounded-[var(--radius-card)] border border-line bg-surface p-6 text-center"><div class="flex justify-center"><?= ui_avatar($m['name'], $m['imageUrl'] ?: null, 72) ?></div><h3 class="mt-4 font-extrabold"><?= e($m['name']) ?></h3><p class="text-sm text-accent-text"><?= e($m['role']) ?></p><?php if (!empty($m['bio'])): ?><p class="mt-3 text-sm text-muted"><?= e($m['bio']) ?></p><?php endif; ?></div><?php endforeach; ?>
  </div>
<?= sec_close() ?>
<?php endif; ?>
<?= sec_open() ?>
  <div class="flex flex-col items-start justify-between gap-6 rounded-[var(--radius-card)] border border-line bg-surface p-8 sm:flex-row sm:items-center sm:p-10">
    <div><h2 class="text-2xl font-extrabold">Let's make something worth watching.</h2><p class="mt-1 text-muted">Tell us about your project — it takes about three minutes.</p></div>
    <?= ui_link('/start-project', 'Start a project', ['size' => 'lg', 'iconRight' => 'arrow']) ?>
  </div>
<?= sec_close() ?>
