<?php /** Plain frame for error pages: content only. */
$body = '<main id="main">' . $content . '</main>';
echo View::capture('layouts/document', compact('meta', 'body') + ['scripts' => $scripts ?? []]);
