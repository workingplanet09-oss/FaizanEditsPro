<?php
/** Dynamic questionnaires (the public inquiry wizard and the project onboarding): definitions, validation, drafts, answers, form builder. */
defined('FEP') or exit;

// ───────────────────────────── form definitions (DB → DTO) ─────────────────────────────

function build_form(string $workspaceId, string $key, bool $includeInactive): ?array
{
    $form = Db::first('onboarding_forms', ['workspaceId' => $workspaceId, 'key' => $key]);
    if (!$form) {
        return null;
    }
    $sections = Db::find('onboarding_sections', ['formId' => $form['id']], ['order' => '`sortOrder` ASC']);
    $qWhere = ['sql' => '`formId` = ?' . ($includeInactive ? '' : ' AND `active` = 1'), 'params' => [$form['id']]];
    $questions = Db::find('onboarding_questions', $qWhere, ['order' => '`sortOrder` ASC']);
    $options = [];
    $cats = [];
    if ($questions) {
        [$ph, $p] = Db::in(array_column($questions, 'id'));
        foreach (Db::find('onboarding_options', ['sql' => "`questionId` IN {$ph}", 'params' => $p], ['order' => '`sortOrder` ASC']) as $o) {
            $options[$o['questionId']][] = ['label' => $o['label'], 'value' => $o['value'], 'categoryKeys' => $o['categoryKeys'], 'icon' => $o['icon'], 'description' => $o['description']];
        }
        foreach (Db::rows("SELECT cq.`questionId`, c.`key` FROM `onboarding_category_questions` cq JOIN `onboarding_categories` c ON c.`id` = cq.`categoryId` WHERE cq.`questionId` IN {$ph}", $p) as $r) {
            $cats[$r['questionId']][] = $r['key'];
        }
    }
    $bySection = [];
    foreach ($questions as $q) {
        $bySection[$q['sectionId']][] = $q;
    }
    $out = ['key' => $form['key'], 'name' => $form['name'], 'sections' => []];
    foreach ($sections as $s) {
        $qs = [];
        foreach ($bySection[$s['id']] ?? [] as $q) {
            $qs[] = [
                'id' => $q['id'], 'key' => $q['key'], 'text' => $q['text'], 'helpText' => $q['helpText'], 'placeholder' => $q['placeholder'], 'type' => $q['type'],
                'required' => $q['required'], 'active' => $q['active'], 'categoryKeys' => $cats[$q['id']] ?? [], 'conditionalLogic' => $q['conditionalLogic'],
                'meta' => $q['meta'], 'sectionKey' => $s['key'], 'sortOrder' => $q['sortOrder'], 'options' => $options[$q['id']] ?? [],
            ];
        }
        $out['sections'][] = ['key' => $s['key'], 'title' => $s['title'], 'description' => $s['description'], 'questions' => $qs];
    }
    return $out;
}

function form_cache(string $k, ?array $set = null, bool $clear = false): ?array
{
    static $cache = [];
    if ($clear) {
        $cache = [];
        return null;
    }
    if ($set !== null) {
        $cache[$k] = $set;
    }
    return $cache[$k] ?? null;
}

/** Public definition of an onboarding form (active questions only). */
function get_form_def(string $workspaceId, string $key): ?array
{
    $ck = "{$workspaceId}:{$key}";
    $hit = form_cache($ck);
    if ($hit !== null) {
        return $hit;
    }
    $f = build_form($workspaceId, $key, false);
    if ($f) {
        form_cache($ck, $f);
    }
    return $f;
}

function get_form_def_fresh(string $workspaceId, string $key): ?array { return build_form($workspaceId, $key, true); }
function invalidate_forms(): void { form_cache('', null, true); }

// ───────────────────────────── validation ─────────────────────────────

/**
 * Validates a submission against the DB-defined form. Only questions that are VISIBLE for the given answers are required/validated,
 * so hidden conditional questions never block a submit. Returns a cleaned answers map containing only known, visible questions.
 * @return array{clean:array,errors:array<string,string>}
 */
