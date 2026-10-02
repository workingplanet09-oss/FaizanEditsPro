<?php
/** Building blocks for the public marketing pages (port of the previous site components). Every function returns an HTML string. */
defined('FEP') or exit;

/** Attributes that fade an element up as it scrolls into view (visible immediately without JavaScript — see layouts/document). */
function rv(int $delay = 0, string $class = ''): string
{
    return ($class !== '' ? ' class="' . e($class) . '"' : '') . ' data-reveal' . ($delay ? ' style="animation-delay:' . $delay . 'ms"' : '');
}

/** <section> + container. $o: id, tone (default|alt|dark), class */
function sec_open(array $o = []): string
{
    $tone = $o['tone'] ?? 'default';
    return '<section' . (!empty($o['id']) ? ' id="' . e($o['id']) . '"' : '') . ' class="' . e(cx('relative section-y', $tone === 'alt' ? 'bg-surface-2/60' : '', $tone === 'dark' ? 'dark-zone' : '', $o['class'] ?? '')) . '"><div class="container-page">';
}

function sec_close(): string { return '</div></section>'; }

/** $o: align (left|center), class, titleHtml (trusted markup replacing the escaped title) */
function section_heading(?string $eyebrow, string $title, ?string $description = null, array $o = []): string
{
    $center = ($o['align'] ?? 'left') === 'center';
    return '<div' . rv(0, cx('mb-10 max-w-2xl sm:mb-14', $center ? 'mx-auto text-center' : '', $o['class'] ?? '')) . '>'
        . ($eyebrow ? '<div class="eyebrow mb-3">' . e($eyebrow) . '</div>' : '')
        . '<h2 class="h-section">' . ($o['titleHtml'] ?? e($title)) . '</h2>'
        . ($description ? '<p class="measure mt-4 text-base leading-relaxed text-muted sm:text-lg' . ($center ? ' mx-auto' : '') . '">' . e($description) . '</p>' : '') . '</div>';
}

/** Interior page hero: light, quiet, navy headline. $childrenHtml is trusted markup (buttons etc). */
function page_hero(?string $eyebrow, string $title, ?string $description = null, ?string $childrenHtml = null): string
{
    return '<div class="border-b border-line bg-bg"><div class="container-page py-14 sm:py-20"><div' . rv(0, 'max-w-3xl') . '>'
        . ($eyebrow ? '<div class="eyebrow mb-4">' . e($eyebrow) . '</div>' : '')
        . '<h1 class="display-sm">' . e($title) . '</h1>'
        . ($description ? '<p class="measure mt-5 text-lg leading-relaxed text-muted">' . e($description) . '</p>' : '')
        . ($childrenHtml ? '<div class="mt-8">' . $childrenHtml . '</div>' : '') . '</div></div></div>';
}

/** Secondary button for NAVY (dark-zone) backgrounds: transparent, white text, visible border. On light backgrounds use ui_link(…, ['variant' => 'outline']). */
function ghost_link(string $href, string $label, array $o = []): string
{
    return ui_link($href, $label, ['variant' => 'outline', 'class' => cx('!border-white/50 !bg-transparent !text-white hover:!bg-white/10', $o['class'] ?? '')] + $o);
}

/** Navy call-to-action band that closes a page. $buttons is trusted markup. */
function cta_band(string $title, string $text, string $buttons): string
{
    return '<section class="dark-zone"><div class="container-page py-14 sm:py-20"><div' . rv(0, 'flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center') . '>'
        . '<div class="max-w-2xl"><h2 class="h-section">' . e($title) . '</h2><p class="mt-4 text-lg leading-relaxed text-muted">' . e($text) . '</p></div>'
        . '<div class="flex flex-wrap gap-3">' . $buttons . '</div></div></div></section>';
}

