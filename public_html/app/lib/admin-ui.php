<?php
/** Shared building blocks for the admin console and the editor workspace (port of components/admin/*). */
defined('FEP') or exit;

// ───────────────────────────── page plumbing ─────────────────────────────

/** Renders a signed-in staff page inside the sidebar frame (area: admin|editor). */
function staff_page(string $area, string $view, Actor $actor, array $vars, array $meta, int $status = 200): never
{
    $badges = [];
    if ($area === 'admin' && $actor->can('messages:read')) {
        $badges['/admin/messages'] = unread_message_count($actor);
    }
    render_page('portal', $view, $vars + ['area' => $area, 'actor' => $actor, 'badges' => $badges, 'scripts' => array_merge(['js/uploader.js', 'js/portal.js', 'js/admin.js'], $vars['extraScripts'] ?? [])], $meta + ['noindex' => true], $status);
}

/**
 * Registers a GET page for the admin console or editor workspace.
 * $perm: null (anyone with access to the area) | permission | list of permissions (any one is enough).
 * $vars(Actor, Ctx) returns the view variables; a '_title' key overrides $title.
 */
function staff_get(string $area, string $path, string|array|null $perm, string $title, string $view, callable $vars): void
{
    page($path, function (Ctx $c) use ($area, $perm, $title, $view, $vars) {
        $actor = require_page_actor($area, req_path());
        if ($perm !== null && !$actor->canAny((array)$perm)) {
            Pages::forbidden();
        }
        $v = $vars($actor, $c);
        $t = $v['_title'] ?? $title;
        unset($v['_title']);
        staff_page($area, $view, $actor, $v, ['title' => $t, 'path' => req_path()]);
    });
}

/** Runs a service call for a page; service errors (404/403) become the matching error page. */
function q_str(Ctx $c, string $key): ?string
{
    $v = $c->query[$key] ?? null;
    return is_string($v) && $v !== '' ? $v : null;
}

function back_link(string $href, string $label): string
{
    return '<div class="mb-2"><a href="' . e($href) . '" class="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg">' . icon('chevron-left', 14) . ' ' . e($label) . '</a></div>';
}

function priority_badge(string $value, string $class = ''): string { return meta_badge('PRIORITY', $value, $class); }

function text_link(string $href, string $label): string
{
    return '<a href="' . e($href) . '" class="text-sm font-semibold text-accent-text hover:underline">' . e($label) . '</a>';
}

/** Standard modal form footer: Cancel + submit button bound to the form id. */
function modal_footer(string $formId, string $submit, string $variant = 'primary'): string
{
    return ui_button('Cancel', ['variant' => 'ghost', 'attrs' => ['data-modal-close' => true]]) . ui_button($submit, ['type' => 'submit', 'variant' => $variant, 'attrs' => ['form' => $formId]]);
}

/** A button + dialog pair: a form that calls the API. $fields: prepared HTML. */
function form_modal(string $id, string $title, string $url, string $fieldsHtml, string $submit, array $o = []): string
{
    $form = '<form id="' . e($id) . '-form" novalidate data-fe-form="' . e($url) . '" data-method="' . e($o['method'] ?? 'POST') . '"'
        . (!empty($o['success']) ? ' data-success="' . e($o['success']) . '"' : '') . (!empty($o['redirect']) ? ' data-redirect="' . e($o['redirect']) . '"' : '')
        . (!empty($o['prepare']) ? ' data-prepare="' . e($o['prepare']) . '"' : '') . (!empty($o['onSuccess']) ? ' data-on-success="' . e($o['onSuccess']) . '"' : '') . ' class="space-y-4">' . form_error_slot() . $fieldsHtml . '</form>';
    return ui_modal($id, $title, $form, ['size' => $o['size'] ?? 'md', 'description' => $o['description'] ?? null, 'footerHtml' => modal_footer($id . '-form', $submit, $o['variant'] ?? 'primary')]);
}

function select_options(array $rows, string $valueKey = 'id', string $labelKey = 'label', ?string $blank = null): array
{
    $out = $blank !== null ? [['value' => '', 'label' => $blank]] : [];
    foreach ($rows as $r) {
        $out[] = ['value' => $r[$valueKey], 'label' => $r[$labelKey]];
    }
    return $out;
}

function enum_options(string $kind, ?string $blank = null): array
{
    $map = status_data(strtoupper($kind) . '_META');
    $out = $blank !== null ? [['value' => '', 'label' => $blank]] : [];
    foreach ($map as $k => $m) {
        $out[] = ['value' => $k, 'label' => $m['label']];
    }
    return $out;
}

// ───────────────────────────── project panels ─────────────────────────────

/** Status card: only legal next steps, plus an admin override mode. The dialog logic lives in assets/js/admin.js. */
function status_control(array $p, bool $canOverride): string
{
    $id = $p['id'];
    $status = $p['status'];
    $meta = [];
    foreach (project_statuses() as $s) {
        $m = status_meta($s);
        $meta[$s] = ['label' => $m['label'], 'clientNow' => $m['clientNow'], 'tone' => $m['tone']];
    }
    $btns = function (array $list, bool $override) use ($meta) {
        $h = '';
        foreach ($list as $s) {
            $h .= '<button type="button" data-status-to="' . e($s) . '" data-override="' . ($override ? '1' : '0') . '" class="' . e(btn_class($override ? 'danger' : (($meta[$s]['tone'] ?? '') === 'success' ? 'soft' : 'outline'), 'sm')) . '">' . ($override ? '' : '→ ') . e($meta[$s]['label'] ?? $s) . '</button>';
        }
        return $h;
    };
    $normal = $p['allowedNext'] ? $btns($p['allowedNext'], false) : '<p class="text-sm text-muted">No further steps available from this status.</p>';
    $h = '<div data-fe-component="status-control" data-props="' . json_attr(['projectId' => $id, 'meta' => $meta, 'canOverride' => $canOverride]) . '">';
    $toggle = $canOverride ? '<button type="button" data-override-toggle class="text-xs font-bold text-subtle hover:text-fg">Admin override</button>' : null;
    $body = '<div class="px-5 pb-5"><div data-group="normal" class="flex flex-wrap gap-2">' . $normal . '</div>'
        . ($canOverride ? '<div data-group="override" hidden class="flex flex-wrap gap-2">' . $btns(array_values(array_filter(project_statuses(), fn($s) => $s !== $status)), true) . '</div>' : '');
    if ($p['history']) {
        $body .= '<details class="mt-4"><summary class="cursor-pointer text-xs font-bold text-muted hover:text-fg">Status history (' . count($p['history']) . ')</summary><ol class="mt-3 space-y-2 border-l border-line pl-4">';
        foreach (array_reverse($p['history']) as $hst) {
            $body .= '<li class="text-xs"><b>' . ($hst['from'] ? e(status_meta($hst['from'])['label'] . ' → ') : '') . e(status_meta($hst['to'])['label']) . '</b>'
                . ($hst['override'] ? '<span class="ml-1.5 rounded bg-danger-soft px-1 py-0.5 text-[10px] font-bold uppercase text-danger">override</span>' : '')
                . '<span class="text-subtle"> · ' . e($hst['by']) . ' · ' . ago($hst['at']) . '</span>' . ($hst['comment'] ? '<span class="block text-muted">' . e($hst['comment']) . '</span>' : '') . '</li>';
        }
        $body .= '</ol></details>';
    }
    $h .= card($body . '</div>', '', 'Status', 'Only legal next steps are offered. Payment and approval gates are enforced.', $toggle);
    $h .= ui_modal('status-modal', 'Move project', '<div class="space-y-4"><p data-gate hidden role="alert" class="flex gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning">' . icon('lock', 16, 'mt-0.5 shrink-0') . '<span data-gate-text></span></p>'
        . '<p data-override-note hidden class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">This bypasses the normal rules. Your name, the time and the reason are stored permanently.</p>'
        . '<p data-status-error hidden role="alert" class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger"></p>'
        . ui_field('status-comment', 'Note (optional, shown in the timeline)', ui_textarea('comment', '', ['id' => 'status-comment', 'rows' => 2, 'class' => 'min-h-[5rem]']), ['class' => '', 'name' => 'comment']) . '</div>',
        ['size' => 'sm', 'footerHtml' => ui_button('Cancel', ['variant' => 'ghost', 'attrs' => ['data-modal-close' => true]]) . ui_button('Override & move', ['variant' => 'danger', 'attrs' => ['data-override-go' => true, 'hidden' => true]]) . ui_button('Move project', ['attrs' => ['data-move-go' => true]])]);
    return $h . '</div>';
}

