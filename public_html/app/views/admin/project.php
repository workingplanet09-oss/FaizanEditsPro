<?php defined('FEP') or exit; /** Vars: $area, $base, $p, $docs, $versions, $latest, $staff, $tab, $showBilling, $actor + per-tab data */
$id = $p['id']; $status = $p['status']; $meta = status_meta($status);
$canWrite = $actor->can('projects:write');
$canAssign = $actor->can('projects:assign');
$closed = in_array($status, ['DELIVERED', 'APPROVED', 'ARCHIVED', 'CANCELLED'], true);
$late = $p['deadline'] && days_until($p['deadline']) < 0 && !$closed;
$here = "{$base}/projects/{$id}";
$tabs = [
    ['overview', 'Overview'], ['brief', 'Brief', null, ($p['brief']['status'] ?? null) === 'DRAFT'], ['files', 'Files', $p['counts']['assets']], ['videos', 'Videos', $p['counts']['versions']],
    ['revisions', 'Revisions', $p['counts']['openRevisions'], $p['counts']['openRevisions'] > 0], ['tasks', 'Tasks', $p['counts']['openTasks']], ['messages', 'Messages'],
];
if ($showBilling) { $tabs[] = ['billing', 'Billing', count($docs['invoices']) + count($docs['quotes']) + count($docs['contracts'])]; }
array_push($tabs, ['delivery', 'Delivery'], ['time', 'Time'], ['activity', 'Activity']);
if ($actor->can('notes:read')) { $tabs[] = ['notes', 'Notes']; }
$eyebrow = $actor->can('clients:read') && $area === 'admin' ? '<a class="hover:underline" href="/admin/clients/' . e($p['client']['id']) . '">' . e($p['client']['companyName']) . '</a>' : e($p['client']['companyName']);
$actions = ($latest ? ui_link("{$here}/review/{$latest['id']}", 'Open review · ' . $latest['label'], ['icon' => 'play', 'variant' => 'dark']) : '')
    . ($canWrite ? project_edit_modal($p) : '')
    . ($canWrite ? ui_action("/api/projects/{$id}/duplicate", 'Duplicate', ['icon' => 'copy', 'variant' => 'outline', 'body' => ['copyOnboarding' => true], 'redirect' => "{$base}/projects/@id", 'success' => 'Project duplicated']) : '');
?>
<?= back_link("{$base}/projects", 'Projects') ?>
<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
  <div class="min-w-0">
    <div class="eyebrow mb-1.5"><?= e($p['code']) ?> · <?= $eyebrow ?></div>
    <h1 class="flex flex-wrap items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl"><?= e($p['name']) ?><?= status_badge($status) ?><?= $p['priority'] !== 'NORMAL' ? priority_badge($p['priority']) : '' ?></h1>
    <?= $p['description'] ? '<p class="mt-1.5 max-w-2xl text-sm text-muted sm:text-[15px]">' . e($p['description']) . '</p>' : '' ?>
  </div>
  <div class="flex flex-wrap items-center gap-2"><?= $actions ?></div>
</div>
<?php ob_start(); ?><div class="p-6"><?= client_stepper($status) ?>
  <div class="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-4 text-sm">
    <span class="flex items-center gap-1.5 font-semibold <?= $late ? 'text-danger' : '' ?>"><?= icon('calendar', 15) ?><?= $p['deadline'] ? e(relative_deadline($p['deadline']) . ' · ' . fmt_date_short($p['deadline'])) : 'No deadline' ?></span>
    <span class="flex items-center gap-1.5"><?= icon('refresh', 15, 'text-subtle') ?>Revisions <?= (int)$p['revisionsUsed'] ?>/<?= (int)$p['revisionLimit'] ?></span>
    <?= $showBilling ? payment_badge($p['paymentState']) : '' ?><?= !empty($p['gateOverride']) ? ui_badge('Gate override active', 'danger') : '' ?>
    <span class="text-muted"><?= e($meta['clientNow']) ?></span></div></div>
<?= card(ob_get_clean(), 'mb-6') ?>
<?= ui_tabs($tabs, $tab, $here) ?>

