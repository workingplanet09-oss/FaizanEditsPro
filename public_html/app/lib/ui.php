<?php
/**
 * The UI kit: small functions that return the same markup (and Tailwind classes) the previous version's React components produced.
 * Everything that comes from data is escaped here; parameters named $html are trusted, already-escaped markup.
 *
 * Interactivity is attached by /assets/js/app.js through data attributes:
 *   data-fe-form="/api/…"      submit a form as JSON        data-fe-action="/api/…"   one-click API call (optional confirm dialog)
 *   data-modal-open="#id"      open a <dialog>              data-copy="text"          copy to clipboard
 *   data-fe-component="name"   mount a JavaScript widget     data-ago="ISO date"       live relative time
 */
defined('FEP') or exit;

/** clsx: strings, or ['class' => bool] maps; falsy parts are dropped. */
function cx(...$parts): string
{
    $out = [];
    foreach ($parts as $p) {
        if (is_array($p)) {
            foreach ($p as $k => $v) {
                if (is_int($k)) {
                    if ($v) {
                        $out[] = $v;
                    }
                } elseif ($v) {
                    $out[] = $k;
                }
            }
        } elseif ($p) {
            $out[] = $p;
        }
    }
    return trim(implode(' ', $out));
}

/** Attribute string from a map; false/null attributes are omitted, true renders bare. */
function attrs(array $a): string
{
    $out = '';
    foreach ($a as $k => $v) {
        if ($v === false || $v === null) {
            continue;
        }
        $out .= $v === true ? " {$k}" : ' ' . $k . '="' . e($v) . '"';
    }
    return $out;
}

/** Attribute holding JSON (safe inside double quotes). */
function json_attr(mixed $v): string { return e(json_enc($v)); }

const CARD = 'rounded-[var(--radius-card)] border border-line bg-surface shadow-soft';

function card_class(string $extra = '', bool $hover = false): string
{
    return cx(CARD, $hover ? 'transition duration-300 hover:-translate-y-0.5 hover:shadow-lift hover:border-line-strong' : '', $extra);
}

function ui_card_header(string $title, ?string $description = null, ?string $actionHtml = null, string $class = ''): string
{
    return '<div class="' . e(cx('flex items-start justify-between gap-4 px-5 pt-5 pb-3', $class)) . '"><div class="min-w-0"><h3 class="text-base font-bold leading-tight">' . e($title) . '</h3>'
        . ($description ? '<p class="mt-1 text-sm text-muted">' . e($description) . '</p>' : '') . '</div>' . ($actionHtml ? '<div class="shrink-0">' . $actionHtml . '</div>' : '') . '</div>';
}

// ─────────── Badge / Avatar / Progress ───────────
const TONE_CLASS = ['neutral' => 'bg-surface-2 text-muted', 'info' => 'bg-info-soft text-info', 'warning' => 'bg-warning-soft text-warning', 'success' => 'bg-success-soft text-success', 'danger' => 'bg-danger-soft text-danger', 'accent' => 'bg-accent-soft text-fg'];
const TONE_ICON = ['neutral' => 'clock', 'info' => 'info', 'warning' => 'alert', 'success' => 'check-circle', 'danger' => 'warning', 'accent' => 'sparkles'];

