<?php
/** Small dependency-free SVG charts rendered on the server. Real data only; with none they show "No data available yet." Each exposes its numbers in a visually hidden table. */
defined('FEP') or exit;

function chart_color(int $i): string
{
    return ['var(--accent)', 'var(--fg)', 'var(--info)', 'var(--success)', 'var(--warning)', '#8b5cf6', '#14b8a6', 'var(--subtle)'][$i % 8];
}

function chart_empty(string $text = 'No data available yet.'): string
{
    return '<div class="flex h-40 items-center justify-center rounded-xl border border-dashed border-line-strong text-sm text-subtle">' . e($text) . '</div>';
}

function chart_a11y(string $caption, array $data, callable $format): string
{
    $rows = implode('', array_map(fn($d) => '<tr><th scope="row">' . e($d['label']) . '</th><td>' . e($format($d['value'])) . '</td></tr>', $data));
    return '<table class="sr-only"><caption>' . e($caption) . '</caption><tbody>' . $rows . '</tbody></table>';
}

/** "2026-09" → "Sep" (with the year on January and the first bar). */
function chart_short_label(string $label, int $i): string
{
    if (preg_match('/^(\d{4})-(\d{2})$/', $label, $m)) {
        $mon = gmdate('M', gmmktime(0, 0, 0, (int)$m[2], 1, (int)$m[1]));
        return $i === 0 || $m[2] === '01' ? "{$mon} '" . substr($m[1], 2) : $mon;
    }
    return mb_strlen($label) > 10 ? mb_substr($label, 0, 9) . '…' : $label;
}

function chart_nice_max(float $v): float
{
    if ($v <= 0) {
        return 1;
    }
    $p = 10 ** floor(log10($v));
    $n = $v / $p;
    return ($n <= 1 ? 1 : ($n <= 2 ? 2 : ($n <= 5 ? 5 : 10))) * $p;
}

/** $data: [{label, value}] */
function bar_chart(array $data, string $label, ?callable $format = null, int $height = 200): string
{
    $format ??= fn($n) => (string)$n;
    if (!$data || !array_filter($data, fn($d) => $d['value'] != 0)) {
        return chart_empty();
    }
    $W = 640; $H = $height; $pl = 8; $pr = 8; $pt = 12; $pb = 26;
    $max = chart_nice_max(max(array_column($data, 'value')));
    $bw = ($W - $pl - $pr) / count($data);
    $svg = '<svg viewBox="0 0 ' . $W . ' ' . $H . '" role="img" aria-label="' . e($label) . '" class="h-auto w-full" preserveAspectRatio="none">';
    foreach ([0, 0.5, 1] as $g) {
        $y = $pt + ($H - $pt - $pb) * (1 - $g);
        $svg .= '<line x1="' . $pl . '" x2="' . ($W - $pr) . '" y1="' . $y . '" y2="' . $y . '" stroke="var(--line)"' . ($g ? ' stroke-dasharray="3 4"' : '') . '/>';
    }
    foreach ($data as $i => $d) {
        $h = (($H - $pt - $pb) * $d['value']) / $max;
        $x = $pl + $i * $bw + $bw * 0.18;
        $svg .= '<g><rect x="' . round($x, 2) . '" y="' . round($H - $pb - $h, 2) . '" width="' . round($bw * 0.64, 2) . '" height="' . round(max($h, $d['value'] ? 2 : 0), 2) . '" rx="4" fill="var(--accent)" opacity="0.92"><title>' . e($d['label'] . ': ' . $format($d['value'])) . '</title></rect>'
            . '<text x="' . round($x + $bw * 0.32, 2) . '" y="' . ($H - 8) . '" text-anchor="middle" font-size="11" fill="var(--subtle)">' . e(chart_short_label($d['label'], $i)) . '</text></g>';
    }
    return '<div>' . $svg . '</svg>' . chart_a11y($label, $data, $format) . '</div>';
}

