<?php
/** Building blocks for the public marketing pages (port of the previous site components). Every function returns an HTML string. */
defined('FEP') or exit;

/** Attributes that fade an element up as it scrolls into view (visible immediately without JavaScript — see layouts/document). */
function rv(int $delay = 0, string $class = ''): string
{
    return ' class="' . e(cx('opacity-0', $class)) . '" data-reveal' . ($delay ? ' style="animation-delay:' . $delay . 'ms"' : '');
}

/** <section> + container. $o: id, tone (default|alt|dark), class */
function sec_open(array $o = []): string
{
    $tone = $o['tone'] ?? 'default';
    return '<section' . (!empty($o['id']) ? ' id="' . e($o['id']) . '"' : '') . ' class="' . e(cx('relative py-20 sm:py-28', $tone === 'alt' ? 'bg-surface-2/50' : '', $tone === 'dark' ? 'dark-zone' : '', $o['class'] ?? '')) . '"><div class="container-page">';
}

function sec_close(): string { return '</div></section>'; }

/** $o: align (left|center), class, titleHtml (trusted markup replacing the escaped title) */
function section_heading(?string $eyebrow, string $title, ?string $description = null, array $o = []): string
{
    return '<div' . rv(0, cx('mb-12 max-w-2xl sm:mb-16', ($o['align'] ?? 'left') === 'center' ? 'mx-auto text-center' : '', $o['class'] ?? '')) . '>'
        . ($eyebrow ? '<div class="eyebrow mb-3 flex items-center gap-2 before:h-px before:w-6 before:bg-accent">' . e($eyebrow) . '</div>' : '')
        . '<h2 class="text-[clamp(1.9rem,4.4vw,3.2rem)] font-extrabold leading-[1.05] tracking-tight">' . ($o['titleHtml'] ?? e($title)) . '</h2>'
        . ($description ? '<p class="mt-4 text-base leading-relaxed text-muted sm:text-lg">' . e($description) . '</p>' : '') . '</div>';
}

/** Interior page hero. $childrenHtml is trusted markup (buttons etc). */
function page_hero(?string $eyebrow, string $title, ?string $description = null, ?string $childrenHtml = null): string
{
    return '<div class="dark-zone grain relative isolate overflow-hidden border-b border-line"><div aria-hidden="true" class="pointer-events-none absolute -right-32 -top-40 h-[28rem] w-[28rem] rounded-full bg-accent/20 blur-[110px]"></div>'
        . '<div class="container-page relative py-20 sm:py-28"><div' . rv(0, 'max-w-3xl') . '>'
        . ($eyebrow ? '<div class="eyebrow mb-4 flex items-center gap-2 before:h-px before:w-6 before:bg-accent">' . e($eyebrow) . '</div>' : '')
        . '<h1 class="display text-[clamp(2.4rem,6vw,4.6rem)]">' . e($title) . '</h1>'
        . ($description ? '<p class="mt-6 max-w-2xl text-lg leading-relaxed text-muted">' . e($description) . '</p>' : '')
        . ($childrenHtml ? '<div class="mt-8">' . $childrenHtml . '</div>' : '') . '</div></div></div>';
}

/** Outline button used on dark hero backgrounds. */
function ghost_link(string $href, string $label, array $o = []): string
{
    return ui_link($href, $label, ['variant' => 'outline', 'class' => cx('border-white/20 text-white hover:bg-white/10', $o['class'] ?? '')] + $o);
}

function price_from(array $s): string
{
    return !empty($s['startingPrice']) ? 'From ' . money((int)$s['startingPrice'], $s['currency'] ?: 'USD', true) : ($s['priceLabel'] ?: 'Custom quote');
}

