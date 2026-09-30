<?php
/**
 * Markdown → safe HTML. Content is admin-authored, but every byte of raw HTML is escaped first so a careless or malicious edit
 * can never inject script into visitors' browsers. Supports the GitHub-flavoured subset the CMS uses: headings, paragraphs,
 * bold / italic / strike, inline code, fenced code, links, images, (nested) lists, blockquotes, rules and tables.
 */
defined('FEP') or exit;

/** http(s) and mailto links, or site-relative paths; anything else (javascript:, data:, …) is dropped. */
function md_safe_url(string $url, bool $imageOnly = false): ?string
{
    $url = trim(html_entity_decode($url, ENT_QUOTES | ENT_HTML5));
    if ($url === '' || preg_match('/[\x00-\x1f\x7f\s]/', $url)) {
        return null;
    }
    if (preg_match('#^https?://#i', $url) || (!$imageOnly && preg_match('#^mailto:[^\s<>]+$#i', $url)) || preg_match('#^/(?![/\\\\])#', $url)) {
        return $url;
    }
    return null;
}

function md_inline(string $text): string
{
    // protect code spans first so their contents are not treated as markdown
    $codes = [];
    $text = preg_replace_callback('/`([^`\n]+)`/', function ($m) use (&$codes) {
        $codes[] = '<code>' . e($m[1]) . '</code>';
        return "\x01" . (count($codes) - 1) . "\x02";
    }, $text);
    $text = e($text);
    // images then links
    $text = preg_replace_callback('/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/', function ($m) {
        $src = md_safe_url($m[2], true);
        return $src ? '<img src="' . e($src) . '" alt="' . $m[1] . '"' . (isset($m[3]) && $m[3] !== '' ? ' title="' . $m[3] . '"' : '') . ' loading="lazy">' : $m[1];
    }, $text);
    $text = preg_replace_callback('/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/', function ($m) {
        $href = md_safe_url($m[2]);
        if (!$href) {
            return $m[1];
        }
        $ext = preg_match('#^https?://#i', $href);
        return '<a href="' . e($href) . '" rel="noopener noreferrer"' . ($ext ? ' target="_blank"' : '') . (isset($m[3]) && $m[3] !== '' ? ' title="' . $m[3] . '"' : '') . '>' . $m[1] . '</a>';
    }, $text);
    $text = preg_replace('/\*\*(?=\S)(.+?)(?<=\S)\*\*/s', '<strong>$1</strong>', $text);
    $text = preg_replace('/(?<![\w*])__(?=\S)(.+?)(?<=\S)__(?![\w*])/s', '<strong>$1</strong>', $text);
    $text = preg_replace('/(?<![\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])/', '<em>$1</em>', $text);
    $text = preg_replace('/(?<![\w_])_(?=\S)([^_\n]+?)(?<=\S)_(?![\w_])/', '<em>$1</em>', $text);
    $text = preg_replace('/~~(?=\S)(.+?)(?<=\S)~~/', '<s>$1</s>', $text);
    $text = preg_replace('/ {2,}\n/', "<br>\n", $text);
    return preg_replace_callback('/\x01(\d+)\x02/', fn($m) => $codes[(int)$m[1]], $text);
}

