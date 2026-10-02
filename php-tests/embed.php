<?php
/**
 * Video links accepted in the portfolio: YouTube, Vimeo and Google Drive turn into embeddable players, Drive folders and unknown hosts
 * do not, and nothing user-supplied can leave the allowed player hosts.
 *   php php-tests/embed.php
 */
require __DIR__ . '/lib.php';

step('Video embeds', 'Google Drive');
$id = '1AbCdEfGhIjKlMnOpQrStUvWxYz_0-9';
foreach ([
    "https://drive.google.com/file/d/{$id}/view?usp=sharing",
    "https://drive.google.com/file/d/{$id}/preview",
    "https://drive.google.com/open?id={$id}",
    "https://drive.google.com/uc?export=download&id={$id}",
    "https://docs.google.com/file/d/{$id}/edit",
] as $u) {
    check("a Drive file link becomes the Drive player: {$u}", embed_url($u) === "https://drive.google.com/file/d/{$id}/preview", embed_url($u));
}
check('the Drive thumbnail uses the same file id', drive_thumbnail("https://drive.google.com/file/d/{$id}/view") === "https://drive.google.com/thumbnail?id={$id}&sz=w1280");
check('a Drive folder has no embed and no thumbnail', embed_url('https://drive.google.com/drive/folders/' . $id) === null && drive_thumbnail('https://drive.google.com/drive/folders/' . $id) === null);
check('a Drive-looking address on another host is not trusted', embed_url("https://evil.example/drive.google.com/file/d/{$id}/view") === null && embed_url("https://drive.google.com.evil.example/file/d/{$id}/view") === null);
check('a script-like id cannot reach the player URL', embed_url('https://drive.google.com/file/d/"><script>alert(1)</script>/view') === null);

step('Video embeds', 'YouTube and Vimeo still work');
check('YouTube watch link', embed_url('https://www.youtube.com/watch?v=dQw4w9WgXcQ') === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');
check('YouTube short link', embed_url('https://youtu.be/dQw4w9WgXcQ') === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');
check('Vimeo link', embed_url('https://vimeo.com/123456789') === 'https://player.vimeo.com/video/123456789');
check('a direct video file has no embed', embed_url('https://cdn.example/film.mp4') === null);

step('Video embeds', 'allowed in frames');
$src = (string)file_get_contents(__DIR__ . '/../public_html/app/core/http.php');
check('the Content-Security-Policy lets pages frame the Drive player and nothing broader', str_contains($src, "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://drive.google.com") && !preg_match('#frame-src[^\']*\*#', $src));
exit(summary());