function line_chart(array $data, string $label, ?callable $format = null, int $height = 180, string $color = 'var(--accent)'): string
{
    $format ??= fn($n) => (string)$n;
    if (count($data) < 2 || !array_filter($data, fn($d) => $d['value'] != 0)) {
        return chart_empty();
    }
    $W = 640; $H = $height; $pl = 8; $pr = 8; $pt = 14; $pb = 26; $n = count($data);
    $max = chart_nice_max(max(array_column($data, 'value')));
    $x = fn($i) => $pl + ($i * ($W - $pl - $pr)) / ($n - 1);
    $y = fn($v) => $pt + ($H - $pt - $pb) * (1 - $v / $max);
    $line = '';
    foreach ($data as $i => $d) {
        $line .= ($i ? 'L' : 'M') . round($x($i), 1) . ',' . round($y($d['value']), 1) . ' ';
    }
    $area = $line . 'L' . $x($n - 1) . ',' . ($H - $pb) . ' L' . $x(0) . ',' . ($H - $pb) . ' Z';
    $id = 'g' . substr(preg_replace('/\W/', '', $label), 0, 12) . substr(md5($label . json_enc($data)), 0, 4);
    $svg = '<svg viewBox="0 0 ' . $W . ' ' . $H . '" role="img" aria-label="' . e($label) . '" class="h-auto w-full" preserveAspectRatio="none"><defs><linearGradient id="' . $id . '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' . $color . '" stop-opacity="0.28"/><stop offset="1" stop-color="' . $color . '" stop-opacity="0"/></linearGradient></defs>';
    foreach ([0, 0.5, 1] as $g) {
        $gy = $pt + ($H - $pt - $pb) * (1 - $g);
        $svg .= '<line x1="' . $pl . '" x2="' . ($W - $pr) . '" y1="' . $gy . '" y2="' . $gy . '" stroke="var(--line)"' . ($g ? ' stroke-dasharray="3 4"' : '') . '/>';
    }
    $svg .= '<path d="' . $area . '" fill="url(#' . $id . ')"/><path d="' . trim($line) . '" fill="none" stroke="' . $color . '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
    $step = (int)ceil($n / 8);
    foreach ($data as $i => $d) {
        $svg .= '<g><circle cx="' . round($x($i), 1) . '" cy="' . round($y($d['value']), 1) . '" r="3.5" fill="var(--surface)" stroke="' . $color . '" stroke-width="2"><title>' . e($d['label'] . ': ' . $format($d['value'])) . '</title></circle>'
            . (($i % $step === 0 || $i === $n - 1) ? '<text x="' . round($x($i), 1) . '" y="' . ($H - 8) . '" text-anchor="middle" font-size="11" fill="var(--subtle)">' . e(chart_short_label($d['label'], $i)) . '</text>' : '') . '</g>';
    }
    return '<div>' . $svg . '</svg>' . chart_a11y($label, $data, $format) . '</div>';
}

function hbar_chart(array $data, string $label, ?callable $format = null, ?float $fixedMax = null): string
{
    $format ??= fn($n) => (string)$n;
    if (!$data) {
        return chart_empty();
    }
    $max = $fixedMax ?? max(1, ...array_column($data, 'value'));
    $h = '<ul class="space-y-2.5" aria-label="' . e($label) . '">';
    foreach ($data as $i => $d) {
        $h .= '<li><div class="mb-1 flex items-baseline justify-between gap-3 text-sm"><span class="truncate font-medium">' . e($d['label']) . '</span><span class="shrink-0 tabular-nums text-muted">' . e($format($d['value'])) . '</span></div>'
            . '<div class="h-2 overflow-hidden rounded-full bg-surface-2"><div class="h-full rounded-full" style="width:' . max(2, $d['value'] / $max * 100) . '%;background:' . chart_color($i) . '"></div></div></li>';
    }
    return '<div>' . $h . '</ul></div>';
}

function donut_chart(array $data, string $label, ?string $centerHtml = null): string
{
    $total = array_sum(array_column($data, 'value'));
    if (!$total) {
        return chart_empty();
    }
    $R = 52; $C = 2 * M_PI * $R; $acc = 0;
    $circles = '';
    foreach ($data as $i => $d) {
        $len = $d['value'] / $total * $C;
        $circles .= '<circle cx="70" cy="70" r="' . $R . '" fill="none" stroke="' . chart_color($i) . '" stroke-width="16" stroke-dasharray="' . round(max($len - 1.5, 0), 2) . ' ' . round($C, 2) . '" stroke-dashoffset="' . round(-$acc, 2) . '"><title>' . e($d['label'] . ': ' . $d['value']) . '</title></circle>';
        $acc += $len;
    }
    $legend = '';
    foreach ($data as $i => $d) {
        $legend .= '<li class="flex items-center gap-2"><span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:' . chart_color($i) . '"></span><span class="truncate">' . e($d['label']) . '</span><span class="ml-auto tabular-nums text-muted">' . e($d['value']) . '</span></li>';
    }
    return '<div class="flex flex-wrap items-center gap-6"><div class="relative h-36 w-36 shrink-0"><svg viewBox="0 0 140 140" role="img" aria-label="' . e($label) . '" class="h-full w-full -rotate-90"><circle cx="70" cy="70" r="' . $R . '" fill="none" stroke="var(--surface-2)" stroke-width="16"/>' . $circles . '</svg>'
        . ($centerHtml ? '<div class="absolute inset-0 flex flex-col items-center justify-center text-center">' . $centerHtml . '</div>' : '') . '</div><ul class="min-w-0 flex-1 space-y-1.5 text-sm">' . $legend . '</ul></div>';
}

function chart_card(string $title, string $bodyHtml, ?string $subtitle = null, ?string $actionHtml = null, string $class = ''): string
{
    return '<section class="' . e(cx('rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-soft', $class)) . '"><div class="mb-4 flex items-start justify-between gap-3"><div><h3 class="text-base font-extrabold leading-tight">' . e($title) . '</h3>' . ($subtitle ? '<p class="mt-0.5 text-xs text-subtle">' . e($subtitle) . '</p>' : '') . '</div>' . $actionHtml . '</div>' . $bodyHtml . '</section>';
}