/** Multi-select helper for the team card. */
function people_select(string $name, string $label, array $staff, array $selected, callable $eligible, bool $disabled): string
{
    $opts = '';
    foreach ($staff as $s) {
        if ($eligible($s['roles']) || in_array($s['id'], $selected, true)) {
            $opts .= '<option value="' . e($s['id']) . '"' . (in_array($s['id'], $selected, true) ? ' selected' : '') . '>' . e($s['name']) . '</option>';
        }
    }
    $id = 'team-' . $name;
    return ui_field($id, $label, '<select id="' . e($id) . '" name="' . e($name) . '" multiple ' . ($disabled ? 'disabled ' : '') . 'class="h-28 w-full rounded-xl border border-line-strong bg-surface px-2 py-1.5 text-sm">' . $opts . '</select>', ['optional' => false, 'name' => $name]);
}

function assign_team_card(array $p, array $staff, bool $canAssign): string
{
    $role = fn(string $r) => array_values(array_map(fn($m) => $m['user']['id'], array_filter($p['members'], fn($m) => $m['role'] === $r)));
    $manager = $p['manager']['id'] ?? '';
    $mgrOptions = select_options(array_map(fn($s) => ['id' => $s['id'], 'label' => $s['name']], $staff), 'id', 'label', 'None');
    $form = form_error_slot()
        . field_select('managerId', 'Project manager', $mgrOptions, $manager, ['optional' => false, 'attrs' => ($canAssign ? [] : ['disabled' => true]) + ['data-null-empty' => true]])
        . people_select('editorIds', 'Editors', $staff, $role('EDITOR'), fn($r) => (bool)array_intersect($r, ['editor', 'senior_editor', 'super_admin', 'admin']), !$canAssign)
        . people_select('motionDesignerIds', 'Motion designers', $staff, $role('MOTION_DESIGNER'), fn($r) => in_array('motion_designer', $r, true), !$canAssign)
        . people_select('reviewerIds', 'Internal reviewers', $staff, $role('REVIEWER'), fn($r) => (bool)array_intersect($r, ['reviewer', 'senior_editor', 'project_manager', 'admin', 'super_admin']), !$canAssign)
        . ($canAssign ? submit_button('Save team') : '') . '<p class="text-xs text-subtle">Hold Ctrl/⌘ to select several people.</p>';
    return card('<form novalidate data-fe-form="/api/projects/' . e($p['id']) . '/assign" data-success="Team updated" data-refresh="0" class="space-y-4 px-5 pb-5">' . $form . '</form>', '', 'Team', 'Assigned editors are notified by email.');
}

function project_edit_modal(array $p): string
{
    $prio = enum_options('PRIORITY');
    $fields = '<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">'
        . field_input('name', 'Name', $p['name'], ['required' => true, 'class' => 'sm:col-span-2'])
        . field_textarea('description', 'Description', (string)($p['description'] ?? ''), ['class' => 'sm:col-span-2', 'attrs' => ['data-null-empty' => true, 'rows' => 3]])
        . field_select('priority', 'Priority', $prio, $p['priority'], ['optional' => false])
        . field_input('deadline', 'Deadline', $p['deadline'] ? substr(iso_dt(ts_ms($p['deadline'])), 0, 10) : '', ['type' => 'date', 'attrs' => ['data-null-empty' => true, 'data-keep-empty' => true]])
        . field_input('revisionLimit', 'Included revision rounds', (string)$p['revisionLimit'], ['type' => 'number', 'min' => 0, 'max' => 20, 'optional' => false, 'attrs' => ['data-type' => 'int']]) . '</div>';
    return ui_button('Edit project', ['variant' => 'outline', 'icon' => 'pencil', 'attrs' => ['data-modal-open' => '#project-edit']]) . form_modal('project-edit', 'Edit project', '/api/projects/' . $p['id'], $fields, 'Save', ['method' => 'PATCH', 'success' => 'Project updated']);
}

function version_upload_card(string $projectId, array $revisions): string
{
    $revOpts = [['value' => '', 'label' => '— not a revision —']];
    foreach ($revisions as $r) {
        $revOpts[] = ['value' => $r['id'], 'label' => 'Round ' . $r['roundNumber'] . ' · ' . ($r['versionLabel'] ?? '')];
    }
    $body = '<div data-fe-component="version-upload" data-props="' . json_attr(['projectId' => $projectId]) . '" class="space-y-4 px-5 pb-5">'
        . '<div data-vu-drop><div data-fe-component="uploader" data-props="' . json_attr(['purpose' => 'version', 'projectId' => $projectId, 'multiple' => false, 'accept' => 'video/*', 'compact' => true, 'title' => 'Drop the exported video here', 'hint' => 'MP4 / MOV / WebM — uploads directly to storage']) . '"></div>'
        . '<div class="mt-4 flex items-center gap-3 text-xs text-subtle"><span class="h-px flex-1 bg-line"></span>or paste a link (Frame.io, Vimeo, Drive…)<span class="h-px flex-1 bg-line"></span></div>'
        . '<input aria-label="Video link" data-vu-link type="url" placeholder="https://" class="' . e(cx(INPUT_BASE, 'mt-4 h-11')) . '"></div>'
        . '<div data-vu-done hidden class="flex items-center gap-3 rounded-xl border border-success/30 bg-success-soft/50 px-4 py-3 text-sm">' . icon('check-circle', 18, 'text-success') . '<span data-vu-name class="min-w-0 flex-1 truncate font-semibold"></span><button type="button" data-vu-replace class="text-xs font-bold text-muted hover:text-fg">Replace</button></div>'
        . '<div class="space-y-4">'
        . ui_field('vu-summary', 'What changed?', ui_input('changeSummary', '', ['id' => 'vu-summary', 'placeholder' => 'e.g. Tightened intro, swapped music, added captions', 'data-vu' => 'changeSummary']), ['optional' => false, 'name' => 'changeSummary'])
        . ui_field('vu-notes', 'Note to the client', ui_textarea('notes', '', ['id' => 'vu-notes', 'rows' => 2, 'class' => 'min-h-[4.5rem]', 'data-vu' => 'notes']), ['optional' => false, 'name' => 'notes'])
        . '<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">'
        . ui_field('vu-rev', 'Answers revision', ui_select('revisionId', $revOpts, '', ['id' => 'vu-rev', 'data-vu' => 'revisionId']), ['optional' => false, 'name' => 'revisionId'])
        . ui_field('vu-rel', 'Release', ui_select('release', [['value' => 'auto', 'label' => 'Follow workflow setting'], ['value' => 'client', 'label' => 'Release to client now'], ['value' => 'internal', 'label' => 'Send to internal review'], ['value' => 'draft', 'label' => 'Team-only draft']], 'auto', ['id' => 'vu-rel', 'data-vu' => 'release']), ['optional' => false, 'name' => 'release'])
        . '</div></div><p data-vu-error hidden role="alert" class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger"></p>'
        . ui_button('Create version', ['icon' => 'upload', 'attrs' => ['data-vu-go' => true]]) . '</div>';
    return card($body, '', 'Upload a new version', 'Earlier versions are never overwritten. Clients are notified when a version is released.');
}

function deliverables_admin_card(string $projectId, int $unpublished, bool $canUpload): string
{
    $body = '<div data-fe-component="deliverables-admin" data-props="' . json_attr(['projectId' => $projectId]) . '" class="space-y-4 px-5 pb-5">';
    if ($canUpload) {
        $body .= field_input('deliverable-label', 'Label shown to the client', 'Final master — 1080p', ['optional' => false, 'attrs' => ['data-da-label' => true]])
            . '<div data-fe-component="uploader" data-da-uploader data-label="Final master — 1080p" data-props="' . json_attr(['purpose' => 'deliverable', 'projectId' => $projectId, 'compact' => true, 'title' => 'Drop final exports here', 'reload' => true, 'label' => 'Final master — 1080p']) . '"></div>';
    }
    $body .= '<div class="flex flex-wrap items-center gap-3">' . ui_action("/api/projects/{$projectId}/deliverables/publish", 'Publish ' . ($unpublished ?: '') . ' deliverable' . ($unpublished === 1 ? '' : 's'), ['variant' => 'dark', 'icon' => 'send', 'success' => 'Published to the client', 'attrs' => $unpublished ? [] : ['disabled' => true]])
        . (!$unpublished ? '<span class="text-xs text-subtle">Nothing waiting to be published.</span>' : '') . '</div></div>';
    return card($body, '', 'Final deliverables', 'Upload the finished files, then publish them. Clients can download once the project is approved and payment conditions are met.');
}

const REV_NEXT = ['OPEN' => ['IN_PROGRESS', 'RESOLVED'], 'IN_PROGRESS' => ['RESOLVED', 'OPEN'], 'RESOLVED' => ['OPEN'], 'REJECTED' => ['OPEN'], 'CLOSED' => ['OPEN']];

