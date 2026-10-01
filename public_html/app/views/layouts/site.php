<?php defined('FEP') or exit; /** Public website frame. Vars: $content, $meta, $actor? */
$site = get_site_context();
$actor = $actor ?? actor();
$body = View::capture('partials/site-header', compact('site', 'actor'))
    . '<main id="main">' . $content . '</main>'
    . View::capture('partials/site-footer', compact('site'));
echo View::capture('layouts/document', compact('meta', 'body') + ['scripts' => $scripts ?? []]);
