<?php
/** Larger interactive pieces shared by the client portal, admin console and editor workspace: files, messages, documents, account panels. */
defined('FEP') or exit;

// ───────────────────────────── money + documents ─────────────────────────────

/** {USD: 12000, EUR: 500} → "$120.00 · €5.00" (never adds different currencies together) */
function money_map(mixed $map, bool $compact = false): string
{
    $entries = array_filter((array)$map);
    if (!$entries) {
        return e(money(0, 'USD', $compact));
    }
    return implode(' · ', array_map(fn($c, $v) => e(money((int)$v, (string)$c, $compact)), array_keys($entries), $entries));
}

/** Line items + totals for quotes and invoices (prints cleanly). $d: items[], currency, subtotal, discount, tax, taxRateBps?, total, deposit?, balance?, amountPaid?, depositPercent? */
function doc_lines(array $d): string
{
    $cur = $d['currency'];
    $m = fn($n) => e(money((int)$n, $cur));
    $rows = '';
    foreach ($d['items'] as $i) {
        $rows .= '<tr><td data-primary class="py-3 pr-4 font-medium">' . e($i['description']) . '</td><td data-label="Qty" class="py-3 pr-4 text-right tabular-nums text-muted">' . e($i['quantity']) . '</td><td data-label="Unit price" class="py-3 pr-4 text-right tabular-nums text-muted">' . $m($i['unitPrice']) . '</td><td data-label="Amount" class="py-3 text-right font-semibold tabular-nums">' . $m($i['amount']) . '</td></tr>';
    }
    $row = fn($k, $v, $strong = false, $muted = false) => '<div class="flex items-baseline justify-between gap-4' . ($strong ? ' border-t border-line pt-2 text-base font-bold' : '') . ($muted ? ' text-muted' : '') . '"><dt' . (!$strong ? ' class="text-muted"' : '') . '>' . e($k) . '</dt><dd class="tabular-nums">' . $v . '</dd></div>';
    $t = $row('Subtotal', $m($d['subtotal']));
    if (($d['discount'] ?? 0) > 0) {
        $t .= $row('Discount', '− ' . $m($d['discount']));
    }
    if (($d['tax'] ?? 0) > 0) {
        $bps = (int)($d['taxRateBps'] ?? 0);
        $t .= $row('Tax' . ($bps ? ' (' . number_format($bps / 100, $bps % 100 ? 2 : 0) . '%)' : ''), $m($d['tax']));
    }
    $t .= $row('Total', $m($d['total']), true);
    if (isset($d['deposit'], $d['balance']) && $d['balance'] > 0) {
        $t .= $row('Deposit due now' . (!empty($d['depositPercent']) ? " ({$d['depositPercent']}%)" : ''), $m($d['deposit'])) . $row('Balance on approval', $m($d['balance']), false, true);
    }
    if (!empty($d['amountPaid'])) {
        $t .= $row('Paid', '− ' . $m($d['amountPaid'])) . $row('Amount due', $m(max(0, $d['total'] - $d['amountPaid'])), true);
    }
    return '<div><table class="responsive-table w-full text-left text-sm"><thead><tr class="border-b border-line text-xs font-semibold text-subtle"><th class="py-2 pr-4 font-semibold">Description</th><th class="w-20 py-2 pr-4 text-right font-semibold">Qty</th><th class="w-32 py-2 pr-4 text-right font-semibold">Unit price</th><th class="w-32 py-2 text-right font-semibold">Amount</th></tr></thead>'
        . '<tbody class="divide-y divide-line">' . $rows . '</tbody></table><dl class="ml-auto mt-4 w-full max-w-xs space-y-1.5 text-sm">' . $t . '</dl></div>';
}

// ───────────────────────────── files ─────────────────────────────

function file_type_icon(string $mime): string
{
    return str_starts_with($mime, 'video/') ? 'video' : (str_starts_with($mime, 'audio/') ? 'music' : (str_starts_with($mime, 'image/') ? 'image' : ($mime === 'application/pdf' ? 'file' : 'package')));
}