function revision_buttons(string $id, string $status, bool $canManage): string
{
    if (!$canManage) {
        return '';
    }
    $h = '<div class="flex gap-1">';
    foreach (REV_NEXT[$status] ?? [] as $s) {
        $h .= ui_action("/api/revisions/{$id}", $s === 'IN_PROGRESS' ? 'Start' : ($s === 'RESOLVED' ? 'Mark done' : 'Reopen'), ['method' => 'PATCH', 'body' => ['status' => $s], 'variant' => 'outline', 'size' => 'xs', 'refresh' => true]);
    }
    return $h . '</div>';
}

function change_request_review(array $c): string
{
    $id = 'cr-' . $c['id'];
    $cls = $c['classification'] === 'PENDING' ? 'INCLUDED' : $c['classification'];
    $fields = field_select('classification', 'Decision', [['value' => 'INCLUDED', 'label' => 'Included in scope'], ['value' => 'OUT_OF_SCOPE', 'label' => 'Out of scope'], ['value' => 'ADDITIONAL_COST', 'label' => 'Needs an additional quote']], $cls, ['optional' => false, 'attrs' => ['data-cr-class' => true]])
        . '<div data-cr-quote hidden class="grid grid-cols-2 gap-3">' . field_input('quoteTitle', 'Quote title', '', ['optional' => false, 'placeholder' => 'Extra 9:16 cut-down']) . field_input('quoteAmount', 'Amount (major units)', '', ['optional' => false, 'inputmode' => 'decimal', 'placeholder' => '150']) . '</div>'
        . field_textarea('staffNote', 'Note to the client', (string)($c['staffNote'] ?? ''), ['optional' => false, 'rows' => 3]);
    return ui_button($c['classification'] === 'PENDING' ? 'Review' : 'Update', ['variant' => 'outline', 'size' => 'xs', 'attrs' => ['data-modal-open' => '#' . $id]])
        . form_modal($id, 'Review change request', '/api/change-requests/' . $c['id'], $fields, 'Send decision', ['method' => 'PATCH', 'size' => 'sm', 'description' => 'The client is notified of your decision.', 'prepare' => 'changeRequestPrep', 'success' => 'Change request updated']);
}

// ───────────────────────────── notes, tasks, time ─────────────────────────────

/** Internal notes — visible to the team only, never to clients. */
function notes_panel(string $entityType, string $entityId, array $notes, bool $canWrite): string
{
    $h = '<div class="space-y-3 px-5 pb-5">';
    if ($canWrite) {
        $h .= '<form novalidate data-fe-form="/api/notes" data-success="Note added" data-reset><input type="hidden" name="entityType" value="' . e($entityType) . '"><input type="hidden" name="entityId" value="' . e($entityId) . '">'
            . form_error_slot() . '<label for="note-' . e($entityId) . '" class="sr-only">Add an internal note</label>'
            . '<textarea id="note-' . e($entityId) . '" name="body" required rows="2" placeholder="Add a note for the team…" class="w-full resize-y rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"></textarea>'
            . '<div class="mt-2 flex justify-end">' . submit_button('Add note', ['size' => 'sm', 'class' => '']) . '</div></form>';
    }
    if ($notes) {
        $h .= '<ul class="space-y-2.5">';
        foreach ($notes as $n) {
            $h .= '<li class="rounded-xl border p-3.5 ' . ($n['pinned'] ? 'border-warning/40 bg-warning-soft/40' : 'border-line bg-surface-2/40') . '"><p class="whitespace-pre-wrap break-words text-sm">' . e($n['body']) . '</p>'
                . '<div class="mt-2 flex items-center justify-between text-xs text-subtle"><span>' . e($n['author']['name']) . ' · ' . ago($n['createdAt']) . ($n['pinned'] ? ' · pinned' : '') . '</span>';
            if ($canWrite) {
                $h .= '<span class="flex gap-1">' . ui_action("/api/notes/{$n['id']}", '', ['method' => 'PATCH', 'body' => ['pinned' => !$n['pinned']], 'variant' => 'ghost', 'size' => 'xs', 'icon' => 'star', 'attrs' => ['aria-label' => $n['pinned'] ? 'Unpin note' : 'Pin note']])
                    . (!empty($n['mine']) ? ui_action("/api/notes/{$n['id']}", '', ['method' => 'DELETE', 'variant' => 'ghost', 'size' => 'xs', 'icon' => 'trash', 'attrs' => ['aria-label' => 'Delete note'], 'success' => 'Note deleted']) : '') . '</span>';
            }
            $h .= '</div></li>';
        }
        $h .= '</ul>';
    } else {
        $h .= '<p class="py-2 text-sm text-muted">No notes yet.</p>';
    }
    return card($h . '</div>', '', 'Internal notes', 'Team only — clients never see these.');
}

/**
 * Task list with inline status/assignee changes (project pages, the admin task board and the editor workspace).
 * $o: staff [{id,name}], projectId, canWrite, showProject, base, title, meId, projects [{id,label}], openNew
 */
function tasks_panel(array $tasks, array $o): string
{
    $canWrite = !empty($o['canWrite']);
    $base = $o['base'] ?? '/admin';
    $staff = $o['staff'] ?? [];
    $order = ['BLOCKED', 'IN_PROGRESS', 'REVIEW', 'TODO', 'COMPLETE'];
    usort($tasks, fn($a, $b) => array_search($a['status'], $order, true) <=> array_search($b['status'], $order, true));
    $open = count(array_filter($tasks, fn($t) => $t['status'] !== 'COMPLETE'));
    // the assignee lists may be empty for people who can't assign others (editors): always offer "me", and keep a task's current assignee selectable
    $people = array_column($staff, 'name', 'id');
    if (!empty($o['meId']) && !isset($people[$o['meId']])) {
        $people[$o['meId']] = 'Me';
    }
    foreach ($tasks as $t) {
        if (!empty($t['assignee']['id']) && !isset($people[$t['assignee']['id']])) {
            $people[$t['assignee']['id']] = $t['assignee']['name'];
        }
    }
    $assignOpts = select_options(array_map(fn($id, $name) => ['id' => $id, 'label' => $name], array_keys($people), $people), 'id', 'label', 'Unassigned');
    $h = '';
    if (!$tasks) {
        $h .= ui_empty('No tasks yet', $canWrite ? 'Add the first task to keep the work organised.' : 'Nothing assigned here.', 'checklist');
    } else {
        $h .= '<ul class="divide-y divide-line">';
        foreach ($tasks as $t) {
            $done = $t['status'] === 'COMPLETE';
            $due = $t['dueDate'] ?? null;
            $late = $due && !$done && days_until($due) !== null && days_until($due) < 0;
            $pr = meta_for('PRIORITY', $t['priority']);
            $h .= '<li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">'
                . '<button type="button" ' . ($canWrite ? '' : 'disabled ') . 'data-fe-action="/api/tasks/' . e($t['id']) . '" data-method="PATCH" data-body="' . e(json_enc(['status' => $done ? 'TODO' : 'COMPLETE'])) . '" aria-label="' . ($done ? 'Mark as to do' : 'Mark complete') . '" class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ' . ($done ? 'border-success bg-success text-white' : 'border-line-strong hover:border-accent') . '">' . ($done ? icon('check', 13, '', 3) : '') . '</button>'
                . '<div class="min-w-0 flex-1 basis-56"><div class="truncate text-sm font-semibold ' . ($done ? 'text-muted line-through' : '') . '">' . e($t['title']) . '</div><div class="flex flex-wrap gap-x-3 text-xs text-subtle">'
                . (!empty($o['showProject']) && !empty($t['project']) ? '<a href="' . e($base . '/projects/' . $t['project']['id']) . '" class="hover:text-fg hover:underline">' . e($t['project']['code'] . ' · ' . $t['project']['name']) . '</a>' : '')
                . (!empty($t['subtasks']) ? '<span>' . count(array_filter($t['subtasks'], fn($s) => $s['status'] === 'COMPLETE')) . '/' . count($t['subtasks']) . ' subtasks</span>' : '') . '</div></div>'
                . ($t['priority'] !== 'NORMAL' ? ui_badge($pr['label'], $pr['tone'], '', false, false) : '')
                . '<span class="w-24 shrink-0 text-xs ' . ($late ? 'font-bold text-danger' : 'text-muted') . '"' . ($due ? ' title="' . e(fmt_date_short($due)) . '"' : '') . '>' . ($due ? e(relative_deadline($due)) : 'No due date') . '</span>';
            if ($canWrite) {
                $h .= '<select aria-label="Assignee" data-patch="/api/tasks/' . e($t['id']) . '" data-field="assigneeId" data-null-empty class="h-8 w-32 rounded-lg border border-line bg-surface px-2 text-xs font-medium">';
                $h .= '<option value="">Unassigned</option>';
                foreach ($people as $pid => $pname) {
                    $h .= '<option value="' . e($pid) . '"' . (($t['assignee']['id'] ?? '') === $pid ? ' selected' : '') . '>' . e($pname) . '</option>';
                }
                $h .= '</select><select aria-label="Status" data-patch="/api/tasks/' . e($t['id']) . '" data-field="status" class="h-8 rounded-lg border border-line bg-surface px-2 text-xs font-semibold">';
                foreach (status_data('TASK_STATUS_META') as $k => $m) {
                    $h .= '<option value="' . e($k) . '"' . ($t['status'] === $k ? ' selected' : '') . '>' . e($m['label']) . '</option>';
                }
                $h .= '</select>' . ui_action("/api/tasks/{$t['id']}", '', ['method' => 'DELETE', 'variant' => 'ghost', 'size' => 'xs', 'icon' => 'trash', 'success' => 'Task deleted', 'attrs' => ['aria-label' => 'Delete ' . $t['title']]]);
            } else {
                $h .= '<span class="text-xs text-muted">' . e($t['assignee']['name'] ?? 'Unassigned') . '</span>' . meta_badge('TASK_STATUS', $t['status']);
            }
            $h .= '</li>';
        }
        $h .= '</ul>';
    }
    $modal = '';
    if ($canWrite) {
        $fields = field_input('title', 'Title', '', ['required' => true, 'placeholder' => 'e.g. Colour-grade the opening'])
            . (!empty($o['projects']) ? field_select('projectId', 'Project', select_options($o['projects'], 'id', 'label', '— none (internal task) —'), $o['projectId'] ?? '', ['attrs' => ['data-null-empty' => true]]) : (!empty($o['projectId']) ? '<input type="hidden" name="projectId" value="' . e($o['projectId']) . '">' : ''))
            . '<div class="grid grid-cols-2 gap-4">' . field_select('assigneeId', 'Assignee', $assignOpts, $o['meId'] ?? '', ['attrs' => ['data-null-empty' => true]]) . field_select('priority', 'Priority', enum_options('PRIORITY'), 'NORMAL') . '</div>'
            . field_input('dueDate', 'Due date', '', ['type' => 'date']);
        $modal = form_modal('task-new', 'New task', '/api/tasks', $fields, 'Create task', ['size' => 'sm', 'success' => 'Task created']);
    }
    $action = $canWrite ? ui_button('Add task', ['size' => 'sm', 'icon' => 'plus', 'attrs' => ['data-modal-open' => '#task-new']]) : null;
    return card($h, '', $o['title'] ?? 'Tasks', $open . ' open · ' . ($tasks ? count($tasks) - $open : 0) . ' done', $action) . $modal . (!empty($o['openNew']) && $canWrite ? '<span hidden data-open-on-load="#task-new"></span>' : '');
}

