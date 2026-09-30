<?php /** Vars: $posts, $cats, $category */
$pill = fn($on) => cx('rounded-full border px-4 py-2 text-sm font-semibold', $on ? 'border-fg bg-fg text-bg' : 'border-line-strong text-muted hover:text-fg');
?>
<?= page_hero('Resources', 'Editing tips & creator resources.', 'Practical ideas for better video — from hooks and pacing to workflows and marketing.') ?>
<?= sec_open() ?>
  <div class="mb-8 flex flex-wrap gap-2"><a href="/blog" class="<?= e($pill(!$category)) ?>">All</a><?php foreach ($cats as $c): ?><a href="/blog?category=<?= e($c['slug']) ?>" class="<?= e($pill($category === $c['slug'])) ?>"><?= e($c['name']) ?></a><?php endforeach; ?></div>
  <?php if ($posts['items']): ?>
    <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      <?php foreach ($posts['items'] as $i => $p): ?>
        <div<?= rv(($i % 3) * 60) ?>><a href="/blog/<?= e($p['slug']) ?>" class="group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface transition duration-300 hover:-translate-y-1 hover:shadow-lift">
          <div class="relative aspect-[16/9] bg-surface-2"><?php if ($p['featuredImage']): ?><img src="<?= e($p['featuredImage']) ?>" alt="" loading="lazy" class="h-full w-full object-cover"><?php else: ?><div class="flex h-full items-center justify-center bg-[radial-gradient(80%_100%_at_30%_0%,color-mix(in_srgb,var(--accent)_26%,var(--surface-2)),var(--surface-2))]"><?= icon('news', 34, 'text-subtle') ?></div><?php endif; ?></div>
          <div class="flex flex-1 flex-col p-6"><div class="eyebrow"><?= e($p['category']['name'] ?? 'Article') ?></div><h2 class="mt-2 text-lg font-extrabold leading-snug group-hover:text-accent-text"><?= e($p['title']) ?></h2>
            <?php if ($p['excerpt']): ?><p class="mt-2 line-clamp-3 text-sm text-muted"><?= e($p['excerpt']) ?></p><?php endif; ?>
            <div class="mt-auto pt-4 text-xs text-subtle"><?= e(fmt_date($p['publishedAt'])) ?><?= $p['authorName'] ? ' · ' . e($p['authorName']) : '' ?></div></div>
        </a></div>
      <?php endforeach; ?>
    </div>
    <div class="mt-8"><?= ui_pagination($posts['page'], $posts['pages'], '/blog', array_filter(['category' => $category])) ?></div>
  <?php else: ?><?= ui_empty('No articles yet', "We're writing. Meanwhile, tell us about your project and we'll share tips tailored to it.", 'news', ui_link('/start-project', 'Start a project')) ?><?php endif; ?>
<?= sec_close() ?>