<?php if ($tab === 'overview'): $g = $p['gate']; ?>
  <div class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
    <div class="space-y-6">
      <?= ($actor->can('projects:transition') || $actor->can('versions:upload')) ? status_control($p, $actor->can('deliverables:override')) : '' ?>
      <?php ob_start(); ?><ol class="grid grid-cols-1 gap-x-8 gap-y-3 px-6 pb-6 sm:grid-cols-2"><?php foreach ($milestones as $ms): ?>
        <li class="flex items-start gap-3"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full <?= $ms['done'] ? 'bg-fg text-bg' : 'border-2 border-line-strong' ?>"><?= $ms['done'] ? icon('check', 11, '', 3) : '' ?></span>
          <div><div class="text-sm font-semibold <?= $ms['done'] ? '' : 'text-muted' ?>"><?= e($ms['label']) ?></div><div class="text-xs text-subtle"><?= $ms['done'] ? e(fmt_date_short($ms['at']) . ($ms['by'] ? ' · ' . $ms['by'] : '')) : 'Pending' ?></div></div></li>
      <?php endforeach; ?></ol>
      <?= card(ob_get_clean(), '', 'Milestones') ?>
      <?php ob_start(); $sc = $p['scope']; ?><dl class="grid grid-cols-1 gap-4 px-6 pb-6 sm:grid-cols-2">
        <?= ui_meta('Deliverables', !empty($sc['deliverables']) ? e(implode(', ', array_map(fn($d) => "{$d['quantity']}× {$d['label']}", $sc['deliverables']))) : null) ?>
        <?= ui_meta('Turnaround', e(($sc['turnaroundBusinessDays'] ?? '—') . ' business days')) ?>
        <?= ui_meta('Service', e($p['service']['title'] ?? '')) ?><?= ui_meta('Type', e($p['projectType']['name'] ?? '')) ?>
        <?= ui_meta('Categories', !empty($sc['categories']) ? e(implode(', ', $sc['categories'])) : null) ?>
        <?= ui_meta('Started', $p['startDate'] ? e(fmt_date($p['startDate'])) : null) ?>
        <?= isset($p['internalCost']) && $p['internalCost'] !== null ? ui_meta('Internal cost', e(money((int)$p['internalCost'], $p['currency']))) : '' ?>
        <?= !empty($p['rushFee']) ? ui_meta('Rush fee', e(money((int)$p['rushFee'], $p['currency']))) : '' ?></dl>
      <?= card(ob_get_clean(), '', 'Scope') ?>
    </div>
    <aside class="space-y-6">
      <?= assign_team_card($p, $staff, $canAssign) ?>
      <?php if ($showBilling): ob_start(); ?><ul class="space-y-2.5 px-6 pb-6 text-sm"><?php foreach ([['Quote accepted', $g['quoteAccepted']], ['Contract signed', $g['contractSigned']], ['Deposit paid', $g['depositPaid']], ['Fully paid', $g['allPaid']]] as [$l, $ok]): ?>
        <li class="flex items-center gap-2.5"><?= icon($ok ? 'check-circle' : 'clock', 16, $ok ? 'text-success' : 'text-subtle') ?><span class="<?= $ok ? '' : 'text-muted' ?>"><?= e($l) ?></span></li><?php endforeach; ?>
        <?= $g['outstanding'] > 0 ? '<li class="rounded-xl bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">Outstanding ' . e(money((int)$g['outstanding'], $p['currency'])) . '</li>' : '' ?></ul>
        <?= card(ob_get_clean(), '', 'Payment gates') ?><?php endif; ?>
      <?= card('<div class="px-6 pb-6 text-sm"><div class="font-bold">' . e($p['client']['name']) . '</div><a class="text-accent-text hover:underline" href="mailto:' . e($p['client']['email']) . '">' . e($p['client']['email']) . '</a>' . (!empty($p['client']['phone']) ? '<div class="text-muted">' . e($p['client']['phone']) . '</div>' : '') . '</div>', '', 'Client contact') ?>
    </aside>
  </div>

<?php elseif ($tab === 'brief'): ?>
  <?php if (!$brief): ?><?= card(ui_empty('No brief yet', 'The client fills the project brief after payment. It will appear here as a structured summary.', 'clipboard')) ?>
  <?php else: ?><div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3 text-sm"><?= ui_badge($brief['status'] === 'LOCKED' ? 'Locked (production started)' : 'Draft v' . (int)$brief['version'], $brief['status'] === 'LOCKED' ? 'neutral' : 'info', '', $brief['status'] === 'LOCKED' ? 'lock' : 'pencil') ?>
      <?= $brief['confirmedAt'] ? ui_badge('Approved by client ' . fmt_date_short($brief['confirmedAt']), 'success') : ui_badge('Not yet approved by client', 'warning') ?></div>
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2"><?php foreach ($brief['content']['sections'] ?? [] as $s): ob_start(); ?>
      <dl class="space-y-3 px-6 pb-6"><?php foreach ($s['items'] as $it): ?><?= ui_meta($it['label'], '<span class="whitespace-pre-line">' . e(is_array($it['value']) ? implode(', ', $it['value']) : (string)$it['value']) . '</span>') ?><?php endforeach; ?></dl>
      <?= card(ob_get_clean(), '', $s['title'] ?? $s['label'] ?? '') ?>
    <?php endforeach; ?></div></div><?php endif; ?>

