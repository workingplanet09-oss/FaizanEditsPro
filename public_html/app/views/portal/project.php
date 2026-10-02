<?php defined('FEP') or exit; /** Vars: $p, $docs, $versions, $latest, $tab, $can, $delivered, $production, $fileRequests, + per-tab data, $actor */
$id = $p['id']; $status = $p['status']; $meta = status_meta($status);
$base = "/dashboard/projects/{$id}";
$open = fn(array $rows, array $statuses) => array_values(array_filter($rows, fn($r) => in_array($r['status'], $statuses, true)))[0] ?? null;
$openInvoice = $open($docs['invoices'], ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE']);
$openContract = $open($docs['contracts'], ['SENT', 'VIEWED']);
$openQuote = $open($docs['quotes'], ['SENT', 'VIEWED']);
$cta = null;
if ($openQuote && in_array($status, ['INQUIRY', 'AWAITING_QUOTE'], true)) { $cta = ['Review your quote', "/dashboard/quotes/{$openQuote['id']}", 'clipboard']; }
elseif ($openContract && $status === 'AWAITING_CONTRACT') { $cta = ['Review & sign contract', "/dashboard/contracts/{$openContract['id']}", 'sign']; }
elseif ($openInvoice && in_array($status, ['AWAITING_PAYMENT', 'APPROVED'], true)) { $cta = ['Pay ' . money((int)($openInvoice['total'] - $openInvoice['amountPaid']), $openInvoice['currency']), "/dashboard/invoices/{$openInvoice['id']}", 'card']; }
elseif ($status === 'ONBOARDING') { $cta = ['Complete project setup', "{$base}/setup", 'rocket']; }
elseif ($status === 'AWAITING_ASSETS') { $cta = ['Upload your files', "{$base}?tab=files", 'upload']; }
elseif (in_array($status, ['CLIENT_REVIEW', 'FINAL_REVIEW'], true) && $latest) { $cta = ['Review ' . $latest['label'], "{$base}/review/{$latest['id']}", 'play']; }
elseif (in_array($status, ['APPROVED', 'DELIVERED'], true)) { $cta = [$status === 'DELIVERED' ? 'Download final files' : 'See delivery status', "{$base}?tab=delivery", 'download']; }
$tabs = [['overview', 'Overview'], ['timeline', 'Timeline'], ['files', 'Files', $p['counts']['assets'], $p['counts']['openFileRequests'] > 0 || $status === 'AWAITING_ASSETS'], ['versions', 'Videos', $p['counts']['versions'], in_array($status, ['CLIENT_REVIEW', 'FINAL_REVIEW'], true)],
    ['messages', 'Messages'], ['billing', 'Billing', count($docs['invoices']) + count($docs['quotes']) + count($docs['contracts'])]];
if ($delivered) { $tabs[] = ['delivery', 'Delivery', null, $status === 'DELIVERED']; $tabs[] = ['feedback', 'Feedback']; }
if ($production) { $tabs[] = ['changes', 'Change requests']; }
?>
<div class="mb-2"><a href="/dashboard/projects" class="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg"><?= icon('chevron-left', 14) ?> All projects</a></div>
<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
  <div class="min-w-0">
    <div class="flex flex-wrap items-center gap-2 text-xs font-bold text-subtle"><span><?= e($p['code']) ?></span><?= $p['service'] ? '<span>· ' . e($p['service']['title']) . '</span>' : '' ?></div>
    <h1 class="mt-1 text-2xl font-bold tracking-tight sm:text-3xl"><?= e($p['name']) ?></h1>
    <div class="mt-2 flex flex-wrap items-center gap-2"><?= status_badge($status, 'STATUS', true) ?>
      <?= ($p['deadline'] && !in_array($status, ['DELIVERED', 'ARCHIVED', 'CANCELLED'], true)) ? ui_badge(relative_deadline($p['deadline']) . ' · ' . fmt_date_short($p['deadline']), 'neutral', '', 'calendar') : '' ?>
      <?= $p['paymentState'] !== 'NONE' ? payment_badge($p['paymentState']) : '' ?></div>
  </div>
  <?= $cta ? ui_link($cta[1], $cta[0], ['icon' => $cta[2], 'size' => 'lg', 'class' => 'shrink-0']) : '' ?>
</div>
<?= card(client_stepper($status) . '<div class="mt-5 grid grid-cols-1 gap-4 border-t border-line pt-5 sm:grid-cols-2"><div><div class="text-xs font-bold text-subtle">Right now</div><p class="mt-1 text-sm font-medium">' . e($meta['clientNow']) . '</p></div><div><div class="text-xs font-bold text-subtle">Next</div><p class="mt-1 text-sm font-medium">' . e($meta['clientNext']) . '</p></div></div>', 'mb-6 p-6 sm:p-6') ?>
<?= ui_tabs($tabs, $tab, $base) ?>

<?php if ($tab === 'overview'): $gate = $p['gate'];
  $steps = [['Quote accepted', $gate['quoteAccepted']], ['Contract signed', $gate['contractSigned']], ['Deposit paid', $gate['depositPaid']], ['Final payment', $gate['allPaid'] && count($docs['invoices']) > 0]]; ?>
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
    <div class="space-y-6">
      <?php ob_start(); ?><ol class="px-6 pb-6"><?php foreach ($milestones as $i => $m): ?>
        <li class="relative flex gap-4 pb-5 last:pb-0"><?= $i < count($milestones) - 1 ? '<span aria-hidden="true" class="absolute left-[13px] top-7 h-[calc(100%-1.5rem)] w-px ' . ($m['done'] ? 'bg-fg/25' : 'bg-line') . '"></span>' : '' ?>
          <span class="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 <?= $m['done'] ? 'border-fg bg-fg text-bg' : 'border-line-strong bg-surface text-subtle' ?>"><?= $m['done'] ? icon('check', 14, '', 3) : '<span class="h-1.5 w-1.5 rounded-full bg-line-strong"></span>' ?></span>
          <div class="min-w-0 flex-1 pt-0.5"><div class="text-sm font-bold <?= $m['done'] ? '' : 'text-muted' ?>"><?= e($m['label']) ?></div><div class="text-xs text-subtle"><?= $m['done'] ? e(fmt_date_short($m['at']) . (!empty($m['by']) ? ' · ' . $m['by'] : '')) : 'Upcoming' ?></div>
            <?= ($m['done'] && !empty($m['comment'])) ? '<p class="mt-1 line-clamp-2 text-xs text-muted">' . e($m['comment']) . '</p>' : '' ?></div></li>
      <?php endforeach; ?></ol>
      <?= card(ob_get_clean(), '', 'Progress tracker', 'Every step, with who did it and when.') ?>
      <?php if ($p['brief']): ?>
        <?php ob_start(); ?><div class="grid grid-cols-1 gap-x-8 gap-y-5 px-6 pb-6 sm:grid-cols-2"><?php foreach (array_slice($p['brief']['content']['sections'] ?? [], 0, 6) as $s): ?>
          <div><h4 class="mb-2 text-xs font-bold text-subtle"><?= e($s['title'] ?? $s['label'] ?? '') ?></h4><dl class="space-y-1.5"><?php foreach (array_slice($s['items'], 0, 5) as $it): ?><div class="text-sm"><dt class="inline text-muted"><?= e($it['label']) ?>: </dt><dd class="inline font-medium"><?= e(mb_substr(is_array($it['value']) ? implode(', ', $it['value']) : (string)$it['value'], 0, 120)) ?></dd></div><?php endforeach; ?></dl></div>
        <?php endforeach; ?></div>
        <?= card(ob_get_clean(), '', 'Project brief', $p['brief']['status'] === 'LOCKED' ? 'Locked — production has started. Use change requests for anything new.' : 'Version ' . $p['brief']['version'],
          ($p['brief']['status'] !== 'LOCKED' && in_array($status, ['ONBOARDING', 'AWAITING_ASSETS', 'QUEUED'], true)) ? ui_link("{$base}/setup", 'Edit', ['size' => 'sm', 'variant' => 'outline', 'icon' => 'pencil']) : null) ?>
      <?php endif; ?>
    </div>
    <aside class="space-y-6">
      <?php ob_start(); ?><dl class="grid grid-cols-2 gap-4 px-6 pb-6">
        <?= ui_meta('Deadline', $p['deadline'] ? e(fmt_date($p['deadline'])) : 'Set after payment') ?><?= ui_meta('Revisions', e("{$p['revisionsUsed']} of {$p['revisionLimit']} used")) ?>
        <?= ui_meta('Started', $p['startDate'] ? e(fmt_date($p['startDate'])) : null) ?><?= ui_meta('Delivered', $p['deliveredAt'] ? e(fmt_date($p['deliveredAt'])) : null) ?>
        <?= ui_meta('Service', e($p['service']['title'] ?? ''), 'col-span-2') ?>
        <?= !empty($p['scope']['deliverables']) ? ui_meta('Deliverables', e(implode(', ', array_map(fn($d) => "{$d['quantity']}× {$d['label']}", $p['scope']['deliverables']))), 'col-span-2') : '' ?></dl>
      <?= card(ob_get_clean(), '', 'Details') ?>
      <?php ob_start(); ?><ul class="space-y-3 px-6 pb-6">
        <?php if ($p['manager']): ?><li class="flex items-center gap-3"><?= ui_avatar($p['manager']['name'], null, 32) ?><div><div class="text-sm font-bold"><?= e($p['manager']['name']) ?></div><div class="text-xs text-subtle">Project manager</div></div></li><?php endif; ?>
        <?php foreach ($p['members'] as $m): if ($m['role'] === 'MANAGER') continue; ?><li class="flex items-center gap-3"><?= ui_avatar($m['user']['name'], null, 32) ?><div><div class="text-sm font-bold"><?= e($m['user']['name']) ?></div><div class="text-xs capitalize text-subtle"><?= e(strtolower(str_replace('_', ' ', $m['role']))) ?></div></div></li><?php endforeach; ?>
        <?php if (!$p['manager'] && !$p['members']): ?><li class="text-sm text-muted">Your team is assigned once the project starts.</li><?php endif; ?></ul>
      <?= card(ob_get_clean(), '', 'Your team') ?>
      <?php ob_start(); ?><ul class="space-y-2.5 px-6 pb-6"><?php foreach ($steps as [$label, $done]): ?><li class="flex items-center gap-2.5 text-sm"><?= icon($done ? 'check-circle' : 'clock', 17, $done ? 'text-success' : 'text-subtle') ?><span class="<?= $done ? '' : 'text-muted' ?>"><?= e($label) ?></span></li><?php endforeach; ?>
        <?= $gate['outstanding'] > 0 ? '<li class="mt-1 rounded-xl bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">Outstanding: ' . e(money((int)$gate['outstanding'], $p['currency'])) . '</li>' : '' ?></ul>
      <?= card(ob_get_clean(), '', 'Payment & approvals') ?>
    </aside>
  </div>

<?php elseif ($tab === 'timeline'): ?>
  <?= card(activity_feed(array_map(fn($i) => ['id' => $i['id'], 'message' => $i['message'], 'at' => $i['at'], 'by' => $i['by'] ?? null], $timeline), false), '', 'Activity', "A complete record of what's happened on this project.") ?>

<?php elseif ($tab === 'files'): ?>
  <div class="space-y-6">
    <?php if ($status === 'AWAITING_ASSETS'): ?>
      <div class="flex flex-col gap-4 rounded-2xl border border-accent/40 bg-accent-soft/60 p-6 sm:flex-row sm:items-center sm:justify-between"><div><h3 class="font-bold">Upload your footage and assets</h3><p class="mt-1 text-sm text-muted">When everything is in, tell me — your project moves to the editing queue straight away.</p></div>
        <?= ui_action("/api/projects/{$id}/assets-ready", "I've uploaded everything", ['variant' => 'dark', 'icon' => 'check-circle', 'success' => 'Great — your project is queued for an editor', 'attrs' => $can['upload'] ? [] : ['disabled' => true], 'confirm' => ['title' => 'Everything uploaded?', 'description' => "I’ll queue your project for an editor. You can still add files later, but the edit starts from what's here now.", 'confirmLabel' => 'Yes, start my project']]) ?></div>
    <?php endif; $closed = in_array($status, ['DELIVERED', 'ARCHIVED', 'CANCELLED'], true); ?>
    <?= file_manager($files['items'], ['projectId' => $id, 'folders' => $folders, 'activeFolder' => $folder, 'basePath' => $base, 'extraParams' => ['tab' => 'files'], 'canUpload' => $can['upload'] && !$closed, 'canDelete' => $can['upload'] && !$closed, 'canShare' => false, 'fileRequests' => $fileRequests]) ?>
  </div>

<?php elseif ($tab === 'versions'): ?>
  <?php if (!$versions): ?><?= card(ui_empty('No drafts yet', $meta['clientNext'], 'film')) ?>
  <?php else: $vmap = ['PENDING_CLIENT' => ['Awaiting your review', 'warning'], 'APPROVED' => ['Approved', 'success'], 'CHANGES_REQUESTED' => ['Changes requested', 'info'], 'SUPERSEDED' => ['Replaced', 'neutral'], 'DRAFT' => ['Draft', 'neutral'], 'INTERNAL_REVIEW' => ['Internal', 'neutral']]; ?>
    <div class="space-y-8">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"><?php foreach ($versions as $i => $v): $vm = $vmap[$v['reviewStatus']] ?? [$v['reviewStatus'], 'neutral']; ?>
        <a href="<?= e("{$base}/review/{$v['id']}") ?>" class="group overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
          <div class="relative aspect-video bg-surface-2"><?php if ($posters[$i]): ?><img src="<?= e($posters[$i]) ?>" alt="" class="h-full w-full object-cover" loading="lazy"><?php else: ?><div class="flex h-full items-center justify-center text-subtle"><?= icon('film', 32) ?></div><?php endif; ?>
            <span class="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100"><span class="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-black"><?= icon('play', 22) ?></span></span>
            <?= !empty($v['durationMs']) ? '<span class="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white">' . e(fmt_timecode((int)$v['durationMs'])) . '</span>' : '' ?></div>
          <div class="space-y-2 p-4"><div class="flex items-center justify-between gap-2"><h3 class="text-base font-bold"><?= e($v['label'] . (!empty($v['isFinal']) ? ' · Final' : '')) ?></h3><?= ui_badge($vm[0], $vm[1]) ?></div>
            <p class="line-clamp-2 text-sm text-muted"><?= e($v['changeSummary'] ?: ($v['notes'] ?: 'No notes.')) ?></p>
            <div class="flex items-center justify-between text-xs text-subtle"><span><?= ago($v['releasedAt'] ?? $v['createdAt']) ?></span><span><?= !empty($v['counts']) ? (int)$v['counts']['open'] . ' open · ' . (int)$v['counts']['resolved'] . ' resolved' : '' ?></span></div></div></a>
      <?php endforeach; ?></div>
      <?php if ($revisions): ?>
        <?php ob_start(); ?><ul class="divide-y divide-line"><?php foreach ($revisions as $r): ?>
          <li class="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5.5"><div class="min-w-0"><div class="text-sm font-bold">Round <?= (int)$r['roundNumber'] ?> · <?= e($r['versionLabel']) ?></div><div class="truncate text-xs text-muted"><?= e(($r['description'] ?: 'Timestamped notes') . ' · ' . (int)($r['commentCount'] ?? 0) . ' note' . ((int)($r['commentCount'] ?? 0) === 1 ? '' : 's')) ?></div></div>
            <div class="flex items-center gap-3"><span class="text-xs text-subtle"><?= ago($r['createdAt']) ?></span><?= meta_badge('REVISION_STATUS', $r['status']) ?></div></li><?php endforeach; ?></ul>
        <?= card(ob_get_clean(), '', 'Revision rounds', 'Each round is a batch of timestamped notes you sent.') ?>
      <?php endif; ?>
    </div>
  <?php endif; ?>

<?php elseif ($tab === 'messages'): ?>
  <?= message_thread($messages, ['projectId' => $id]) ?>

<?php elseif ($tab === 'billing'): ?>
  <?php if (!$docs['quotes'] && !$docs['contracts'] && !$docs['invoices']): ?><?= card(ui_empty('No billing documents yet', "Your quote, contract and invoices will appear here as soon as they're ready.", 'receipt')) ?>
  <?php else:
    $docList = function (string $title, array $rows) {
        $h = '<ul class="divide-y divide-line">';
        foreach ($rows as $r) {
            $h .= '<li><a href="' . e($r['href']) . '" class="flex items-center gap-4 px-6 py-3.5.5 transition hover:bg-surface-2/60"><div class="min-w-0 flex-1"><div class="text-sm font-bold">' . e($r['title']) . '</div><div class="truncate text-xs text-muted">' . e($r['sub']) . '</div></div><div class="hidden text-sm font-semibold tabular-nums sm:block">' . e($r['right']) . '</div>' . $r['badge'] . icon('chevron-right', 16, 'text-subtle') . '</a></li>';
        }
        return card($h . '</ul>', '', $title);
    }; ?>
    <div class="space-y-6">
      <?= $docs['quotes'] ? $docList('Quotes', array_map(fn($q) => ['href' => "/dashboard/quotes/{$q['id']}", 'title' => $q['number'], 'sub' => (string)$q['title'], 'right' => money((int)$q['total'], $q['currency']), 'badge' => meta_badge('QUOTE_STATUS', $q['status'])], $docs['quotes'])) : '' ?>
      <?= $docs['contracts'] ? $docList('Contracts', array_map(fn($c) => ['href' => "/dashboard/contracts/{$c['id']}", 'title' => $c['number'], 'sub' => (string)$c['title'], 'right' => $c['signedAt'] ? 'Signed ' . fmt_date_short($c['signedAt']) : '', 'badge' => meta_badge('CONTRACT_STATUS', $c['status'])], $docs['contracts'])) : '' ?>
      <?= $docs['invoices'] ? $docList('Invoices', array_map(fn($i) => ['href' => "/dashboard/invoices/{$i['id']}", 'title' => $i['number'], 'sub' => ucfirst(strtolower($i['kind'])) . ($i['dueDate'] ? ' · due ' . fmt_date_short($i['dueDate']) : ''), 'right' => money((int)$i['total'], $i['currency']), 'badge' => meta_badge('INVOICE_STATUS', $i['status'])], $docs['invoices'])) : '' ?>
    </div>
  <?php endif; ?>

<?php elseif ($tab === 'delivery' && $delivered): ?>
  <?= delivery_list($delivery, $status, $id) ?>

<?php elseif ($tab === 'feedback' && $delivered): ?>
  <?php if ($feedback['submitted']): ?>
    <?= card(icon('check-circle', 30, 'mx-auto text-success') . '<h3 class="mt-3 text-lg font-bold">Feedback received — thank you!</h3><p class="mt-1 text-sm text-muted">You rated this project ' . (int)$feedback['submitted']['rating'] . '/5 on ' . e(fmt_date($feedback['submitted']['createdAt'])) . '.</p>', 'p-8 text-center') ?>
  <?php else: ?><div class="max-w-2xl"><?= feedback_form($id, $feedback['defaults']) ?></div><?php endif; ?>

<?php elseif ($tab === 'changes' && $production):
  $cls = ['PENDING' => ['In review', 'info'], 'INCLUDED' => ['Included', 'success'], 'OUT_OF_SCOPE' => ['Out of scope', 'neutral'], 'ADDITIONAL_COST' => ['Needs a quote', 'warning']];
  $locked = ($p['brief']['status'] ?? null) === 'LOCKED'; ?>
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
    <div>
      <?php if ($changes): ?><ul class="space-y-3"><?php foreach ($changes as $c): $cm = $cls[$c['classification']] ?? [$c['classification'], 'neutral']; ?>
        <li class="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-soft"><div class="flex items-start justify-between gap-3"><p class="text-sm font-semibold"><?= e($c['whatChanged']) ?></p><?= ui_badge($cm[0], $cm[1]) ?></div>
          <?= $c['why'] ? '<p class="mt-1.5 text-sm text-muted">' . e($c['why']) . '</p>' : '' ?><?= $c['staffNote'] ? '<p class="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm"><b>Studio:</b> ' . e($c['staffNote']) . '</p>' : '' ?>
          <p class="mt-3 text-xs text-subtle"><?= e($c['submittedBy']['name']) ?> · <?= ago($c['createdAt']) ?></p></li><?php endforeach; ?></ul>
      <?php else: ?><?= card(ui_empty('No change requests', $locked ? "The brief is locked because production has started. If something changes, send a change request and I’ll confirm scope and cost." : 'Send a request here if the scope changes after production starts.', 'pencil')) ?><?php endif; ?>
    </div>
    <?= $can['manage'] ? change_request_form($id) : '<p class="text-sm text-muted">Only project managers on your team can submit change requests.</p>' ?>
  </div>
<?php endif; ?>
