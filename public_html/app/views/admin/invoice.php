<?php /** Vars: $inv, $notes, $actor */
$id = $inv['id']; $due = (int)$inv['total'] - (int)$inv['amountPaid'];
$desc = e($inv['client']['companyName']) . ($inv['project'] ? ' · <a class="font-semibold text-fg hover:underline" href="/admin/projects/' . e($inv['project']['id']) . '">' . e($inv['project']['code'] . ' ' . $inv['project']['name']) . '</a>' : '')
    . ($inv['quote'] ? ' · from <a class="font-semibold text-fg hover:underline" href="/admin/quotes/' . e($inv['quote']['id']) . '">' . e($inv['quote']['number']) . '</a>' : '');
$line = fn($l, $v) => '<div class="flex justify-between"><dt class="text-muted">' . e($l) . '</dt><dd>' . $v . '</dd></div>';
?>
<?= back_link('/admin/invoices', 'Invoices') ?>
<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
  <div class="min-w-0"><h1 class="flex flex-wrap items-center gap-3 text-2xl font-extrabold tracking-tight sm:text-3xl"><?= e($inv['number']) ?><?= meta_badge('INVOICE_STATUS', $inv['status']) ?></h1><p class="mt-1.5 text-sm text-muted sm:text-[15px]"><?= $desc ?></p></div>
  <div class="flex flex-wrap items-center gap-2"><?= ui_button('Print', ['variant' => 'outline', 'icon' => 'file', 'class' => 'print:hidden', 'attrs' => ['data-print' => true]]) ?><?= invoice_actions($inv, $actor->can('invoices:write'), $actor->can('payments:write')) ?></div>
</div>
<div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
  <?= card(doc_lines($inv) . ($inv['notes'] ? '<p class="mt-6 whitespace-pre-wrap text-sm text-muted">' . e($inv['notes']) . '</p>' : ''), 'p-6 sm:p-8') ?>
  <aside class="space-y-4">
    <?php ob_start(); if ($inv['payments']): ?><ul class="divide-y divide-line"><?php foreach ($inv['payments'] as $p): ?>
      <li class="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span><span class="font-semibold tabular-nums"><?= e(money((int)$p['amount'], $p['currency'])) ?></span><span class="block text-xs text-muted"><?= e(($p['method'] ?? $p['provider']) . ' · ' . ($p['paidAt'] ? fmt_datetime($p['paidAt']) : '—')) ?></span></span><span class="text-xs font-bold <?= $p['status'] === 'SUCCEEDED' ? 'text-success' : 'text-danger' ?>"><?= e(strtolower($p['status'])) ?></span></li>
    <?php endforeach; ?></ul><?php else: ?><p class="px-5 pb-5 text-sm text-muted">No payments yet.</p><?php endif; ?>
    <?= card(ob_get_clean(), '', 'Payments', $due > 0 ? money($due, $inv['currency']) . ' outstanding' : 'Paid in full') ?>
    <?= card('<dl class="space-y-2 px-5 pb-5 text-sm">' . $line('Issued', $inv['issuedAt'] ? e(fmt_date($inv['issuedAt'])) : 'Draft') . $line('Due', $inv['dueDate'] ? e(fmt_date($inv['dueDate'])) : '—') . $line('Viewed by client', $inv['viewedAt'] ? e(fmt_datetime($inv['viewedAt'])) : 'Not yet') . $line('Type', '<span class="capitalize">' . e(strtolower(humanize($inv['kind']))) . '</span>') . '</dl>', '', 'Details') ?>
    <?= $actor->can('notes:read') ? notes_panel('INVOICE', $id, $notes, $actor->can('notes:write')) : '' ?>
  </aside>
</div>