function validate_submission(array $form, array $answers, array $opts = []): array
{
    $clean = [];
    $errors = [];
    foreach ($form['sections'] as $section) {
        if (in_array($section['key'], $opts['skipSections'] ?? [], true)) {
            continue;
        }
        foreach (visible_questions($form, $section, $answers, $opts['extraCategories'] ?? []) as $q) {
            $v = $answers[$q['key']] ?? null;
            if ($q['type'] === 'FILE') {
                // file answers are attachment ids validated by the caller
                if (is_answered($v)) {
                    $clean[$q['key']] = $v;
                } elseif ($q['required']) {
                    $errors[$q['key']] = 'This field is required.';
                }
                continue;
            }
            $err = validate_answer($q, $v);
            if ($err) {
                $errors[$q['key']] = $err;
            } elseif (is_answered($v)) {
                $clean[$q['key']] = is_string($v) ? trim($v) : $v;
            }
        }
    }
    return ['clean' => $clean, 'errors' => $errors];
}

function assert_valid(array $errors): void
{
    if ($errors) {
        throw new AppError('VALIDATION', 'Please check the highlighted fields.', $errors);
    }
}

// ───────────────────────────── drafts (autosave / resume) ─────────────────────────────

function save_draft(array $in): array
{
    $data = $in['data'];
    $step = (int)$in['step'];
    $out = fn(array $d) => ['token' => $d['token'], 'step' => $d['step'], 'updatedAt' => $d['updatedAt']];
    $userId = $in['userId'] ?? null;
    if (!empty($in['token'])) {
        $existing = Db::first('onboarding_drafts', ['token' => $in['token']]);
        if ($existing && !$existing['submittedAt'] && $existing['formKey'] === $in['formKey'] && (!$existing['userId'] || $existing['userId'] === $userId)) {
            Db::update('onboarding_drafts', ['id' => $existing['id']], ['data' => $data, 'step' => $step] + ($userId && !$existing['userId'] ? ['userId' => $userId] : []));
            return $out(Db::first('onboarding_drafts', ['id' => $existing['id']]));
        }
    }
    // signed-in users keep one open draft per form/subject so "Continue setup" always finds it
    if ($userId) {
        $open = find_open_draft($userId, $in['formKey'], $in['subjectType'] ?? null, $in['subjectId'] ?? null);
        if ($open) {
            Db::update('onboarding_drafts', ['id' => $open['id']], ['data' => $data, 'step' => $step]);
            return $out(Db::first('onboarding_drafts', ['id' => $open['id']]));
        }
    }
    // The browser may mint its own unguessable token (used to tie file uploads to this draft); adopt it if well-formed.
    $token = !empty($in['token']) && preg_match('/^[A-Za-z0-9_-]{16,64}$/', $in['token']) && !Db::exists('onboarding_drafts', ['token' => $in['token']]) ? $in['token'] : random_token(24);
    $d = Db::insert('onboarding_drafts', ['workspaceId' => $in['workspaceId'], 'token' => $token, 'userId' => $userId, 'formKey' => $in['formKey'], 'data' => $data, 'step' => $step, 'subjectType' => $in['subjectType'] ?? null, 'subjectId' => $in['subjectId'] ?? null]);
    return $out($d);
}

function find_open_draft(string $userId, string $formKey, ?string $subjectType, ?string $subjectId): ?array
{
    return Db::first('onboarding_drafts', ['sql' => '`userId` = ? AND `formKey` = ? AND `submittedAt` IS NULL AND `subjectType` <=> ? AND `subjectId` <=> ?', 'params' => [$userId, $formKey, $subjectType, $subjectId]], ['order' => '`updatedAt` DESC']);
}

function get_draft(array $in): ?array
{
    $userId = $in['userId'] ?? null;
    $d = !empty($in['token']) ? Db::first('onboarding_drafts', ['token' => $in['token']]) : null;
    if ($d && ($d['formKey'] !== $in['formKey'] || $d['submittedAt'] || ($d['userId'] && $d['userId'] !== $userId))) {
        $d = null;
    }
    if (!$d && $userId) {
        $d = find_open_draft($userId, $in['formKey'], $in['subjectType'] ?? null, $in['subjectId'] ?? null);
    }
    return $d ? ['token' => $d['token'], 'data' => $d['data'] ?? [], 'step' => $d['step'], 'updatedAt' => $d['updatedAt']] : null;
}