function hm(int $seconds): string { return intdiv($seconds, 3600) . 'h ' . str_pad((string)intdiv($seconds % 3600, 60), 2, '0', STR_PAD_LEFT) . 'm'; }

function time_panel(string $projectId, array $entries, ?array $running, bool $canTrack): string
{
    $total = array_sum(array_map(fn($e) => (int)$e['seconds'], $entries));
    $here = $running && $running['project']['id'] === $projectId;
    $h = '';
    if ($canTrack) {
        $h .= '<div class="grid grid-cols-1 gap-3 px-5 pb-4 sm:grid-cols-[1fr_auto_auto]">'
            . '<form novalidate data-fe-form="/api/time" data-success="Timer started" class="contents"><input type="hidden" name="projectId" value="' . e($projectId) . '"><div class="space-y-1.5">' . field_input('note', 'Note', '', ['optional' => false, 'placeholder' => 'What are you working on?']) . '</div>'
            . '<div class="flex items-end gap-2">' . ($here
                ? ui_action('/api/time/stop', 'Stop', ['variant' => 'danger', 'icon' => 'pause', 'success' => 'Timer stopped'])
                : ui_button('Start timer', ['type' => 'submit', 'icon' => 'play', 'attrs' => $running ? ['disabled' => true, 'title' => 'Stop your other timer first'] : []])) . '</div></form>'
            . '<form novalidate data-fe-form="/api/time" data-success="Time added" class="flex items-end gap-2"><input type="hidden" name="projectId" value="' . e($projectId) . '">'
            . field_input('minutes', 'Or add minutes', '', ['optional' => false, 'inputmode' => 'numeric', 'placeholder' => '45', 'class' => 'w-28', 'attrs' => ['data-type' => 'int']]) . ui_button('Add', ['type' => 'submit', 'variant' => 'outline']) . '</form></div>';
    }
    if ($entries) {
        $h .= '<ul class="divide-y divide-line border-t border-line">';
        foreach (array_slice($entries, 0, 30) as $en) {
            $h .= '<li class="flex items-center gap-3 px-5 py-2.5 text-sm">' . icon('clock', 14, 'text-subtle') . '<span class="w-16 shrink-0 font-semibold tabular-nums">' . ($en['endedAt'] ? e(hm((int)$en['seconds'])) : 'running') . '</span><span class="min-w-0 flex-1 truncate text-muted">' . e($en['note'] ?: '—')
                . '</span><span class="hidden text-xs text-subtle sm:inline">' . e($en['user']['name']) . '</span><span class="text-xs text-subtle">' . e(fmt_date_short($en['startedAt'])) . '</span></li>';
        }
        $h .= '</ul>';
    } else {
        $h .= '<p class="border-t border-line px-5 py-6 text-center text-sm text-muted">No time logged yet.</p>';
    }
    return card($h, '', 'Time tracking', hm($total) . ' logged on this project');
}

/** Live view of the signed-in user's running timer (one at a time). */
function timer_widget(?array $running, string $base): string
{
    if (!$running) {
        return card('<div class="flex items-center gap-3 p-4"><span class="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-subtle">' . icon('clock', 18) . '</span><div class="min-w-0 flex-1"><div class="text-sm font-bold">No timer running</div><div class="text-xs text-muted">Start one from a project’s Time tab.</div></div></div>');
    }
    return card('<div class="flex flex-wrap items-center gap-3 border-accent/40 p-4"><span class="relative flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent-text">' . icon('clock', 18) . '<span class="absolute right-0 top-0 h-2.5 w-2.5 animate-pulse rounded-full bg-accent"></span></span>'
        . '<div class="min-w-0 flex-1"><div data-timer="' . e(iso_dt(ts_ms($running['startedAt']))) . '" role="timer" aria-label="Elapsed time" class="text-lg font-extrabold tabular-nums leading-none">00:00:00</div>'
        . '<a href="' . e($base . '/projects/' . $running['project']['id'] . '?tab=time') . '" class="mt-1 block truncate text-xs text-muted hover:text-fg hover:underline">' . e($running['project']['code'] . ' · ' . $running['project']['name'] . ($running['note'] ? ' — ' . $running['note'] : '')) . '</a></div>'
        . ui_action('/api/time/stop', 'Stop', ['variant' => 'danger', 'size' => 'sm', 'icon' => 'pause', 'success' => 'Timer stopped']) . '</div>', 'border-accent/40');
}

// ───────────────────────────── CRM helpers ─────────────────────────────

function budget_label(?string $v): string
{
    if (!$v) {
        return '—';
    }
    foreach (app_data('site-defaults')['BUDGET_RANGES'] as $b) {
        if ($b['value'] === $v) {
            return $b['label'];
        }
    }
    return str_replace('_', ' ', $v);
}

function humanize(?string $s): string { return $s ? str_replace('_', ' ', $s) : ''; }

/** Lead status/assignee/follow-up/temperature: each control saves on change (assets/js/admin.js → data-patch). */
function lead_controls(array $lead, array $staff, bool $canWrite): string
{
    $url = '/api/leads/' . $lead['id'];
    $dis = $canWrite ? '' : ' disabled';
    $sel = function (string $field, string $label, string $optionsHtml, string $hint = '') use ($url, $dis) {
        $id = 'lc-' . $field;
        return ui_field($id, $label, '<div class="relative"><select id="' . $id . '" data-patch="' . e($url) . '" data-field="' . $field . '" data-null-empty' . $dis . ' class="' . e(cx(INPUT_BASE, 'h-11 appearance-none pr-9')) . '">' . $optionsHtml . '</select>' . icon('chevron-down', 16, 'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle') . '</div>', ['optional' => false, 'hint' => $hint, 'name' => $field]);
    };
    $opts = function (array $list, string $cur) { $h = ''; foreach ($list as $v => $l) { $h .= '<option value="' . e($v) . '"' . ((string)$v === $cur ? ' selected' : '') . '>' . e($l) . '</option>'; } return $h; };
    $status = $sel('status', 'Status', $opts(array_map(fn($m) => $m['label'], status_data('LEAD_STATUS_META')), $lead['status']));
    $assign = $sel('assignedToId', 'Assigned to', $opts(['' => 'Unassigned'] + array_column(array_map(fn($s) => ['id' => $s['id'], 'name' => $s['name']], $staff), 'name', 'id'), (string)($lead['assignedToId'] ?? '')));
    $follow = ui_field('lc-follow', 'Next follow-up', ui_input('nextFollowUpAt', $lead['nextFollowUpAt'] ? substr(iso_dt(ts_ms($lead['nextFollowUpAt'])), 0, 10) : '', ['type' => 'date', 'id' => 'lc-follow', 'data-patch' => $url, 'data-field' => 'nextFollowUpAt', 'data-null-empty' => true] + ($canWrite ? [] : ['disabled' => true])), ['optional' => false, 'name' => 'nextFollowUpAt']);
    $tempMeta = status_data('TEMPERATURE_META');
    $tempOpts = '<option value="">Auto (' . e($tempMeta[$lead['computedTemperature']]['label'] ?? '') . ')</option>';
    foreach ($tempMeta as $k => $m) {
        $tempOpts .= '<option value="' . e($k) . '"' . ($lead['overridden'] && $lead['temperature'] === $k ? ' selected' : '') . '>Override: ' . e($m['label']) . '</option>';
    }
    $temp = $sel('temperatureOverride', 'Lead temperature', $tempOpts, $lead['overridden'] ? 'Auto-scored as ' . ($tempMeta[$lead['computedTemperature']]['label'] ?? '') . '; you overrode it.' : 'Auto-scored from the answers. Internal only — visitors never see it.');
    return card('<div class="grid gap-4 px-5 pb-5">' . $status . $assign . $follow . $temp . '</div>', '', 'Manage lead');
}