function service_card(array $s, bool $compact = false): string
{
    $deliv = array_slice((array)($s['deliverables'] ?? []), 0, 4);
    $h = '<a href="/services/' . e($s['slug']) . '" class="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-6 transition duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-lift">'
        . '<div aria-hidden="true" class="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/0 blur-2xl transition duration-500 group-hover:bg-accent/25"></div>'
        . '<div class="mb-5 flex items-start justify-between"><span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-fg transition group-hover:bg-accent group-hover:text-accent-fg">' . icon($s['icon'] ?: 'film', 22) . '</span>'
        . icon('arrow-up-right', 18, 'text-subtle transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg') . '</div>'
        . '<h3 class="text-lg font-extrabold tracking-tight">' . e($s['title']) . '</h3><p class="mt-2 text-sm leading-relaxed text-muted">' . e($s['shortDescription']) . '</p>';
    if (!$compact) {
        if (!empty($s['useCase'])) {
            $h .= '<p class="mt-4 text-xs text-subtle"><span class="font-semibold text-muted">Typical use · </span>' . e($s['useCase']) . '</p>';
        }
        if ($deliv) {
            $h .= '<ul class="mt-4 flex flex-wrap gap-1.5">' . implode('', array_map(fn($d) => '<li class="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted">' . e($d) . '</li>', $deliv)) . '</ul>';
        }
    }
    return $h . '<div class="mt-auto flex items-center justify-between border-t border-line pt-4 text-xs"><span class="font-bold">' . e(price_from($s)) . '</span>'
        . (!empty($s['turnaround']) ? '<span class="inline-flex items-center gap-1 text-subtle">' . icon('clock', 12) . e($s['turnaround']) . '</span>' : '') . '</div></a>';
}

function plan_card(array $p): string
{
    $n = fn($v) => $v !== null && $v !== '';
    $inc = [];
    $add = function (bool $on, string $label) use (&$inc) {
        if ($on && trim($label) !== '') {
            $inc[] = $label;
        }
    };
    $add($n($p['includedVideos']), $p['includedVideos'] . ' video' . ((int)$p['includedVideos'] === 1 ? '' : 's') . ' included');
    $add($n($p['includedShorts']), $p['includedShorts'] . ' short' . ((int)$p['includedShorts'] === 1 ? '' : 's') . ' included');
    $add($n($p['hoursIncluded']), $p['hoursIncluded'] . ' editing hours');
    $add($n($p['includedRevisions']), $p['includedRevisions'] . ' revision round' . ((int)$p['includedRevisions'] === 1 ? '' : 's'));
    $add(!empty($p['turnaround']), $p['turnaround'] . ' turnaround');
    $add(!empty($p['resolution']), (string)$p['resolution']);
    $add(!empty($p['motionGraphics']), 'Motion graphics');
    $add(!empty($p['captions']), 'Captions');
    $add(!empty($p['soundDesign']), 'Sound design');
    $add(!empty($p['prioritySupport']), 'Priority support');
    $add(!empty($p['dedicatedEditor']), 'Dedicated editor');
    $add($n($p['storageGb']), $p['storageGb'] . ' GB storage');
    foreach ((array)($p['features'] ?? []) as $f) {
        $add(true, (string)$f);
    }
    $seen = [];
    $inc = array_values(array_filter($inc, function ($l) use (&$seen) { // the same phrase can come from a field and the free-text list
        $k = mb_strtolower(trim($l));
        return isset($seen[$k]) ? false : ($seen[$k] = true);
    }));
    $billing = ['ONE_TIME' => 'per project', 'PER_VIDEO' => 'per video', 'PER_SHORT' => 'per short', 'MONTHLY_RETAINER' => 'per month', 'HOURLY' => 'per hour', 'CUSTOM_QUOTE' => ''];
    $custom = $p['billingType'] === 'CUSTOM_QUOTE' || $p['price'] === null;
    $hi = !empty($p['highlighted']);
    $h = '<div class="' . e(cx('relative flex h-full flex-col rounded-[var(--radius-card)] border p-7', $hi ? 'border-accent bg-surface shadow-[0_0_0_1px_var(--accent),0_30px_80px_-30px_color-mix(in_srgb,var(--accent)_50%,transparent)]' : 'border-line bg-surface shadow-soft')) . '">'
        . ($hi ? '<span class="absolute -top-3 left-7 rounded-full bg-accent px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-accent-fg">Most popular</span>' : '')
        . (!empty($p['tier']) ? '<div class="eyebrow">' . e($p['tier']) . '</div>' : '') . '<h3 class="mt-1 text-2xl font-extrabold tracking-tight">' . e($p['name']) . '</h3>'
        . (!empty($p['description']) ? '<p class="mt-2 min-h-10 text-sm text-muted">' . e($p['description']) . '</p>' : '')
        . '<div class="mt-6 flex items-baseline gap-2">' . ($custom ? '<span class="text-4xl font-extrabold tracking-tight">Custom</span>'
            : '<span class="text-4xl font-extrabold tracking-tight tabular-nums">' . e(money((int)$p['price'], $p['currency'] ?: 'USD', true)) . '</span><span class="text-sm text-muted">' . e($p['priceNote'] ?: ($billing[$p['billingType']] ?? '')) . '</span>') . '</div>'
        . '<div class="mt-1 text-xs text-subtle">' . e(title_case(strtolower(str_replace('_', ' ', $p['billingType'])))) . '</div>'
        . '<ul class="mt-6 space-y-3 border-t border-line pt-6 text-sm">' . implode('', array_map(fn($l) => '<li class="flex gap-3">' . icon('check-circle', 17, 'mt-px shrink-0 text-accent-text') . '<span>' . e($l) . '</span></li>', $inc)) . '</ul>'
        . '<div class="mt-auto pt-8">' . ui_link('/start-project?plan=' . rawurlencode($p['name']), $p['ctaLabel'] ?: ($custom ? 'Request a quote' : 'Get started'), ['variant' => $hi ? 'primary' : 'outline', 'class' => 'w-full']) . '</div></div>';
    return $h;
}

