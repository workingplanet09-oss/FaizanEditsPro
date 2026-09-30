<?php
/**
 * Generic CMS engine: every admin-editable content type (services, pricing, portfolio, case studies, testimonials, FAQs, help articles,
 * blog, project types/templates, email templates) is described in data/cms-resources.json and edited through the same validated code path.
 */
defined('FEP') or exit;

const FEP_CMS_TABLES = [
    'service' => 'services', 'pricingPlan' => 'pricing_plans', 'portfolioProject' => 'portfolio_projects', 'caseStudy' => 'case_studies', 'testimonial' => 'testimonials', 'faq' => 'faqs',
    'kbArticle' => 'kb_articles', 'blogPost' => 'blog_posts', 'blogCategory' => 'blog_categories', 'projectType' => 'project_types', 'projectTemplate' => 'project_templates', 'emailTemplate' => 'email_templates',
];

function cms_resources(): array { return app_data('cms-resources')['RESOURCES']; }

function cms_resource(string $key): array
{
    $def = cms_resources()[$key] ?? null;
    if (!$def) {
        throw not_found('Resource');
    }
    $def['table'] = FEP_CMS_TABLES[$def['model']];
    return $def;
}

function cms_clean_str(mixed $v, int $max): string
{
    if (is_array($v) || is_object($v)) {
        return '';
    }
    return mb_substr(trim((string)($v ?? '')), 0, $max);
}

function cms_safe_url(string $v): bool
{
    return $v === '' || preg_match('#^https?://#i', $v) || str_starts_with($v, '/');
}

function cms_coerce_field(array $f, mixed $raw, string $currency): mixed
{
    $req = !empty($f['required']);
    switch ($f['type']) {
        case 'text':
        case 'icon':
        case 'select':
            $s = cms_clean_str($raw, 300);
            if ($f['type'] === 'select' && $s !== '' && !empty($f['options']) && !in_array($s, array_map(fn($o) => is_array($o) ? $o['value'] : $o, $f['options']), true)) {
                throw bad_request("Choose a valid option for {$f['label']}.", [$f['key'] => 'Invalid option.']);
            }
            return $s === '' ? ($req ? '' : null) : $s;
        case 'textarea':
            $s = cms_clean_str($raw, 5000);
            return $s === '' ? ($req ? '' : null) : $s;
        case 'markdown':
            $s = is_string($raw) ? mb_substr($raw, 0, 80000) : '';
            return trim($s) === '' ? ($req ? '' : null) : $s;
        case 'url':
        case 'image':
            $s = cms_clean_str($raw, 1000);
            if (!cms_safe_url($s)) {
                throw bad_request("{$f['label']} must start with http:// or https://", [$f['key'] => 'Invalid URL.']);
            }
            return $s === '' ? null : $s;
        case 'slug':
            return slugify(cms_clean_str($raw, 120));
        case 'number':
            if ($raw === '' || $raw === null) {
                return null;
            }
            if (!is_numeric($raw)) {
                throw bad_request("{$f['label']} must be a number.", [$f['key'] => 'Must be a number.']);
            }
            return (int)round((float)$raw);
        case 'money':
            if ($raw === '' || $raw === null) {
                return null;
            }
            if (!is_numeric($raw) || (float)$raw < 0) {
                throw bad_request("{$f['label']} must be a positive amount.", [$f['key'] => 'Invalid amount.']);
            }
            return to_minor((float)$raw, $currency);
        case 'boolean':
            return $raw === true || $raw === 'true';
        case 'relation':
            return $raw ? (string)$raw : null;
        case 'tags':
        case 'lines':
            $arr = is_array($raw) ? $raw : (is_string($raw) ? explode($f['type'] === 'lines' ? "\n" : ',', $raw) : []);
            $out = array_slice(array_values(array_filter(array_map(fn($x) => cms_clean_str($x, 300), $arr), fn($x) => $x !== '')), 0, 100);
            return $f['type'] === 'tags' ? array_values(array_unique($out)) : $out;
        case 'datetime':
            if (!$raw) {
                return null;
            }
            $ms = ts_ms((string)$raw);
            if ($ms === null) {
                throw bad_request("{$f['label']} isn't a valid date.", [$f['key'] => 'Invalid date.']);
            }
            return $ms;
        case 'metrics':
            if (!is_array($raw)) {
                return null;
            }
            $out = [];
            foreach ($raw as $k => $v) {
                $val = cms_clean_str($v, 80);
                if ($val !== '' && strlen((string)$k) <= 40) {
                    $out[$k] = $val;
                }
            }
            return $out ?: null;
        case 'tasklist':
            $tasks = [];
            foreach (preg_split('/\n/', is_string($raw) ? $raw : '') as $l) {
                $l = rtrim($l);
                if (trim($l) === '') {
                    continue;
                }
                if (preg_match('/^\s*[-–•*]\s+(.*)$/u', $l, $m) && $tasks) {
                    $tasks[count($tasks) - 1]['subtasks'][] = mb_substr(trim($m[1]), 0, 200);
                } else {
                    $tasks[] = ['title' => mb_substr(trim($l), 0, 200), 'subtasks' => []];
                }
            }
            return array_slice($tasks, 0, 80);
        case 'deliverables':
            $lines = array_values(array_filter(array_map('trim', preg_split('/\n/', is_string($raw) ? $raw : '')), fn($x) => $x !== ''));
            return array_map(function ($l) {
                return preg_match('/^(\d+)\s*[x×]\s*(.+)$/iu', $l, $m) ? ['quantity' => (int)$m[1], 'label' => mb_substr(trim($m[2]), 0, 150)] : ['quantity' => 1, 'label' => mb_substr($l, 0, 150)];
            }, array_slice($lines, 0, 40));
    }
    return null;
}

