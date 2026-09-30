<?php /** Distraction-free frame for the wizard and auth screens: logo, a help link, nothing else. */
$site = get_site_context();
$b = $site['business'];
$body = '<div class="flex min-h-dvh flex-col"><header class="border-b border-line"><div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">'
    . View::capture('partials/logo', ['name' => $b['name'], 'logoUrl' => $b['logoUrl'] ?: null])
    . '<div class="flex items-center gap-5 text-sm font-semibold text-muted"><a href="/help" class="hover:text-fg">Help</a><a href="/contact" class="hidden hover:text-fg sm:inline">Talk to us</a></div></div></header>'
    . '<main id="main" class="flex-1 px-4 py-10 sm:px-6 sm:py-14">' . $content . '</main>'
    . '<footer class="border-t border-line py-6 text-center text-xs text-subtle"><a href="/privacy" class="hover:text-fg">Privacy</a> · <a href="/terms" class="hover:text-fg">Terms</a> · © ' . gmdate('Y') . ' ' . e($b['name']) . '</footer></div>';
echo View::capture('layouts/document', compact('meta', 'body') + ['scripts' => $scripts ?? []]);