<?php elseif ($tab === 'files'): ?>
  <?= file_manager($files['items'], ['projectId' => $id, 'folders' => $folders, 'activeFolder' => $folder, 'basePath' => $here, 'extraParams' => ['tab' => 'files'], 'canUpload' => $actor->can('files:write'), 'canDelete' => $actor->can('files:delete'), 'canShare' => true, 'fileRequests' => $fileRequests]) ?>

<?php elseif ($tab === 'videos'): $canUpload = $actor->can('versions:upload'); $rmap = ['APPROVED' => 'success', 'PENDING_CLIENT' => 'warning']; ?>
  <div class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
    <div>
      <?php if ($versions): ?><div class="grid grid-cols-1 gap-4 sm:grid-cols-2"><?php foreach ($versions as $i => $v): ?>
        <a href="<?= e("{$here}/review/{$v['id']}") ?>" class="group overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-soft transition-[border-color,box-shadow] duration-150 hover:shadow-lift">
          <div class="relative aspect-video bg-surface-2"><?php if ($posters[$i]): ?><img src="<?= e($posters[$i]) ?>" alt="" class="h-full w-full object-cover" loading="lazy"><?php else: ?><div class="flex h-full items-center justify-center text-subtle"><?= icon('film', 30) ?></div><?php endif; ?>
            <?= !empty($v['durationMs']) ? '<span class="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white">' . e(fmt_timecode((int)$v['durationMs'])) . '</span>' : '' ?></div>
          <div class="space-y-1.5 p-4"><div class="flex items-center justify-between gap-2"><b class="text-base"><?= e($v['label'] . (!empty($v['isFinal']) ? ' · Final' : '')) ?></b><?= ui_badge(strtolower(str_replace('_', ' ', $v['reviewStatus'])), $rmap[$v['reviewStatus']] ?? 'neutral') ?></div>
            <p class="line-clamp-2 text-sm text-muted"><?= e($v['changeSummary'] ?: ($v['notes'] ?: '—')) ?></p>
            <div class="flex justify-between text-xs text-subtle"><span><?= e($v['createdBy'] ?? '') ?> · <?= ago($v['createdAt']) ?></span><span><?= !empty($v['counts']) ? (int)$v['counts']['open'] . ' open / ' . (int)$v['counts']['total'] : '' ?></span></div></div></a>
      <?php endforeach; ?></div>
      <?php else: ?><?= card(ui_empty('No versions yet', in_array($status, ['QUEUED', 'EDITING', 'REVISION', 'AWAITING_ASSETS', 'INTERNAL_REVIEW'], true) ? "Upload the first cut when it's ready." : 'Versions can be uploaded once the project is in production.', 'film')) ?><?php endif; ?>
    </div>
    <?= $canUpload ? version_upload_card($id, $openRevisions) : '' ?>
  </div>

<?php elseif ($tab === 'revisions'): $canManage = $actor->can('revisions:manage'); ?>
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <?php ob_start(); if ($revisions): ?><ul class="divide-y divide-line"><?php foreach ($revisions as $r): ?>
      <li class="flex flex-wrap items-center gap-3 px-6 py-3.5"><div class="min-w-0 flex-1"><div class="text-sm font-bold">Round <?= (int)$r['roundNumber'] ?> · <?= e($r['versionLabel'] ?? '') ?></div><div class="truncate text-xs text-muted"><?= e(($r['description'] ?: 'Timestamped notes') . ' · ' . (int)($r['commentCount'] ?? 0) . ' note(s)') ?> · <?= ago($r['createdAt']) ?></div></div>
        <?= priority_badge($r['priority']) ?><?= meta_badge('REVISION_STATUS', $r['status']) ?><?= revision_buttons($r['id'], $r['status'], $canManage) ?><a class="text-xs font-bold text-accent-text hover:underline" href="<?= e("{$here}/review/{$r['versionId']}") ?>">Open</a></li>
    <?php endforeach; ?></ul><?php else: ?><?= ui_empty('No revision requests', 'When the client requests changes, each round appears here.', 'refresh') ?><?php endif; ?>
    <?= card(ob_get_clean(), '', 'Revision rounds', 'Feedback batches sent by the client.') ?>
    <?php ob_start(); if ($changeRequests): $ccls = ['PENDING' => 'warning', 'INCLUDED' => 'success']; ?><ul class="divide-y divide-line"><?php foreach ($changeRequests as $cr): ?>
      <li class="space-y-1.5 px-6 py-3.5"><div class="flex items-start justify-between gap-3"><p class="text-sm font-semibold"><?= e($cr['whatChanged']) ?></p><?= ui_badge(strtolower(str_replace('_', ' ', $cr['classification'])), $ccls[$cr['classification']] ?? 'neutral') ?></div>
        <?= $cr['why'] ? '<p class="text-xs text-muted">' . e($cr['why']) . '</p>' : '' ?>
        <div class="flex items-center justify-between text-xs text-subtle"><span><?= e($cr['submittedBy']['name']) ?> · <?= ago($cr['createdAt']) ?></span><?= $canWrite ? change_request_review($cr) : '' ?></div></li>
    <?php endforeach; ?></ul><?php else: ?><?= ui_empty('No change requests', null, 'pencil') ?><?php endif; ?>
    <?= card(ob_get_clean(), '', 'Change requests', 'Scope changes after production started.') ?>
  </div>

