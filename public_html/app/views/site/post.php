<?php defined('FEP') or exit; ?><article>
  <header class="border-b border-line bg-bg"><div class="container-page max-w-3xl py-14 sm:py-20">
    <a href="/blog" class="inline-flex min-h-11 items-center gap-1.5 text-base font-semibold text-accent-text hover:underline"><?= icon('chevron-left', 15) ?> All articles</a>
    <div class="eyebrow mt-4"><?= e($p['category']['name'] ?? 'Article') ?></div><h1 class="display-sm mt-3"><?= e($p['title']) ?></h1>
    <p class="mt-5 text-base text-muted"><?= e(fmt_date($p['publishedAt'])) ?><?= $p['authorName'] ? ' · ' . e($p['authorName']) : '' ?></p>
  </div></header>
  <?= sec_open() ?>
    <div class="mx-auto max-w-3xl">
      <?php if ($p['featuredImage']): ?><img src="<?= e($p['featuredImage']) ?>" alt="" class="mb-10 w-full rounded-[var(--radius-card)] border border-line"><?php endif; ?>
      <div class="prose-lite site-copy measure text-fg"><?= render_markdown($p['content']) ?></div>
      <?php if ($p['tags']): ?><ul class="mt-10 flex flex-wrap gap-2"><?php foreach ((array)$p['tags'] as $t): ?><li class="rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold text-fg">#<?= e($t) ?></li><?php endforeach; ?></ul><?php endif; ?>
      <div class="mt-14 rounded-[var(--radius-card)] border border-line bg-surface p-6 text-center sm:p-8"><h2 class="h-card">Want your videos edited this carefully?</h2><?= ui_link('/start-project', 'Discuss your project', ['class' => 'mt-5', 'iconRight' => 'arrow']) ?></div>
    </div>
  <?= sec_close() ?>
</article>