function mark_draft_submitted(?string $token): void
{
    if ($token) {
        Db::update('onboarding_drafts', ['token' => $token], ['submittedAt' => db_dt()]);
    }
}

// ───────────────────────────── stored responses ─────────────────────────────

function save_responses(array $in): void
{
    $byKey = [];
    foreach ($in['form']['sections'] as $s) {
        foreach ($s['questions'] as $q) {
            $byKey[$q['key']] = $q;
        }
    }
    $keys = array_values(array_filter(array_keys($in['answers']), fn($k) => isset($byKey[$k])));
    Db::tx(function () use ($in, $byKey, $keys) {
        [$ph, $p] = Db::in($keys);
        Db::exec("DELETE FROM `onboarding_responses` WHERE `subjectType` = ? AND `subjectId` = ? AND `formKey` = ? AND `questionKey` NOT IN {$ph}", [$in['subjectType'], $in['subjectId'], $in['formKey'], ...$p]);
        foreach ($keys as $k) {
            Db::upsert(
                'onboarding_responses',
                ['workspaceId' => $in['workspaceId'], 'formKey' => $in['formKey'], 'subjectType' => $in['subjectType'], 'subjectId' => $in['subjectId'], 'questionKey' => $k, 'questionText' => $byKey[$k]['text'], 'value' => $in['answers'][$k]],
                ['value' => $in['answers'][$k], 'questionText' => $byKey[$k]['text'], 'updatedAt' => db_dt()],
            );
        }
    });
}

/** @return array{answers:array,rows:array} */
function load_responses(string $subjectType, string $subjectId, ?string $formKey = null): array
{
    $where = ['sql' => '`subjectType` = ? AND `subjectId` = ?' . ($formKey ? ' AND `formKey` = ?' : ''), 'params' => array_values(array_filter([$subjectType, $subjectId, $formKey]))];
    $rows = Db::find('onboarding_responses', $where, ['order' => '`createdAt` ASC']);
    $answers = [];
    foreach ($rows as $r) {
        $answers[$r['questionKey']] = $r['value'];
    }
    return ['answers' => $answers, 'rows' => $rows];
}

/** Human-readable label for a stored answer (maps option values to option labels). */
function display_answer(?array $q, mixed $value): string
{
    $one = function ($v) use ($q) {
        foreach ($q['options'] ?? [] as $o) {
            if ($o['value'] === js_str($v)) {
                return $o['label'];
            }
        }
        return js_str($v);
    };
    if (is_array($value)) {
        return implode(', ', array_map($one, $value));
    }
    if (is_bool($value)) {
        return $value ? 'Yes' : 'No';
    }
    return $one($value);
}

// ───────────────────────────── admin form builder ─────────────────────────────

function category_ids(string $workspaceId, array $keys): array
{
    if (!$keys) {
        return [];
    }
    [$ph, $p] = Db::in($keys);
    return Db::col("SELECT `id` FROM `onboarding_categories` WHERE `workspaceId` = ? AND `key` IN {$ph}", [$workspaceId, ...$p]);
}

function admin_overview(Actor $actor, string $formKey): array
{
    assert_can($actor, 'forms:manage');
    $form = get_form_def_fresh($actor->workspaceId, $formKey);
    if (!$form) {
        throw not_found('Form');
    }
    return [
        'form' => $form,
        'categories' => Db::find('onboarding_categories', ['workspaceId' => $actor->workspaceId], ['order' => '`sortOrder` ASC']),
        'forms' => Db::find('onboarding_forms', ['workspaceId' => $actor->workspaceId], ['cols' => ['key', 'name']]),
    ];
}

