<?php /** Vars: $q, $canWrite, $editable, $edit, [$d, $initial, $defaults when editing] */
$id = $q['id'];
if ($edit): ?>
<?= back_link("/admin/quotes/{$id}", $q['number']) ?>
<?= ui_page_header('Edit ' . $q['number'], 'Changes apply to the same quote; if it was already sent the client sees the update.') ?>
<?= doc_builder('quote', $d, $initial, $defaults) ?>
<?php return; endif;
$desc = e($q['client']['companyName']) . ($q['project'] ? ' · <a class="font-semibold text-fg hover:underline" href="/admin/projects/' . e($q['project']['id']) . '">' . e($q['project']['code'] . ' ' . $q['project']['name']) . '</a>' : '');
$actions = ($editable ? ui_link("/admin/quotes/{$id}?edit=1", 'Edit', ['icon' => 'pencil', 'variant' => 'outline']) : '')
    . ($canWrite && in_array($q['status'], ['DRAFT', 'SENT', 'VIEWED'], true) ? ui_action("/api/quotes/{$id}/send", $q['status'] === 'DRAFT' ? 'Send to client' : 'Resend', ['icon' => 'send', 'variant' => 'dark', 'success' => $q['status'] === 'DRAFT' ? 'Quote sent to the client' : 'Quote re-sent']) : '');
$row = fn($l, $v, $cls = '') => '<li class="flex justify-between ' . $cls . '"><span class="' . ($cls ? '' : 'text-muted') . '">' . e($l) . '</span><span>' . $v . '</span></li>';
?>
<?= back_link('/admin/quotes', 'Quotes') ?>
<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
  <div class="min-w-0"><h1 class="flex flex-wrap items-center gap-3 text-2xl font-extrabold tracking-tight sm:text-3xl"><?= e($q['number']) ?><?= meta_badge('QUOTE_STATUS', $q['status']) ?></h1><p class="mt-1.5 text-sm text-muted sm:text-[15px]"><?= $desc ?></p></div>
  <div class="flex flex-wrap items-center gap-2"><?= $actions ?></div>
</div>
<div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
  <?= card(doc_lines($q) . ($q['notes'] ? '<p class="mt-6 whitespace-pre-wrap text-sm">' . e($q['notes']) . '</p>' : '') . ($q['terms'] ? '<p class="mt-4 whitespace-pre-wrap text-sm text-muted">' . e($q['terms']) . '</p>' : ''), 'p-6 sm:p-8') ?>
  <aside class="space-y-4">
    <?php ob_start(); ?><ul class="space-y-2.5 px-5 pb-5 text-sm">
      <?= $row('Created', e(fmt_datetime($q['createdAt']))) ?>
      <?= $q['sentAt'] ? $row('Sent', e(fmt_datetime($q['sentAt']))) : '' ?><?= $q['viewedAt'] ? $row('Viewed', e(fmt_datetime($q['viewedAt']))) : '' ?>
      <?= $q['acceptedAt'] ? $row('Accepted', e(fmt_datetime($q['acceptedAt'])), 'font-semibold text-success') : '' ?>
      <?= $q['rejectedAt'] ? '<li class="text-danger"><div class="flex justify-between font-semibold"><span>Declined</span><span>' . e(fmt_datetime($q['rejectedAt'])) . '</span></div>' . ($q['rejectionReason'] ? '<p class="mt-1 text-muted">' . e($q['rejectionReason']) . '</p>' : '') . '</li>' : '' ?>
      <?= $q['validUntil'] ? $row('Valid until', e(fmt_date($q['validUntil']))) : '' ?><?= $row('Created by', e($q['createdBy']['name'] ?? '—')) ?></ul>
    <?= card(ob_get_clean(), '', 'Timeline') ?>
    <?php if ($q['contracts'] || $q['invoices']): ob_start(); ?><ul class="divide-y divide-line">
      <?php foreach ($q['contracts'] as $c): ?><li><a href="/admin/contracts/<?= e($c['id']) ?>" class="flex items-center justify-between px-5 py-3 text-sm hover:bg-surface-2/60"><b><?= e($c['number']) ?></b><?= meta_badge('CONTRACT_STATUS', $c['status']) ?></a></li><?php endforeach; ?>
      <?php foreach ($q['invoices'] as $i): ?><li><a href="/admin/invoices/<?= e($i['id']) ?>" class="flex items-center justify-between px-5 py-3 text-sm hover:bg-surface-2/60"><span><b><?= e($i['number']) ?></b> <span class="text-xs text-muted"><?= e(money((int)$i['total'], $q['currency'])) ?></span></span><?= meta_badge('INVOICE_STATUS', $i['status']) ?></a></li><?php endforeach; ?></ul>
      <?= card(ob_get_clean(), '', 'Linked documents') ?><?php endif; ?>
  </aside>
</div>
