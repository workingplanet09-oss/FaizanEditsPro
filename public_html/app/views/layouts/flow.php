<?php defined('FEP') or exit; /** Distraction-free frame for the wizard and auth screens: logo, a help link, nothing else. */
$site = get_site_context();
$b = $site['business'];
$body = '<div class="flex min-h-dvh flex-col"><header class="border-b border-line bg-surface"><div class="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6 md:px-10">'
    . View::capture('partials/logo', ['name' => $b['name'], 'logoUrl' => $b['logoUrl'] ?: null])
    . '<div class="flex items-center gap-2 text-base font-semibold text-muted"><a href="/help" class="inline-flex min-h-11 items-center px-3 hover:text-fg">Help</a><a href="/contact" class="hidden min-h-11 items-center px-3 hover:text-fg sm:inline-flex">Contact me</a></div></div></header>'
    . '<main id="main" class="flex-1 px-6 py-10 md:px-10 sm:py-14">' . $content . '</main>'
    . '<footer class="border-t border-line py-6 text-center text-sm text-muted"><a href="/privacy" class="inline-flex min-h-11 items-center px-2 hover:text-fg">Privacy</a> · <a href="/terms" class="inline-flex min-h-11 items-center px-2 hover:text-fg">Terms</a> · © ' . gmdate('Y') . ' ' . e($b['name']) . '</footer></div>';
echo View::capture('layouts/document', compact('meta', 'body') + ['scripts' => $scripts ?? []]);