function lead_activity_form(string $leadId): string
{
    $types = [['value' => 'note', 'label' => 'Note'], ['value' => 'contacted', 'label' => 'Contacted'], ['value' => 'email_sent', 'label' => 'Email sent'], ['value' => 'call_made', 'label' => 'Call made'], ['value' => 'call_scheduled', 'label' => 'Call scheduled'], ['value' => 'meeting', 'label' => 'Meeting']];
    $form = '<form novalidate data-fe-form="/api/leads/' . e($leadId) . '/activities" data-success="Activity logged" class="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-[10rem_1fr]">' . form_error_slot()
        . field_select('type', 'Type', $types, 'note', ['optional' => false]) . field_input('title', 'Summary', '', ['required' => true, 'placeholder' => 'e.g. Called — wants a quote by Friday', 'attrs' => ['data-trim' => true]])
        . field_textarea('note', 'Details', '', ['rows' => 2, 'class' => 'sm:col-span-2']) . field_input('nextFollowUpAt', 'Set follow-up', '', ['type' => 'date'])
        . '<div class="flex items-end justify-end">' . ui_button('Log activity', ['type' => 'submit']) . '</div></form>';
    return card($form, '', 'Log activity');
}

/** Convert / lost / archive controls for a lead. */
function lead_decisions(array $lead, bool $canConvert, bool $canWrite): string
{
    $id = $lead['id'];
    $status = $lead['status'];
    $closed = in_array($status, ['LOST', 'ARCHIVED'], true);
    $h = '<div class="flex flex-wrap gap-2">';
    if ($canConvert && $status !== 'CONVERTED') {
        $h .= ui_button($lead['client'] ? 'Create project for client' : 'Convert to client', ['icon' => 'check-circle', 'attrs' => ['data-modal-open' => '#lead-convert'] + ($closed ? ['disabled' => true] : [])]);
    }
    if ($canWrite && !$closed && $status !== 'CONVERTED') {
        $h .= ui_button('Mark as lost', ['variant' => 'outline', 'attrs' => ['data-modal-open' => '#lead-lost']]);
    }
    if ($canWrite && $closed) {
        $h .= ui_action("/api/leads/{$id}/archive", 'Reopen lead', ['variant' => 'outline', 'body' => ['archive' => false], 'success' => 'Lead updated']);
    }
    if ($canWrite && !$closed) {
        $h .= ui_action("/api/leads/{$id}/archive", 'Archive', ['variant' => 'ghost', 'body' => ['archive' => true], 'success' => 'Lead updated']);
    }
    $h .= '</div>';
    $convertFields = ui_checkbox('createProject', 'Create the project now', true, "Uses the lead's answers as the starting brief.")
        . field_input('projectName', 'Project name', '', ['placeholder' => 'Leave blank for an automatic name'])
        . ui_checkbox('invite', 'Invite them to the client portal', true, "They'll get an email to set a password.");
    $h .= form_modal('lead-convert', 'Convert this lead', "/api/leads/{$id}/convert", $convertFields, 'Convert', ['size' => 'sm', 'description' => 'Creates the client record (or links the existing one) and can start the project in “Awaiting quote”.', 'onSuccess' => 'leadConverted']);
    $h .= form_modal('lead-lost', 'Mark as lost', "/api/leads/{$id}/reject", field_textarea('reason', 'Reason (optional)', '', ['rows' => 3, 'placeholder' => 'Budget, timing, went elsewhere…']), 'Mark as lost', ['size' => 'sm', 'variant' => 'danger', 'success' => 'Lead marked as lost']);
    return $h;
}

/** Client status + account manager (save on change), Edit and Invite buttons. */
function client_toolbar(array $c, array $staff, bool $canWrite): string
{
    $url = '/api/clients/' . $c['id'];
    $dis = $canWrite ? '' : ' disabled';
    $st = '<label class="sr-only" for="client-status">Client status</label><select id="client-status" data-patch="' . e($url) . '" data-field="status"' . $dis . ' class="h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold">';
    foreach (status_data('CLIENT_STATUS_META') as $k => $m) {
        $st .= '<option value="' . e($k) . '"' . ($c['status'] === $k ? ' selected' : '') . '>' . e($m['label']) . '</option>';
    }
    $st .= '</select>';
    $mg = '<label class="sr-only" for="client-manager">Account manager</label><select id="client-manager" data-patch="' . e($url) . '" data-field="managerId" data-null-empty' . $dis . ' class="h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold"><option value="">No account manager</option>';
    foreach ($staff as $s) {
        $mg .= '<option value="' . e($s['id']) . '"' . (($c['managerId'] ?? '') === $s['id'] ? ' selected' : '') . '>' . e($s['name']) . '</option>';
    }
    $mg .= '</select>';
    $h = '<div class="flex flex-wrap items-center gap-2">' . $st . $mg;
    if ($canWrite) {
        $fields = '<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">'
            . field_input('name', 'Contact name', $c['name'], ['required' => true]) . field_input('email', 'Email', $c['email'], ['required' => true, 'type' => 'email'])
            . field_input('companyName', 'Company', $c['companyName'], ['required' => true]) . field_input('phone', 'Phone', (string)($c['phone'] ?? ''), ['attrs' => ['data-null-empty' => true]])
            . field_input('industry', 'Industry', (string)($c['industry'] ?? ''), ['attrs' => ['data-null-empty' => true]]) . field_input('country', 'Country', (string)($c['country'] ?? ''), ['attrs' => ['data-null-empty' => true]])
            . field_input('website', 'Website', (string)($c['website'] ?? ''), ['type' => 'url', 'class' => 'sm:col-span-2', 'attrs' => ['data-null-empty' => true]]) . '</div>';
        $h .= ui_button('Edit', ['variant' => 'outline', 'icon' => 'pencil', 'attrs' => ['data-modal-open' => '#client-edit']])
            . ui_action("/api/clients/{$c['id']}/invite", $c['user'] ? 'Resend portal invite' : 'Invite to portal', ['variant' => 'outline', 'icon' => 'send', 'refresh' => false, 'success' => 'Portal invitation sent'])
            . form_modal('client-edit', 'Edit client', $url, $fields, 'Save changes', ['method' => 'PATCH', 'success' => 'Client updated']);
    }
    return $h . '</div>';
}

// ───────────────────────────── billing helpers ─────────────────────────────

/** Everything the quote / invoice builders need. */
function builder_data(Actor $a): array
{
    $ws = $a->workspaceId;
    $s = get_settings($ws, ['business', 'quote', 'invoice']);
    return [
        'clients' => array_map(fn($c) => ['id' => $c['id'], 'label' => $c['companyName'] . ' — ' . $c['name']], list_clients($a, ['pageSize' => 200, 'sort' => 'name'])['items']),
        'projects' => array_map(fn($p) => ['id' => $p['id'], 'label' => $p['code'] . ' · ' . $p['name'], 'clientId' => $p['clientId']], Db::rows("SELECT `id`, `name`, `code`, `clientId` FROM `projects` WHERE `workspaceId` = ? AND `status` NOT IN ('ARCHIVED','CANCELLED') ORDER BY `createdAt` DESC LIMIT 400", [$ws])),
        'services' => array_map(fn($x) => ['id' => $x['id'], 'label' => $x['title'], 'price' => $x['startingPrice'] !== null ? (int)$x['startingPrice'] : null], Db::rows('SELECT `id`, `title`, `startingPrice` FROM `services` WHERE `workspaceId` = ? ORDER BY `sortOrder` ASC', [$ws])),
        'business' => $s['business'], 'quote' => $s['quote'], 'invoice' => $s['invoice'],
    ];
}

