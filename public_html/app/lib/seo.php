<?php
/** Per-page SEO: title (with the site-wide "| Brand" template), description, canonical URL, Open Graph + Twitter cards. */
defined('FEP') or exit;

/**
 * $in: title, description?, path, image?, type? (website|article), noindex?, publishedTime?, absoluteTitle?, jsonLd? (array|list of arrays)
 * @return array{title:string,description:?string,canonical:string,image:?string,type:string,noindex:bool,publishedTime:?string,jsonLd:array}
 */
function seo_meta(array $in): array
{
    $site = get_site_context();
    $template = (string)($site['seo']['titleTemplate'] ?? '%s | ' . $site['business']['name']);
    $title = !empty($in['absoluteTitle']) ? $in['title'] : str_replace('%s', $in['title'], $template);
    $noindex = !empty($in['noindex']);
    // Private pages don't need a share card; every public page gets one.
    $image = $in['image'] ?? ($noindex ? null : '/opengraph-image');
    return [
        'title' => $title, 'description' => $in['description'] ?? ($site['seo']['defaultDescription'] ?? null), 'canonical' => absolute_url($in['path']),
        'image' => $image ? (preg_match('#^https?://#', $image) ? $image : absolute_url($image)) : null, 'type' => $in['type'] ?? 'website', 'noindex' => $noindex,
        'publishedTime' => $in['publishedTime'] ?? null, 'jsonLd' => $in['jsonLd'] ?? [],
    ];
}

/** Sends a full page: view inside a layout, with SEO meta. $meta is passed to seo_meta(). */
function render_page(string $layout, string $view, array $vars = [], array $meta = [], int $status = 200): never
{
    $vars['meta'] = seo_meta($meta + ['title' => $vars['title'] ?? 'Page', 'path' => '/']);
    View::send($layout, $view, $vars, $status);
}
