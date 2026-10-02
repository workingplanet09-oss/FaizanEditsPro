<?php
/** Building blocks shared by the client portal, admin console and editor workspace (port of components/portal/common). */
defined('FEP') or exit;

/** Greeting for the visitor's local time of day; the browser stores its zone in the fe_tz cookie. */
function viewer_greeting(): string
{
    $tz = isset($_COOKIE['fe_tz']) ? rawurldecode((string)$_COOKIE['fe_tz']) : '';
    try {
        $hour = $tz !== '' ? (int)(new DateTimeImmutable('now', new DateTimeZone($tz)))->format('G') : null;
    } catch (Throwable) {
        $hour = null; // unknown zone name
    }
    return greeting_for($hour);
}

/** Page number from a query string. */
function page_num(mixed $v, int $d = 1): int
{
    $n = (int)$v;
    return $n > 0 ? $n : $d;
}

/** Badge for any status enum: quote, invoice, contract, revision, task, lead, client, retainer, priority. */
function meta_badge(string $kind, ?string $value, string $class = ''): string
{
    $m = meta_for($kind, $value);
    return ui_badge($m['label'], $m['tone'], $class);
}

function temperature_badge(string $value, bool $overridden = false): string
{
    $m = meta_for('TEMPERATURE', $value);
    return ui_badge($m['label'] . ($overridden ? ' ✎' : ''), $m['tone'], '', $value === 'HOT' ? 'zap' : ($value === 'WARM' ? 'trending' : ($value === 'COLD' ? 'clock' : 'help')));
}

/** The 7-step journey shown to clients. */
function client_stepper(string $status, bool $compact = false): string
{
    $idx = $status === 'CANCELLED' ? -1 : client_step_index($status);
    $done = in_array($status, ['DELIVERED', 'ARCHIVED'], true);
    $h = '<ol class="' . ($compact ? 'grid grid-cols-7 gap-1' : 'grid grid-cols-7 gap-1 sm:gap-2') . '" aria-label="Project progress">';
    foreach (client_steps() as $i => $s) {
        $state = $done || $i < $idx ? 'done' : ($i === $idx ? 'current' : 'todo');
        $h .= '<li' . ($state === 'current' ? ' aria-current="step"' : '') . ' class="min-w-0"><div class="h-1.5 rounded-full ' . ($state === 'todo' ? 'bg-surface-2' : ($state === 'current' ? 'bg-accent' : 'bg-fg')) . '"></div>'
            . (!$compact ? '<div class="mt-2 truncate text-xs font-semibold ' . ($state === 'current' ? 'text-fg' : 'text-subtle') . '"><span class="sr-only">' . ($state === 'done' ? 'Completed: ' : ($state === 'current' ? 'Current: ' : 'Upcoming: ')) . '</span>' . e($s['label']) . '</div>' : '') . '</li>';
    }
    return $h . '</ol>';
}

/** $p: id, code, name, status, deadline, service?, editor?, latestVersion? */
function project_card(array $p, string $base = '/dashboard'): string
{
    $meta = status_meta($p['status']);
    $left = days_until($p['deadline']);
    $late = $left !== null && $left < 0 && !in_array($p['status'], ['DELIVERED', 'ARCHIVED', 'CANCELLED', 'APPROVED'], true);
    $reviewable = !empty($p['latestVersion']) && in_array($p['status'], ['CLIENT_REVIEW', 'FINAL_REVIEW'], true);
    $deadline = $p['deadline'] ? (in_array($p['status'], ['DELIVERED', 'ARCHIVED'], true) ? 'Delivered' : relative_deadline($p['deadline'])) : 'No deadline yet';
    return '<div class="group relative flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-soft transition duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift">'
        . '<div class="flex items-start justify-between gap-3"><div class="min-w-0"><div class="text-xs font-bold text-subtle">' . e($p['code'] . (!empty($p['service']) ? ' · ' . $p['service'] : '')) . '</div>'
        . '<h3 class="mt-1 text-[17px] font-bold leading-snug tracking-tight"><a href="' . e($base . '/projects/' . $p['id']) . '" class="after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-offset-4">' . e($p['name']) . '</a></h3></div>' . status_badge($p['status'], 'STATUS', true) . '</div>'
        . '<p class="mt-2 line-clamp-2 min-h-[2.5rem] text-sm text-muted">' . e($meta['clientNow']) . '</p><div class="mt-4">' . client_stepper($p['status'], true) . '</div>'
        . '<div class="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3 text-xs text-muted"><span class="flex min-w-0 items-center gap-1.5">'
        . (!empty($p['editor']) ? ui_avatar($p['editor'], null, 20) . '<span class="truncate">' . e($p['editor']) . '</span>' : '<span class="text-subtle">Editor being assigned</span>') . '</span>'
        . '<span class="shrink-0 font-semibold ' . ($late ? 'text-danger' : 'text-muted') . '">' . e($deadline) . '</span></div>'
        . ($reviewable ? '<a href="' . e($base . '/projects/' . $p['id'] . '/review/' . $p['latestVersion']['id']) . '" class="relative z-10 mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-accent-fg transition hover:bg-accent-hover">' . icon('play', 15) . ' Review ' . e($p['latestVersion']['label']) . '</a>' : '')
        . '</div>';
}