/** Line-item builder for quotes and invoices; assets/js/admin.js (docBuilder) keeps the live totals preview. */
function doc_builder(string $mode, array $d, array $initial, array $defaults): string
{
    $quote = $mode === 'quote';
    $props = ['mode' => $mode, 'clients' => $d['clients'], 'projects' => $d['projects'], 'services' => $d['services'], 'currencies' => $d['business']['currencies'], 'initial' => $initial, 'defaults' => $defaults];
    $editing = !empty($initial['id']);
    $dis = $editing ? ['disabled' => true] : [];
    $details = '<div class="grid grid-cols-1 gap-4 px-5 pb-6 sm:grid-cols-2">'
        . field_select('clientId', 'Client', [['value' => '', 'label' => 'Choose a client…']], '', ['required' => true, 'class' => 'sm:col-span-2', 'attrs' => ['data-doc' => 'clientId'] + $dis])
        . field_select('projectId', 'Project', [['value' => '', 'label' => $quote ? 'New project (auto)' : '— none —']], '', ['hint' => $quote ? 'Leave empty to create a project when the quote is accepted.' : null, 'attrs' => ['data-doc' => 'projectId'] + $dis])
        . field_select('currency', 'Currency', array_map(fn($c) => ['value' => $c, 'label' => $c], $d['business']['currencies']), $initial['currency'], ['optional' => false, 'attrs' => ['data-doc' => 'currency'] + $dis])
        . ($quote
            ? field_input('title', 'Title', '', ['class' => 'sm:col-span-2', 'placeholder' => 'e.g. Autumn campaign — 6 shorts', 'attrs' => ['data-doc' => 'title']])
            : field_select('kind', 'Type', [['value' => 'OTHER', 'label' => 'One-off'], ['value' => 'DEPOSIT', 'label' => 'Deposit'], ['value' => 'BALANCE', 'label' => 'Balance'], ['value' => 'FULL', 'label' => 'Full payment'], ['value' => 'RETAINER', 'label' => 'Retainer'], ['value' => 'CHANGE_ORDER', 'label' => 'Change order']], 'OTHER', ['optional' => false, 'attrs' => ['data-doc' => 'kind']]))
        . '</div>';
    $lines = '<div class="space-y-3 px-5 pb-5"><div data-lines class="space-y-3"></div><datalist id="svc-list"></datalist>' . ui_button('Add line', ['variant' => 'outline', 'size' => 'sm', 'icon' => 'plus', 'attrs' => ['data-add-line' => true]]) . '</div>';
    $pricing = '<div class="grid grid-cols-1 gap-4 px-5 pb-6 sm:grid-cols-3">'
        . field_input('discount', 'Discount', '', ['optional' => false, 'inputmode' => 'decimal', 'placeholder' => '0', 'attrs' => ['data-doc' => 'discount']])
        . field_input('tax', 'Tax rate (%)', '', ['optional' => false, 'inputmode' => 'decimal', 'attrs' => ['data-doc' => 'tax']])
        . ($quote ? field_input('deposit', 'Deposit (%)', '', ['optional' => false, 'type' => 'number', 'min' => 0, 'max' => 100, 'hint' => 'Paid before work starts; the rest is billed on approval.', 'attrs' => ['data-doc' => 'deposit']])
                  : field_input('dueDate', 'Due date', '', ['optional' => false, 'type' => 'date', 'attrs' => ['data-doc' => 'dueDate']]))
        . ($quote ? field_input('validUntil', 'Valid until', '', ['optional' => false, 'type' => 'date', 'attrs' => ['data-doc' => 'validUntil']]) : '')
        . field_textarea('notes', 'Notes to the client', '', ['rows' => 3, 'class' => 'sm:col-span-3', 'attrs' => ['data-doc' => 'notes']])
        . ($quote ? field_textarea('terms', 'Terms', '', ['rows' => 3, 'class' => 'sm:col-span-3', 'attrs' => ['data-doc' => 'terms']]) : '') . '</div>';
    return '<div data-fe-component="doc-builder" data-props="' . json_attr($props) . '" class="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_26rem]"><div class="space-y-6">'
        . card($details, '', $quote ? 'Quote details' : 'Invoice details') . card($lines, '', 'Line items', 'Prices are in the document currency.') . card($pricing, '', 'Pricing & terms')
        . '</div><aside class="space-y-4 xl:sticky xl:top-24 xl:self-start">'
        . card('<div class="p-5"><h3 class="mb-4 text-base font-extrabold">Preview</h3><div data-preview></div></div>')
        . card('<div class="space-y-3 p-5"><p data-doc-error hidden role="alert" class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger"></p>'
            . ui_button($editing ? 'Save & send' : 'Send to client', ['size' => 'lg', 'icon' => 'send', 'class' => 'w-full', 'attrs' => ['data-doc-save' => 'send']])
            . ui_button('Save as draft', ['size' => 'lg', 'variant' => 'outline', 'class' => 'w-full', 'attrs' => ['data-doc-save' => 'draft']]) . '<p data-doc-total class="text-center text-xs text-subtle"></p></div>')
        . '</aside></div>';
}