function replace_question_options(string $questionId, array $options): void
{
    Db::delete('onboarding_options', ['questionId' => $questionId]);
    foreach (array_values($options) as $i => $o) {
        Db::insert('onboarding_options', ['questionId' => $questionId, 'label' => $o['label'], 'value' => $o['value'], 'categoryKeys' => $o['categoryKeys'] ?? [], 'icon' => $o['icon'] ?? null, 'description' => $o['description'] ?? null, 'sortOrder' => $i * 10], false);
    }
}

function set_question_categories(string $workspaceId, string $questionId, array $keys): void
{
    Db::delete('onboarding_category_questions', ['questionId' => $questionId]);
    foreach (category_ids($workspaceId, $keys) as $cid) {
        Db::insert('onboarding_category_questions', ['categoryId' => $cid, 'questionId' => $questionId], false);
    }
}

function create_question(Actor $actor, array $in): array
{
    assert_can($actor, 'forms:manage');
    $form = Db::first('onboarding_forms', ['workspaceId' => $actor->workspaceId, 'key' => $in['formKey']]);
    if (!$form) {
        throw not_found('Form');
    }
    $section = Db::first('onboarding_sections', ['formId' => $form['id'], 'key' => $in['sectionKey']]);
    if (!$section) {
        throw bad_request('Unknown section.');
    }
    if (Db::exists('onboarding_questions', ['formId' => $form['id'], 'key' => $in['key']])) {
        throw new AppError('CONFLICT', 'A question with that key already exists.', ['key' => 'Key already in use.']);
    }
    $max = (int)Db::val('SELECT COALESCE(MAX(`sortOrder`), 0) FROM `onboarding_questions` WHERE `sectionId` = ?', [$section['id']]);
    $q = Db::tx(function () use ($in, $form, $section, $max, $actor) {
        $q = Db::insert('onboarding_questions', [
            'formId' => $form['id'], 'sectionId' => $section['id'], 'key' => $in['key'], 'text' => $in['text'], 'helpText' => $in['helpText'] ?? null, 'placeholder' => $in['placeholder'] ?? null,
            'type' => $in['type'], 'required' => $in['required'] ?? false, 'conditionalLogic' => $in['conditionalLogic'] ?? null, 'meta' => $in['meta'] ?? null,
            'active' => $in['active'] ?? true, 'sortOrder' => $max + 10,
        ]);
        set_question_categories($actor->workspaceId, $q['id'], $in['categoryKeys'] ?? []);
        replace_question_options($q['id'], $in['options'] ?? []);
        return $q;
    });
    invalidate_forms();
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'form.question_created', 'entityType' => 'onboarding_question', 'entityId' => $q['id'], 'message' => "{$actor->name} added question “{$q['text']}”"]);
    return $q;
}

function update_question(Actor $actor, string $id, array $in): array
{
    assert_can($actor, 'forms:manage');
    $existing = Db::rowRaw('SELECT q.* FROM `onboarding_questions` q JOIN `onboarding_forms` f ON f.`id` = q.`formId` WHERE q.`id` = ? AND f.`workspaceId` = ?', [$id, $actor->workspaceId]);
    if (!$existing) {
        throw not_found('Question');
    }
    $existing = Db::hydrate('onboarding_questions', $existing);
    $data = [];
    foreach (['text', 'helpText', 'placeholder', 'type', 'required', 'active', 'conditionalLogic', 'meta'] as $f) {
        if (array_key_exists($f, $in)) {
            $data[$f] = $in[$f];
        }
    }
    if (!empty($in['sectionKey'])) {
        $section = Db::first('onboarding_sections', ['formId' => $existing['formId'], 'key' => $in['sectionKey']]);
        if (!$section) {
            throw bad_request('Unknown section.');
        }
        $data['sectionId'] = $section['id'];
    }
    if (!empty($in['key']) && $in['key'] !== $existing['key']) {
        if (Db::exists('onboarding_questions', ['formId' => $existing['formId'], 'key' => $in['key']])) {
            throw new AppError('CONFLICT', 'A question with that key already exists.', ['key' => 'Key already in use.']);
        }
        $data['key'] = $in['key'];
    }
    Db::tx(function () use ($id, $data, $in, $actor) {
        if ($data) {
            Db::update('onboarding_questions', ['id' => $id], $data + ['updatedAt' => db_dt()]);
        }
        if (isset($in['categoryKeys'])) {
            set_question_categories($actor->workspaceId, $id, $in['categoryKeys']);
        }
        if (isset($in['options'])) {
            replace_question_options($id, $in['options']);
        }
    });
    invalidate_forms();
    $q = Db::first('onboarding_questions', ['id' => $id]);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'form.question_updated', 'entityType' => 'onboarding_question', 'entityId' => $id, 'message' => "{$actor->name} edited question “{$q['text']}”"]);
    return $q;
}

