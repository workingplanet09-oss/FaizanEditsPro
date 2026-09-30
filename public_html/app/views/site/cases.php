<?= page_hero('Case studies', 'The problem, the edit, the result.', 'Each story shows the brief, our approach and the outcomes the client actually saw.') ?>
<?= sec_open() ?>
<?php if ($cases): ?>
  <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
    <?php foreach ($cases as $i => $c): ?>
      <div<?= rv(($i % 2) * 80) ?>><a href="/case-studies/<?= e($c['slug']) ?>" class="group block overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface transition duration-300 hover:-translate-y-1 hover:shadow-lift">
        <div class="relative aspect-[16/8] overflow-hidden bg-surface-2">
          <?php if ($c['heroImage']): ?><img src="<?= e($c['heroImage']) ?>" alt="" loading="lazy" class="h-full w-full object-cover transition duration-500 group-hover:scale-105">
          <?php else: ?><div class="flex h-full items-center justify-center bg-[radial-gradient(80%_100%_at_30%_0%,color-mix(in_srgb,var(--accent)_30%,var(--surface-2)),var(--surface-2))]"><?= icon('book', 40, 'text-subtle') ?></div><?php endif; ?>
          <?php if (!empty($c['isDemo'])): ?><span class="absolute right-3 top-3 rounded-full bg-warning px-2 py-0.5 text-[10px] font-extrabold uppercase text-warning-fg">Demo</span><?php endif; ?>
        </div>
        <div class="p-6"><div class="eyebrow"><?= e(implode(' · ', array_filter([$c['clientName'], $c['industry']]))) ?></div><h2 class="mt-2 text-xl font-extrabold leading-snug"><?= e($c['title']) ?></h2>
          <p class="mt-2 text-sm text-muted"><?= e(excerpt_text($c['summary'] ?: $c['problem'], 160)) ?></p>
          <span class="mt-4 inline-flex items-center gap-1.5 text-sm font-bold group-hover:text-accent-text">Read the case study <?= icon('arrow', 14) ?></span></div>
      </a></div>
    <?php endforeach; ?>
  </div>
<?php else: ?><?= ui_empty('Case studies are on the way', 'We only publish stories with results the client has verified. Ask us for relevant examples on a call.', 'book', ui_link('/book', 'Book a call')) ?><?php endif; ?>
<?= sec_close() ?>