/** @param string[] $lines */
function md_blocks(array $lines): string
{
    $out = '';
    $n = count($lines);
    $i = 0;
    while ($i < $n) {
        $line = $lines[$i];
        if (trim($line) === '') {
            $i++;
            continue;
        }
        // fenced code
        if (preg_match('/^\s*(```|~~~)/', $line, $f)) {
            $buf = [];
            $i++;
            while ($i < $n && !preg_match('/^\s*' . preg_quote($f[1], '/') . '\s*$/', $lines[$i])) {
                $buf[] = $lines[$i++];
            }
            $i++;
            $out .= '<pre><code>' . e(implode("\n", $buf)) . "</code></pre>\n";
            continue;
        }
        // heading (h1 is demoted: the page title is the only h1)
        if (preg_match('/^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/', $line, $m)) {
            $lvl = max(2, strlen($m[1]));
            $out .= "<h{$lvl}>" . md_inline($m[2]) . "</h{$lvl}>\n";
            $i++;
            continue;
        }
        if (preg_match('/^\s{0,3}([-*_])(\s*\1){2,}\s*$/', $line)) {
            $out .= "<hr>\n";
            $i++;
            continue;
        }
        // blockquote
        if (preg_match('/^\s{0,3}>\s?/', $line)) {
            $buf = [];
            while ($i < $n && preg_match('/^\s{0,3}>\s?(.*)$/', $lines[$i], $m)) {
                $buf[] = $m[1];
                $i++;
            }
            $out .= '<blockquote>' . md_blocks($buf) . "</blockquote>\n";
            continue;
        }
        // table: header row + separator row
        if (str_contains($line, '|') && $i + 1 < $n && preg_match('/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/', $lines[$i + 1])) {
            $cells = fn(string $l) => array_map('trim', explode('|', trim(trim($l), '|')));
            $head = $cells($line);
            $aligns = array_map(fn($c) => str_starts_with($c, ':') && str_ends_with($c, ':') ? 'center' : (str_ends_with($c, ':') ? 'right' : (str_starts_with($c, ':') ? 'left' : '')), $cells($lines[$i + 1]));
            $i += 2;
            $html = '<table><thead><tr>';
            foreach ($head as $k => $c) {
                $html .= '<th' . (!empty($aligns[$k]) ? ' align="' . $aligns[$k] . '"' : '') . '>' . md_inline($c) . '</th>';
            }
            $html .= '</tr></thead><tbody>';
            while ($i < $n && trim($lines[$i]) !== '' && str_contains($lines[$i], '|')) {
                $html .= '<tr>';
                foreach ($cells($lines[$i]) as $k => $c) {
                    $html .= '<td' . (!empty($aligns[$k]) ? ' align="' . $aligns[$k] . '"' : '') . '>' . md_inline($c) . '</td>';
                }
                $html .= '</tr>';
                $i++;
            }
            $out .= $html . "</tbody></table>\n";
            continue;
        }
        // lists (one level of nesting by indentation)
        if (preg_match('/^(\s*)([-*+]|\d+[.)])\s+/', $line, $m)) {
            $ordered = ctype_digit($m[2][0]);
            $baseIndent = strlen($m[1]);
            $items = [];
            while ($i < $n) {
                if (preg_match('/^(\s*)([-*+]|\d+[.)])\s+(.*)$/', $lines[$i], $mm) && strlen($mm[1]) <= $baseIndent + 1 && (ctype_digit($mm[2][0]) === $ordered)) {
                    $items[] = ['text' => $mm[3], 'sub' => []];
                    $i++;
                } elseif ($items && preg_match('/^(\s{2,})(\S.*)$/', $lines[$i], $mm) && strlen($mm[1]) > $baseIndent) {
                    // nested list line or a lazy continuation of the current item
                    $items[count($items) - 1]['sub'][] = substr($lines[$i], min(strlen($mm[1]), $baseIndent + 2));
                    $i++;
                } elseif (trim($lines[$i]) === '' && $i + 1 < $n && preg_match('/^(\s*)([-*+]|\d+[.)])\s+/', $lines[$i + 1])) {
                    $i++;
                } else {
                    break;
                }
            }
            $tag = $ordered ? 'ol' : 'ul';
            $html = "<{$tag}>";
            foreach ($items as $it) {
                $html .= '<li>' . md_inline($it['text']);
                if ($it['sub']) {
                    $html .= "\n" . md_blocks($it['sub']);
                }
                $html .= '</li>';
            }
            $out .= $html . "</{$tag}>\n";
            continue;
        }
        // paragraph: consume until a blank line or another block starts
        $buf = [];
        while ($i < $n && trim($lines[$i]) !== '' && !preg_match('/^\s*(```|~~~)|^\s{0,3}#{1,4}\s|^\s{0,3}>|^\s*([-*+]|\d+[.)])\s+/', $lines[$i])) {
            $buf[] = $lines[$i++];
        }
        if (!$buf) { // a stray line the rules above did not claim
            $buf[] = $lines[$i++];
        }
        $out .= '<p>' . md_inline(implode("\n", $buf)) . "</p>\n";
    }
    return $out;
}

function render_markdown(?string $md): string
{
    $md = trim((string)$md);
    if ($md === '') {
        return '';
    }
    return md_blocks(explode("\n", str_replace(["\r\n", "\r", "\t"], ["\n", "\n", '    '], $md)));
}

/** Plain-text excerpt for meta descriptions and cards. */
function excerpt_text(?string $md, int $n = 160): string
{
    $text = trim(preg_replace('/\s+/', ' ', preg_replace('/[#*_`>\[\]()!-]/', '', (string)$md)) ?? '');
    return mb_strlen($text) > $n ? rtrim(mb_substr($text, 0, $n - 1)) . '…' : $text;
}
