<?php /** Vars: $lead, $notes, $staff, $actor */
$ICON = ['inquiry_submitted' => 'inbox', 'status_changed' => 'refresh', 'note' => 'pencil', 'contacted' => 'phone', 'email_sent' => 'mail', 'call_made' => 'phone', 'call_scheduled' => 'calendar', 'meeting' => 'users', 'quote_sent' => 'clipboard', 'quote_viewed' => 'eye', 'quote_accepted' => 'check-circle', 'contract_sent' => 'sign', 'contract_signed' => 'sign', 'payment_received' => 'wallet', 'project_started' => 'rocket', 'project_created' => 'film', 'converted' => 'check-circle'];
$sections = array_values(array_unique(array_column($lead['answers'], 'section')));
$breakdown = [];
foreach ((array)($lead['scoreBreakdown'] ?? []) as $k => $v) {
    $breakdown[] = ['label' => ucfirst(strtolower(trim(preg_replace('/([A-Z])/', ' $1', (string)$k)))), 'value' => $v];
}
$desc = implode(' · ', array_filter([$lead['company'], $lead['email'], $lead['phone']]));
$actions = ($actor->can('quotes:write') && $lead['client'] ? ui_link('/admin/quotes/new?clientId=' . $lead['client']['id'] . '&leadId=' . $lead['id'] . ($lead['project'] ? '&projectId=' . $lead['project']['id'] : ''), 'Create quote', ['icon' => 'clipboard', 'variant' => 'outline']) : '')
    . ui_link('mailto:' . $lead['email'], 'Email', ['icon' => 'mail', 'variant' => 'outline']);
?>
<?= back_link('/admin/leads', 'Leads') ?>
<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
  <div class="min-w-0"><div class="eyebrow mb-1.5"><?= e($lead['requestCode']) ?></div>
    <h1 class="flex flex-wrap items-center gap-3 text-2xl font-extrabold tracking-tight sm:text-3xl"><?= e($lead['name']) ?><?= temperature_badge($lead['temperature'], $lead['overridden']) ?><?= meta_badge('LEAD_STATUS', $lead['status']) ?></h1>
    <p class="mt-1.5 max-w-2xl text-sm text-muted sm:text-[15px]"><?= e($desc) ?></p></div>
  <div class="flex flex-wrap items-center gap-2"><?= $actions ?></div>
</div>
<div class="mb-6"><?= lead_decisions($lead, $actor->can('leads:convert') && $actor->can('clients:write'), $actor->can('leads:write')) ?></div>