/**
 * The project file list. $files rows: id, displayName, mimeType, sizeBytes, version, status, folderName?, isDeliverable?, visibleToClient?, hasThumbnail?, durationMs?, uploadedBy?, createdAt, project?{id,name,code}
 * $o: projectId, folders[{key,name,count}], activeFolder, canUpload, canDelete, canShare, fileRequests[], basePath, extraParams[], showProject, projectBase
 */
function file_manager(array $files, array $o = []): string
{
    $projectId = $o['projectId'] ?? null;
    $canUpload = !empty($o['canUpload']);
    $h = '<div class="space-y-6" data-files>';
    $openReqs = array_values(array_filter($o['fileRequests'] ?? [], fn($r) => ($r['status'] ?? 'OPEN') === 'OPEN'));
    if ($openReqs) {
        $h .= '<div class="space-y-2">';
        foreach ($openReqs as $r) {
            $h .= '<div class="rounded-2xl border border-warning/30 bg-warning-soft/60 p-4"><div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div class="flex items-start gap-3">' . icon('upload', 18, 'mt-0.5 text-warning')
                . '<div><div class="text-sm font-bold">Requested: ' . e($r['title']) . '</div>' . (!empty($r['description']) ? '<div class="text-xs text-muted">' . e($r['description']) . '</div>' : '') . '</div></div>'
                . ($canUpload && $projectId ? ui_button('Upload for this request', ['variant' => 'dark', 'size' => 'sm', 'attrs' => ['data-toggle' => 'req-' . $r['id']]]) : '') . '</div>'
                . ($canUpload && $projectId ? '<div id="req-' . e($r['id']) . '" hidden class="mt-4 rounded-2xl border border-line bg-surface p-4"><div data-fe-component="uploader" data-props="' . json_attr(['projectId' => $projectId, 'fileRequestId' => $r['id'], 'purpose' => 'asset', 'folderKey' => 'raw-footage', 'compact' => true, 'reload' => true]) . '"></div></div>' : '') . '</div>';
        }
        $h .= '</div>';
    }
    if ($canUpload && $projectId) {
        $folder = $o['activeFolder'] ?? null;
        $h .= '<div data-fe-component="uploader" data-props="' . json_attr(['purpose' => 'asset', 'projectId' => $projectId, 'folderKey' => ($folder && $folder !== 'all') ? $folder : 'raw-footage', 'title' => 'Drag & drop footage, audio, images and documents', 'hint' => 'Large files upload directly and can be retried', 'reload' => true]) . '"></div>';
    }
    if (!empty($o['folders']) && !empty($o['basePath'])) {
        $href = function (?string $key) use ($o) {
            $q = array_filter(($o['extraParams'] ?? []) + ['folder' => $key], fn($v) => $v !== null && $v !== '');
            return $o['basePath'] . ($q ? '?' . http_build_query($q) : '');
        };
        $active = $o['activeFolder'] ?? null;
        $pill = fn($on) => cx('whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-semibold transition', $on ? 'border-fg bg-fg text-bg' : 'border-line-strong hover:bg-surface-2');
        $h .= '<nav aria-label="Folders" class="thin-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"><a href="' . e($href(null)) . '" class="' . e($pill(!$active)) . '">All files</a>';
        foreach ($o['folders'] as $f) {
            $h .= '<a href="' . e($href($f['key'])) . '" class="' . e($pill($active === $f['key'])) . '">' . e($f['name']) . ' <span class="ml-1 text-xs ' . ($active === $f['key'] ? 'opacity-70' : 'text-subtle') . '">' . (int)$f['count'] . '</span></a>';
        }
        $h .= '</nav>';
    }
    if (!$files) {
        return $h . '<div class="rounded-[var(--radius-card)] border border-dashed border-line-strong">' . ui_empty('No files here yet', $canUpload ? 'Drop files above to add them to this project.' : 'Files added to this project will show up here.', 'folder') . '</div></div>';
    }
    $h .= '<ul class="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-soft">';
    foreach ($files as $f) {
        $mime = $f['mimeType'];
        $inline = preg_match('#^(video|audio|image)/|application/pdf#', $mime) ? 'inline' : 'download';
        $thumb = $f['status'] === 'READY' && (!empty($f['hasThumbnail']) || (str_starts_with($mime, 'image/') && $mime !== 'image/svg+xml'));
        $h .= '<li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"><span' . ($thumb ? ' data-thumb="' . e($f['id']) . '"' : '') . ' class="relative flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-muted">' . icon(file_type_icon($mime), 20) . '</span>'
            . '<div class="min-w-0 flex-1 basis-56"><div class="flex flex-wrap items-center gap-2"><button type="button" data-asset-open="' . e($f['id']) . '" data-mode="' . $inline . '" class="truncate text-left text-sm font-bold hover:text-accent-text hover:underline">' . e($f['displayName']) . '</button>'
            . ((int)$f['version'] > 1 ? ui_badge('v' . (int)$f['version'], 'info', '', false, false) : '')
            . (!empty($f['isDeliverable']) ? ui_badge(!empty($f['visibleToClient']) ? 'Deliverable' : 'Deliverable (unpublished)', !empty($f['visibleToClient']) ? 'success' : 'warning', '', !empty($f['visibleToClient']) ? 'check' : 'lock') : '')
            . ($f['status'] !== 'READY' ? ui_badge(strtolower($f['status']), $f['status'] === 'QUARANTINED' ? 'danger' : 'warning') : '') . '</div>'
            . '<div class="mt-0.5 flex flex-wrap gap-x-3 text-xs text-subtle"><span>' . e(fmt_bytes((int)$f['sizeBytes'])) . '</span>' . (!empty($f['durationMs']) ? '<span>' . e(fmt_timecode((int)$f['durationMs'])) . '</span>' : '') . (!empty($f['folderName']) ? '<span>' . e($f['folderName']) . '</span>' : '')
            . '<span>' . e($f['uploadedBy'] ?? '—') . ' · ' . e(fmt_date_short($f['createdAt'])) . '</span>'
            . (!empty($o['showProject']) && !empty($f['project']) ? '<a href="' . e(($o['projectBase'] ?? '/dashboard') . '/projects/' . $f['project']['id']) . '" class="hover:text-fg hover:underline">' . e($f['project']['code']) . '</a>' : '') . '</div></div>'
            . '<div class="flex items-center gap-1">' . ui_button('Download', ['variant' => 'ghost', 'size' => 'sm', 'icon' => 'download', 'attrs' => ['data-asset-open' => $f['id'], 'data-mode' => 'download', 'aria-label' => 'Download ' . $f['displayName']], 'labelHtml' => icon('download', 16) . '<span class="hidden sm:inline">Download</span>'])
            . (!empty($o['canShare']) && empty($f['isDeliverable']) ? ui_action("/api/assets/{$f['id']}/share", '', ['variant' => 'ghost', 'size' => 'sm', 'icon' => 'link', 'attrs' => ['aria-label' => 'Copy share link', 'data-on-success' => 'copyShare', 'data-refresh' => '0'], 'success' => 'Share link copied']) : '')
            . ($canUpload ? ui_button('', ['variant' => 'ghost', 'size' => 'sm', 'icon' => 'pencil', 'attrs' => ['data-rename' => $f['id'], 'data-name' => $f['displayName'], 'aria-label' => 'Rename ' . $f['displayName']]]) : '')
            . (!empty($o['canDelete']) ? ui_action("/api/assets/{$f['id']}", '', ['method' => 'DELETE', 'variant' => 'ghost', 'size' => 'sm', 'icon' => 'trash', 'attrs' => ['aria-label' => 'Delete ' . $f['displayName']], 'success' => 'File deleted', 'confirm' => ['title' => 'Delete this file?', 'description' => "“{$f['displayName']}” will be removed from the project. This can't be undone.", 'confirmLabel' => 'Delete file', 'tone' => 'danger']]) : '') . '</div></li>';
    }
    $h .= '</ul>';
    if ($canUpload) {
        $h .= ui_modal('rename-file', 'Rename file', '<form id="rename-form" novalidate data-fe-form="" data-method="PATCH" data-success="File renamed" class="space-y-3">' . form_error_slot() . field_input('displayName', 'File name', '', ['required' => true, 'id' => 'rename-input']) . '</form>',
            ['size' => 'sm', 'footerHtml' => ui_button('Cancel', ['variant' => 'ghost', 'attrs' => ['data-modal-close' => true]]) . ui_button('Save', ['type' => 'submit', 'attrs' => ['form' => 'rename-form']])]);
    }
    return $h . '</div>';
}

