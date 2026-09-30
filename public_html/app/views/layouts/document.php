<?php
/** The HTML document shell shared by every layout. Vars: $meta (seo_meta), $body (html), $scripts (extra JS files), $bodyClass */
$site = get_site_context();
$accent = preg_match('/^#[0-9a-f]{6}$/i', $site['theme']['accent'] ?? '') ? $site['theme']['accent'] : '#ff5b2e';
$name = $site['business']['name'];
$scripts = array_merge(['js/icons.js', 'js/app.js'], $scripts ?? []);
$favicon = !empty($site['business']['faviconUrl']) ? $site['business']['faviconUrl'] : '/favicon.svg';
$themeScript = "(function(){try{var t=localStorage.getItem('fe-theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}try{document.cookie='fe_tz='+encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)+';path=/;max-age=31536000;samesite=lax';}catch(e){}})();";
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($meta['title']) ?></title>
<?php if (!empty($meta['description'])): ?><meta name="description" content="<?= e($meta['description']) ?>">
<?php endif; ?>
<link rel="canonical" href="<?= e($meta['canonical']) ?>">
<?php if (!empty($meta['noindex'])): ?><meta name="robots" content="noindex, nofollow">
<?php endif; ?>
<meta property="og:site_name" content="<?= e($name) ?>">
<meta property="og:type" content="<?= e($meta['type']) ?>">
<meta property="og:title" content="<?= e($meta['title']) ?>">
<?php if (!empty($meta['description'])): ?><meta property="og:description" content="<?= e($meta['description']) ?>">
<?php endif; ?>
<meta property="og:url" content="<?= e($meta['canonical']) ?>">
<?php if (!empty($meta['image'])): ?><meta property="og:image" content="<?= e($meta['image']) ?>">
<?php endif; ?>
<?php if (!empty($meta['publishedTime'])): ?><meta property="article:published_time" content="<?= e($meta['publishedTime']) ?>">
<?php endif; ?>
<meta name="twitter:card" content="<?= !empty($meta['image']) ? 'summary_large_image' : 'summary' ?>">
<meta name="twitter:title" content="<?= e($meta['title']) ?>">
<?php if (!empty($meta['description'])): ?><meta name="twitter:description" content="<?= e($meta['description']) ?>">
<?php endif; ?>
<?php if (!empty($meta['image'])): ?><meta name="twitter:image" content="<?= e($meta['image']) ?>">
<?php endif; ?>
<meta name="application-name" content="<?= e($name) ?>">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#09090b">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f6f5f1">
<link rel="icon" href="<?= e($favicon) ?>">
<link rel="apple-touch-icon" href="/apple-icon">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/assets/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
<script><?= $themeScript ?></script>
<style>:root{--accent:<?= e($accent) ?>;--accent-fg:<?= e(contrast_on($accent)) ?>;--accent-text:<?= e(accent_for_text($accent, '#efeee8', 'black')) ?>}.dark,.dark-zone{--accent-text:<?= e(accent_for_text($accent, '#18181c', 'white')) ?>}</style>
<?php foreach ($meta['jsonLd'] as $ld) { echo json_ld($ld), "\n"; } ?>
</head>
<body class="min-h-dvh antialiased <?= e($bodyClass ?? '') ?>">
<a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-fg focus:px-4 focus:py-2 focus:text-bg">Skip to content</a>
<?= $body ?>
<?php foreach ($scripts as $s): ?><script src="<?= e(asset($s)) ?>" defer></script>
<?php endforeach; ?>
</body>
</html>
