<?php defined('FEP') or exit; /** Vars: $base, $data, $projectId, $props, $playback, $actor */
$project = $data['project']; $cur = $data['current']; $perms = $data['perms'];
$vmap = ['PENDING_CLIENT' => ['Awaiting client review', 'warning'], 'APPROVED' => ['Approved', 'success'], 'CHANGES_REQUESTED' => ['Changes requested', 'info'], 'SUPERSEDED' => ['Replaced by newer version', 'neutral'], 'DRAFT' => ['Team-only draft', 'neutral'], 'INTERNAL_REVIEW' => ['Internal review', 'neutral']];
?>
<?php if (!$cur): ?>
  <?= card(ui_empty('No drafts to review yet', 'As soon as the first version is uploaded it will appear here, ready for timestamped notes.', 'film', ui_link("{$base}/projects/{$projectId}", 'Back to project', ['variant' => 'outline']))) ?>
<?php else: $vs = $vmap[$cur['reviewStatus']] ?? [$cur['reviewStatus'], 'neutral']; $meta = status_meta($project['status']); $others = array_values(array_filter($data['versions'], fn($v) => $v['id'] !== $cur['id'])); ?>
<div class="-mx-4 sm:mx-0">
  <div class="mb-4 flex flex-wrap items-start justify-between gap-3 px-4 sm:px-0">
    <div class="min-w-0">
      <a href="<?= e("{$base}/projects/{$projectId}") ?>" class="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg"><?= icon('chevron-left', 14) ?> <?= e($project['name']) ?></a>
      <div class="mt-1 flex flex-wrap items-center gap-2"><h1 class="text-xl font-bold tracking-tight sm:text-2xl"><?= e($cur['label'] . ($cur['isFinal'] ? ' · Final' : '')) ?></h1><?= ui_badge($vs[0], $vs[1]) ?>
        <span class="text-xs text-subtle"><?= e($project['code']) ?> · <?= ago($cur['releasedAt'] ?? $cur['createdAt'], 'uploaded ') ?><?= $cur['createdBy'] ? e(' by ' . $cur['createdBy']) : '' ?></span></div>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <label class="sr-only" for="version-select">Version</label>
      <select id="version-select" data-base="<?= e("{$base}/projects/{$projectId}/review/") ?>" class="h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold">
        <?php foreach ($data['versions'] as $v): ?><option value="<?= e($v['id']) ?>"<?= $v['id'] === $cur['id'] ? ' selected' : '' ?>><?= e($v['label'] . ($v['isFinal'] ? ' (final)' : '') . ' — ' . ($vmap[$v['reviewStatus']][0] ?? $v['reviewStatus'])) ?></option><?php endforeach; ?>
      </select>
      <?php if ($others): ?>
        <?= ui_button('Stop comparing', ['variant' => 'outline', 'icon' => 'x', 'attrs' => ['id' => 'stop-compare', 'hidden' => true]]) ?>
        <label class="relative"><span class="sr-only">Compare with another version</span>
          <select id="compare-select" class="h-10 appearance-none rounded-xl border border-line-strong bg-surface pl-9 pr-8 text-sm font-semibold"><option value="">Compare…</option><?php foreach ($others as $v): ?><option value="<?= e($v['id']) ?>">vs <?= e($v['label']) ?></option><?php endforeach; ?></select>
          <?= icon('layers', 15, 'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle') ?></label>
      <?php endif; ?>
      <?= !empty($perms['canRelease']) ? ui_action("/api/video-versions/{$cur['id']}/release", 'Release to client', ['variant' => 'dark', 'icon' => 'send', 'body' => (object)[], 'success' => 'Released to the client']) : '' ?>
    </div>
  </div>

  <?php /* The player is built by JavaScript. This placeholder has the same proportions, so nothing below it moves when the player appears. */ ?>
  <div data-fe-component="review-player" data-props="<?= json_attr($props) ?>">
    <div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_26rem]" aria-hidden="true">
      <div><div class="aspect-video w-full bg-black sm:rounded-t-[var(--radius-card)]"></div><div class="h-[5.25rem] bg-neutral-950 sm:rounded-b-[var(--radius-card)]"></div></div>
      <div class="h-[24.5rem] px-4 sm:px-0 lg:h-[max(32rem,calc(100vh-11rem))]"><div class="skeleton h-full w-full rounded-[var(--radius-card)]"></div></div>
    </div>
  </div>

  <div class="px-4 sm:px-0">
    <?php if ($cur['notes'] || $cur['changeSummary']): ?>
      <div class="mt-4 rounded-2xl border border-line bg-surface p-4 lg:max-w-[calc(100%-26rem-1.25rem)]">
        <?= $cur['changeSummary'] ? '<p class="text-sm"><b>What changed:</b> ' . e($cur['changeSummary']) . '</p>' : '' ?>
        <?= $cur['notes'] ? '<p class="text-sm text-muted' . ($cur['changeSummary'] ? ' mt-1.5' : '') . '"><b class="text-fg">Editor\'s note:</b> ' . e($cur['notes']) . '</p>' : '' ?>
      </div>
    <?php endif; ?>
    <?php if ($perms['canApprove'] || $perms['canRequestRevision']): ?>
      <div class="mt-4 rounded-[var(--radius-card)] border border-accent/40 bg-accent-soft/50 p-6 lg:max-w-[calc(100%-26rem-1.25rem)]">
        <h2 class="text-base font-bold">Ready to decide on <?= e($cur['label']) ?>?</h2>
        <p class="mt-1 text-sm text-muted"><?= e($meta['clientNext']) ?> You've used <?= (int)$project['revisionsUsed'] ?> of <?= (int)$project['revisionLimit'] ?> included revision rounds.</p>
        <div class="mt-4 flex flex-wrap gap-3">
          <?= $perms['canApprove'] ? ui_button('Approve ' . $cur['label'], ['size' => 'lg', 'icon' => 'check-circle', 'attrs' => ['data-modal-open' => '#approve-modal']]) : '' ?>
          <?= $perms['canRequestRevision'] ? ui_button('Leave feedback', ['size' => 'lg', 'variant' => 'outline', 'icon' => 'refresh', 'labelHtml' => icon('refresh', 16) . 'Leave feedback (<span data-open-notes>0</span> notes)', 'attrs' => ['data-modal-open' => '#changes-modal', 'data-open-changes' => true]]) : '' ?>
        </div>
      </div>
    <?php elseif ($cur['reviewStatus'] === 'APPROVED'): ?>
      <div class="mt-4 flex items-start gap-3 rounded-2xl border border-success/30 bg-success-soft/50 p-4 text-sm lg:max-w-[calc(100%-26rem-1.25rem)]"><?= icon('check-circle', 20, 'mt-0.5 shrink-0 text-success') ?><div><b>Approved<?= $cur['approvedBy'] ? e(' by ' . $cur['approvedBy']) : '' ?>.</b> <?= $cur['approvalNotes'] ? '“' . e($cur['approvalNotes']) . '” ' : '' ?><span class="text-muted">Final files unlock once payment conditions are met.</span></div></div>
    <?php endif; ?>
  </div>