// ───────────────────────────── deliveries ─────────────────────────────

/** Final deliverables, locked with a plain-language reason until approval and payment conditions are met. $d: items, unlocked, lockedReason */
function delivery_list(array $d, string $status, string $projectId, bool $staff = false): string
{
    $visible = $staff ? $d['items'] : array_values(array_filter($d['items'], fn($i) => !empty($i['visibleToClient'])));
    if (!$visible) {
        $approved = $status === 'APPROVED';
        return card(ui_empty($approved ? "I’m preparing your final files" : 'No final files yet', $approved ? "You approved the video — I’m exporting the final deliverables now. You'll get a notification the moment they're ready." : 'Your final files will appear here once the video is approved and delivered.', 'package'));
    }
    $h = '<div class="space-y-4">';
    if (!$d['unlocked']) {
        $h .= '<div class="flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning-soft/70 p-6 sm:flex-row sm:items-center sm:justify-between" role="status"><div class="flex gap-3">' . icon('lock', 20, 'mt-0.5 shrink-0 text-warning')
            . '<div><h3 class="font-bold">Your final files are ready — and waiting for you</h3><p class="mt-0.5 text-sm text-muted">' . e($d['lockedReason']) . '</p></div></div>'
            . (!$staff ? ui_link("/dashboard/projects/{$projectId}?tab=billing", 'View invoices', ['variant' => 'dark', 'icon' => 'card']) : '') . '</div>';
    } else {
        $h .= '<div class="flex items-center gap-3 rounded-2xl border border-success/30 bg-success-soft/50 px-6 py-4 text-sm" role="status">' . icon('check-circle', 20, 'text-success') . '<span><b>Ready to download.</b> Links are private and expire after an hour — just click again for a fresh one.</span></div>';
    }
    $h .= '<ul class="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-soft">';
    foreach ($visible as $f) {
        $can = $d['unlocked'] || $staff;
        $h .= '<li class="flex flex-wrap items-center gap-4 px-6 py-4"><span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2">' . icon(str_starts_with($f['mimeType'], 'video/') ? 'video' : (str_starts_with($f['mimeType'], 'image/') ? 'image' : 'file'), 20) . '</span>'
            . '<div class="min-w-0 flex-1 basis-48"><div class="truncate text-sm font-bold">' . e($f['deliverableLabel'] ?: $f['displayName']) . '</div><div class="truncate text-xs text-muted">' . e($f['displayName'] . ' · ' . fmt_bytes((int)$f['sizeBytes']) . ' · ' . fmt_date_short($f['createdAt'])) . (empty($f['visibleToClient']) ? ' · unpublished' : '') . '</div></div>'
            . ui_button($can ? 'Download final files' : 'Locked', ['variant' => $can ? 'dark' : 'outline', 'icon' => $can ? 'download' : 'lock', 'attrs' => $can ? ['data-asset-open' => $f['id'], 'data-mode' => 'download'] : ['disabled' => true]]) . '</li>';
    }
    return $h . '</ul></div>';
}