/** DB row → API shape (tasklist/deliverables become editable text; everything else passes through). */
function cms_serialize_row(array $def, array $row): array
{
    $out = $row;
    foreach ($def['fields'] as $f) {
        $v = $row[$f['key']] ?? null;
        if ($f['type'] === 'tasklist' && is_array($v)) {
            $out[$f['key']] = implode("\n", array_map(fn($t) => implode("\n", array_merge([$t['title']], array_map(fn($s) => "- {$s}", $t['subtasks'] ?? []))), $v));
        }
        if ($f['type'] === 'deliverables' && is_array($v)) {
            $out[$f['key']] = implode("\n", array_map(fn($d) => "{$d['quantity']} x {$d['label']}", $v));
        }
        if ($f['type'] === 'lines' && $v && !is_array($v)) {
            $out[$f['key']] = [];
        }
    }
    return $out;
}

function cms_build_data(array $def, array $input, bool $create, ?string $existingCurrency = null): array
{
    $data = [];
    $currency = strtoupper((string)($input['currency'] ?? $existingCurrency ?? 'USD'));
    $fields = [];
    foreach ($def['fields'] as $f) {
        if (!array_key_exists($f['key'], $input)) {
            if ($create && !empty($f['required']) && !isset($def['defaults'][$f['key']]) && $f['type'] !== 'slug') {
                $fields[$f['key']] = 'Required.';
            }
            continue;
        }
        if (!empty($f['readOnlyOnEdit']) && !$create) {
            continue;
        }
        $v = cms_coerce_field($f, $input[$f['key']], $currency);
        if (!empty($f['required']) && ($v === null || $v === '' || (is_array($v) && !$v))) {
            $fields[$f['key']] = 'Required.';
        }
        $data[$f['key']] = $v;
    }
    if ($fields) {
        throw new AppError('VALIDATION', 'Please check the highlighted fields.', $fields);
    }
    if ($create) {
        foreach ($def['defaults'] ?? [] as $k => $v) {
            if (!array_key_exists($k, $data)) {
                $data[$k] = $v;
            }
        }
    }
    if (array_filter($def['fields'], fn($f) => $f['key'] === 'slug') && empty($data['slug']) && ($create || array_key_exists('slug', $input))) {
        $base = slugify((string)($data[$def['titleField']] ?? $input[$def['titleField']] ?? ''));
        if ($base === '') {
            throw new AppError('VALIDATION', 'A slug (or title) is required.', ['slug' => 'Required.']);
        }
        $data['slug'] = $base;
    }
    if (isset($data['currency']) && is_string($data['currency'])) {
        $data['currency'] = substr(strtoupper($data['currency']), 0, 3);
    }
    // a relation may only point at a row of the related resource in this workspace
    foreach ($def['fields'] as $f) {
        if ($f['type'] === 'relation' && !empty($data[$f['key']])) {
            $rel = cms_resource($f['relation']);
            if (!Db::exists($rel['table'], ['id' => $data[$f['key']]])) {
                throw bad_request("Choose a valid {$f['label']}.", [$f['key'] => 'Not found.']);
            }
        }
    }
    return $data;
}