</div>

<?php if ($perms['canApprove']): ?>
  <?= ui_modal('approve-modal', 'Approve ' . $cur['label'] . '?', '<form id="approve-form" novalidate data-fe-form="/api/projects/' . e($projectId) . '/approve" data-prepare="approvePrep" data-redirect="' . e($base) . '/projects/' . e($projectId) . '?tab=delivery" data-success="' . e($cur['label']) . ' approved — I\'m preparing your final files." class="space-y-4">' . form_error_slot()
      . '<input type="hidden" name="versionId" value="' . e($cur['id']) . '"><input type="hidden" name="confirmVersionNumber" value="' . (int)$cur['versionNumber'] . '">'
      . '<div data-field="sure">' . ui_checkbox('sure', "I've watched {$cur['label']} and approve it as final", false, 'Further changes after approval may be treated as a new request.') . '<p data-error-for="sure" role="alert" class="mt-1 hidden text-xs font-medium text-danger"></p></div>'
      . field_textarea('notes', 'Note for the team', '', ['rows' => 2, 'placeholder' => "Optional — anything you'd like me to know"]) . '<p class="text-xs text-subtle">Final files unlock when any remaining balance is paid. You\'ll get an invoice right after approving if one is due.</p></form>',
      ['size' => 'sm', 'description' => 'This tells me the edit is final. It\'s recorded with your name, the time and this exact version.', 'footerHtml' => ui_button('Not yet', ['variant' => 'ghost', 'attrs' => ['data-modal-close' => true]]) . ui_button('Approve ' . $cur['label'], ['type' => 'submit', 'icon' => 'check-circle', 'attrs' => ['form' => 'approve-form']])]) ?>
<?php endif; ?>
<?php if ($perms['canRequestRevision']): $over = $project['revisionsUsed'] >= $project['revisionLimit']; ?>
  <?= ui_modal('changes-modal', 'Send your feedback', '<form id="changes-form" novalidate data-fe-form="/api/revisions" data-redirect="' . e($base) . '/projects/' . e($projectId) . '" data-success="Feedback sent. I will work through your notes." class="space-y-4">' . form_error_slot()
      . '<input type="hidden" name="projectId" value="' . e($projectId) . '"><input type="hidden" name="versionId" value="' . e($cur['id']) . '">'
      . '<div class="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm ' . ($over ? 'bg-warning-soft text-warning' : 'bg-surface-2 text-muted') . '">' . icon($over ? 'warning' : 'info', 16, 'mt-0.5 shrink-0')
      . '<span>' . ($over ? "You've used all " . (int)$project['revisionLimit'] . ' included revision rounds. Extra rounds may be quoted — I\'ll confirm before doing any additional work.' : 'This is revision round ' . ((int)$project['revisionsUsed'] + 1) . ' of ' . (int)$project['revisionLimit'] . ' included.') . '</span></div>'
      . field_textarea('description', 'Overall message', '', ['rows' => 3, 'placeholder' => "Anything that doesn't belong to a single moment — pacing, music, tone…"])
      . field_select('priority', 'Priority', ['NORMAL' => 'Normal', 'HIGH' => 'High — needed soon', 'URGENT' => 'Urgent — deadline at risk'], 'NORMAL') . '</form>',
      ['size' => 'sm', 'description' => 'Your timestamped feedback on ' . $cur['label'] . ' will be sent as one revision round.', 'footerHtml' => ui_button('Keep reviewing', ['variant' => 'ghost', 'attrs' => ['data-modal-close' => true]]) . ui_button('Send feedback', ['type' => 'submit', 'icon' => 'send', 'attrs' => ['form' => 'changes-form']])]) ?>
<?php endif; ?>
<?php endif; ?>
