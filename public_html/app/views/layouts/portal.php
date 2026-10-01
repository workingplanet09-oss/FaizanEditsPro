<?php defined('FEP') or exit;
/**
 * Sidebar + top bar frame for every signed-in area. Vars: $area (admin|editor|client), $actor, $content, $meta, $bottomNav?
 */
$site = get_site_context();
$b = $site['business'];
$actor = $actor ?? require_actor();
$groups = nav_filter(nav_groups($area), $actor);
$home = ['admin' => '/admin', 'editor' => '/editor', 'client' => '/dashboard'][$area];
$areaLabel = ['admin' => 'Admin console', 'editor' => 'Editor workspace', 'client' => 'Client portal'][$area];
$unread = unread_count($actor);
$badges = $badges ?? [];
$path = req_path();
$bottomNav = $bottomNav ?? ($area === 'client' ? [['Home', '/dashboard', 'dashboard', true], ['Projects', '/dashboard/projects', 'film', false], ['Messages', '/dashboard/messages', 'message', false], ['Invoices', '/dashboard/invoices', 'receipt', false]] : null);
$menu = [
    $area === 'client' ? ['Settings', '/dashboard/settings', 'settings'] : ['My account', "{$home}/account", 'user'],
    ['View website', '/', 'external'],
    ['Help center', '/help', 'help'],
];
$navList = function () use ($groups, $badges, $path) {
    $o = '<nav aria-label="Main" class="space-y-6">';
    foreach ($groups as $g) {
        $o .= '<div>' . (!empty($g['label']) ? '<div class="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">' . e($g['label']) . '</div>' : '') . '<ul class="space-y-0.5">';
        foreach ($g['items'] as $i) {
            $active = nav_is_active($path, $i['href'], $i['exact']);
            $badge = $badges[$i['href']] ?? 0;
            $o .= '<li><a href="' . e($i['href']) . '"' . ($active ? ' aria-current="page"' : '') . ' class="' . e(cx('group flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition-colors', $active ? 'bg-fg text-bg' : 'text-muted hover:bg-surface-2 hover:text-fg')) . '">'
                . icon($i['icon'], 17, $active ? 'text-accent-text' : 'text-subtle group-hover:text-fg') . '<span class="flex-1 truncate">' . e($i['label']) . '</span>'
                . ($badge ? '<span class="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-accent-fg">' . ($badge > 99 ? '99+' : $badge) . '</span>' : '') . '</a></li>';
        }
        $o .= '</ul></div>';
    }
    return $o . '</nav>';
};
ob_start(); ?>
<div class="min-h-dvh bg-bg">
  <aside class="fixed inset-y-0 left-0 z-30 hidden w-[15.5rem] flex-col border-r border-line bg-surface/60 lg:flex">
    <div class="flex h-16 shrink-0 items-center border-b border-line px-5"><?php partial('partials/logo', ['name' => $b['name'], 'logoUrl' => $b['logoUrl'] ?: null, 'href' => $home, 'class' => '[&>span:last-child]:max-w-[9.5rem] [&>span:last-child]:truncate']); ?></div>
    <div class="flex-1 overflow-y-auto px-3 py-5"><?= $navList() ?></div>
    <div class="border-t border-line p-3"><div class="rounded-xl bg-surface-2/70 px-3 py-2.5 text-xs"><div class="font-bold"><?= e($areaLabel) ?></div><a href="/" class="mt-0.5 inline-flex items-center gap-1 text-muted hover:text-fg">View website <?= icon('arrow-up-right', 12) ?></a></div></div>
  </aside>

  <div class="lg:pl-[15.5rem]">
    <header class="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-bg/85 px-3 backdrop-blur sm:px-6">
      <button type="button" aria-label="Open menu" aria-expanded="false" data-drawer-toggle="mobile-nav" class="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-surface-2 lg:hidden"><?= icon('menu', 20) ?></button>
      <button type="button" data-palette-open aria-label="Open command menu" class="flex h-9 w-full max-w-sm flex-1 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 text-sm text-subtle transition hover:border-subtle sm:w-72 sm:flex-none">
        <?= icon('search', 15) ?><span class="hidden sm:inline">Search or jump to…</span><span class="ml-auto hidden gap-1 sm:flex"><?= ui_kbd('⌘') ?><?= ui_kbd('K') ?></span>
      </button>
      <div class="ml-auto flex items-center gap-1">
        <?= theme_toggle() ?>
        <div class="relative" data-fe-component="bell" data-unread="<?= (int)$unread ?>">
          <button type="button" data-bell-btn data-menu-toggle="bell-panel" aria-haspopup="dialog" aria-expanded="false" aria-label="<?= $unread ? "Notifications, {$unread} unread" : 'Notifications' ?>" class="relative flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg">
            <?= icon('bell', 18) ?><span data-bell-badge class="<?= $unread ? '' : 'hidden ' ?>absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-extrabold text-accent-fg ring-2 ring-bg"><?= $unread > 99 ? '99+' : (int)$unread ?></span>
          </button>
          <div id="bell-panel" data-menu data-bell-panel role="dialog" aria-label="Notifications" class="absolute right-0 top-full z-50 mt-2 hidden w-[min(24rem,calc(100vw-1.5rem))] animate-pop overflow-hidden rounded-2xl border border-line bg-surface shadow-lift max-sm:fixed max-sm:inset-x-3 max-sm:top-16 max-sm:w-auto">
            <div class="flex items-center justify-between border-b border-line px-4 py-3"><h2 class="text-sm font-bold">Notifications</h2><button type="button" data-bell-markall class="text-xs font-semibold text-muted hover:text-fg disabled:opacity-40">Mark all as read</button></div>
            <div data-bell-tabs class="scroll-x flex gap-1 border-b border-line px-3 py-2"></div>
            <div data-bell-list class="thin-scroll max-h-[min(26rem,60dvh)] overflow-y-auto"><div class="space-y-3 p-4" role="status" aria-label="Loading notifications"><div class="skeleton h-12 w-full"></div><div class="skeleton h-12 w-full"></div></div></div>
          </div>
        </div>
        <div class="relative">
          <button type="button" data-menu-toggle="user-menu" aria-haspopup="menu" aria-expanded="false" aria-label="Account menu" class="flex items-center gap-2 rounded-xl p-1 pr-2 transition hover:bg-surface-2"><?= ui_avatar($actor->name, null, 30) ?><?= icon('chevron-down', 14, 'hidden text-subtle sm:block') ?></button>
          <div id="user-menu" data-menu role="menu" class="absolute right-0 top-full z-50 mt-2 hidden w-60 animate-pop overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-lift">
            <div class="border-b border-line px-3 pb-2.5 pt-2"><div class="truncate text-sm font-bold"><?= e($actor->name) ?></div><div class="truncate text-xs text-muted"><?= e($actor->email) ?></div></div>
            <div class="py-1"><?php foreach ($menu as [$label, $href, $ic]): ?><a role="menuitem" href="<?= e($href) ?>" class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg"><?= icon($ic, 16) ?><?= e($label) ?></a><?php endforeach; ?></div>
            <button type="button" role="menuitem" data-logout class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-60"><?= icon('logout', 16) ?>Sign out</button>
          </div>
        </div>
      </div>
    </header>
    <main id="main" class="mx-auto w-full max-w-[88rem] px-4 py-6 sm:px-6 sm:py-8 <?= $bottomNav ? 'pb-28 lg:pb-8' : '' ?>"><?= $content ?></main>
  </div>

  <div id="mobile-nav" data-drawer class="fixed inset-0 z-50 hidden lg:hidden" role="dialog" aria-modal="true" aria-label="<?= e($b['name']) ?>">
    <button type="button" aria-label="Close menu" data-drawer-close="mobile-nav" class="absolute inset-0 bg-black/50 backdrop-blur-sm"></button>
    <div class="absolute inset-y-0 left-0 flex w-[84%] max-w-xs animate-slide-in-left flex-col bg-bg shadow-lift">
      <div class="flex h-16 items-center justify-between border-b border-line px-5"><span class="text-base font-extrabold"><?= e($b['name']) ?></span><button type="button" aria-label="Close menu" data-drawer-close="mobile-nav" class="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-surface-2"><?= icon('x', 18) ?></button></div>
      <div class="flex-1 overflow-y-auto p-4"><?= $navList() ?></div>
    </div>
  </div>

  <?php if ($bottomNav): ?>
  <nav aria-label="Quick navigation" class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/92 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
    <ul class="mx-auto grid max-w-lg grid-cols-4">
      <?php foreach ($bottomNav as [$label, $href, $ic, $exact]): $active = nav_is_active($path, $href, $exact); $bd = $badges[$href] ?? 0; ?>
        <li><a href="<?= e($href) ?>"<?= $active ? ' aria-current="page"' : '' ?> class="<?= e(cx('relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold', $active ? 'text-fg' : 'text-subtle')) ?>"><span class="relative"><?= icon($ic, 20, $active ? 'text-accent-text' : '') ?><?= $bd ? '<span class="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-extrabold text-accent-fg">' . $bd . '</span>' : '' ?></span><?= e($label) ?></a></li>
      <?php endforeach; ?>
    </ul>
  </nav>
  <?php endif; ?>

  <dialog aria-label="Command menu" data-fe-component="palette" data-props="<?= json_attr(['commands' => nav_commands($area, $groups, $actor), 'canSearch' => true]) ?>" class="m-auto mt-[12vh] w-[calc(100%-1.5rem)] max-w-xl overflow-hidden rounded-2xl border border-line bg-surface p-0 text-fg shadow-lift open:animate-pop">
    <div>
      <div class="flex items-center gap-3 border-b border-line px-4">
        <?= icon('search', 18, 'text-subtle') ?>
        <input role="combobox" aria-expanded="true" aria-controls="cmd-list" placeholder="Search clients, projects, invoices… or type a command" class="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle" autocomplete="off">
        <span data-palette-spin class="hidden"><?= icon('loader', 16, 'animate-spin text-subtle') ?></span><?= ui_kbd('esc') ?>
      </div>
      <ul id="cmd-list" data-palette-list role="listbox" class="thin-scroll max-h-[min(24rem,55dvh)] overflow-y-auto p-2"></ul>
    </div>
  </dialog>
</div>
<?php
$body = ob_get_clean();
echo View::capture('layouts/document', compact('meta', 'body') + ['scripts' => $scripts ?? [], 'bodyClass' => '']);
