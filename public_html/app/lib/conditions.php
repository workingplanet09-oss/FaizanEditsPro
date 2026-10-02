<?php
/**
 * Conditional logic shared by the browser (live show/hide, see assets/js/wizard.js) and the server (validation, automations).
 * Stored in the database as JSON:  { all?: Cond[], any?: Cond[] }   Cond = { field, op, value? }
 */
defined('FEP') or exit;

/** JavaScript's String(x) for the value types that occur in answers. */
function js_str(mixed $v): string
{
    if (is_bool($v)) {
        return $v ? 'true' : 'false';
    }
    if ($v === null) {
        return 'null';
    }
    if (is_float($v)) {
        return (floor($v) == $v && abs($v) < 1e15) ? (string)(int)$v : rtrim(rtrim(sprintf('%.14F', $v), '0'), '.');
    }
    if (is_array($v)) {
        return implode(',', array_map('js_str', $v));
    }
    return (string)$v;
}

function js_truthy(mixed $v): bool
{
    if ($v === null || $v === false || $v === '' || $v === 0 || $v === 0.0) {
        return false;
    }
    return !(is_float($v) && is_nan($v)); // arrays (even empty) and the string "0" are truthy in JavaScript
}

function js_number(mixed $v): float
{
    if (is_bool($v)) {
        return $v ? 1.0 : 0.0;
    }
    if ($v === null || $v === '') {
        return 0.0;
    }
    return is_numeric($v) ? (float)$v : NAN;
}

function cond_as_array(mixed $v): array
{
    if (is_array($v)) {
        return array_values($v);
    }
    return $v === null || $v === '' ? [] : [$v];
}

function cond_is_empty(mixed $v): bool
{
    if ($v === null) {
        return true;
    }
    if (is_string($v)) {
        return trim($v) === '';
    }
    return is_array($v) && count($v) === 0;
}

function eval_cond(array $c, array $ctx): bool
{
    $actual = $ctx[$c['field']] ?? null;
    $a = cond_as_array($actual);
    $val = $c['value'] ?? null;
    $eq = fn($x) => js_str($x) === js_str($val);
    switch ($c['op']) {
        case 'eq':
            return (bool)array_filter($a, $eq);
        case 'neq':
            return !array_filter($a, $eq);
        case 'in':
        case 'nin':
            $wanted = array_map('js_str', cond_as_array($val));
            $hit = (bool)array_filter($a, fn($x) => in_array(js_str($x), $wanted, true));
            return $c['op'] === 'in' ? $hit : !$hit;
        case 'contains':
        case 'not_contains':
            $hit = is_string($actual) ? str_contains(mb_strtolower($actual), mb_strtolower(js_str($val ?? ''))) : (bool)array_filter($a, $eq);
            return $c['op'] === 'contains' ? $hit : !$hit;
        case 'exists':
            return !cond_is_empty($actual);
        case 'empty':
            return cond_is_empty($actual);
        case 'gt':
            return js_number($actual) > js_number($val);
        case 'lt':
            return js_number($actual) < js_number($val);
        case 'truthy':
            return js_truthy($actual) && $actual !== 'false' && $actual !== 'no';
    }
    return false;
}

function eval_logic(?array $logic, array $ctx): bool
{
    if (!$logic) {
        return true;
    }
    $all = $logic['all'] ?? [];
    $any = $logic['any'] ?? [];
    if (!$all && !$any) {
        return true;
    }
    foreach ($all as $c) {
        if (!eval_cond($c, $ctx)) {
            return false;
        }
    }
    return !$any || (bool)array_filter($any, fn($c) => eval_cond($c, $ctx));
}

// ─────────────────────────────── onboarding form definition helpers ───────────────────────────────

function question_visible_with(array $q, array $answers, array $cats): bool
{
    if (!empty($q['categoryKeys']) && !array_intersect($q['categoryKeys'], array_keys($cats))) {
        return false;
    }
    return eval_logic($q['conditionalLogic'] ?? null, $answers);
}

/**
 * Which question categories are currently in play. COMMON is always on; every selected option can add categories (picking
 * "Real Estate" adds REAL_ESTATE). Iterates to a fixed point because a category can reveal further questions whose options add more.
 * @return array<string,true>
 */