function delete_question(Actor $actor, string $id): array
{
    assert_can($actor, 'forms:manage');
    $q = Db::rowRaw('SELECT q.* FROM `onboarding_questions` q JOIN `onboarding_forms` f ON f.`id` = q.`formId` WHERE q.`id` = ? AND f.`workspaceId` = ?', [$id, $actor->workspaceId]);
    if (!$q) {
        throw not_found('Question');
    }
    Db::delete('onboarding_questions', ['id' => $id]);
    invalidate_forms();
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'form.question_deleted', 'entityType' => 'onboarding_question', 'entityId' => $id, 'message' => "{$actor->name} deleted question “{$q['text']}”"]);
    return ['ok' => true];
}

function duplicate_question(Actor $actor, string $id): array
{
    assert_can($actor, 'forms:manage');
    $row = Db::rowRaw('SELECT q.* FROM `onboarding_questions` q JOIN `onboarding_forms` f ON f.`id` = q.`formId` WHERE q.`id` = ? AND f.`workspaceId` = ?', [$id, $actor->workspaceId]);
    if (!$row) {
        throw not_found('Question');
    }
    $q = Db::hydrate('onboarding_questions', $row);
    $key = "{$q['key']}_copy";
    for ($i = 2; Db::exists('onboarding_questions', ['formId' => $q['formId'], 'key' => $key]); $i++) {
        $key = "{$q['key']}_copy{$i}";
    }
    $copy = Db::tx(function () use ($q, $key, $id) {
        $copy = Db::insert('onboarding_questions', [
            'formId' => $q['formId'], 'sectionId' => $q['sectionId'], 'key' => $key, 'text' => "{$q['text']} (copy)", 'helpText' => $q['helpText'], 'placeholder' => $q['placeholder'],
            'type' => $q['type'], 'required' => $q['required'], 'conditionalLogic' => $q['conditionalLogic'], 'meta' => $q['meta'], 'active' => false, 'sortOrder' => $q['sortOrder'] + 1,
        ]);
        foreach (Db::find('onboarding_category_questions', ['questionId' => $id]) as $c) {
            Db::insert('onboarding_category_questions', ['categoryId' => $c['categoryId'], 'questionId' => $copy['id']], false);
        }
        foreach (Db::find('onboarding_options', ['questionId' => $id]) as $o) {
            Db::insert('onboarding_options', ['questionId' => $copy['id'], 'label' => $o['label'], 'value' => $o['value'], 'categoryKeys' => $o['categoryKeys'], 'icon' => $o['icon'], 'description' => $o['description'], 'sortOrder' => $o['sortOrder']], false);
        }
        return $copy;
    });
    invalidate_forms();
    return $copy;
}

/** Persists a new order. $ids is the complete ordered list of question ids within one section. */
function reorder_questions(Actor $actor, array $ids): array
{
    assert_can($actor, 'forms:manage');
    [$ph, $p] = Db::in($ids);
    $owned = (int)Db::val("SELECT COUNT(*) FROM `onboarding_questions` q JOIN `onboarding_forms` f ON f.`id` = q.`formId` WHERE q.`id` IN {$ph} AND f.`workspaceId` = ?", [...$p, $actor->workspaceId]);
    if ($owned !== count($ids)) {
        throw not_found('Question');
    }
    Db::tx(function () use ($ids) {
        foreach ($ids as $i => $id) {
            Db::update('onboarding_questions', ['id' => $id], ['sortOrder' => ($i + 1) * 10]);
        }
    });
    invalidate_forms();
    return ['ok' => true];
}