function cms_order_sql(array $def): string
{
    $parts = [];
    foreach ($def['orderBy'] as $col => $dir) {
        $parts[] = '`' . preg_replace('/[^A-Za-z0-9_]/', '', $col) . '` ' . (strtolower($dir) === 'desc' ? 'DESC' : 'ASC');
    }
    return implode(', ', $parts);
}

/** $q: q, page, pageSize */
function cms_list(Actor $actor, string $resource, array $q = []): array
{
    $def = cms_resource($resource);
    assert_can($actor, $def['perm']);
    $pageSize = min((int)($q['pageSize'] ?? 25), 200) ?: 25;
    $page = max((int)($q['page'] ?? 1), 1);
    $where = '`workspaceId` = ?';
    $params = [$actor->workspaceId];
    if (!empty($q['q'])) {
        $like = like_pattern((string)$q['q']);
        $where .= ' AND (' . implode(' OR ', array_map(fn($f) => '`' . preg_replace('/[^A-Za-z0-9_]/', '', $f) . '` LIKE ?', $def['searchFields'])) . ')';
        array_push($params, ...array_fill(0, count($def['searchFields']), $like));
    }
    $rows = Db::hydrateAll($def['table'], Db::rows("SELECT * FROM `{$def['table']}` WHERE {$where} ORDER BY " . cms_order_sql($def) . ' LIMIT ' . $pageSize . ' OFFSET ' . (($page - 1) * $pageSize), $params));
    $total = (int)Db::val("SELECT COUNT(*) FROM `{$def['table']}` WHERE {$where}", $params);
    return ['items' => array_map(fn($r) => cms_serialize_row($def, $r), $rows), 'total' => $total, 'page' => $page, 'pageSize' => $pageSize, 'pages' => max(1, (int)ceil($total / $pageSize))];
}

function cms_get(Actor $actor, string $resource, string $id): array
{
    $def = cms_resource($resource);
    assert_can($actor, $def['perm']);
    $row = Db::first($def['table'], ['id' => $id, 'workspaceId' => $actor->workspaceId]);
    if (!$row) {
        throw not_found($def['singular']);
    }
    return cms_serialize_row($def, $row);
}

function cms_conflict(PDOException $e, array $def): never
{
    if (Db::isDuplicate($e)) {
        throw new AppError('CONFLICT', 'That ' . (array_filter($def['fields'], fn($f) => $f['key'] === 'slug') ? 'URL slug' : 'value') . ' is already in use.', ['slug' => 'Already in use.']);
    }
    throw $e;
}

function cms_after_write(): void { invalidate_settings(); }

function cms_create(Actor $actor, string $resource, array $input): array
{
    $def = cms_resource($resource);
    assert_can($actor, $def['perm']);
    if (($def['allowCreate'] ?? null) === false) {
        throw new AppError('FORBIDDEN', "New " . strtolower($def['label']) . " can't be created here.");
    }
    $data = cms_build_data($def, $input, true);
    if ($def['key'] === 'blog-posts') {
        if (empty($data['authorName'])) {
            $data['authorName'] = $actor->name;
        }
        if (($data['status'] ?? null) === 'PUBLISHED' && empty($data['publishedAt'])) {
            $data['publishedAt'] = now_ms();
        }
    }
    if (!empty($def['sortable'])) {
        $data['sortOrder'] = (int)Db::val("SELECT COALESCE(MAX(`sortOrder`), 0) FROM `{$def['table']}` WHERE `workspaceId` = ?", [$actor->workspaceId]) + 10;
    }
    try {
        $row = Db::insert($def['table'], $data + ['workspaceId' => $actor->workspaceId]);
    } catch (PDOException $e) {
        cms_conflict($e, $def);
    }
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => "{$def['key']}.created", 'entityType' => $def['key'], 'entityId' => $row['id'], 'message' => "{$actor->name} created {$def['singular']} “{$row[$def['titleField']]}”"]);
    cms_after_write();
    return cms_serialize_row($def, $row);
}