// ───────────────────────────── messages ─────────────────────────────

/** Project (or general) conversation; assets/js/portal.js polls lightly and posts new messages. */
function message_thread(array $initial, array $o = []): string
{
    $props = ['projectId' => $o['projectId'] ?? null, 'clientId' => $o['clientId'] ?? null, 'staff' => !empty($o['staff']), 'placeholder' => $o['placeholder'] ?? 'Write a message…', 'initial' => $initial];
    return '<div data-fe-component="messages" data-props="' . json_attr($props) . '" class="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-soft">'
        . '<div data-msg-list class="thin-scroll space-y-4 overflow-y-auto px-4 py-5 sm:px-6 ' . e($o['height'] ?? 'h-[32rem]') . '" aria-live="polite" aria-label="Conversation"></div>'
        . '<form data-msg-form class="border-t border-line bg-surface-2/40 p-3 sm:p-4"><p data-msg-error role="alert" class="mb-2 hidden text-xs font-medium text-danger"></p><div class="flex items-end gap-2"><label class="sr-only" for="msg-body">Message</label>'
        . '<textarea id="msg-body" rows="2" maxlength="5000" placeholder="' . e($props['placeholder']) . '" class="max-h-40 min-h-[3rem] flex-1 resize-y rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"></textarea>'
        . '<button type="submit" disabled aria-label="Send message" class="' . e(btn_class('primary', 'md')) . '">' . icon('send', 16) . '<span class="hidden sm:inline">Send</span></button></div>'
        . '<div class="mt-2 flex items-center justify-between text-xs text-subtle"><span>Ctrl/⌘ + Enter to send</span>'
        . (empty($o['staff']) ? '<label class="flex items-center gap-1.5">Send to <select data-msg-group class="rounded-md border border-line bg-surface px-1.5 py-1 text-xs font-medium text-fg"><option value="PROJECT_MANAGER">Project manager</option><option value="EDITOR">Editor</option><option value="SUPPORT">Support</option></select></label>' : '') . '</div></form></div>';
}

