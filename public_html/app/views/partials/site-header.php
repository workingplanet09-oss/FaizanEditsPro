<?php defined('FEP') or exit; /** Public site header. Vars: $site, $actor (?Actor) */
$b = $site['business']; $nav = $site['nav']; $path = req_path();
$portal = $actor ? home_for_roles($actor->roleKeys, $actor->permissions) : null;
?>
<header data-site-header class="sticky top-0 z-40 border-b border-transparent bg-bg/95 transition-colors duration-150">
  <div class="container-page flex h-[72px] items-center gap-4">
    <?php partial('partials/logo', ['name' => $b['name'], 'logoUrl' => $b['logoUrl'] ?: null, 'class' => 'shrink-0']); ?>
    <nav aria-label="Main" class="ml-6 hidden items-center gap-1 xl:flex">
      <?php foreach ($nav['links'] as $l): $active = $path === $l['href'] || ($l['href'] !== '/' && str_starts_with($path, $l['href'])); ?>
        <a href="<?= e($l['href']) ?>"<?= $active ? ' aria-current="page"' : '' ?> class="<?= e(cx('relative inline-flex min-h-11 items-center rounded-lg px-3 text-base font-semibold transition-colors duration-150', $active ? 'text-fg' : 'text-muted hover:text-fg')) ?>"><?= e($l['label']) ?><?= $active ? '<span class="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-accent"></span>' : '' ?></a>
      <?php endforeach; ?>
    </nav>
    <div class="ml-auto flex shrink-0 items-center gap-2">
      <?= theme_toggle('hidden sm:flex') ?>
      <?= ui_link($actor ? ($portal ?: '/dashboard') : '/login', $actor ? 'My portal' : $nav['loginLabel'], ['variant' => 'ghost', 'size' => 'sm', 'class' => 'hidden lg:inline-flex']) ?>
      <?= ui_link('/start-project', $nav['ctaLabel'], ['size' => 'sm', 'class' => 'hidden whitespace-nowrap sm:inline-flex']) ?>
      <button type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-menu" data-drawer-toggle="mobile-menu" class="flex h-11 w-11 items-center justify-center rounded-xl text-fg transition-colors duration-150 hover:bg-surface-2 xl:hidden"><?= icon('menu', 22) ?></button>
    </div>
  </div>
  <div id="mobile-menu" data-drawer class="hidden border-t border-line bg-bg xl:hidden">
    <nav aria-label="Mobile" class="container-page flex max-h-[calc(100dvh-72px)] flex-col gap-1 overflow-y-auto py-4">
      <?php foreach ($nav['links'] as $l): ?>
        <a href="<?= e($l['href']) ?>" class="flex min-h-12 items-center justify-between rounded-xl px-3 font-display text-xl font-bold hover:bg-surface-2"><?= e($l['label']) ?><?= icon('arrow', 18, 'text-subtle') ?></a>
      <?php endforeach; ?>
      <div class="mt-3 grid gap-3 border-t border-line pt-5">
        <?= ui_link('/start-project', $nav['ctaLabel'], ['size' => 'lg', 'class' => 'w-full']) ?>
        <div class="flex items-center gap-3">
          <?= ui_link($actor ? ($portal ?: '/dashboard') : '/login', $actor ? 'My portal' : $nav['loginLabel'], ['variant' => 'outline', 'class' => 'flex-1']) ?>
          <?= theme_toggle() ?>
        </div>
      </div>
    </nav>
  </div>
</header>