function cms_update(Actor $actor, string $resource, string $id, array $input): array
{
    $def = cms_resource($resource);
    assert_can($actor, $def['perm']);
    $existing = Db::first($def['table'], ['id' => $id, 'workspaceId' => $actor->workspaceId]);
    if (!$existing) {
        throw not_found($def['singular']);
    }
    $data = cms_build_data($def, $input, false, $existing['currency'] ?? null);
    if ($def['key'] === 'blog-posts' && ($data['status'] ?? null) === 'PUBLISHED' && empty($existing['publishedAt']) && empty($data['publishedAt'])) {
        $data['publishedAt'] = now_ms();
    }
    try {
        Db::update($def['table'], ['id' => $id], $data);
    } catch (PDOException $e) {
        cms_conflict($e, $def);
    }
    $row = Db::first($def['table'], ['id' => $id]);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => "{$def['key']}.updated", 'entityType' => $def['key'], 'entityId' => $id, 'message' => "{$actor->name} edited {$def['singular']} “{$row[$def['titleField']]}”"]);
    cms_after_write();
    return cms_serialize_row($def, $row);
}

function cms_delete(Actor $actor, string $resource, string $id): array
{
    $def = cms_resource($resource);
    assert_can($actor, $def['perm']);
    if (($def['allowDelete'] ?? null) === false) {
        throw new AppError('FORBIDDEN', "{$def['label']} can't be deleted — disable them instead.");
    }
    $existing = Db::first($def['table'], ['id' => $id, 'workspaceId' => $actor->workspaceId]);
    if (!$existing) {
        throw not_found($def['singular']);
    }
    try {
        Db::delete($def['table'], ['id' => $id]);
    } catch (PDOException $e) {
        if (($e->errorInfo[1] ?? 0) === 1451) {
            throw new AppError('CONFLICT', "This {$def['singular']} is in use and can't be deleted. Unpublish or disable it instead.");
        }
        throw $e;
    }
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => "{$def['key']}.deleted", 'entityType' => $def['key'], 'entityId' => $id, 'message' => "{$actor->name} deleted {$def['singular']} “{$existing[$def['titleField']]}”"]);
    cms_after_write();
    return ['ok' => true];
}

function cms_duplicate(Actor $actor, string $resource, string $id): array
{
    $def = cms_resource($resource);
    assert_can($actor, $def['perm']);
    $existing = Db::first($def['table'], ['id' => $id, 'workspaceId' => $actor->workspaceId]);
    if (!$existing) {
        throw not_found($def['singular']);
    }
    unset($existing['id'], $existing['createdAt'], $existing['updatedAt']);
    $data = $existing;
    $data[$def['titleField']] = "{$existing[$def['titleField']]} (copy)";
    if (array_key_exists('slug', $data)) {
        $data['slug'] = $existing['slug'] . '-copy-' . strtolower(substr(preg_replace('/[^a-z0-9]/i', '', random_token(4)), 0, 4));
    }
    if (array_key_exists('published', $data)) {
        $data['published'] = false;
    }
    if (array_key_exists('enabled', $data)) {
        $data['enabled'] = false;
    }
    if (array_key_exists('status', $data) && $def['key'] !== 'testimonials') {
        $data['status'] = 'DRAFT';
    }
    if ($def['key'] === 'blog-posts') {
        $data['publishedAt'] = null;
    }
    if ($def['key'] === 'case-studies') {
        $data['portfolioProjectId'] = null;
    }
    $row = Db::insert($def['table'], $data);
    cms_after_write();
    return cms_serialize_row($def, $row);
}

function cms_reorder(Actor $actor, string $resource, array $ids): array
{
    $def = cms_resource($resource);
    assert_can($actor, $def['perm']);
    if (empty($def['sortable'])) {
        throw bad_request("This resource can't be reordered.");
    }
    [$ph, $pp] = Db::in($ids);
    $owned = (int)Db::val("SELECT COUNT(*) FROM `{$def['table']}` WHERE `id` IN {$ph} AND `workspaceId` = ?", [...$pp, $actor->workspaceId]);
    if ($owned !== count(array_unique($ids))) {
        throw not_found($def['singular']);
    }
    Db::tx(function () use ($def, $ids) {
        foreach (array_values($ids) as $i => $id) {
            Db::update($def['table'], ['id' => $id], ['sortOrder' => ($i + 1) * 10]);
        }
    });
    cms_after_write();
    return ['ok' => true];
}