/** Status pill: text + icon, never colour alone. $icon: icon name, false for none. */
function ui_badge(string $text, string $tone = 'neutral', string $class = '', string|false|null $icon = null, bool $dot = true): string
{
    $tone = isset(TONE_CLASS[$tone]) ? $tone : 'neutral';
    $ic = $icon === false ? '' : ($icon ? icon($icon, 12) : ($dot ? icon(TONE_ICON[$tone], 12) : ''));
    return '<span class="' . e(cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold leading-none', TONE_CLASS[$tone], $class)) . '">' . $ic . e($text) . '</span>';
}

function ui_avatar(string $name, ?string $src = null, int $size = 32, string $class = ''): string
{
    if ($src) {
        return '<img src="' . e($src) . '" alt="" width="' . $size . '" height="' . $size . '" class="' . e(cx('rounded-full object-cover', $class)) . '" style="width:' . $size . 'px;height:' . $size . 'px">';
    }
    return '<span aria-hidden="true" class="' . e(cx('inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-bold text-fg', $class)) . '" style="width:' . $size . 'px;height:' . $size . 'px;font-size:' . round($size * 0.38, 1) . 'px">' . e(initials($name)) . '</span>';
}

function ui_progress(float $value, string $class = '', string $label = 'Progress'): string
{
    $v = max(0, min(100, $value));
    return '<div role="progressbar" aria-valuenow="' . round($v) . '" aria-valuemin="0" aria-valuemax="100" aria-label="' . e($label) . '" class="' . e(cx('h-1.5 w-full overflow-hidden rounded-full bg-surface-2', $class)) . '"><div class="h-full rounded-full bg-accent transition-[width] duration-700 ease-out" style="width:' . $v . '%"></div></div>';
}

function ui_empty(string $title, ?string $description = null, string $iconName = 'inbox', ?string $actionHtml = null, string $class = ''): string
{
    return '<div class="' . e(cx('flex flex-col items-center justify-center px-6 py-14 text-center', $class)) . '"><div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-subtle">' . icon($iconName, 24) . '</div><h3 class="text-base font-bold">' . e($title) . '</h3>'
        . ($description ? '<p class="mt-1.5 max-w-sm text-sm text-muted">' . e($description) . '</p>' : '') . ($actionHtml ? '<div class="mt-5">' . $actionHtml . '</div>' : '') . '</div>';
}

function ui_page_header(string $title, ?string $description = null, ?string $actionsHtml = null, ?string $eyebrow = null, string $class = ''): string
{
    return '<div class="' . e(cx('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', $class)) . '"><div class="min-w-0">' . ($eyebrow ? '<div class="eyebrow mb-1.5">' . e($eyebrow) . '</div>' : '')
        . '<h1 class="text-2xl font-extrabold tracking-tight sm:text-3xl">' . e($title) . '</h1>' . ($description ? '<p class="mt-1.5 max-w-2xl text-sm text-muted sm:text-[15px]">' . e($description) . '</p>' : '') . '</div>'
        . ($actionsHtml ? '<div class="flex flex-wrap items-center gap-2">' . $actionsHtml . '</div>' : '') . '</div>';
}

/** $value / $sub: trusted markup or plain text already escaped by the caller. */
function ui_stat(string $label, string $valueHtml, ?string $subHtml = null, ?string $tone = null, ?string $iconName = null, ?string $href = null): string
{
    $inner = '<div class="flex items-start justify-between gap-3"><div class="min-w-0"><div class="text-xs font-medium text-muted">' . e($label) . '</div><div class="mt-1.5 truncate text-2xl font-extrabold tracking-tight tabular-nums">' . $valueHtml . '</div>'
        . ($subHtml ? '<div class="mt-1 text-xs text-subtle">' . $subHtml . '</div>' : '') . '</div>'
        . ($iconName ? '<span class="' . e(cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', $tone ? (TONE_CLASS[$tone] ?? '') : 'bg-surface-2 text-muted')) . '">' . icon($iconName, 18) . '</span>' : '') . '</div>';
    $cls = 'block rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-soft transition hover:border-line-strong';
    return $href ? '<a href="' . e($href) . '" class="' . $cls . '">' . $inner . '</a>' : '<div class="' . $cls . '">' . $inner . '</div>';
}

function ui_meta(string $label, ?string $valueHtml, string $class = ''): string
{
    return '<div class="' . e(cx('min-w-0', $class)) . '"><dt class="text-xs font-medium text-subtle">' . e($label) . '</dt><dd class="mt-0.5 break-words text-sm font-medium">' . (($valueHtml !== null && $valueHtml !== '') ? $valueHtml : '<span class="text-subtle">—</span>') . '</dd></div>';
}

function ui_kbd(string $text): string { return '<kbd class="rounded-md border border-line-strong bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-muted">' . e($text) . '</kbd>'; }

/** "5m ago" that the browser keeps fresh; the server-rendered text is the fallback. */
function ago(mixed $value, string $prefix = '', string $suffix = '', string $class = ''): string
{
    $ms = ts_ms($value);
    if ($ms === null) {
        return '<span class="' . e($class) . '">—</span>';
    }
    return '<span data-ago="' . e(iso_dt($ms)) . '" data-prefix="' . e($prefix) . '" data-suffix="' . e($suffix) . '"' . ($class ? ' class="' . e($class) . '"' : '') . '>' . e($prefix . time_ago($ms) . $suffix) . '</span>';
}

/** A date/time that the browser renders in the visitor's own time zone (falls back to the server's UTC text). */
function local_time(mixed $value, string $format = 'datetime', string $class = ''): string
{
    $ms = ts_ms($value);
    if ($ms === null) {
        return '—';
    }
    $text = match ($format) { 'date' => fmt_date($ms), 'short' => fmt_date_short($ms), 'time' => gmdate('g:i A', intdiv($ms, 1000)) . ' UTC', default => fmt_datetime($ms) };
    return '<time datetime="' . e(iso_dt($ms)) . '" data-local="' . e($format) . '"' . ($class ? ' class="' . e($class) . '"' : '') . '>' . e($text) . '</time>';
}

// ─────────── Buttons ───────────
/** Tailwind classes for a button. Variants: primary secondary outline ghost danger dark soft; sizes xs sm md lg. */
function btn_class(string $variant = 'primary', string $size = 'md', string $extra = ''): string
{
    $hasDisplay = $extra !== '' && preg_match('/(^|\s)(hidden|block|flex|inline|inline-block|inline-flex|grid)(\s|$)/', $extra);
    return cx(
        !$hasDisplay ? 'inline-flex' : '',
        'relative items-center justify-center gap-2 whitespace-nowrap font-semibold select-none transition-[background,transform,box-shadow,color,border-color] duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 rounded-xl',
        match ($size) { 'xs' => 'h-7 px-2.5 text-xs rounded-lg', 'sm' => 'h-9 px-3.5 text-sm', 'lg' => 'h-13 px-7 text-base rounded-2xl', default => 'h-11 px-5 text-sm' },
        match ($variant) {
            'primary' => 'bg-accent text-accent-fg shadow-[0_1px_0_rgb(255_255_255/0.35)_inset,0_8px_20px_-8px_color-mix(in_srgb,var(--accent)_70%,transparent)] hover:brightness-105 hover:-translate-y-px',
            'dark' => 'bg-fg text-bg hover:opacity-90',
            'secondary' => 'bg-surface-2 text-fg hover:bg-line',
            'soft' => 'bg-accent-soft text-fg hover:bg-[color-mix(in_srgb,var(--accent)_24%,transparent)]',
            'outline' => 'border border-line-strong text-fg hover:bg-surface-2',
            'ghost' => 'text-muted hover:text-fg hover:bg-surface-2',
            'danger' => 'bg-danger-soft text-danger hover:bg-danger hover:text-white',
            default => '',
        },
        $extra,
    );
}

/** $o: variant, size, icon, iconRight, class, type, attrs[] */
function ui_button(string $label, array $o = []): string
{
    $html = (!empty($o['icon']) ? icon($o['icon'], 16) : '') . e($label) . (!empty($o['iconRight']) ? icon($o['iconRight'], 16) : '');
    return '<button type="' . e($o['type'] ?? 'button') . '" class="' . e(btn_class($o['variant'] ?? 'primary', $o['size'] ?? 'md', $o['class'] ?? '')) . '"' . attrs($o['attrs'] ?? []) . '>' . ($o['labelHtml'] ?? $html) . '</button>';
}

/** $o: variant, size, icon, iconRight, class, attrs[], labelHtml (replaces the escaped label) */
function ui_link(string $href, string $label, array $o = []): string
{
    $external = (bool)preg_match('#^https?://#', $href);
    $html = (!empty($o['icon']) ? icon($o['icon'], 16) : '') . ($o['labelHtml'] ?? e($label)) . (!empty($o['iconRight']) ? icon($o['iconRight'], 16) : '');
    return '<a href="' . e($href) . '" class="' . e(btn_class($o['variant'] ?? 'primary', $o['size'] ?? 'md', $o['class'] ?? '')) . '"' . ($external ? ' rel="noopener noreferrer"' : '') . attrs($o['attrs'] ?? []) . '>' . $html . '</a>';
}

/**
 * One-click mutation button: optional confirmation dialog → API call → toast → page refresh.
 * $o: variant, size, icon, class, method, body, success, confirm {title, description, confirmLabel, tone}, redirect, refresh(bool)
 */
function ui_action(string $url, string $label, array $o = []): string
{
    $a = ['data-fe-action' => $url, 'data-method' => $o['method'] ?? 'POST'];
    if (array_key_exists('body', $o)) {
        $a['data-body'] = json_enc($o['body']);
    }
    if (!empty($o['success'])) {
        $a['data-success'] = $o['success'];
    }
    if (!empty($o['redirect'])) {
        $a['data-redirect'] = $o['redirect'];
    }
    if (($o['refresh'] ?? true) === false) {
        $a['data-refresh'] = '0';
    }
    if (!empty($o['confirm'])) {
        $a['data-confirm-title'] = $o['confirm']['title'];
        $a['data-confirm-description'] = $o['confirm']['description'] ?? null;
        $a['data-confirm-label'] = $o['confirm']['confirmLabel'] ?? null;
        $a['data-confirm-tone'] = $o['confirm']['tone'] ?? null;
    }
    return ui_button($label, array_replace($o, ['attrs' => $a + ($o['attrs'] ?? [])]));
}

// ─────────── Form controls ───────────
const INPUT_BASE = 'w-full rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-fg placeholder:text-subtle transition-[border-color,box-shadow] duration-150 hover:border-subtle focus:border-accent focus:outline-none focus:ring-4 focus:ring-[color-mix(in_srgb,var(--accent)_22%,transparent)] disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20';

function ui_input(string $name, mixed $value = '', array $a = []): string
{
    $class = cx(INPUT_BASE, 'h-11', $a['class'] ?? '');
    unset($a['class']);
    return '<input name="' . e($name) . '" value="' . e((string)$value) . '" class="' . e($class) . '"' . attrs(($a['type'] ?? null) ? $a : ['type' => 'text'] + $a) . '>';
}

function ui_textarea(string $name, mixed $value = '', array $a = []): string
{
    $class = cx(INPUT_BASE, 'min-h-28 py-3 leading-relaxed', $a['class'] ?? '');
    unset($a['class']);
    return '<textarea name="' . e($name) . '" class="' . e($class) . '"' . attrs($a) . '>' . e((string)$value) . '</textarea>';
}

/** $options: [value => label] or [['value'=>,'label'=>]…] */
function ui_select(string $name, array $options, mixed $selected = '', array $a = []): string
{
    $class = cx(INPUT_BASE, 'h-11 appearance-none pr-9', $a['class'] ?? '');
    unset($a['class']);
    $opts = '';
    foreach ($options as $k => $v) {
        [$val, $label] = is_array($v) ? [$v['value'], $v['label']] : [$k, $v];
        $opts .= '<option value="' . e($val) . '"' . ((string)$val === (string)$selected ? ' selected' : '') . '>' . e($label) . '</option>';
    }
    return '<div class="relative"><select name="' . e($name) . '" class="' . e($class) . '"' . attrs($a) . '>' . $opts . '</select>' . icon('chevron-down', 16, 'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle') . '</div>';
}

/** Label + control + hint/error. $controlHtml is the rendered control (give it id="$id"). */
function ui_field(string $id, ?string $label, string $controlHtml, array $o = []): string
{
    $required = !empty($o['required']);
    $l = '';
    if ($label) {
        $tip = '';
        if (!empty($o['tooltip'])) {
            $tip = '<span class="group relative inline-flex"><button type="button" aria-label="About ' . e($label) . '" class="text-subtle hover:text-fg">' . icon('help', 14) . '</button><span role="tooltip" class="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 hidden w-56 -translate-x-1/2 rounded-lg bg-fg px-3 py-2 text-xs font-normal leading-snug text-bg shadow-lift group-hover:block group-focus-within:block">' . e($o['tooltip']) . '</span></span>';
        }
        $l = '<label for="' . e($id) . '" class="flex items-center gap-1.5 text-sm font-semibold"><span>' . e($label) . '</span>'
            . ($required ? '<span class="text-danger" aria-hidden="true" title="Required">*</span><span class="sr-only">(required)</span>' : (($o['optional'] ?? true) ? '<span class="text-xs font-normal text-subtle">optional</span>' : '')) . $tip . '</label>';
    }
    $foot = !empty($o['error'])
        ? '<p id="' . e($id) . '-err" role="alert" class="flex items-center gap-1.5 text-xs font-medium text-danger">' . icon('alert', 13) . e($o['error']) . '</p>'
        : (!empty($o['hint']) ? '<p id="' . e($id) . '-hint" class="text-xs text-subtle">' . e($o['hint']) . '</p>' : '');
    return '<div class="' . e(cx('space-y-1.5', $o['class'] ?? '')) . '" data-field="' . e($o['name'] ?? $id) . '">' . $l . $controlHtml . '<p data-error-for="' . e($o['name'] ?? $id) . '" role="alert" class="hidden items-center gap-1.5 text-xs font-medium text-danger"></p>' . $foot . '</div>';
}

/** Convenience: a labelled text-like field. $o: type, placeholder, required, hint, autocomplete, maxlength, class, attrs[] */
function field_input(string $name, string $label, mixed $value = '', array $o = []): string
{
    $id = $o['id'] ?? 'f-' . preg_replace('/[^a-z0-9_-]/i', '-', $name);
    $a = ['id' => $id, 'type' => $o['type'] ?? 'text', 'placeholder' => $o['placeholder'] ?? null, 'required' => !empty($o['required']) ?: null, 'autocomplete' => $o['autocomplete'] ?? null, 'maxlength' => $o['maxlength'] ?? null,
        'inputmode' => $o['inputmode'] ?? null, 'min' => $o['min'] ?? null, 'max' => $o['max'] ?? null, 'step' => $o['step'] ?? null, 'class' => $o['inputClass'] ?? '', 'disabled' => !empty($o['disabled']) ?: null] + ($o['attrs'] ?? []);
    return ui_field($id, $label, ui_input($name, $value, array_filter($a, fn($v) => $v !== null && $v !== '')), $o + ['name' => $name]);
}

function field_textarea(string $name, string $label, mixed $value = '', array $o = []): string
{
    $id = $o['id'] ?? 'f-' . preg_replace('/[^a-z0-9_-]/i', '-', $name);
    $a = ['id' => $id, 'placeholder' => $o['placeholder'] ?? null, 'required' => !empty($o['required']) ?: null, 'maxlength' => $o['maxlength'] ?? null, 'rows' => $o['rows'] ?? null, 'class' => $o['inputClass'] ?? ''] + ($o['attrs'] ?? []);
    return ui_field($id, $label, ui_textarea($name, $value, array_filter($a, fn($v) => $v !== null && $v !== '')), $o + ['name' => $name]);
}

function field_select(string $name, string $label, array $options, mixed $selected = '', array $o = []): string
{
    $id = $o['id'] ?? 'f-' . preg_replace('/[^a-z0-9_-]/i', '-', $name);
    $a = ['id' => $id, 'required' => !empty($o['required']) ?: null, 'class' => $o['inputClass'] ?? ''] + ($o['attrs'] ?? []);
    return ui_field($id, $label, ui_select($name, $options, $selected, array_filter($a, fn($v) => $v !== null && $v !== '')), $o + ['name' => $name]);
}

function ui_checkbox(string $name, string $label, bool $checked = false, ?string $description = null, string $class = '', array $a = []): string
{
    return '<label class="' . e(cx('flex cursor-pointer items-start gap-3 rounded-xl p-2 -m-2 hover:bg-surface-2/60', $class)) . '"><span class="relative mt-0.5 inline-flex shrink-0"><input type="checkbox" name="' . e($name) . '" class="peer h-[18px] w-[18px] shrink-0 cursor-pointer appearance-none rounded-md border border-line-strong bg-surface transition checked:border-accent checked:bg-accent focus-visible:ring-4 focus-visible:ring-accent/25"' . ($checked ? ' checked' : '') . attrs($a) . '>'
        . icon('check', 13, 'pointer-events-none absolute left-[2.5px] top-[2.5px] hidden text-accent-fg peer-checked:block', 3) . '</span><span class="min-w-0"><span class="block text-sm font-medium leading-snug">' . e($label) . '</span>'
        . ($description ? '<span class="mt-0.5 block text-xs text-muted">' . e($description) . '</span>' : '') . '</span></label>';
}

/** Toggle switch. With $name it submits as a boolean inside a fe-form; JS toggles aria-checked. */
function ui_switch(string $name, bool $checked, ?string $label = null, ?string $description = null, bool $disabled = false): string
{
    $id = 'sw-' . preg_replace('/[^a-z0-9_-]/i', '-', $name) . '-' . substr(md5($name . $label), 0, 4);
    return '<div class="flex items-center justify-between gap-4">' . ($label ? '<label for="' . e($id) . '" class="min-w-0 cursor-pointer"><span class="block text-sm font-semibold leading-snug">' . e($label) . '</span>' . ($description ? '<span class="mt-0.5 block text-xs text-muted">' . e($description) . '</span>' : '') . '</label>' : '')
        . '<button id="' . e($id) . '" type="button" role="switch" data-switch="' . e($name) . '" aria-checked="' . ($checked ? 'true' : 'false') . '"' . ($disabled ? ' disabled' : '') . ' class="relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50 ' . ($checked ? 'bg-accent' : 'bg-line-strong') . '">'
        . '<span class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ' . ($checked ? 'translate-x-[22px]' : 'translate-x-0.5') . '"></span><span class="sr-only">' . ($checked ? 'On' : 'Off') . '</span></button></div>';
}

// ─────────── Tabs, pagination, filters, tables ───────────
/** Link-based tabs: the active tab lives in the URL. $tabs: [['key','label','count'?,'alert'?]] */
function ui_tabs(array $tabs, string $active, string $basePath, string $param = 'tab', array $extra = []): string
{
    // tabs may be written positionally: [key, label, count?, alert?]
    $tabs = array_map(fn($t) => isset($t['key']) ? $t : ['key' => $t[0], 'label' => $t[1], 'count' => $t[2] ?? null, 'alert' => $t[3] ?? null], $tabs);
    $href = function (string $k) use ($tabs, $basePath, $param, $extra) {
        $q = array_filter($extra, fn($v) => $v !== null && $v !== '');
        if ($k !== $tabs[0]['key']) {
            $q[$param] = $k;
        }
        return $q ? $basePath . '?' . http_build_query($q) : $basePath;
    };
    $li = '';
    foreach ($tabs as $t) {
        $on = $t['key'] === $active;
        $li .= '<li><a href="' . e($href($t['key'])) . '"' . ($on ? ' aria-current="page"' : '') . ' class="' . e(cx('relative inline-flex items-center gap-2 whitespace-nowrap px-3.5 py-3 text-sm font-semibold transition-colors', $on ? 'text-fg' : 'text-muted hover:text-fg')) . '">' . e($t['label'])
            . (!empty($t['count']) ? '<span class="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-bold leading-none text-muted">' . e($t['count']) . '</span>' : '')
            . (!empty($t['alert']) ? '<span aria-label="needs attention" class="h-2 w-2 rounded-full bg-accent"></span>' : '')
            . ($on ? '<span aria-hidden="true" class="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent"></span>' : '') . '</a></li>';
    }
    return '<nav aria-label="Sections" class="thin-scroll -mx-4 mb-6 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0"><ul class="flex min-w-max gap-1">' . $li . '</ul></nav>';
}

function ui_pagination(int $page, int $pages, string $basePath, array $params = [], ?int $total = null): string
{
    if ($pages <= 1) {
        return $total !== null ? '<div class="px-4 py-3 text-xs text-subtle">' . $total . ' result' . ($total === 1 ? '' : 's') . '</div>' : '';
    }
    $href = function (int $p) use ($basePath, $params) {
        $q = array_filter($params, fn($v) => $v !== null && $v !== '');
        if ($p > 1) {
            $q['page'] = $p;
        }
        return $q ? $basePath . '?' . http_build_query($q) : $basePath;
    };
    $b = 'inline-flex h-9 items-center gap-1 rounded-lg border border-line-strong px-3 font-semibold hover:bg-surface-2';
    return '<nav aria-label="Pagination" class="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm"><span class="text-xs text-subtle">Page ' . $page . ' of ' . $pages . ($total !== null ? " · {$total} total" : '') . '</span><div class="flex gap-2">'
        . '<a aria-disabled="' . ($page <= 1 ? 'true' : 'false') . '" ' . ($page <= 1 ? 'tabindex="-1" ' : '') . 'href="' . e($href(max(1, $page - 1))) . '" class="' . e(cx($b, $page <= 1 ? 'pointer-events-none opacity-40' : '')) . '">' . icon('chevron-left', 14) . ' Prev</a>'
        . '<a aria-disabled="' . ($page >= $pages ? 'true' : 'false') . '" ' . ($page >= $pages ? 'tabindex="-1" ' : '') . 'href="' . e($href(min($pages, $page + 1))) . '" class="' . e(cx($b, $page >= $pages ? 'pointer-events-none opacity-40' : '')) . '">Next ' . icon('chevron-right', 14) . '</a></div></nav>';
}

/** URL-driven filter bar (plain GET form). $fields: [['name','label','type'?'search'|'select','options'?,'placeholder'?]] */
function ui_filter_bar(string $action, array $fields, array $values, string $extraHtml = ''): string
{
    $out = '<form action="' . e($action) . '" method="get" class="flex flex-wrap items-end gap-2 border-b border-line p-3">';
    foreach ($fields as $f) {
        if (($f['type'] ?? 'search') === 'select') {
            $opts = '<option value="">' . e($f['label']) . ': all</option>';
            foreach ($f['options'] ?? [] as $o) {
                $opts .= '<option value="' . e($o['value']) . '"' . ((string)($values[$f['name']] ?? '') === (string)$o['value'] ? ' selected' : '') . '>' . e($o['label']) . '</option>';
            }
            $out .= '<label class="text-xs font-semibold text-subtle"><span class="sr-only">' . e($f['label']) . '</span><select name="' . e($f['name']) . '" aria-label="' . e($f['label']) . '" class="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-sm font-medium text-fg focus:border-accent focus:outline-none">' . $opts . '</select></label>';
        } else {
            $out .= '<label class="relative min-w-[12rem] flex-1 sm:max-w-xs"><span class="sr-only">' . e($f['label']) . '</span>' . icon('search', 15, 'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle')
                . '<input type="search" name="' . e($f['name']) . '" value="' . e($values[$f['name']] ?? '') . '" placeholder="' . e($f['placeholder'] ?? $f['label']) . '" class="h-9 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-sm focus:border-accent focus:outline-none"></label>';
        }
    }
    $out .= '<button type="submit" class="h-9 rounded-lg bg-fg px-4 text-sm font-semibold text-bg hover:opacity-90">Apply</button>';
    if (array_filter($values)) {
        $out .= '<a href="' . e($action) . '" class="h-9 rounded-lg px-3 text-sm font-semibold leading-9 text-muted hover:text-fg">Clear</a>';
    }
    return $out . $extraHtml . '</form>';
}

/**
 * Responsive table: a dense table from md up; below that each row becomes a labelled card.
 * $columns: [['key','header','render'=>fn($row)=>html,'primary'?,'class'?,'hideOnMobile'?,'align'?'right']]
 */
function ui_table(array $columns, array $rows, callable $rowKey, ?callable $rowHref = null, ?string $emptyHtml = null, string $class = '', bool $dense = true): string
{
    if (!$rows) {
        return $emptyHtml ?? '';
    }
    $th = '';
    foreach ($columns as $c) {
        $th .= '<th scope="col" class="' . e(cx('px-4 py-2.5 font-semibold whitespace-nowrap', ($c['align'] ?? '') === 'right' ? 'text-right' : '', $c['class'] ?? '')) . '">' . e($c['header']) . '</th>';
    }
    $body = '';
    foreach ($rows as $r) {
        $href = $rowHref ? $rowHref($r) : null;
        $tds = '';
        foreach (array_values($columns) as $i => $c) {
            $cell = ($c['render'])($r);
            if ($i === 0 && $href) {
                $cell = '<a href="' . e($href) . '" class="block font-semibold after:absolute after:inset-0 md:after:hidden focus-visible:outline-offset-4">' . $cell . '</a>';
            }
            $tds .= '<td data-label="' . e($c['header']) . '"' . (!empty($c['primary']) ? ' data-primary' : '') . ' class="' . e(cx($dense ? 'px-4 py-3' : 'px-4 py-4', 'align-middle', ($c['align'] ?? '') === 'right' ? 'text-right' : '', !empty($c['hideOnMobile']) ? 'max-md:hidden' : '', $c['class'] ?? '')) . '">' . $cell . '</td>';
        }
        $body .= '<tr class="' . e(cx('group relative transition-colors', $href ? 'hover:bg-surface-2/60' : '')) . '">' . $tds . '</tr>';
    }
    return '<div class="' . e(cx('overflow-hidden', $class)) . '"><table class="responsive-table w-full border-collapse text-left text-sm"><thead><tr class="border-b border-line text-xs font-semibold text-subtle">' . $th . '</tr></thead><tbody class="divide-y divide-line">' . $body . '</tbody></table></div>';
}

/** Native <dialog> modal, opened by data-modal-open="#id" or FE.modal.open('#id'). $o: size sm|md|lg|xl, description, footerHtml, dismissible */
function ui_modal(string $id, string $title, string $bodyHtml, array $o = []): string
{
    $size = match ($o['size'] ?? 'md') { 'sm' => 'max-w-md', 'lg' => 'max-w-3xl', 'xl' => 'max-w-5xl', default => 'max-w-xl' };
    return '<dialog id="' . e($id) . '" aria-labelledby="' . e($id) . '-t"' . (($o['dismissible'] ?? true) ? '' : ' data-static') . ' class="' . e(cx('m-auto w-[calc(100%-1.5rem)] max-h-[92dvh] overflow-hidden rounded-3xl border border-line bg-surface p-0 text-fg shadow-lift open:flex open:flex-col open:animate-pop', $size)) . '">'
        . '<div class="flex items-start justify-between gap-4 border-b border-line px-6 py-4"><div class="min-w-0"><h2 id="' . e($id) . '-t" class="text-lg font-bold leading-tight">' . e($title) . '</h2>' . (!empty($o['description']) ? '<p class="mt-1 text-sm text-muted">' . e($o['description']) . '</p>' : '') . '</div>'
        . '<button type="button" data-modal-close aria-label="Close dialog" class="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg">' . icon('x', 18) . '</button></div>'
        . '<div class="thin-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">' . $bodyHtml . '</div>'
        . (!empty($o['footerHtml']) ? '<div class="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/40 px-6 py-4">' . $o['footerHtml'] . '</div>' : '') . '</dialog>';
}

// ─────────── status helpers ───────────
function status_badge(string $status, string $kind = 'STATUS', bool $client = false): string
{
    if ($kind === 'STATUS') {
        $m = status_meta($status);
        return ui_badge($client ? $m['clientLabel'] : $m['label'], $m['tone']);
    }
    $m = meta_for($kind, $status);
    return ui_badge($m['label'], $m['tone']);
}

/** Payment state pill used in project lists. */
function payment_badge(string $state): string
{
    return match ($state) {
        'PAID' => ui_badge('Paid', 'success'), 'PARTIAL' => ui_badge('Partial', 'warning'), 'UNPAID' => ui_badge('Unpaid', 'warning'), 'OVERDUE' => ui_badge('Overdue', 'danger'),
        default => ui_badge('No invoice', 'neutral', '', 'file'),
    };
}

/** Money for display; $currency defaults to the workspace currency. */
function fmt_money(?int $minor, ?string $currency = null): string
{
    return money($minor, $currency ?? get_setting(workspace_id(), 'business')['defaultCurrency']);
}

/** Money map {USD: 1200} → "$12.00 · €5.00" */
function fmt_money_map(mixed $map): string
{
    $map = (array)$map;
    if (!$map) {
        return '—';
    }
    return implode(' · ', array_map(fn($cur, $n) => money((int)$n, $cur), array_keys($map), $map));
}

/** schema.org structured data — "<" is escaped so content can never break out of the script tag. */
function json_ld(array $data): string
{
    return '<script type="application/ld+json">' . str_replace('<', '\\u003c', json_enc($data)) . '</script>';
}

/** Path of the current request (without the query string), for "active link" highlighting. */
function req_path(): string
{
    $p = (string)parse_url((string)($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
    return rtrim($p, '/') ?: '/';
}

function theme_toggle(string $class = ''): string
{
    return '<button type="button" data-theme-toggle class="' . e(cx('flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg', $class)) . '" aria-label="Change theme">' . icon('monitor', 17) . '</button>';
}

/** Centered card used by every sign-in / account screen. $footerHtml is trusted markup. */
function auth_card(string $title, ?string $description, string $bodyHtml, ?string $footerHtml = null): string
{
    return '<div class="mx-auto w-full max-w-md"><div class="rounded-[var(--radius-card)] border border-line bg-surface p-7 shadow-soft sm:p-9"><h1 class="text-[1.75rem] font-extrabold leading-tight tracking-tight">' . e($title) . '</h1>'
        . ($description ? '<p class="mt-2 text-sm leading-relaxed text-muted">' . e($description) . '</p>' : '') . '<div class="mt-7">' . $bodyHtml . '</div></div>'
        . ($footerHtml ? '<div class="mt-6 text-center text-sm text-muted">' . $footerHtml . '</div>' : '') . '</div>';
}

function ui_notice(string $text, string $tone = 'info'): string
{
    $c = ['success' => 'bg-success-soft text-success', 'danger' => 'bg-danger-soft text-danger', 'info' => 'bg-info-soft text-info'][$tone] ?? 'bg-info-soft text-info';
    return '<p role="' . ($tone === 'danger' ? 'alert' : 'status') . '" class="mb-5 rounded-xl px-4 py-3 text-sm font-medium ' . $c . '">' . e($text) . '</p>';
}

/** Hidden field group that bots fill in and people never see. */
function honeypot(string $name = 'hp'): string
{
    return '<div aria-hidden="true" class="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Leave this empty<input tabindex="-1" autocomplete="off" name="' . e($name) . '"></label></div>';
}

/** Big primary submit button for forms (loading state handled by app.js). */
function submit_button(string $label, array $o = []): string
{
    return ui_button($label, ['type' => 'submit', 'size' => $o['size'] ?? 'lg', 'class' => $o['class'] ?? 'w-full', 'iconRight' => $o['iconRight'] ?? null, 'icon' => $o['icon'] ?? null, 'variant' => $o['variant'] ?? 'primary', 'attrs' => $o['attrs'] ?? []]);
}

function form_error_slot(): string { return '<p data-form-error role="alert" class="mb-1 hidden rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger"></p>'; }
