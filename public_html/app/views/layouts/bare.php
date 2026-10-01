<?php defined('FEP') or exit; /** Plain frame for error pages: content only. Vars: $content, $title?, $meta? */
$meta ??= seo_meta(['title' => $title ?? 'Something went wrong', 'path' => req_path(), 'noindex' => true]);
$body = '<main id="main">' . $content . '</main>';
echo View::capture('layouts/document', compact('meta', 'body') + ['scripts' => $scripts ?? []]);