function testimonial_card(array $t): string
{
    $stars = '';
    for ($i = 0; $i < 5; $i++) {
        $stars .= icon('star', 16, $i < (int)$t['rating'] ? 'fill-current' : 'opacity-25');
    }
    return '<figure class="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-7 shadow-soft"><div class="flex gap-0.5 text-accent-text" role="img" aria-label="' . (int)$t['rating'] . ' out of 5 stars">' . $stars . '</div>'
        . '<blockquote class="mt-4 flex-1 text-[15px] leading-relaxed">“' . e($t['quote']) . '”</blockquote>'
        . '<figcaption class="mt-6 flex items-center gap-3 border-t border-line pt-5">' . (!empty($t['imageUrl']) ? '<img src="' . e($t['imageUrl']) . '" alt="" class="h-10 w-10 rounded-full object-cover" loading="lazy">'
            : '<span aria-hidden="true" class="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-sm font-bold">' . e(mb_substr($t['name'], 0, 1)) . '</span>')
        . '<span class="text-sm"><span class="block font-bold">' . e($t['name']) . '</span><span class="block text-xs text-muted">' . e(implode(' · ', array_filter([$t['role'] ?? '', $t['company'] ?? '']))) . '</span></span></figcaption></figure>';
}

/** Accessible accordion on native <details>. $items: [{question, answer(markdown)}] */
function faq_list(array $items): string
{
    $h = '<div class="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">';
    foreach ($items as $f) {
        $h .= '<details class="group px-5 py-1 sm:px-6"><summary class="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-[15px] font-bold marker:hidden [&::-webkit-details-marker]:hidden">' . e($f['question'])
            . '<span aria-hidden="true" class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-lg leading-none transition group-open:rotate-45 group-open:bg-accent group-open:text-accent-fg">+</span></summary>'
            . '<div class="prose-lite pb-5 pr-10 text-sm text-muted">' . render_markdown($f['answer']) . '</div></details>';
    }
    return $h . '</div>';
}

/** YouTube / Vimeo page URL → privacy-friendly embed URL, or null for a direct video file. */
function embed_url(string $url): ?string
{
    if (preg_match('#(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/)|youtu\.be/)([A-Za-z0-9_-]{6,20})#', $url, $m)) {
        return 'https://www.youtube-nocookie.com/embed/' . $m[1] . '?rel=0';
    }
    if (preg_match('#vimeo\.com/(?:video/)?(\d+)#', $url, $m)) {
        return 'https://player.vimeo.com/video/' . $m[1];
    }
    return null;
}