/** Invoice actions: send / resend / record an offline payment / cancel. */
function invoice_actions(array $inv, bool $canWrite, bool $canPay): string
{
    $id = $inv['id'];
    $status = $inv['status'];
    $due = (int)$inv['total'] - (int)$inv['amountPaid'];
    $payable = in_array($status, ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'], true);
    $h = '<div class="flex flex-wrap gap-2">';
    if ($canWrite && $status === 'DRAFT') {
        $h .= ui_action("/api/invoices/{$id}/send", 'Send invoice', ['icon' => 'send', 'success' => 'Invoice sent to the client']);
    }
    if ($canWrite && $payable) {
        $h .= ui_action("/api/invoices/{$id}/send", 'Resend', ['variant' => 'outline', 'icon' => 'mail', 'success' => 'Reminder sent']);
    }
    if ($canPay && $payable) {
        $h .= ui_button('Record payment', ['variant' => 'outline', 'icon' => 'wallet', 'attrs' => ['data-modal-open' => '#record-payment']]);
    }
    if ($canWrite && !in_array($status, ['PAID', 'CANCELLED'], true)) {
        $h .= ui_action("/api/invoices/{$id}/cancel", 'Cancel invoice', ['variant' => 'danger', 'success' => 'Invoice cancelled', 'confirm' => ['title' => 'Cancel this invoice?', 'description' => 'The client will no longer be able to pay it. This is recorded in the audit log.', 'confirmLabel' => 'Cancel invoice', 'tone' => 'danger']]);
    }
    $h .= '</div>';
    if ($canPay && $payable) {
        $fields = field_input('amount', "Amount ({$inv['currency']})", (string)from_minor($due, $inv['currency']), ['required' => true, 'inputmode' => 'decimal'])
            . field_input('method', 'Method', 'Bank transfer', ['required' => true, 'placeholder' => 'Bank transfer, cash, PayPal…']) . field_input('reference', 'Reference', '', ['placeholder' => 'Transaction ID or note']);
        $h .= form_modal('record-payment', 'Record an offline payment', "/api/invoices/{$id}/manual-payment", $fields, 'Record payment', ['size' => 'sm', 'description' => 'Outstanding: ' . money($due, $inv['currency']), 'prepare' => 'manualPaymentPrep', 'success' => 'Payment recorded']);
        $h = str_replace('<form id="record-payment-form"', '<form data-currency="' . e($inv['currency']) . '" id="record-payment-form"', $h);
    }
    return $h;
}

/** Contract section editor (saves a new version). */
function contract_editor(array $c): string
{
    $h = '<form novalidate data-fe-form="/api/contracts/' . e($c['id']) . '" data-method="PATCH" data-prepare="contractPrep" data-success="Contract saved" class="space-y-4 px-5 pb-5">' . form_error_slot()
        . field_input('title', 'Title', $c['title'], ['optional' => false]);
    foreach ($c['sections'] as $i => $s) {
        $h .= '<div class="space-y-2 rounded-xl border border-line p-4" data-section data-key="' . e($s['key']) . '"><input aria-label="Section title" data-s="title" value="' . e($s['title']) . '" class="' . e(cx(INPUT_BASE, 'h-11 font-bold')) . '">'
            . '<textarea aria-label="' . e($s['title']) . ' text" data-s="body" rows="5" class="' . e(cx(INPUT_BASE, 'min-h-28 py-3 leading-relaxed')) . '">' . e($s['body']) . '</textarea></div>';
    }
    return card($h . ui_button('Save new version', ['type' => 'submit']) . '</form>', '', 'Edit contract', "Editing creates a new version. If the client already viewed it, they'll be asked to review the update before signing.");
}

function retainer_status_select(string $id, string $status): string
{
    $o = '';
    foreach (['ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED'] as $s) {
        $o .= '<option value="' . $s . '"' . ($s === $status ? ' selected' : '') . '>' . ucfirst(strtolower($s)) . '</option>';
    }
    return '<select aria-label="Retainer status" data-patch="/api/retainers/' . e($id) . '" data-field="status" data-refresh="1" class="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-sm font-semibold">' . $o . '</select>';
}

function new_retainer_modal(array $clients, array $currencies, string $defaultCurrency, array $plans): string
{
    $planOpts = [['value' => '', 'label' => 'Custom']];
    foreach ($plans as $p) {
        $planOpts[] = ['value' => $p['id'], 'label' => $p['name']];
    }
    $fields = '<div class="grid grid-cols-1 gap-4 sm:grid-cols-2" data-fe-component="retainer-form" data-props="' . json_attr(['plans' => array_map(fn($p) => ['id' => $p['id'], 'name' => $p['name'], 'price' => $p['price'], 'videos' => $p['includedVideos'], 'shorts' => $p['includedShorts'], 'hours' => $p['hoursIncluded'], 'revisions' => $p['includedRevisions']], $plans)]) . '">'
        . field_select('clientId', 'Client', array_merge([['value' => '', 'label' => 'Choose…']], array_map(fn($c) => ['value' => $c['id'], 'label' => $c['companyName']], $clients)), '', ['required' => true, 'class' => 'sm:col-span-2'])
        . ($plans ? field_select('planId', 'Start from a plan', $planOpts, '', ['class' => 'sm:col-span-2', 'attrs' => ['data-null-empty' => true, 'data-plan' => true]]) : '')
        . field_input('name', 'Name', '', ['required' => true, 'placeholder' => 'Creator Growth — monthly']) . field_input('monthlyPrice', 'Monthly price', '', ['required' => true, 'inputmode' => 'decimal'])
        . field_select('currency', 'Currency', array_map(fn($c) => ['value' => $c, 'label' => $c], $currencies), $defaultCurrency, ['optional' => false])
        . field_input('turnaroundDays', 'Turnaround (days)', '3', ['optional' => false, 'type' => 'number', 'min' => 1, 'attrs' => ['data-type' => 'int']])
        . field_input('videosIncluded', 'Videos / month', '0', ['optional' => false, 'type' => 'number', 'min' => 0, 'attrs' => ['data-type' => 'int']]) . field_input('shortsIncluded', 'Shorts / month', '0', ['optional' => false, 'type' => 'number', 'min' => 0, 'attrs' => ['data-type' => 'int']])
        . field_input('hoursIncluded', 'Hours / month', '0', ['optional' => false, 'type' => 'number', 'min' => 0, 'attrs' => ['data-type' => 'int']]) . field_input('revisionsIncluded', 'Revisions per video', '2', ['optional' => false, 'type' => 'number', 'min' => 0, 'attrs' => ['data-type' => 'int']])
        . field_textarea('notes', 'Notes', '', ['rows' => 2, 'class' => 'sm:col-span-2', 'attrs' => ['data-null-empty' => true]]) . '</div>';
    return ui_button('New retainer', ['icon' => 'plus', 'variant' => 'dark', 'attrs' => ['data-modal-open' => '#retainer-new']])
        . form_modal('retainer-new', 'New retainer', '/api/retainers', $fields, 'Create retainer', ['size' => 'lg', 'description' => 'A monthly allowance billed automatically each period.', 'prepare' => 'retainerPrep', 'success' => 'Retainer created']);
}

// ───────────────────────────── calendar ─────────────────────────────

/** The viewer's time zone (browser cookie), else the studio's, else UTC. */
function viewer_tz(): DateTimeZone
{
    $name = isset($_COOKIE['fe_tz']) ? rawurldecode((string)$_COOKIE['fe_tz']) : '';
    foreach ([$name, get_site_context()['business']['timezone'] ?? ''] as $n) {
        if ($n !== '') {
            try {
                return new DateTimeZone($n);
            } catch (Throwable) {
            }
        }
    }
    return new DateTimeZone('UTC');
}

const CAL_KINDS = [
    'deadline' => ['bg-danger-soft text-danger', 'clock', 'Deadline'], 'call' => ['bg-info-soft text-info', 'phone', 'Call'], 'meeting' => ['bg-info-soft text-info', 'users', 'Meeting'],
    'start' => ['bg-success-soft text-success', 'rocket', 'Start'], 'draft' => ['bg-accent-soft text-fg', 'film', 'Draft'], 'revision' => ['bg-warning-soft text-warning', 'refresh', 'Revision'],
    'retainer' => ['bg-accent-soft text-fg', 'repeat', 'Retainer'], 'custom' => ['bg-surface-2 text-muted', 'calendar', 'Event'], 'task' => ['bg-surface-2 text-fg', 'checklist', 'Task'],
];

/** Calendar date math in the viewer's zone. Returns [$date, $from, $to] (DateTimeImmutable, zone-aware). */
function calendar_range(string $view, ?string $dateParam, DateTimeZone $tz): array
{
    $d = ($dateParam && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateParam)) ? DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $dateParam . ' 12:00:00', $tz) : false;
    $d = $d ?: new DateTimeImmutable('now', $tz);
    $weekStart = fn(DateTimeImmutable $x) => $x->setTime(0, 0)->modify('-' . ((int)$x->format('N') - 1) . ' days');
    if ($view === 'month') {
        $from = $weekStart($d->modify('first day of this month'));
        $to = $from->modify('+42 days');
    } elseif ($view === 'week') {
        $from = $weekStart($d);
        $to = $from->modify('+7 days');
    } else {
        $from = $d->setTime(0, 0);
        $to = $from->modify('+1 day');
    }
    return [$d, $from, $to];
}

function calendar_chip(array $e): string
{
    [$cls, $ic] = CAL_KINDS[$e['kind']] ?? CAL_KINDS['custom'];
    $inner = '<span class="flex items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-[11px] font-semibold leading-tight ' . $cls . '" title="' . e($e['title']) . '">' . icon($ic, 11, 'shrink-0')
        . '<span class="truncate">' . (empty($e['allDay']) ? local_time($e['at'], 'time') . ' ' : '') . e($e['title']) . '</span></span>';
    return !empty($e['href']) ? '<a href="' . e($e['href']) . '" class="block hover:brightness-95">' . $inner . '</a>' : '<div>' . $inner . '</div>';
}