<?php elseif ($tab === 'tasks'): ?>
  <?= tasks_panel($tasks, ['staff' => $staff, 'projectId' => $id, 'canWrite' => $actor->can('tasks:write'), 'meId' => $actor->userId, 'base' => $base]) ?>

<?php elseif ($tab === 'messages'): ?>
  <?= message_thread($messages, ['projectId' => $id, 'staff' => true, 'placeholder' => "Reply to the client (they'll get a notification)…"]) ?>

<?php elseif ($tab === 'billing' && $showBilling): ?>
  <div class="space-y-6">
    <div class="flex flex-wrap gap-2">
      <?= $actor->can('quotes:write') ? ui_link('/admin/quotes/new?clientId=' . $p['client']['id'] . '&projectId=' . $id, 'New quote', ['icon' => 'clipboard', 'variant' => 'outline']) : '' ?>
      <?= $actor->can('invoices:write') ? ui_link('/admin/invoices/new?clientId=' . $p['client']['id'] . '&projectId=' . $id, 'New invoice', ['icon' => 'receipt', 'variant' => 'outline']) : '' ?></div>
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <?php
      $col = function (string $title, array $rows, string $empty, callable $li) { $h = $rows ? '<ul class="divide-y divide-line">' . implode('', array_map($li, $rows)) . '</ul>' : '<p class="px-6 pb-6 text-sm text-muted">' . e($empty) . '</p>'; return card($h, '', $title); };
      echo $col('Quotes', $docs['quotes'], 'No quotes.', fn($q) => '<li><a href="/admin/quotes/' . e($q['id']) . '" class="flex items-center justify-between gap-2 px-6 py-3.5 text-sm hover:bg-surface-2/60"><span><b>' . e($q['number']) . '</b><span class="block text-xs tabular-nums text-muted">' . e(money((int)$q['total'], $q['currency'])) . '</span></span>' . meta_badge('QUOTE_STATUS', $q['status']) . '</a></li>');
      echo $col('Contracts', $docs['contracts'], 'No contracts.', fn($c) => '<li><a href="/admin/contracts/' . e($c['id']) . '" class="flex items-center justify-between gap-2 px-6 py-3.5 text-sm hover:bg-surface-2/60"><span><b>' . e($c['number']) . '</b><span class="block text-xs text-muted">' . ($c['signedAt'] ? 'Signed ' . e(fmt_date_short($c['signedAt'])) : 'Not signed') . '</span></span>' . meta_badge('CONTRACT_STATUS', $c['status']) . '</a></li>');
      echo $col('Invoices', $docs['invoices'], 'No invoices.', fn($i) => '<li><a href="/admin/invoices/' . e($i['id']) . '" class="flex items-center justify-between gap-2 px-6 py-3.5 text-sm hover:bg-surface-2/60"><span><b>' . e($i['number']) . '</b><span class="block text-xs tabular-nums text-muted">' . e(money((int)$i['total'], $i['currency']) . ' · ' . strtolower($i['kind'])) . '</span></span>' . meta_badge('INVOICE_STATUS', $i['status']) . '</a></li>');
      ?>
    </div>
  </div>

<?php elseif ($tab === 'delivery'): $unpublished = count(array_filter($delivery['items'], fn($i) => empty($i['visibleToClient']))); ?>
  <div class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
    <?= delivery_list($delivery, $status, $id, true) ?>
    <?= deliverables_admin_card($id, $unpublished, $actor->can('files:write')) ?>
  </div>

<?php elseif ($tab === 'time'): ?>
  <?= $actor->can('time:track') ? time_panel($id, $entries, $running, true) : card(ui_empty("Time tracking isn't enabled for your role", null, 'timer')) ?>

<?php elseif ($tab === 'activity'): ?>
  <?= card(activity_feed($timeline, false), '', 'Activity', 'Client-visible events and internal ones (marked).') ?>

<?php elseif ($tab === 'notes' && $actor->can('notes:read')): ?>
  <div class="max-w-2xl"><?= notes_panel('PROJECT', $id, $notes, $actor->can('notes:write')) ?></div>
<?php endif; ?>