function before_after(string $before, string $after): string
{
    $fig = fn($label, $src, $muted) => '<figure class="relative overflow-hidden rounded-2xl bg-black"><video data-src="' . e($src) . '"' . ($muted ? ' muted' : '') . ' playsinline loop preload="none" class="aspect-video w-full object-cover"></video>'
        . '<figcaption class="absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-bold ' . ($label === 'After' ? 'bg-accent text-accent-fg' : 'bg-black/70 text-white') . '">' . $label . '</figcaption></figure>';
    return '<div data-fe-component="before-after"><div class="grid grid-cols-1 gap-3 sm:grid-cols-2">' . $fig('Before', $before, true) . $fig('After', $after, false)
        . '</div><button type="button" data-ba-toggle class="mt-3 rounded-xl bg-fg px-5 py-2.5 text-sm font-bold text-bg hover:opacity-90">Play both</button></div>';
}

/** A portfolio row in the shape the work grid and its dialogs use. */
function work_item(array $w): array
{
    $cs = $w['caseStudy'] ?? null;
    return [
        'id' => $w['id'], 'slug' => $w['slug'], 'title' => $w['title'], 'clientName' => $w['clientName'], 'industry' => $w['industry'], 'category' => $w['category'], 'projectType' => $w['projectType'],
        'platforms' => (array)$w['platforms'], 'thumbnailUrl' => $w['thumbnailUrl'], 'videoUrl' => $w['videoUrl'], 'beforeVideoUrl' => $w['beforeVideoUrl'], 'afterVideoUrl' => $w['afterVideoUrl'],
        'description' => $w['description'], 'caseStudySlug' => $cs && $cs['status'] === 'PUBLISHED' ? $cs['slug'] : null, 'isDemo' => !empty($w['isDemo']),
    ];
}

/** Filterable grid of projects; each card opens a dialog with the video (loaded only when opened). $items are work_item() rows. */
function work_grid(array $items, array $categories): string
{
    $h = '<div data-fe-component="work-grid">';
    if ($categories) {
        $h .= '<div role="tablist" aria-label="Filter work by category" class="scroll-x -mx-1 mb-8 flex gap-2 px-1 pb-2">';
        foreach (array_merge(['All'], $categories) as $k => $c) {
            $h .= '<button role="tab" type="button" data-cat="' . e($c) . '" aria-selected="' . ($k === 0 ? 'true' : 'false') . '" class="' . e(cx('shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition', $k === 0 ? 'border-fg bg-fg text-bg' : 'border-line-strong text-muted hover:border-subtle hover:text-fg')) . '">' . e($c) . '</button>';
        }
        $h .= '</div>';
    }
    $h .= '<ul class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">';
    $modals = '';
    foreach ($items as $w) {
        $h .= '<li data-cat="' . e($w['category']) . '" id="' . e($w['slug']) . '" class="group overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface transition duration-300 hover:-translate-y-1 hover:shadow-lift">'
            . '<button type="button" data-modal-open="#work-' . e($w['id']) . '" aria-label="Open ' . e($w['title']) . '" class="relative block aspect-video w-full overflow-hidden bg-surface-2 text-left">'
            . ($w['thumbnailUrl'] ? '<img src="' . e($w['thumbnailUrl']) . '" alt="" loading="lazy" decoding="async" class="h-full w-full object-cover transition duration-500 group-hover:scale-105">'
                : '<span class="flex h-full w-full items-center justify-center bg-[radial-gradient(80%_100%_at_30%_0%,color-mix(in_srgb,var(--accent)_30%,var(--surface-2)),var(--surface-2))]">' . icon('film', 40, 'text-subtle') . '</span>')
            . ($w['videoUrl'] ? '<span class="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/30"><span class="flex h-14 w-14 scale-90 items-center justify-center rounded-full bg-accent text-accent-fg opacity-0 shadow-xl transition group-hover:scale-100 group-hover:opacity-100">' . icon('play', 22, 'ml-0.5') . '</span></span>' : '')
            . ($w['beforeVideoUrl'] && $w['afterVideoUrl'] ? '<span class="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">Before / After</span>' : '')
            . ($w['isDemo'] ? '<span class="absolute right-3 top-3 rounded-full bg-warning px-2 py-0.5 text-[10px] font-extrabold uppercase text-warning-fg">Demo</span>' : '') . '</button>'
            . '<div class="p-5"><div class="mb-2 flex flex-wrap gap-1.5">' . ui_badge($w['category'], 'neutral', '', false, false) . ($w['projectType'] ? ui_badge(title_case(str_replace('_', ' ', $w['projectType'])), 'neutral', '', false, false) : '') . '</div>'
            . '<h3 class="text-base font-extrabold leading-snug">' . e($w['title']) . '</h3><p class="mt-1 text-sm text-muted">' . e(implode(' · ', array_filter([$w['clientName'], $w['industry']]))) . '</p>'
            . ($w['platforms'] ? '<p class="mt-3 text-xs text-subtle">' . e(implode(' · ', $w['platforms'])) . '</p>' : '')
            . ($w['caseStudySlug'] ? '<a href="/case-studies/' . e($w['caseStudySlug']) . '" class="mt-4 inline-flex items-center gap-1.5 text-sm font-bold hover:text-accent-text">View case study ' . icon('arrow', 14) . '</a>' : '') . '</div></li>';
        if ($w['beforeVideoUrl'] && $w['afterVideoUrl']) {
            $media = before_after($w['beforeVideoUrl'], $w['afterVideoUrl']);
        } elseif ($w['videoUrl']) {
            $emb = embed_url($w['videoUrl']);
            $media = $emb ? '<iframe data-src="' . e($emb) . '" title="' . e($w['title']) . '" allow="fullscreen; picture-in-picture" class="aspect-video w-full rounded-2xl"></iframe>'
                : '<video data-src="' . e($w['videoUrl']) . '" controls playsinline preload="none"' . ($w['thumbnailUrl'] ? ' poster="' . e($w['thumbnailUrl']) . '"' : '') . ' class="aspect-video w-full rounded-2xl bg-black"></video>';
        } else {
            $media = '<p class="rounded-xl bg-surface-2 p-6 text-center text-sm text-muted">No preview available for this project yet.</p>';
        }
        $modals .= ui_modal('work-' . $w['id'], $w['title'], '<div class="space-y-4">' . $media . ($w['description'] ? '<p class="text-sm leading-relaxed text-muted">' . e($w['description']) . '</p>' : '')
            . ($w['caseStudySlug'] ? '<a href="/case-studies/' . e($w['caseStudySlug']) . '" class="inline-flex items-center gap-1.5 font-bold hover:text-accent-text">Read the full case study ' . icon('arrow', 14) . '</a>' : '') . '</div>',
            ['size' => 'lg', 'description' => implode(' · ', array_filter([$w['clientName'], $w['industry']]))]);
    }
    return $h . '</ul><p data-work-empty hidden class="rounded-2xl border border-dashed border-line-strong p-10 text-center text-muted">No projects in this category yet.</p>' . $modals . '</div>';
}