function active_categories(array $form, array $answers, array $extra = []): array
{
    $cats = ['COMMON' => true];
    foreach ($extra as $k) {
        $cats[$k] = true;
    }
    for ($i = 0; $i < 6; $i++) {
        $before = count($cats);
        foreach ($form['sections'] as $s) {
            foreach ($s['questions'] as $q) {
                if (empty($q['options']) || !question_visible_with($q, $answers, $cats)) {
                    continue;
                }
                $picked = array_map('js_str', cond_as_array($answers[$q['key']] ?? null));
                foreach ($q['options'] as $o) {
                    if (in_array(js_str($o['value']), $picked, true)) {
                        foreach ($o['categoryKeys'] ?? [] as $k) {
                            $cats[$k] = true;
                        }
                    }
                }
            }
        }
        if (count($cats) === $before) {
            break;
        }
    }
    return $cats;
}

function is_question_visible(array $form, array $q, array $answers, array $extra = []): bool
{
    return question_visible_with($q, $answers, active_categories($form, $answers, $extra));
}

function visible_questions(array $form, array $section, array $answers, array $extra = []): array
{
    $cats = active_categories($form, $answers, $extra);
    return array_values(array_filter($section['questions'], fn($q) => question_visible_with($q, $answers, $cats)));
}

function visible_sections(array $form, array $answers, array $extra = []): array
{
    $cats = active_categories($form, $answers, $extra);
    return array_values(array_filter($form['sections'], fn($s) => (bool)array_filter($s['questions'], fn($q) => question_visible_with($q, $answers, $cats))));
}

function is_answered(mixed $v): bool
{
    if ($v === null) {
        return false;
    }
    if (is_string($v)) {
        return trim($v) !== '';
    }
    if (is_array($v)) {
        return count($v) > 0;
    }
    return true;
}

/** Validates ONE answer against its question definition. Returns an error message or null. */
function validate_answer(array $q, mixed $value): ?string
{
    if (!is_answered($value)) {
        return !empty($q['required']) ? 'This field is required.' : null;
    }
    $s = is_string($value) ? trim($value) : $value;
    $meta = $q['meta'] ?? [];
    switch ($q['type']) {
        case 'EMAIL':
            return preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u', js_str($s)) ? null : 'Enter a valid email address.';
        case 'URL':
            return preg_match('#^https?://[^\s/$.?\#].[^\s]*$#i', js_str($s)) ? null : 'Enter a valid URL starting with http:// or https://';
        case 'PHONE':
            return preg_match('/^[+()\-.\s\d]{6,24}$/', js_str($s)) ? null : 'Enter a valid phone number.';
        case 'COLOR':
            return preg_match('/^#?[0-9a-f]{3,8}$/i', js_str($s)) ? null : 'Enter a valid color like #2457E6.';
        case 'NUMBER':
        case 'CURRENCY':
            if (!is_numeric($s) || !is_finite((float)$s)) {
                return 'Enter a number.';
            }
            if (isset($meta['min']) && (float)$s < $meta['min']) {
                return "Must be at least {$meta['min']}.";
            }
            if (isset($meta['max']) && (float)$s > $meta['max']) {
                return "Must be at most {$meta['max']}.";
            }
            return null;
        case 'DATE':
            return ts_ms(js_str($s)) === null ? 'Enter a valid date.' : null;
        case 'TIME':
            return preg_match('/^\d{1,2}:\d{2}$/', js_str($s)) ? null : 'Enter a valid time.';
        case 'RATING':
            $n = js_number($s);
            return $n >= 1 && $n <= 5 ? null : 'Choose a rating from 1 to 5.';
        case 'SELECT':
        case 'RADIO':
            if (!empty($q['options']) && !array_filter($q['options'], fn($o) => js_str($o['value']) === js_str($s))) {
                return 'Choose one of the options.';
            }
            return null;
        case 'MULTI_SELECT':
            if (!is_array($value)) {
                return 'Choose one or more options.';
            }
            if (!empty($q['options'])) {
                foreach ($value as $v) {
                    if (!array_filter($q['options'], fn($o) => js_str($o['value']) === js_str($v))) {
                        return 'One of the selected options is not valid.';
                    }
                }
            }
            return null;
        case 'TEXT':
        case 'TEXTAREA':
            $max = $meta['maxLength'] ?? ($q['type'] === 'TEXT' ? 300 : 8000);
            $min = $meta['minLength'] ?? null;
            $len = mb_strlen(js_str($s));
            if ($min && $len < $min) {
                return "Please write at least {$min} characters so we can help properly.";
            }
            return $len > $max ? "Keep this under {$max} characters." : null;
    }
    return null;
}