/** "FA" monogram (the favicon mark) as inline SVG. */
function monogram_svg(int $size = 64): string
{
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="' . $size . '" height="' . $size . '" role="img" aria-label="FA monogram"><rect width="64" height="64" rx="14" fill="#10213D"/>'
        . '<path d="M15 46V18h13M15 31.5h10M30 46l9.5-28L49 46M33.5 37h12" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
        . '<path d="M54 44v10H44" fill="none" stroke="#2457E6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

/** The portrait slot of the home page and About page: the owner's real photo, or a quiet monogram card until one is uploaded (never a stock image). */
function brand_portrait(array $b, string $class = ''): string
{
    $frame = cx('crop-frame relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-[var(--radius-card)] bg-surface-2', $class);
    if (!empty($b['portraitUrl'])) {
        return '<div class="' . e($frame) . '"><img src="' . e($b['portraitUrl']) . '" alt="Portrait of ' . e($b['name']) . '" class="h-full w-full object-cover" decoding="async" fetchpriority="high"></div>';
    }
    return '<div class="' . e($frame) . '" role="img" aria-label="' . e($b['name'] . ', ' . ($b['descriptor'] ?? '')) . '"><div class="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">'
        . '<div class="w-28 sm:w-32">' . monogram_svg(128) . '</div><div><div class="font-display text-3xl font-extrabold tracking-tight">' . e($b['name']) . '</div><div class="mt-1 text-base text-muted">' . e($b['descriptor'] ?? '') . '</div></div></div></div>';
}

function price_from(array $s): string
{
    return !empty($s['startingPrice']) ? 'From ' . money((int)$s['startingPrice'], $s['currency'] ?: 'USD', true) : ($s['priceLabel'] ?: 'Custom quote');
}

function service_card(array $s, bool $compact = false): string
{
    $deliv = array_slice((array)($s['deliverables'] ?? []), 0, 5);
    $h = '<a href="/services/' . e($s['slug']) . '" class="group relative flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-6 transition-colors duration-150 hover:border-accent sm:p-8">'
        . '<div class="mb-6 flex items-start justify-between"><span class="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-fg">' . icon($s['icon'] ?: 'film', 24) . '</span>'
        . icon('arrow-up-right', 20, 'text-subtle transition-colors duration-150 group-hover:text-accent-text') . '</div>'
        . '<h3 class="h-card">' . e($s['title']) . '</h3><p class="mt-3 text-base leading-relaxed text-muted">' . e($s['shortDescription']) . '</p>';
    if (!$compact) {
        if (!empty($s['useCase'])) {
            $h .= '<p class="mt-4 text-sm text-muted"><span class="font-semibold text-fg">Typical use · </span>' . e($s['useCase']) . '</p>';
        }
    }
    if ($deliv) {
        $h .= '<p class="mt-5 text-sm font-medium text-fg">What you receive</p><ul class="mt-2 flex flex-wrap gap-2">' . implode('', array_map(fn($d) => '<li class="rounded-full bg-surface-2 px-3 py-1 text-sm font-medium text-fg">' . e($d) . '</li>', $deliv)) . '</ul>';
    }
    return $h . '<div class="mt-auto flex items-center justify-between gap-3 border-t border-line pt-5 text-sm"><span class="font-semibold">' . e(price_from($s)) . '</span>'
        . (!empty($s['turnaround']) ? '<span class="inline-flex items-center gap-1.5 text-muted">' . icon('clock', 14) . e($s['turnaround']) . '</span>' : '') . '</div></a>';
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
    $h = '<div class="' . e(cx('relative flex h-full flex-col rounded-[var(--radius-card)] border p-6 sm:p-8', $hi ? 'border-accent bg-surface shadow-soft ring-1 ring-accent' : 'border-line bg-surface')) . '">'
        . ($hi ? '<span class="absolute -top-3 left-6 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-fg sm:left-8">Most popular</span>' : '')
        . (!empty($p['tier']) && strcasecmp(trim($p['tier']), trim($p['name'])) !== 0 ? '<div class="eyebrow">' . e($p['tier']) . '</div>' : '') . '<h3 class="h-card mt-1">' . e($p['name']) . '</h3>'
        . (!empty($p['description']) ? '<p class="mt-2 min-h-12 text-base text-muted">' . e($p['description']) . '</p>' : '')
        . '<div class="mt-6 flex items-baseline gap-2">' . ($custom ? '<span class="font-display text-4xl font-extrabold tracking-tight">Custom</span>'
            : '<span class="font-display text-4xl font-extrabold tracking-tight tabular-nums">' . e(money((int)$p['price'], $p['currency'] ?: 'USD', true)) . '</span><span class="text-base text-muted">' . e($p['priceNote'] ?: ($billing[$p['billingType']] ?? '')) . '</span>') . '</div>'
        . '<div class="mt-1 text-sm text-muted">' . e(title_case(strtolower(str_replace('_', ' ', $p['billingType'])))) . '</div>'
        . '<ul class="mt-6 space-y-3 border-t border-line pt-6 text-base">' . implode('', array_map(fn($l) => '<li class="flex gap-3">' . icon('check-circle', 17, 'mt-px shrink-0 text-accent-text') . '<span>' . e($l) . '</span></li>', $inc)) . '</ul>'
        . '<div class="mt-auto pt-8">' . ui_link('/start-project?plan=' . rawurlencode($p['name']), $p['ctaLabel'] ?: 'Discuss your project', ['variant' => $hi ? 'primary' : 'outline', 'class' => 'w-full']) . '</div></div>';
    return $h;
}

function testimonial_card(array $t): string
{
    $stars = '';
    for ($i = 0; $i < 5; $i++) {
        $stars .= icon('star', 16, $i < (int)$t['rating'] ? 'fill-current' : 'opacity-25');
    }
    $who = implode(' · ', array_filter([$t['role'] ?? '', $t['company'] ?? '']));
    return '<figure class="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-8">'
        . ((int)$t['rating'] > 0 ? '<div class="flex gap-0.5 text-accent-text" role="img" aria-label="Rated ' . (int)$t['rating'] . ' out of 5">' . $stars . '</div>' : '')
        . '<blockquote class="mt-4 flex-1 text-base leading-relaxed">“' . e($t['quote']) . '”</blockquote>'
        . '<figcaption class="mt-6 flex items-center gap-3 border-t border-line pt-5">' . (!empty($t['imageUrl']) ? '<img src="' . e($t['imageUrl']) . '" alt="" class="h-10 w-10 rounded-full object-cover" loading="lazy">'
            : '<span aria-hidden="true" class="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold">' . e(mb_substr($t['name'], 0, 1)) . '</span>')
        . '<span class="text-sm"><span class="block font-semibold">' . e($t['name']) . '</span><span class="block text-muted">' . e($who) . '</span></span></figcaption></figure>';
}

/** Accessible accordion on native <details>. $items: [{question, answer(markdown)}] */
function faq_list(array $items): string
{
    $h = '<div class="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">';
    foreach ($items as $f) {
        $h .= '<details class="group px-6 py-1"><summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-left text-base font-semibold marker:hidden [&::-webkit-details-marker]:hidden">' . e($f['question'])
            . '<span aria-hidden="true" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xl leading-none transition-transform duration-150 group-open:rotate-45 group-open:bg-accent group-open:text-accent-fg">+</span></summary>'
            . '<div class="prose-lite pb-5 pr-10 text-base text-muted">' . render_markdown($f['answer']) . '</div></details>';
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
        . '<figcaption class="absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-bold ' . ($label === 'After' ? 'bg-accent text-accent-fg' : 'bg-brand-navy text-white') . '">' . $label . '</figcaption></figure>';
    return '<div data-fe-component="before-after"><div class="grid grid-cols-1 gap-3 sm:grid-cols-2">' . $fig('Before', $before, true) . $fig('After', $after, false)
        . '</div><button type="button" data-ba-toggle class="mt-3 inline-flex h-11 items-center rounded-xl bg-accent px-5 text-base font-semibold text-accent-fg transition-colors duration-150 hover:bg-accent-hover">Play both</button></div>';
}

/** Right-hand side of the home hero: the showreel (poster + play button, no autoplay) when one is set, otherwise the owner's portrait. */
function hero_visual(array $business, ?string $showreelUrl, ?string $posterUrl): string
{
    if (!$showreelUrl) {
        return brand_portrait($business);
    }
    $emb = embed_url($showreelUrl);
    $attr = $emb ? 'data-embed="' . e(str_replace('rel=0', 'rel=0&autoplay=1', $emb) . (str_contains($emb, '?') ? '' : '?autoplay=1')) . '"' : 'data-video="' . e($showreelUrl) . '"';
    return '<div class="crop-frame relative aspect-video w-full overflow-hidden rounded-[var(--radius-card)] bg-brand-navy"><button type="button" data-showreel ' . $attr . ' aria-label="Play the showreel" class="group absolute inset-0 block w-full">'
        . ($posterUrl ? '<img src="' . e($posterUrl) . '" alt="Showreel poster" class="absolute inset-0 h-full w-full object-cover" decoding="async">' : '')
        . '<span class="absolute bottom-4 left-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-soft transition-colors duration-150 group-hover:bg-accent-hover">' . icon('play', 24, 'ml-0.5') . '</span></button></div>';
}

/** Metrics a person actually entered (list of {label,value}, or label → value) as [label, value] pairs; nothing is inferred or filled in. */
function public_results(mixed $raw): array
{
    $out = [];
    $add = function ($k, $v) use (&$out) {
        if (is_string($k) && trim($k) !== '' && (is_string($v) || is_int($v) || is_float($v)) && trim((string)$v) !== '') {
            $out[] = [$k, (string)$v];
        }
    };
    if (is_array($raw)) {
        if (array_is_list($raw)) {
            foreach ($raw as $r) {
                $add(is_array($r) ? ($r['label'] ?? null) : null, is_array($r) ? ($r['value'] ?? null) : null);
            }
        } else {
            foreach ($raw as $k => $v) {
                $add($k, $v);
            }
        }
    }
    return $out;
}

/** A portfolio row in the shape the work grid and its dialogs use (project presentation: goal, my role, deliverables, verified outcome). */
function work_item(array $w): array
{
    $cs = $w['caseStudy'] ?? null;
    $published = $cs && $cs['status'] === 'PUBLISHED';
    return [
        'id' => $w['id'], 'slug' => $w['slug'], 'title' => $w['title'], 'clientName' => $w['clientName'], 'industry' => $w['industry'], 'category' => $w['category'], 'projectType' => $w['projectType'],
        'platforms' => (array)$w['platforms'], 'thumbnailUrl' => $w['thumbnailUrl'], 'videoUrl' => $w['videoUrl'], 'beforeVideoUrl' => $w['beforeVideoUrl'], 'afterVideoUrl' => $w['afterVideoUrl'],
        'description' => $w['description'], 'caseStudySlug' => $published ? $cs['slug'] : null, 'isDemo' => !empty($w['isDemo']), 'featured' => !empty($w['featured']),
        'goal' => $published ? ($cs['objective'] ?? null) : null, 'role' => $published ? ($cs['strategy'] ?? null) : null, 'deliverables' => $published ? array_values((array)($cs['deliverables'] ?? [])) : [],
        'timeline' => $published ? ($cs['timeline'] ?? null) : null, 'results' => public_results($published && !empty($cs['results']) ? $cs['results'] : ($w['results'] ?? null)),
    ];
}

/** Filterable, image-led grid of projects; each card opens a dialog with the video (loaded only when opened). $items are work_item() rows. */
function work_grid(array $items, array $categories): string
{
    $h = '<div data-fe-component="work-grid">';
    if ($categories) {
        $h .= '<div role="tablist" aria-label="Filter work by category" class="scroll-x -mx-1 mb-10 flex gap-2 px-1 pb-2">';
        foreach (array_merge(['All'], $categories) as $k => $c) {
            $h .= '<button role="tab" type="button" data-cat="' . e($c) . '" aria-selected="' . ($k === 0 ? 'true' : 'false') . '" class="' . e(cx('inline-flex h-11 shrink-0 items-center rounded-full border px-5 text-base font-semibold transition-colors duration-150', $k === 0 ? 'border-fg bg-fg text-bg' : 'border-line-strong bg-surface text-fg hover:bg-surface-2')) . '">' . e($c) . '</button>';
        }
        $h .= '</div>';
    }
    $h .= '<ul class="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">';
    $modals = '';
    foreach ($items as $w) {
        $h .= '<li data-cat="' . e($w['category']) . '" id="' . e($w['slug']) . '" class="group flex flex-col">'
            . '<button type="button" data-modal-open="#work-' . e($w['id']) . '" aria-label="' . ($w['videoUrl'] || ($w['beforeVideoUrl'] && $w['afterVideoUrl']) ? 'Play ' : 'Open ') . e($w['title']) . '" class="' . e(cx($w['featured'] ? 'crop-frame' : '', 'relative block aspect-video w-full overflow-hidden rounded-[var(--radius-card)] bg-surface-2 text-left')) . '">'
            . ($w['thumbnailUrl'] ? '<img src="' . e($w['thumbnailUrl']) . '" alt="' . e($w['title'] . ' — video thumbnail') . '" loading="lazy" decoding="async" class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]">'
                : '<span class="flex h-full w-full items-center justify-center bg-surface-2">' . icon('film', 40, 'text-subtle') . '</span>')
            . ($w['videoUrl'] || ($w['beforeVideoUrl'] && $w['afterVideoUrl']) ? '<span class="absolute bottom-3 left-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-fg shadow-soft transition-colors duration-150 group-hover:bg-accent-hover">' . icon('play', 20, 'ml-0.5') . '</span>' : '')
            . ($w['beforeVideoUrl'] && $w['afterVideoUrl'] ? '<span class="absolute right-3 top-3 rounded-full bg-brand-navy px-3 py-1 text-sm font-medium text-white">Before / after</span>' : '')
            . ($w['isDemo'] ? '<span class="absolute left-3 top-3 rounded-full bg-warning px-2.5 py-1 text-xs font-bold text-warning-fg">Sample</span>' : '') . '</button>'
            . '<div class="pt-5"><div class="mb-3 flex flex-wrap gap-2">' . ui_badge($w['category'], 'neutral', '', false, false) . ($w['projectType'] && preg_replace('/[^a-z0-9]/', '', strtolower($w['projectType'])) !== preg_replace('/[^a-z0-9]/', '', strtolower($w['category'])) ? ui_badge(title_case(str_replace('_', ' ', $w['projectType'])), 'neutral', '', false, false) : '') . '</div>'
            . '<h3 class="h-card">' . e($w['title']) . '</h3><p class="mt-2 text-base text-muted">' . e(implode(' · ', array_filter([$w['clientName'], $w['industry']]))) . '</p>'
            . ($w['platforms'] ? '<p class="mt-2 text-sm text-muted">' . e(implode(' · ', $w['platforms'])) . '</p>' : '')
            . ($w['caseStudySlug'] ? '<a href="/case-studies/' . e($w['caseStudySlug']) . '" class="link mt-4 inline-flex min-h-11 items-center gap-1.5 text-base font-semibold">Read the case study ' . icon('arrow', 16) . '</a>' : '') . '</div></li>';
        if ($w['beforeVideoUrl'] && $w['afterVideoUrl']) {
            $media = before_after($w['beforeVideoUrl'], $w['afterVideoUrl']);
        } elseif ($w['videoUrl']) {
            $emb = embed_url($w['videoUrl']);
            $media = $emb ? '<iframe data-src="' . e($emb) . '" title="' . e($w['title']) . '" allow="fullscreen; picture-in-picture" class="aspect-video w-full rounded-xl"></iframe>'
                : '<video data-src="' . e($w['videoUrl']) . '" controls playsinline preload="none"' . ($w['thumbnailUrl'] ? ' poster="' . e($w['thumbnailUrl']) . '"' : '') . ' class="aspect-video w-full rounded-xl bg-brand-navy"></video>';
        } else {
            $media = '<p class="rounded-xl bg-surface-2 p-6 text-center text-base text-muted">No video preview is available for this project yet.</p>';
        }
        $facts = '';
        $block = fn(string $title, string $inner) => '<div><h4 class="font-display text-base font-bold">' . e($title) . '</h4>' . $inner . '</div>';
        if (!empty($w['goal'])) {
            $facts .= $block('Client goal', '<p class="mt-1 text-base text-muted">' . e(excerpt_text($w['goal'], 320)) . '</p>');
        }
        if (!empty($w['role'])) {
            $facts .= $block('My role and editing decisions', '<p class="mt-1 text-base text-muted">' . e(excerpt_text($w['role'], 320)) . '</p>');
        }
        if (!empty($w['deliverables'])) {
            $facts .= $block('Deliverables', '<ul class="mt-2 flex flex-wrap gap-2">' . implode('', array_map(fn($d) => '<li class="rounded-full bg-surface-2 px-3 py-1 text-sm font-medium">' . e($d) . '</li>', $w['deliverables'])) . '</ul>');
        }
        if (!empty($w['results'])) {
            $where = implode(' · ', array_filter([implode(', ', $w['platforms']), $w['timeline'] ?? '']));
            $facts .= $block('Verified outcome', '<dl class="mt-2 grid grid-cols-2 gap-3">' . implode('', array_map(fn($r) => '<div class="rounded-xl bg-surface-2 p-3"><dt class="text-sm text-muted">' . e($r[0]) . '</dt><dd class="font-display text-xl font-bold tabular-nums">' . e($r[1]) . '</dd></div>', $w['results'])) . '</dl>'
                . ($where !== '' ? '<p class="mt-2 text-sm text-muted">' . e($where) . '</p>' : ''));
        }
        $modals .= ui_modal('work-' . $w['id'], $w['title'], '<div class="space-y-5">' . $media . ($w['description'] ? '<p class="text-base leading-relaxed text-muted">' . e($w['description']) . '</p>' : '') . $facts
            . ($w['caseStudySlug'] ? '<a href="/case-studies/' . e($w['caseStudySlug']) . '" class="link inline-flex min-h-11 items-center gap-1.5 text-base font-semibold">Read the full case study ' . icon('arrow', 16) . '</a>' : '') . '</div>',
            ['size' => 'lg', 'description' => implode(' · ', array_filter([$w['clientName'], $w['industry']]))]);
    }
    return $h . '</ul><p data-work-empty hidden class="rounded-[var(--radius-card)] border border-dashed border-line-strong p-10 text-center text-base text-muted">No projects in this category yet.</p>' . $modals . '</div>';
}

/** Card-style list of icon + title + body blocks used on several pages. $rows: [[icon, title, body]] */
function icon_cards(array $rows, string $cols = 'md:grid-cols-3'): string
{
    $h = '<div class="grid grid-cols-1 gap-6 sm:gap-8 ' . e($cols) . '">';
    foreach ($rows as [$ic, $t, $b]) {
        $h .= '<div class="rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-8"><span class="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2">' . icon($ic, 24) . '</span><h3 class="h-card mt-5">' . e($t) . '</h3><p class="mt-3 text-base leading-relaxed text-muted">' . e($b) . '</p></div>';
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