<div class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
  <div class="space-y-6">
    <?php if ($lead['client'] || $lead['project']): ?>
      <?php ob_start(); ?><div class="flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
        <?php if ($lead['client']): ?><div><div class="text-xs font-bold uppercase tracking-wider text-subtle">Client</div><a href="/admin/clients/<?= e($lead['client']['id']) ?>" class="font-bold hover:underline"><?= e($lead['client']['companyName']) ?></a></div><?php endif; ?>
        <?php if ($lead['project']): ?><div><div class="text-xs font-bold uppercase tracking-wider text-subtle">Project</div><a href="/admin/projects/<?= e($lead['project']['id']) ?>" class="font-bold hover:underline"><?= e($lead['project']['code'] . ' · ' . $lead['project']['name']) ?></a> <?= status_badge($lead['project']['status']) ?></div><?php endif; ?></div>
      <?= card(ob_get_clean()) ?>
    <?php endif; ?>

    <?php ob_start(); ?><div class="space-y-6 px-5 pb-6">
      <?= $lead['description'] ? '<p class="whitespace-pre-wrap rounded-xl bg-surface-2/60 p-4 text-sm leading-relaxed">' . e($lead['description']) . '</p>' : '' ?>
      <?php foreach ($sections as $sec): ?><div><h3 class="mb-2 text-xs font-bold uppercase tracking-wider text-subtle"><?= e(humanize($sec)) ?></h3>
        <dl class="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2"><?php foreach ($lead['answers'] as $an) { if ($an['section'] === $sec) { echo ui_meta($an['question'], e(is_array($an['answer']) ? implode(', ', $an['answer']) : (string)$an['answer'])); } } ?></dl></div><?php endforeach; ?>
      <?= !$lead['answers'] ? '<p class="text-sm text-muted">No form answers were stored for this lead.</p>' : '' ?>
      <?php if ($lead['attachments']): ?><div><h3 class="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">Reference files</h3>
        <ul class="divide-y divide-line rounded-xl border border-line"><?php foreach ($lead['attachments'] as $at): ?><li class="flex items-center gap-3 px-4 py-2.5 text-sm"><?= icon('file', 16, 'text-muted') ?><span class="flex-1 truncate font-medium"><?= e($at['displayName']) ?></span><span class="text-xs text-subtle"><?= e(fmt_bytes((int)$at['sizeBytes'])) ?></span>
          <button type="button" data-asset-open="<?= e($at['id']) ?>" data-mode="download" class="text-xs font-bold text-accent-text hover:underline">Open</button></li><?php endforeach; ?></ul></div><?php endif; ?></div>
    <?= card(ob_get_clean(), '', 'What they told us', 'Submitted ' . fmt_datetime($lead['createdAt'])) ?>

    <?php ob_start(); ?><ol class="relative px-5 pb-5"><span aria-hidden="true" class="absolute bottom-6 left-[31px] top-2 w-px bg-line"></span>
      <?php foreach ($lead['activities'] as $ac): $note = is_array($ac['metadata'] ?? null) ? ($ac['metadata']['note'] ?? null) : null; ?>
        <li class="relative flex gap-3 py-2.5"><span class="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted"><?= icon($ICON[$ac['type']] ?? 'activity', 13) ?></span>
          <div class="min-w-0"><p class="text-sm font-semibold"><?= e($ac['title']) ?></p><?= $note ? '<p class="mt-0.5 whitespace-pre-wrap text-sm text-muted">' . e($note) . '</p>' : '' ?><p class="mt-0.5 text-xs text-subtle"><?= ago($ac['createdAt']) ?> · <?= e($ac['actor']['name'] ?? 'System') ?></p></div></li>
      <?php endforeach; ?></ol>
    <?= card(ob_get_clean(), '', 'Activity timeline') ?>
    <?= $actor->can('leads:write') ? lead_activity_form($lead['id']) : '' ?>
  </div>

  <aside class="space-y-6">
    <?= lead_controls($lead, $staff, $actor->can('leads:write')) ?>
    <?= card('<div class="px-5 pb-5">' . hbar_chart($breakdown, 'Score breakdown', null, 30) . '</div>', '', 'Score', 'Internal only', '<span class="text-2xl font-extrabold tabular-nums">' . (int)$lead['score'] . '<span class="text-sm font-semibold text-subtle">/100</span></span>') ?>
    <?php ob_start(); ?><dl class="grid grid-cols-2 gap-4 px-5 pb-5">
      <?= ui_meta('Looking for', '<span class="capitalize">' . e(humanize($lead['lookingFor'])) . '</span>') ?><?= ui_meta('Budget', e(budget_label($lead['budgetRange']))) ?>
      <?= ui_meta('Client type', '<span class="capitalize">' . e((string)$lead['clientType']) . '</span>') ?><?= ui_meta('Industry', e((string)$lead['industry'])) ?>
      <?= ui_meta('Source', e($lead['source']['label'] ?? '')) ?><?= ui_meta('Service page', e((string)$lead['serviceSlug'])) ?>
      <?= ui_meta('Website', $lead['website'] ? '<a class="text-accent-text hover:underline" href="' . e($lead['website']) . '" target="_blank" rel="noreferrer noopener">' . e($lead['website']) . '</a>' : null, 'col-span-2') ?>
      <?= ($lead['utmSource'] || $lead['utmCampaign']) ? ui_meta('UTM', e(implode(' / ', array_filter([$lead['utmSource'], $lead['utmMedium'], $lead['utmCampaign']]))), 'col-span-2') : '' ?>
      <?= $lead['referrer'] ? ui_meta('Referrer', '<span class="break-all">' . e($lead['referrer']) . '</span>', 'col-span-2') : '' ?>
      <?= $lead['referralCode'] ? ui_meta('Referral code', e($lead['referralCode'])) : '' ?>
      <?= $lead['lostReason'] ? ui_meta('Lost reason', e($lead['lostReason']), 'col-span-2') : '' ?></dl>
    <?= card(ob_get_clean(), '', 'Details') ?>
    <?php if ($lead['quotes']): ob_start(); ?><ul class="divide-y divide-line"><?php foreach ($lead['quotes'] as $q): ?><li><a href="/admin/quotes/<?= e($q['id']) ?>" class="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-surface-2/60"><span class="font-bold"><?= e($q['number']) ?></span><span class="tabular-nums"><?= e(money((int)$q['total'], $q['currency'])) ?></span><?= meta_badge('QUOTE_STATUS', $q['status']) ?></a></li><?php endforeach; ?></ul>
      <?= card(ob_get_clean(), '', 'Quotes') ?><?php endif; ?>
    <?= $actor->can('notes:read') ? notes_panel('LEAD', $lead['id'], $notes, $actor->can('notes:write')) : '' ?>
  </aside>
</div>
