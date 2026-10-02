<?php
/** Crawler and browser-facing files: /sitemap.xml, /robots.txt, /manifest.webmanifest, share image, app icons. */
defined('FEP') or exit;

/** Streams a bundled image with a day of browser caching. */
function send_static_image(string $file, string $type): never
{
    $path = FEP_ROOT . '/assets/img/' . $file;
    if (!is_file($path)) {
        Pages::notFound();
    }
    http_response_code(200);
    header('Content-Type: ' . $type);
    header('Cache-Control: public, max-age=86400');
    header('Content-Length: ' . filesize($path));
    readfile($path);
    exit;
}

page('/sitemap.xml', function (Ctx $c) {
    $base = rtrim(app_url(), '/');
    $urls = [];
    foreach (['', '/services', '/work', '/case-studies', '/process', '/pricing', '/about', '/blog', '/faq', '/contact', '/book', '/help', '/start-project', '/terms', '/privacy'] as $p) {
        $urls[] = [$base . $p, gmdate('Y-m-d'), $p === '' ? '1.0' : '0.7'];
    }
    try {
        $e = sitemap_entries();
        foreach ($e['services'] as $s) {
            $urls[] = [$base . '/services/' . $s['slug'], gmdate('Y-m-d', (int)(ts_ms($s['updatedAt']) / 1000)), '0.8'];
        }
        foreach ($e['posts'] as $s) {
            $urls[] = [$base . '/blog/' . $s['slug'], gmdate('Y-m-d', (int)(ts_ms($s['updatedAt']) / 1000)), '0.6'];
        }
        foreach ($e['cases'] as $s) {
            $urls[] = [$base . '/case-studies/' . $s['slug'], gmdate('Y-m-d', (int)(ts_ms($s['updatedAt']) / 1000)), '0.7'];
        }
    } catch (Throwable $t) { // database unavailable — still serve the static routes
    }
    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
    foreach ($urls as [$loc, $mod, $prio]) {
        $xml .= '  <url><loc>' . e($loc) . '</loc><lastmod>' . $mod . '</lastmod><priority>' . $prio . "</priority></url>\n";
    }
    Res::text($xml . '</urlset>' . "\n", 'application/xml; charset=utf-8');
});

page('/robots.txt', function (Ctx $c) {
    $base = rtrim(app_url(), '/');
    Res::text("User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /dashboard\nDisallow: /admin\nDisallow: /editor\nDisallow: /login\nDisallow: /register\nDisallow: /auth/\nDisallow: /s/\n\nSitemap: {$base}/sitemap.xml\n");
});

page('/manifest.webmanifest', function (Ctx $c) {
    $site = get_site_context();
    $name = $site['business']['name'];
    $accent = preg_match('/^#[0-9a-f]{6}$/i', (string)$site['theme']['accent']) ? $site['theme']['accent'] : '#2457E6';
    Res::text(json_enc(['name' => $name, 'short_name' => mb_strlen($name) > 14 ? explode(' ', $name)[0] : $name, 'description' => $site['business']['tagline'], 'start_url' => '/', 'display' => 'standalone', 'background_color' => '#F7F9FC', 'theme_color' => $accent,
        'icons' => [['src' => '/favicon.svg', 'sizes' => 'any', 'type' => 'image/svg+xml'], ['src' => '/assets/img/icon-192.png', 'sizes' => '192x192', 'type' => 'image/png'], ['src' => '/assets/img/icon-512.png', 'sizes' => '512x512', 'type' => 'image/png']]]), 'application/manifest+json; charset=utf-8');
});

// An image uploaded in Admin → Settings → SEO wins over the bundled share card.
page('/opengraph-image', function (Ctx $c) {
    $og = (string)(get_site_context()['seo']['ogImage'] ?? '');
    if ($og !== '' && (preg_match('#^https?://#i', $og) || str_starts_with($og, '/'))) {
        Res::redirect(preg_match('#^https?://#i', $og) ? $og : absolute_url($og), 307);
    }
    send_static_image('og.png', 'image/png');
});
page('/apple-icon', fn(Ctx $c) => send_static_image('apple-icon.png', 'image/png'));
page('/favicon.ico', fn(Ctx $c) => send_static_image('favicon-32.png', 'image/png'));

/** Public share links: /s/<token> → short-lived signed URL. Revocable per file; delivery gating still applies. */
page('/s/{token}', function (Ctx $c) {
    [$ok] = rate_hit('share:' . $c->ip, 60, 60000);
    if (!$ok) {
        Pages::error(429, 'Slow down', 'clock', 'Too many requests', 'Please wait a moment and try that link again.');
    }
    try {
        $r = resolve_share($c->params['token']);
    } catch (AppError $e) {
        Pages::error($e->status ?? 404, 'Unavailable', 'lock', "This link isn't available", $e->getMessage() ?: 'It may have expired or been turned off.');
    }
    Res::redirect($r['url']);
});