// ───────────────────────────── documents: sign / pay / quote ─────────────────────────────

function quote_actions(string $id, ?string $projectId): string
{
    return '<div class="flex flex-wrap gap-3">' . ui_action("/api/quotes/{$id}/accept", 'Accept quote', ['size' => 'lg', 'icon' => 'check-circle', 'body' => (object)[], 'success' => 'Quote accepted — your contract is next.', 'redirect' => $projectId ? "/dashboard/projects/{$projectId}" : null])
        . ui_button('Decline', ['size' => 'lg', 'variant' => 'outline', 'attrs' => ['data-modal-open' => '#decline-quote']]) . '<a href="/dashboard/messages" class="inline-flex h-13 items-center px-3 text-sm font-semibold text-muted hover:text-fg">Ask a question first</a></div>'
        . ui_modal('decline-quote', 'Decline this quote?', '<form id="decline-form" novalidate data-fe-form="/api/quotes/' . e($id) . '/reject" data-success="Quote declined" class="space-y-3">' . form_error_slot() . field_textarea('reason', 'Reason (optional)', '', ['rows' => 3, 'placeholder' => 'Budget, timing, scope…']) . '</form>',
            ['size' => 'sm', 'description' => "I’d love to make it work — tell me what would change your mind.", 'footerHtml' => ui_button('Cancel', ['variant' => 'ghost', 'attrs' => ['data-modal-close' => true]]) . ui_button('Decline quote', ['type' => 'submit', 'variant' => 'danger', 'attrs' => ['form' => 'decline-form']])]);
}

