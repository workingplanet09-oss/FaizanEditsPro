<?php defined('FEP') or exit; /** Vars: $posts, $cats, $category */
$pill = fn($on) => cx('inline-flex min-h-11 items-center rounded-full border px-4 text-base font-semibold transition-colors duration-150', $on ? 'border-fg bg-fg text-bg' : 'border-line-strong text-muted hover:border-accent hover:text-fg');
?>
<?= page_hero('Resources', 'Editing notes for creators.', 'Practical ideas for better video, from hooks and pacing to workflows and publishing.') ?>
<?= sec_open() ?>
  <div class="mb-8 flex flex-wrap gap-2"><a href="/blog" class="<?= e($pill(!$category)) ?>">All</a><?php foreach ($cats as $c): ?><a href="/blog?category=<?= e($c['slug']) ?>" class="<?= e($pill($category === $c['slug'])) ?>"><?= e($c['name']) ?></a><?php endforeach; ?></div>
  <?php if ($posts['items']): ?>
    <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      <?php foreach ($posts['items'] as $i => $p): ?>
        <div<?= rv(($i % 3) * 60) ?>><a href="/blog/<?= e($p['slug']) ?>" class="group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface transition-colors duration-150 hover:border-accent">
          <div class="relative aspect-[16/9] bg-surface-2"><?php if ($p['featuredImage']): ?><img src="<?= e($p['featuredImage']) ?>" alt="" loading="lazy" class="h-full w-full object-cover"><?php else: ?><div class="flex h-full items-center justify-center bg-surface-2"><?= icon('news', 34, 'text-subtle') ?></div><?php endif; ?></div>
          <div class="flex flex-1 flex-col p-6"><div class="eyebrow"><?= e($p['category']['name'] ?? 'Article') ?></div><h2 class="h-card mt-2 text-xl group-hover:text-accent-text"><?= e($p['title']) ?></h2>
            <?php if ($p['excerpt']): ?><p class="mt-2 line-clamp-3 text-base text-muted"><?= e($p['excerpt']) ?></p><?php endif; ?>
            <div class="mt-auto pt-4 text-sm text-muted"><?= e(fmt_date($p['publishedAt'])) ?><?= $p['authorName'] ? ' · ' . e($p['authorName']) : '' ?></div></div>
        </a></div>
      <?php endforeach; ?>
    </div>
    <div class="mt-8"><?= ui_pagination($posts['page'], $posts['pages'], '/blog', array_filter(['category' => $category])) ?></div>
  <?php else: ?><?= ui_empty('No articles yet', 'I am writing. In the meantime, tell me about your project and I will share tips that fit it.', 'news', ui_link('/start-project', 'Discuss your project')) ?><?php endif; ?>
<?= sec_close() ?>