/** Animated, abstract "editor timeline" — decorative, contains no invented footage or numbers. */
function timeline_art(): string
{
    $tracks = [['w' => [22, 30, 18, 24], 'c' => 'bg-accent'], ['w' => [30, 14, 34, 16], 'c' => 'bg-fg/80'], ['w' => [16, 26, 22, 28], 'c' => 'bg-fg/35'], ['w' => [40, 20, 26], 'c' => 'bg-accent/55']];
    $rows = '';
    foreach ($tracks as $t) {
        $rows .= '<div class="flex gap-1">' . implode('', array_map(fn($w) => '<div style="width:' . $w . '%" class="h-2.5 rounded-[4px] ' . $t['c'] . '"></div>', $t['w'])) . '</div>';
    }
    return '<div class="absolute inset-0 flex flex-col bg-[radial-gradient(90%_120%_at_20%_0%,color-mix(in_srgb,var(--accent)_28%,#0b0b0d),#08080a_60%)]"><div class="relative flex-1">'
        . '<div class="absolute inset-6 rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,.07),rgba(255,255,255,.01))]"></div>'
        . '<div class="absolute inset-6 flex items-center justify-center"><div class="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20 backdrop-blur-md">' . icon('play', 26, 'ml-0.5 text-white') . '</div></div>'
        . '<div class="absolute bottom-8 left-8 flex items-center gap-2 font-mono text-[11px] text-white/60"><span class="h-1.5 w-1.5 animate-pulse rounded-full bg-accent"></span> 00:00:14:08</div>'
        . '<div class="absolute right-8 top-8 rounded-md bg-white/10 px-2 py-1 font-mono text-[10px] text-white/70 backdrop-blur">4K · 24fps</div></div>'
        . '<div class="relative border-t border-white/10 bg-black/40 px-4 py-3 backdrop-blur"><div class="space-y-1.5">' . $rows . '</div>'
        . '<div class="absolute inset-y-2 w-px animate-playhead bg-white shadow-[0_0_12px_2px_rgba(255,255,255,.55)]"><span class="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-white"></span></div></div></div>';
}