/** E-signature: type your name or draw it. The server stores who/when/IP/UA and a hash of the exact text signed. */
function contract_sign(string $id, int $version, string $defaultName): string
{
    return '<section aria-labelledby="sign-h" data-fe-component="contract-sign" data-props="' . json_attr(['id' => $id, 'version' => $version]) . '" class="rounded-[var(--radius-card)] border-2 border-accent/50 bg-surface p-6 shadow-soft sm:p-7"><h2 id="sign-h" class="text-lg font-bold">Sign this agreement</h2>'
        . '<p class="mt-1 text-sm text-muted">By signing you confirm you have authority to enter this agreement on behalf of your company.</p><form novalidate class="mt-5 space-y-5" data-sign-form>' . form_error_slot()
        . field_input('signerName', 'Full legal name', $defaultName, ['required' => true, 'autocomplete' => 'name'])
        . '<div><div role="tablist" aria-label="Signature style" class="mb-3 inline-flex rounded-xl bg-surface-2 p-1 text-sm font-semibold"><button role="tab" type="button" data-kind="typed" aria-selected="true" class="rounded-lg bg-surface px-4 py-1.5 shadow-soft transition">Type</button><button role="tab" type="button" data-kind="drawn" aria-selected="false" class="rounded-lg px-4 py-1.5 text-muted transition">Draw</button></div>'
        . '<div data-pane="typed" class="rounded-xl border border-line-strong bg-white px-4 py-3"><label for="typed-sig" class="sr-only">Type your signature</label><input id="typed-sig" data-typed placeholder="Your name" autocomplete="off" class="w-full bg-transparent text-3xl text-black outline-none placeholder:text-neutral-300" style="font-family:\'Segoe Script\',\'Snell Roundhand\',\'Brush Script MT\',cursive"></div>'
        . '<div data-pane="drawn" hidden><canvas data-canvas class="h-40 w-full touch-none rounded-xl border border-line-strong bg-white" aria-label="Draw your signature"></canvas><button type="button" data-clear class="mt-1.5 text-xs font-semibold text-muted hover:text-fg">Clear</button></div></div>'
        . ui_checkbox('accept', 'I have read and agree to this agreement', false, 'My typed or drawn signature is legally binding.', '', ['data-agree' => true])
        . '<button type="submit" disabled data-sign-btn class="' . e(btn_class('primary', 'lg')) . '">' . icon('sign', 16) . 'Sign contract</button></form></section>';
}

/** Starts checkout with whichever provider is configured. In demo mode no card is charged — the payment pipeline still runs for real. */
function pay_panel(string $id, int $due, string $currency, bool $demoCheckout): string
{
    $amount = e(money($due, $currency));
    return '<div data-fe-component="pay-panel" data-props="' . json_attr(['id' => $id, 'demo' => $demoCheckout]) . '"><div data-pay-start' . ($demoCheckout ? ' hidden' : '') . '><button type="button" data-pay-begin class="' . e(btn_class('primary', 'lg')) . '">' . icon('card', 16) . 'Pay ' . $amount . '</button></div>'
        . '<div data-pay-demo' . ($demoCheckout ? '' : ' hidden') . ' class="rounded-[var(--radius-card)] border-2 border-dashed border-accent/60 bg-accent-soft/40 p-6"><div class="flex items-start gap-3">' . icon('card', 20, 'mt-0.5') . '<div class="flex-1"><h3 class="font-bold">Demo checkout</h3>'
        . '<p class="mt-1 text-sm text-muted">Payments are in demo mode: no real card is charged, but the invoice, project activation, notifications and receipt all run exactly as they would live.</p><div class="mt-4 flex flex-wrap items-center gap-3">'
        . '<button type="button" data-pay-demo-go class="' . e(btn_class('primary', 'lg')) . '">' . icon('check-circle', 16) . 'Simulate paying ' . $amount . '</button><button type="button" data-pay-cancel class="text-sm font-semibold text-muted hover:text-fg">Cancel</button></div></div></div></div>'
        . '<p data-pay-error role="alert" class="mt-3 hidden text-sm font-medium text-danger"></p></div>';
}

// ───────────────────────────── simple forms ─────────────────────────────

