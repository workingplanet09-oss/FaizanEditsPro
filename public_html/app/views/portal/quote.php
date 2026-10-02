<?php defined('FEP') or exit; /** Var: $q */
$open = in_array($q['status'], ['SENT', 'VIEWED'], true);
$expired = $q['validUntil'] && ts_ms($q['validUntil']) < now_ms();
$contract = array_values(array_filter($q['contracts'] ?? [], fn($c) => $c['status'] !== 'DRAFT'))[0] ?? null;
?>
<div class="mb-2"><a href="/dashboard/quotes" class="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg"><?= icon('chevron-left', 14) ?> Quotes</a></div>
<?= ui_page_header($q['number'], $q['project'] ? 'For ' . $q['project']['name'] : (string)$q['title'], meta_badge('QUOTE_STATUS', $q['status'])) ?>
<div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
  <?php ob_start(); ?>
    <div class="mb-6 flex flex-wrap justify-between gap-4 border-b border-line pb-6 text-sm">
      <div><div class="text-xs font-bold text-subtle">Prepared for</div><div class="mt-1 font-bold"><?= e($q['client']['companyName']) ?></div><div class="text-muted"><?= e($q['client']['name']) ?></div></div>
      <div class="text-right"><div class="text-xs font-bold text-subtle">Valid until</div><div class="mt-1 font-bold <?= $expired ? 'text-danger' : '' ?>"><?= $q['validUntil'] ? e(fmt_date($q['validUntil'])) : '—' ?></div><?= $q['sentAt'] ? '<div class="text-muted">Sent ' . e(fmt_date($q['sentAt'])) . '</div>' : '' ?></div>
    </div>
    <?= doc_lines(['items' => $q['items'], 'currency' => $q['currency'], 'subtotal' => $q['subtotal'], 'discount' => $q['discount'], 'tax' => $q['tax'], 'taxRateBps' => $q['taxRateBps'], 'total' => $q['total'], 'deposit' => $q['deposit'], 'balance' => $q['balance'], 'depositPercent' => $q['depositPercent']]) ?>
    <?php if ($q['notes']): ?><div class="mt-8"><h3 class="text-xs font-bold text-subtle">Notes</h3><p class="mt-1.5 whitespace-pre-wrap text-sm"><?= e($q['notes']) ?></p></div><?php endif; ?>
    <?php if ($q['terms']): ?><div class="mt-6"><h3 class="text-xs font-bold text-subtle">Terms</h3><p class="mt-1.5 whitespace-pre-wrap text-sm text-muted"><?= e($q['terms']) ?></p></div><?php endif; ?>
  <?= card(ob_get_clean(), 'p-6 sm:p-8') ?>
  <aside class="space-y-4">
    <?php if ($open && !$expired): ?>
      <?= card('<h2 class="text-base font-bold">Ready to go ahead?</h2><p class="mb-4 mt-1 text-sm text-muted">Accepting takes you straight to the agreement — nothing is charged until you sign it.</p>' . quote_actions($q['id'], $q['project']['id'] ?? null), 'p-6') ?>
    <?php elseif ($q['status'] === 'ACCEPTED'): ?>
      <?= card('<div class="flex items-center gap-2 font-bold">' . icon('check-circle', 18, 'text-success') . ' Accepted</div><p class="mt-1 text-sm text-muted">' . ($q['acceptedAt'] ? 'You accepted this quote on ' . e(fmt_date($q['acceptedAt'])) . '.' : '') . '</p>'
        . ($contract ? ui_link('/dashboard/contracts/' . $contract['id'], $contract['status'] === 'SIGNED' ? 'View contract' : 'Review contract', ['class' => 'mt-3', 'icon' => 'sign']) : ''), 'border-success/30 bg-success-soft/40 p-6') ?>
    <?php else: ?>
      <?= card(e($expired || $q['status'] === 'EXPIRED' ? 'This quote has expired. Message me and I\'ll refresh it.' : ($q['status'] === 'REJECTED' ? 'You declined this quote.' : 'This quote is not open for action.')) . ui_link('/dashboard/messages', 'Message me', ['variant' => 'outline', 'class' => 'mt-3', 'icon' => 'message']), 'p-6 text-sm text-muted') ?>
    <?php endif; ?>
    <?= card('<h3 class="font-bold">Questions?</h3><p class="mt-1 text-muted">Ask your project manager anything about scope, timing or price.</p><a href="' . e($q['project'] ? '/dashboard/projects/' . $q['project']['id'] . '?tab=messages' : '/dashboard/messages') . '" class="mt-2 inline-block font-semibold text-accent-text hover:underline">Send a message →</a>', 'p-6 text-sm') ?>
  </aside>
</div>
