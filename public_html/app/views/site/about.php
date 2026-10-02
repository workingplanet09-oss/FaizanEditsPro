<?php defined('FEP') or exit; /** Vars: $about, $site */ $b = $site['business']; ?>
<?= page_hero('About ' . $b['name'], $about['headline']) ?>
<?= sec_open() ?>
  <div class="grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
    <div<?= rv() ?>><?= brand_portrait($b) ?></div>
    <div>
      <div<?= rv(0, 'site-copy measure space-y-5 text-muted') ?>><?php foreach (preg_split('/\n{2,}/', $about['story']) as $p): ?><p><?= e($p) ?></p><?php endforeach; ?></div>
      <div<?= rv(100, 'mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2') ?>><?php foreach ($about['values'] as $v): ?><div class="rounded-[var(--radius-card)] border border-line bg-surface p-6"><h3 class="h-card text-xl"><?= e($v['title']) ?></h3><p class="mt-2 text-base text-muted"><?= e($v['body']) ?></p></div><?php endforeach; ?></div>
    </div>
  </div>
<?= sec_close() ?>
<?php if (!empty($about['team'])): ?>
<?= sec_open(['tone' => 'alt']) ?>
  <?= section_heading('Team', 'People who help with your projects.') ?>
  <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
    <?php foreach ($about['team'] as $m): ?><div class="rounded-[var(--radius-card)] border border-line bg-surface p-6 text-center"><div class="flex justify-center"><?= ui_avatar($m['name'], $m['imageUrl'] ?: null, 72) ?></div><h3 class="h-card mt-4 text-xl"><?= e($m['name']) ?></h3><p class="text-base text-accent-text"><?= e($m['role']) ?></p><?php if (!empty($m['bio'])): ?><p class="mt-3 text-base text-muted"><?= e($m['bio']) ?></p><?php endif; ?></div><?php endforeach; ?>
  </div>
<?= sec_close() ?>
<?php endif; ?>
<?= cta_band("Let's make something worth watching.", 'Tell me about your project. It takes about three minutes.', ui_link('/start-project', 'Discuss your project', ['size' => 'lg', 'iconRight' => 'arrow']) . ghost_link('/work', 'View my work', ['size' => 'lg'])) ?>
