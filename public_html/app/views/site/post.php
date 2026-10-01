<?php defined('FEP') or exit; ?><article>
  <header class="dark-zone grain relative overflow-hidden border-b border-line"><div class="container-page max-w-3xl py-20 sm:py-24">
    <a href="/blog" class="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg"><?= icon('chevron-left', 15) ?> All articles</a>
    <div class="eyebrow mt-6"><?= e($p['category']['name'] ?? 'Article') ?></div><h1 class="display mt-3 text-[clamp(2.1rem,5vw,3.6rem)]"><?= e($p['title']) ?></h1>
    <p class="mt-5 text-sm text-muted"><?= e(fmt_date($p['publishedAt'])) ?><?= $p['authorName'] ? ' · ' . e($p['authorName']) : '' ?></p>
  </div></header>
  <?= sec_open() ?>
    <div class="mx-auto max-w-3xl">
      <?php if ($p['featuredImage']): ?><img src="<?= e($p['featuredImage']) ?>" alt="" class="mb-10 w-full rounded-[var(--radius-card)] border border-line"><?php endif; ?>
      <div class="prose-lite text-[17px] text-fg/90"><?= render_markdown($p['content']) ?></div>
      <?php if ($p['tags']): ?><ul class="mt-10 flex flex-wrap gap-2"><?php foreach ((array)$p['tags'] as $t): ?><li class="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">#<?= e($t) ?></li><?php endforeach; ?></ul><?php endif; ?>
      <div class="mt-14 rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center"><h2 class="text-xl font-extrabold">Want this level of polish on your videos?</h2><?= ui_link('/start-project', 'Start a project', ['class' => 'mt-5', 'iconRight' => 'arrow']) ?></div>
    </div>
  <?= sec_close() ?>
</article>