function hero_visual(?string $showreelUrl, ?string $posterUrl, array $cards): string
{
    $pos = ['left-[-3%] top-[8%] sm:left-[-9%]', 'right-[-2%] top-[-4%] sm:right-[-7%]', 'left-[2%] bottom-[-5%] sm:left-[-6%]', 'right-[2%] bottom-[10%] sm:right-[-8%]'];
    $delay = ['0s', '-2s', '-4s', '-1s'];
    $inner = timeline_art();
    if ($showreelUrl) {
        $emb = embed_url($showreelUrl);
        $inner = '<button type="button" data-showreel data-' . ($emb ? 'embed="' . e(str_replace('rel=0', 'rel=0&autoplay=1', $emb) . (str_contains($emb, '?') ? '' : '?autoplay=1')) : 'video="' . e($showreelUrl)) . '" aria-label="Play the studio showreel" class="group absolute inset-0 block w-full">'
            . ($posterUrl ? '<img src="' . e($posterUrl) . '" alt="" class="absolute inset-0 h-full w-full object-cover" decoding="async">' : timeline_art())
            . '<span class="absolute inset-0 flex items-center justify-center bg-black/25 transition group-hover:bg-black/10"><span class="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-accent-fg shadow-2xl transition group-hover:scale-105">' . icon('play', 30, 'ml-1') . '</span></span></button>';
    }
    $h = '<div class="relative mx-auto w-full max-w-[34rem] lg:max-w-none"><div class="relative aspect-[16/11] overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-[0_40px_120px_-30px_color-mix(in_srgb,var(--accent)_55%,transparent)] ring-1 ring-white/5">' . $inner . '</div>';
    foreach (array_slice($cards, 0, 4) as $i => $c) {
        $h .= '<div style="animation-delay:' . $delay[$i] . '" class="' . e(cx('absolute z-10 hidden animate-float items-center gap-3 rounded-2xl border border-white/10 bg-[#111114]/85 px-3.5 py-3 text-white shadow-2xl backdrop-blur-xl sm:flex', $pos[$i])) . '">'
            . '<span class="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/90 text-accent-fg">' . icon($c['icon'], 17) . '</span><span><span class="block text-[13px] font-bold leading-tight">' . e($c['title']) . '</span><span class="block text-[11px] text-white/55">' . e($c['sub']) . '</span></span></div>';
    }
    return $h . '</div>';
}

/** Card-style list of centred icon + title + body blocks used on several pages. $rows: [[icon, title, body]] */
function icon_cards(array $rows, string $cols = 'md:grid-cols-3'): string
{
    $h = '<div class="grid grid-cols-1 gap-5 ' . e($cols) . '">';
    foreach ($rows as [$ic, $t, $b]) {
        $h .= '<div class="rounded-[var(--radius-card)] border border-line bg-surface p-6">' . icon($ic, 22, 'text-accent-text') . '<h3 class="mt-3 font-extrabold">' . e($t) . '</h3><p class="mt-2 text-sm leading-relaxed text-muted">' . e($b) . '</p></div>';
    }
    return $h . '</div>';
}

/** Cloudflare Turnstile placeholder inside a form; renders nothing unless both keys are configured. */
function turnstile_field(): string
{
    if (!turnstile_enabled()) {
        return '';
    }
    return '<input type="hidden" name="turnstile"><div data-fe-component="turnstile" data-props="' . json_attr(['siteKey' => cfg('turnstile.site_key')]) . '" class="min-h-[65px]"></div>';
}

/** Structured-data list → the `jsonLd` meta entry, with "@context" filled in. */
function ld(array ...$items): array
{
    return array_map(fn($i) => ['@context' => 'https://schema.org'] + $i, $items);
}
