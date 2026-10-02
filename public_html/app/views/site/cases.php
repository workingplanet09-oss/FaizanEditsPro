<?php defined('FEP') or exit; ?><?= page_hero('Case studies', 'The goal, the edit, the result.', 'Each story shows the client goal, my process, the deliverables and the results the client verified.') ?>
<?= sec_open() ?>
<?php if ($cases): ?>
  <div class="grid grid-cols-1 gap-8 md:grid-cols-2">
    <?php foreach ($cases as $i => $c): ?>
      <div<?= rv(($i % 2) * 80) ?>><a href="/case-studies/<?= e($c['slug']) ?>" class="group block overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface transition-colors duration-150 hover:border-accent">
        <div class="relative aspect-[16/8] overflow-hidden bg-surface-2">
          <?php if ($c['heroImage']): ?><img src="<?= e($c['heroImage']) ?>" alt="<?= e($c['title']) ?>" loading="lazy" class="h-full w-full object-cover">
          <?php else: ?><div class="flex h-full items-center justify-center"><?= icon('book', 40, 'text-subtle') ?></div><?php endif; ?>
          <?php if (!empty($c['isDemo'])): ?><span class="absolute left-3 top-3 rounded-full bg-warning px-2.5 py-1 text-xs font-bold text-warning-fg">Sample</span><?php endif; ?>
        </div>
        <div class="p-6 sm:p-8"><div class="eyebrow"><?= e(implode(' · ', array_filter([$c['clientName'], $c['industry']]))) ?></div><h2 class="h-card mt-3"><?= e($c['title']) ?></h2>
          <p class="mt-3 text-base text-muted"><?= e(excerpt_text($c['summary'] ?: $c['problem'], 160)) ?></p>
          <span class="mt-5 inline-flex min-h-11 items-center gap-1.5 text-base font-semibold text-accent-text group-hover:underline">Read the case study <?= icon('arrow', 16) ?></span></div>
      </a></div>
    <?php endforeach; ?>
  </div>
<?php else: ?><?= ui_empty('Case studies are on the way', 'I only publish stories with results the client has verified. Ask me for relevant examples on a call.', 'book', ui_link('/book', 'Book a call')) ?><?php endif; ?>
<?= sec_close() ?>