function change_request_form(string $projectId): string
{
    return '<form novalidate data-fe-form="/api/projects/' . e($projectId) . '/change-requests" data-success="Change request sent" data-reset class="space-y-4 rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-soft">'
        . '<div><h3 class="text-base font-bold">Request a change to the brief</h3><p class="mt-1 text-sm text-muted">Production has started, so the brief is locked. Tell me what changed and I\'ll confirm whether it\'s included or needs a small quote — nothing is charged without your approval.</p></div>' . form_error_slot()
        . field_textarea('whatChanged', 'What changed?', '', ['required' => true, 'rows' => 3, 'placeholder' => 'e.g. The client has asked for a 9:16 version as well.']) . field_textarea('why', 'Why?', '', ['rows' => 2]) . field_textarea('additionalRequirements', 'Anything new I should know?', '', ['rows' => 2])
        . submit_button('Submit change request', ['size' => 'md', 'class' => '']) . '</form>';
}

/** Star rating input: renders a hidden field named $name that the form picks up. */
function rating_input(string $name, string $label, bool $required = true): string
{
    return ui_field('rate-' . $name, $label, '<input type="hidden" name="' . e($name) . '" data-type="int"><div data-fe-component="rating" class="flex gap-1" role="radiogroup" aria-label="' . e($label) . '">'
        . implode('', array_map(fn($n) => '<button type="button" role="radio" aria-checked="false" data-rate="' . $n . '" aria-label="' . $n . ' star' . ($n > 1 ? 's' : '') . '" class="rounded-lg p-1 text-accent-text transition hover:scale-110">' . icon('star', 30, 'opacity-30') . '</button>', [1, 2, 3, 4, 5])) . '</div>', ['required' => $required, 'name' => $name]);
}

function feedback_form(string $projectId, array $defaults): string
{
    return '<form novalidate data-fe-form="/api/projects/' . e($projectId) . '/feedback" data-success="Thank you! Your feedback means a lot." class="space-y-4 rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-soft"><div><h3 class="text-base font-bold">How did I do?</h3>'
        . '<p class="mt-1 text-sm text-muted">A minute of your time helps me improve — and helps other creators choose with confidence.</p></div>' . form_error_slot() . rating_input('rating', 'Overall rating')
        . field_textarea('quote', 'Your experience', '', ['required' => true, 'rows' => 4, 'placeholder' => 'What went well? What made the biggest difference?'])
        . '<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">' . field_input('name', 'Name', $defaults['name'] ?? '', ['required' => true]) . field_input('role', 'Role', '') . field_input('company', 'Company', $defaults['company'] ?? '') . '</div>'
        . ui_checkbox('permissionToPublish', 'You may publish this on the website', true, 'Only shown after the studio reviews it. You can ask me to remove it any time.') . submit_button('Send feedback', ['size' => 'md', 'class' => '']) . '</form>';
}

function retainer_start(string $id, string $base = '/dashboard'): string
{
    return ui_button('Start a project from this retainer', ['variant' => 'dark', 'icon' => 'plus', 'attrs' => ['data-modal-open' => '#retainer-start-' . $id]])
        . ui_modal('retainer-start-' . $id, 'New retainer project', '<form id="retainer-form-' . e($id) . '" novalidate data-fe-form="/api/retainers/' . e($id) . '/projects" data-redirect="' . e($base) . '/projects/@id" data-success="Project started from your retainer" class="space-y-4">' . form_error_slot()
            . field_input('name', 'Project name', '', ['required' => true, 'placeholder' => 'e.g. October product reel']) . field_select('kind', 'Type', ['VIDEO' => 'Video', 'SHORT' => 'Short-form'], 'VIDEO', ['required' => true])
            . field_textarea('description', 'What do you need?', '', ['rows' => 3]) . field_input('deadline', 'Deadline', '', ['type' => 'date']) . '</form>',
            ['description' => 'Uses one of your included videos or shorts this month — no new quote or invoice needed.', 'footerHtml' => ui_button('Cancel', ['variant' => 'ghost', 'attrs' => ['data-modal-close' => true]]) . ui_button('Start project', ['type' => 'submit', 'attrs' => ['form' => 'retainer-form-' . $id]])]);
}