function calendar_view(array $events, string $view, DateTimeImmutable $date, string $base, DateTimeZone $tz): string
{
    $today = new DateTimeImmutable('now', $tz);
    $ymd = fn(DateTimeInterface $d) => $d->format('Y-m-d');
    $byDay = [];
    foreach ($events as $e) {
        $ms = (int)ts_ms($e['at']);
        $key = !empty($e['allDay']) ? gmdate('Y-m-d', intdiv($ms, 1000)) : (new DateTimeImmutable('@' . intdiv($ms, 1000)))->setTimezone($tz)->format('Y-m-d');
        $byDay[$key][] = $e;
    }
    $shift = function (string $v, int $dir) use ($date, $base, $ymd) {
        $d = $v === 'month' ? $date->modify('first day of this month')->modify(($dir > 0 ? '+' : '-') . '1 month') : $date->modify(($dir > 0 ? '+' : '-') . ($v === 'week' ? 7 : 1) . ' days');
        return $base . '?view=' . $v . '&date=' . $ymd($d);
    };
    $weekStart = $date->setTime(0, 0)->modify('-' . ((int)$date->format('N') - 1) . ' days');
    $title = $view === 'month' ? $date->format('F Y') : ($view === 'week' ? 'Week of ' . $weekStart->format('M j') : $date->format('l, F j'));
    $nav = 'flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong hover:bg-surface-2';
    $h = '<div class="mb-4 flex flex-wrap items-center justify-between gap-3"><div class="flex items-center gap-2">'
        . '<a href="' . e($shift($view, -1)) . '" aria-label="Previous" class="' . $nav . '">' . icon('chevron-left', 16) . '</a><a href="' . e($shift($view, 1)) . '" aria-label="Next" class="' . $nav . '">' . icon('chevron-right', 16) . '</a>'
        . '<a href="' . e($base . '?view=' . $view . '&date=' . $ymd($today)) . '" class="h-9 rounded-lg border border-line-strong px-3 text-sm font-semibold leading-9 hover:bg-surface-2">Today</a><h2 class="ml-2 text-lg font-extrabold">' . e($title) . '</h2></div>'
        . '<div class="inline-flex rounded-xl bg-surface-2 p-1 text-sm font-semibold" role="group" aria-label="Calendar view">';
    foreach (['month', 'week', 'day'] as $v) {
        $h .= '<a href="' . e($base . '?view=' . $v . '&date=' . $ymd($date)) . '"' . ($view === $v ? ' aria-current="page"' : '') . ' class="rounded-lg px-3.5 py-1.5 capitalize ' . ($view === $v ? 'bg-surface shadow-soft' : 'text-muted hover:text-fg') . '">' . $v . '</a>';
    }
    $h .= '</div></div>';
    if ($view === 'month') {
        $start = $date->modify('first day of this month')->setTime(0, 0);
        $start = $start->modify('-' . ((int)$start->format('N') - 1) . ' days');
        $h .= '<div class="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-soft"><div class="grid grid-cols-7 border-b border-line bg-surface-2/50 text-center text-[11px] font-bold uppercase tracking-wider text-subtle">';
        foreach (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as $dn) {
            $h .= '<div class="py-2">' . $dn . '</div>';
        }
        $h .= '</div><div class="grid grid-cols-7">';
        for ($i = 0; $i < 42; $i++) {
            $d = $start->modify("+{$i} days");
            $list = $byDay[$ymd($d)] ?? [];
            $other = $d->format('n') !== $date->format('n');
            $isToday = $ymd($d) === $ymd($today);
            $h .= '<div class="min-h-24 border-b border-r border-line p-1.5 max-md:min-h-16 ' . ($other ? 'bg-surface-2/40 ' : '') . (($i + 1) % 7 === 0 ? 'border-r-0 ' : '') . ($i >= 35 ? 'border-b-0' : '') . '">'
                . '<a href="' . e($base . '?view=day&date=' . $ymd($d)) . '" class="mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold ' . ($isToday ? 'bg-accent text-accent-fg' : ($other ? 'text-subtle' : 'hover:bg-surface-2')) . '">' . $d->format('j') . '</a><div class="space-y-1 max-md:hidden">';
            foreach (array_slice($list, 0, 3) as $e) {
                $h .= calendar_chip($e);
            }
            if (count($list) > 3) {
                $h .= '<a href="' . e($base . '?view=day&date=' . $ymd($d)) . '" class="block px-1 text-[11px] font-semibold text-muted hover:text-fg">+' . (count($list) - 3) . ' more</a>';
            }
            $h .= '</div>';
            if ($list) {
                $h .= '<div class="flex gap-0.5 md:hidden">' . implode('', array_map(fn($e) => '<span class="h-1.5 w-1.5 rounded-full ' . explode(' ', (CAL_KINDS[$e['kind']] ?? CAL_KINDS['custom'])[0])[0] . '"></span>', array_slice($list, 0, 4))) . '</div>';
            }
            $h .= '</div>';
        }
        $h .= '</div></div>';
    } elseif ($view === 'week') {
        $h .= '<div class="grid grid-cols-1 gap-3 md:grid-cols-7">';
        for ($i = 0; $i < 7; $i++) {
            $d = $weekStart->modify("+{$i} days");
            $list = $byDay[$ymd($d)] ?? [];
            $isToday = $ymd($d) === $ymd($today);
            $h .= '<section class="rounded-2xl border bg-surface p-3 ' . ($isToday ? 'border-accent' : 'border-line') . '" aria-label="' . e($d->format('D M j Y')) . '"><h3 class="mb-2 flex items-baseline justify-between text-xs font-bold uppercase tracking-wider text-subtle"><span>' . $d->format('D') . '</span><span class="text-base font-extrabold normal-case tracking-normal ' . ($isToday ? 'text-accent-text' : 'text-fg') . '">' . $d->format('j') . '</span></h3><div class="space-y-1.5">'
                . ($list ? implode('', array_map('calendar_chip', $list)) : '<p class="py-3 text-center text-xs text-subtle">—</p>') . '</div></section>';
        }
        $h .= '</div>';
    } else {
        $list = $byDay[$ymd($date)] ?? [];
        $h .= '<div class="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-soft">';
        if ($list) {
            $h .= '<ul class="divide-y divide-line">';
            foreach ($list as $e) {
                [$cls, $ic, $lab] = CAL_KINDS[$e['kind']] ?? CAL_KINDS['custom'];
                $when = !empty($e['allDay']) ? 'All day' : local_time($e['at'], 'time') . (!empty($e['end']) ? ' – ' . local_time($e['end'], 'time') : '');
                $row = '<div class="flex items-center gap-4 py-3.5"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' . $cls . '">' . icon($ic, 18) . '</span><div class="min-w-0 flex-1"><div class="text-sm font-bold">' . e($e['title']) . '</div><div class="text-xs text-muted">' . e($lab) . ' · ' . $when . '</div></div>' . (!empty($e['href']) ? icon('chevron-right', 16, 'text-subtle') : '') . '</div>';
                $h .= '<li>' . (!empty($e['href']) ? '<a href="' . e($e['href']) . '" class="block rounded-lg hover:bg-surface-2/50">' . $row . '</a>' : $row) . '</li>';
            }
            $h .= '</ul>';
        } else {
            $h .= '<p class="py-10 text-center text-sm text-muted">Nothing scheduled for ' . e($date->format('l')) . '.</p>';
        }
        $h .= '</div>';
    }
    $h .= '<ul class="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted" aria-label="Legend">';
    foreach (CAL_KINDS as $v) {
        $h .= '<li class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm ' . explode(' ', $v[0])[0] . '"></span>' . e($v[2]) . '</li>';
    }
    return $h . '</ul>';
}

function schedule_call_modal(array $clients): string
{
    $types = [['value' => 'DISCOVERY_CALL', 'label' => 'Discovery call'], ['value' => 'PROJECT_CONSULTATION', 'label' => 'Project consultation'], ['value' => 'CLIENT_REVIEW_CALL', 'label' => 'Client review call'], ['value' => 'STRATEGY_CALL', 'label' => 'Strategy call']];
    $fields = field_input('title', 'Title', '', ['required' => true, 'placeholder' => 'e.g. Review call — Harbor View']) . field_select('type', 'Type', $types, 'DISCOVERY_CALL', ['optional' => false])
        . '<div class="grid grid-cols-2 gap-4">' . field_input('when', 'Date & time', '', ['required' => true, 'type' => 'datetime-local']) . field_input('minutes', 'Minutes', '30', ['optional' => false, 'type' => 'number', 'min' => 10, 'max' => 240, 'step' => 5, 'attrs' => ['data-type' => 'int']]) . '</div>'
        . field_select('clientId', 'Client', select_options(array_map(fn($c) => ['id' => $c['id'], 'label' => $c['companyName']], $clients), 'id', 'label', '— none —'), '', ['attrs' => ['data-null-empty' => true]])
        . field_textarea('notes', 'Notes', '', ['rows' => 2]);
    return ui_button('Schedule call', ['icon' => 'plus', 'variant' => 'dark', 'attrs' => ['data-modal-open' => '#schedule-call']]) . form_modal('schedule-call', 'Schedule a call', '/api/meetings', $fields, 'Schedule', ['size' => 'sm', 'prepare' => 'meetingPrep', 'success' => 'Call scheduled']);
}

/** Revision rounds table shared by the admin and editor areas. */
function revisions_board(array $rows, string $base, bool $canManage): string
{
    return card(ui_table([
        ['key' => 'p', 'header' => 'Project', 'primary' => true, 'render' => fn($r) => '<a class="font-bold hover:underline" href="' . e("{$base}/projects/" . ($r['project']['id'] ?? '') . "/review/{$r['versionId']}") . '">' . e($r['project']['name'] ?? '') . '<span class="block text-xs font-normal text-muted">' . e(($r['project']['code'] ?? '') . ' · Round ' . $r['roundNumber'] . ' · ' . ($r['versionLabel'] ?? '')) . '</span></a>'],
        ['key' => 'd', 'header' => 'Request', 'hideOnMobile' => true, 'render' => fn($r) => '<span class="line-clamp-2 max-w-md text-muted">' . e(($r['description'] ?: 'Timestamped notes') . ' (' . (int)($r['commentCount'] ?? 0) . ')') . '</span>'],
        ['key' => 'pr', 'header' => 'Priority', 'hideOnMobile' => true, 'render' => fn($r) => priority_badge($r['priority'])],
        ['key' => 's', 'header' => 'Status', 'render' => fn($r) => meta_badge('REVISION_STATUS', $r['status'])],
        ['key' => 'w', 'header' => 'Requested', 'hideOnMobile' => true, 'render' => fn($r) => '<span class="text-muted">' . ago($r['createdAt']) . '</span>'],
        ['key' => 'a', 'header' => '', 'align' => 'right', 'render' => fn($r) => revision_buttons($r['id'], $r['status'], $canManage)],
    ], $rows, fn($r) => $r['id'], null, ui_empty('No revision requests', 'When clients request changes they show up here with the exact timestamps.', 'refresh')));
}
