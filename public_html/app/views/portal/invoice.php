<?php /** Vars: $inv, $business, $invoiceSettings, $online, $canPay, $demoCheckout, $paid, $cancelled */
$due = $inv['total'] - $inv['amountPaid'];
$payable = in_array($inv['status'], ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'], true);
?>
<div class="mb-2"><a href="/dashboard/invoices" class="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg print:hidden"><?= icon('chevron-left', 14) ?> Invoices</a></div>
<?= ui_page_header($inv['number'], $inv['project'] ? 'For ' . $inv['project']['name'] : null, meta_badge('INVOICE_STATUS', $inv['status']) . ui_button('Print / save PDF', ['variant' => 'outline', 'icon' => 'download', 'class' => 'print:hidden', 'attrs' => ['data-print' => true]])) ?>
<?php if ($paid && $inv['status'] === 'PAID'): ?><p role="status" class="mb-5 flex items-center gap-2 rounded-2xl bg-success-soft px-5 py-3.5 text-sm font-semibold text-success"><?= icon('check-circle', 18) ?> Payment received — thank you! Your project is moving forward.</p><?php endif; ?>
<?php if ($cancelled): ?><p role="status" class="mb-5 rounded-2xl bg-warning-soft px-5 py-3.5 text-sm font-semibold text-warning">Checkout was cancelled. You haven't been charged.</p><?php endif; ?>
<div class="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
  <?php ob_start(); ?>
    <div class="mb-6 flex flex-wrap justify-between gap-6 border-b border-line pb-6 text-sm">
      <div><div class="text-xs font-bold uppercase tracking-wider text-subtle">From</div><div class="mt-1 font-bold"><?= e($business['name']) ?></div><?= $business['legalName'] ? '<div class="text-muted">' . e($business['legalName']) . '</div>' : '' ?><?= $business['address'] ? '<div class="whitespace-pre-line text-muted">' . e($business['address']) . '</div>' : '' ?><?= $business['taxId'] ? '<div class="text-muted">Tax ID: ' . e($business['taxId']) . '</div>' : '' ?></div>
      <div><div class="text-xs font-bold uppercase tracking-wider text-subtle">Billed to</div><div class="mt-1 font-bold"><?= e($inv['client']['companyName']) ?></div><div class="text-muted"><?= e($inv['client']['name']) ?></div><div class="text-muted"><?= e($inv['client']['email']) ?></div></div>
      <div class="text-right"><div class="text-xs font-bold uppercase tracking-wider text-subtle">Details</div><div class="mt-1">Issued <?= $inv['issuedAt'] ? e(fmt_date($inv['issuedAt'])) : '—' ?></div><div class="<?= $inv['status'] === 'OVERDUE' ? 'font-bold text-danger' : '' ?>">Due <?= $inv['dueDate'] ? e(fmt_date($inv['dueDate'])) : 'on receipt' ?></div></div>
    </div>
    <?= doc_lines(['items' => $inv['items'], 'currency' => $inv['currency'], 'subtotal' => $inv['subtotal'], 'discount' => $inv['discount'], 'tax' => $inv['tax'], 'total' => $inv['total'], 'amountPaid' => $inv['amountPaid']]) ?>
    <?php if ($inv['notes']): ?><p class="mt-8 whitespace-pre-wrap text-sm text-muted"><?= e($inv['notes']) ?></p><?php endif; ?>
    <?php if ($inv['payments']): ?>
      <div class="mt-8"><h3 class="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">Payments</h3><ul class="divide-y divide-line rounded-xl border border-line text-sm">
        <?php foreach ($inv['payments'] as $p): ?><li class="flex items-center justify-between gap-4 px-4 py-2.5"><span><?= $p['paidAt'] ? local_time($p['paidAt']) : '—' ?> · <span class="text-muted"><?= e($p['method'] ?: $p['provider']) ?></span></span><span class="font-semibold tabular-nums"><?= e(money((int)$p['amount'], $p['currency'])) ?> <span class="ml-1 text-xs font-medium text-success"><?= $p['status'] === 'SUCCEEDED' ? 'received' : e(strtolower($p['status'])) ?></span></span></li><?php endforeach; ?>
      </ul></div>
    <?php endif; ?>
  <?= card(ob_get_clean(), 'p-5 sm:p-8 print:border-0 print:shadow-none') ?>
  <aside class="space-y-4 print:hidden">
    <?php if ($payable): ?>
      <?php ob_start(); ?>
        <div class="text-xs font-bold uppercase tracking-wider text-subtle">Amount due</div><div class="mt-1 text-3xl font-extrabold tracking-tight tabular-nums"><?= e(money((int)$due, $inv['currency'])) ?></div>
        <?= $inv['status'] === 'OVERDUE' ? '<p class="mt-1 text-sm font-semibold text-danger">Overdue since ' . e($inv['dueDate'] ? fmt_date($inv['dueDate']) : '') . '</p>' : '' ?>
        <div class="mt-5">
          <?php if (!$canPay): ?><p class="text-sm text-muted">Only account owners and billing contacts can pay invoices.</p>
          <?php elseif ($online): ?><?= pay_panel($inv['id'], (int)$due, $inv['currency'], $demoCheckout) ?>
          <?php else: ?>
            <div class="rounded-xl border border-line bg-surface-2/50 p-4 text-sm"><h3 class="font-extrabold">Pay by bank transfer or another method</h3>
              <p class="mt-1 whitespace-pre-line text-muted"><?= e(trim((string)($invoiceSettings['paymentInstructions'] ?? '')) ?: "Online card payment isn't switched on yet. Message us and we'll send payment details, quoting invoice {$inv['number']}.") ?></p>
              <p class="mt-2 text-xs text-subtle">We mark the invoice as paid as soon as the payment arrives.</p></div>
          <?php endif; ?>
        </div>
        <p class="mt-4 flex items-start gap-2 text-xs text-subtle"><?= icon('lock', 13, 'mt-0.5 shrink-0') ?>Payments are processed securely. We never see or store your card details.</p>
      <?= card(ob_get_clean(), 'p-5') ?>
    <?php elseif ($inv['status'] === 'PAID'): ?>
      <?= card('<div class="flex items-center gap-2 font-extrabold">' . icon('check-circle', 18, 'text-success') . ' Paid in full</div><p class="mt-1 text-sm text-muted">' . ($inv['paidAt'] ? 'Received ' . e(fmt_date($inv['paidAt'])) . '.' : '') . '</p>', 'border-success/30 bg-success-soft/40 p-5') ?>
    <?php else: ?><?= card('This invoice is ' . e(strtolower($inv['status'])) . '.', 'p-5 text-sm text-muted') ?><?php endif; ?>
    <?= card('<h3 class="font-extrabold">Question about this invoice?</h3><p class="mt-1 text-muted">Message us and we\'ll sort it out quickly.</p><a href="/dashboard/messages" class="mt-2 inline-block font-semibold text-accent-text hover:underline">Message billing →</a>', 'p-5 text-sm') ?>
  </aside>
</div>
