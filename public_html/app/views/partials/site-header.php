<?php /** Public site header. Vars: $site, $actor (?Actor) */
$b = $site['business']; $nav = $site['nav']; $path = req_path();
$portal = $actor ? home_for_roles($actor->roleKeys, $actor->permissions) : null;
?>
<header data-site-header class="sticky top-0 z-40 border-b border-transparent bg-bg/60 backdrop-blur-md transition-colors duration-300">
  <div class="container-page flex h-16 items-center gap-3 sm:gap-6">
    <?php partial('partials/logo', ['name' => $b['name'], 'logoUrl' => $b['logoUrl'] ?: null]); ?>
    <nav aria-label="Main" class="ml-4 hidden items-center gap-0.5 lg:flex">
      <?php foreach ($nav['links'] as $l): $active = $path === $l['href'] || ($l['href'] !== '/' && str_starts_with($path, $l['href'])); ?>
        <a href="<?= e($l['href']) ?>"<?= $active ? ' aria-current="page"' : '' ?> class="<?= e(cx('relative rounded-lg px-3 py-2 text-sm font-medium transition-colors', $active ? 'text-fg' : 'text-muted hover:text-fg')) ?>"><?= e($l['label']) ?><?= $active ? '<span class="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-accent"></span>' : '' ?></a>
      <?php endforeach; ?>
    </nav>
    <div class="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
      <?= theme_toggle('hidden sm:flex') ?>
      <?= ui_link($actor ? ($portal ?: '/dashboard') : '/login', $actor ? 'My portal' : $nav['loginLabel'], ['variant' => 'ghost', 'size' => 'sm', 'class' => 'hidden sm:inline-flex']) ?>
      <?= ui_link('/start-project', $nav['ctaLabel'], ['size' => 'sm', 'class' => 'whitespace-nowrap', 'labelHtml' => '<span class="sm:hidden">Start Project</span><span class="hidden sm:inline">' . e($nav['ctaLabel']) . '</span>']) ?>
      <button type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-menu" data-drawer-toggle="mobile-menu" class="flex h-9 w-9 items-center justify-center rounded-xl text-fg hover:bg-surface-2 lg:hidden"><?= icon('menu', 20) ?></button>
    </div>
  </div>
  <div id="mobile-menu" data-drawer class="hidden animate-fade-in border-t border-line bg-bg lg:hidden">
    <nav aria-label="Mobile" class="container-page flex max-h-[calc(100dvh-4rem)] flex-col gap-1 overflow-y-auto py-4">
      <?php foreach ($nav['links'] as $l): ?>
        <a href="<?= e($l['href']) ?>" class="flex items-center justify-between rounded-xl px-3 py-3.5 text-lg font-bold hover:bg-surface-2"><?= e($l['label']) ?><?= icon('arrow', 16, 'text-subtle') ?></a>
      <?php endforeach; ?>
      <div class="mt-3 flex items-center gap-3 border-t border-line pt-4">
        <?= ui_link($actor ? ($portal ?: '/dashboard') : '/login', $actor ? 'My portal' : $nav['loginLabel'], ['variant' => 'outline', 'class' => 'flex-1']) ?>
        <?= theme_toggle() ?>
      </div>
    </nav>
  </div>
</header>