/** $items: [{id, message, at, by?, project?{id,name}, internal?}] */
function activity_feed(array $items, bool $showProject = true, string $empty = 'Nothing has happened yet.', string $projectBase = '/dashboard/projects/'): string
{
    if (!$items) {
        return '<p class="px-5 py-8 text-center text-sm text-subtle">' . e($empty) . '</p>';
    }
    $h = '<ol class="relative space-y-0 px-5 pb-2"><span aria-hidden="true" class="absolute bottom-4 left-[29px] top-3 w-px bg-line"></span>';
    foreach ($items as $a) {
        $h .= '<li class="relative flex gap-3 py-2.5"><span aria-hidden="true" class="z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-surface ' . (!empty($a['internal']) ? 'bg-warning' : 'bg-accent') . '" style="box-shadow:0 0 0 3px var(--surface)"></span>'
            . '<div class="min-w-0 flex-1"><p class="text-sm leading-snug">' . e($a['message']) . (!empty($a['internal']) ? '<span class="ml-2 rounded bg-warning-soft px-1.5 py-0.5 text-xs font-bold text-warning">Internal</span>' : '') . '</p>'
            . '<p class="mt-0.5 text-xs text-subtle">' . ago($a['at']) . (!empty($a['by']) ? ' · ' . e($a['by']) : '')
            . ($showProject && !empty($a['project']) ? ' · <a class="hover:text-fg hover:underline" href="' . e($projectBase . $a['project']['id']) . '">' . e($a['project']['name']) . '</a>' : '') . '</p></div></li>';
    }
    return $h . '</ol>';
}

const ATTN_ICON = ['quote' => 'clipboard', 'contract' => 'sign', 'invoice' => 'receipt', 'setup' => 'rocket', 'files' => 'upload', 'review' => 'play', 'approve' => 'check-circle', 'download' => 'download'];

function attention_list(array $items): string
{
    $tone = ['warning' => 'border-warning/30 bg-warning-soft/60', 'success' => 'border-success/30 bg-success-soft/60', 'accent' => 'border-accent/40 bg-accent-soft/60'];
    $h = '<ul class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">';
    foreach ($items as $a) {
        $h .= '<li><a href="' . e($a['href']) . '" class="group flex h-full items-start gap-3.5 rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-lift ' . ($tone[$a['tone']] ?? $tone['accent']) . '">'
            . '<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface shadow-soft">' . icon(ATTN_ICON[$a['kind']] ?? 'bell', 18) . '</span><span class="min-w-0 flex-1"><span class="block text-sm font-bold leading-snug">' . e($a['title']) . '</span>'
            . '<span class="mt-0.5 block truncate text-xs text-muted">' . e($a['detail']) . '</span><span class="mt-2 inline-flex items-center gap-1 text-xs font-bold group-hover:underline">' . e($a['cta']) . ' ' . icon('arrow', 12) . '</span></span></a></li>';
    }
    return $h . '</ul>';
}

function progress_row(string $label, int|float $used, int|float $total, string $unit = ''): string
{
    $pct = $total ? min(100, round($used / $total * 100)) : 0;
    return '<div><div class="mb-1 flex justify-between text-xs"><span class="font-semibold">' . e($label) . '</span><span class="text-muted">' . e($used . $unit . ' of ' . $total . $unit) . '</span></div>' . ui_progress($pct, '', "{$label}: {$used} of {$total}") . '</div>';
}

/** A titled card wrapper: card_class() + optional header. */
function card(string $bodyHtml, string $class = '', ?string $title = null, ?string $description = null, ?string $actionHtml = null): string
{
    return '<div class="' . e(card_class($class)) . '">' . ($title ? ui_card_header($title, $description, $actionHtml) : '') . $bodyHtml . '</div>';
}

/** "Getting started" checklist card. */
function checklist_card(array $c): string
{
    $pct = $c['total'] ? round($c['done'] / $c['total'] * 100) : 0;
    $h = '<div class="px-6 pb-6"><div class="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-2"><div class="h-full rounded-full bg-accent" style="width:' . $pct . '%"></div></div><ul class="space-y-1.5">';
    foreach ($c['items'] as $i) {
        if (!empty($i['done']) || empty($i['href'])) {
            $h .= '<li><div class="flex items-center gap-2.5 py-1 text-sm"><span class="' . (!empty($i['done']) ? 'text-success' : 'text-subtle') . '">' . icon(!empty($i['done']) ? 'check-circle' : 'clock', 16) . '</span><span class="' . (!empty($i['done']) ? 'text-muted line-through decoration-line-strong' : '') . '">' . e($i['label']) . '</span></div></li>';
        } else {
            $h .= '<li><a href="' . e($i['href']) . '" class="group flex items-center gap-2.5 rounded-lg py-1 text-sm hover:text-accent-text"><span class="text-subtle">' . icon('clock', 16) . '</span><span class="flex-1 font-medium">' . e($i['label']) . '</span>' . icon('chevron-right', 14, 'text-subtle group-hover:text-accent-text') . '</a></li>';
        }
    }
    return card($h . '</ul></div>', '', 'Getting started', "{$c['done']} of {$c['total']} done");
}
