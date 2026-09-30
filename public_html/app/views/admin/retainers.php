<?php /** Vars: $list, $manage, $clients, $business, $plans */
$mrr = [];
foreach ($list as $r) { if ($r['status'] === 'ACTIVE') { $mrr[$r['currency']] = ($mrr[$r['currency']] ?? 0) + (int)$r['monthlyPrice']; } }
$desc = $mrr ? 'Monthly recurring: ' . implode(' · ', array_map(fn($c, $v) => money($v, $c), array_keys($mrr), $mrr)) : 'Monthly allowances for recurring clients.';
?>
<?= ui_page_header('Retainers', $desc, $manage && $business ? new_retainer_modal($clients, $business['currencies'], $business['defaultCurrency'], $plans) : null) ?>
<?php if (!$list): ?>
  <?= card(ui_empty('No retainers yet', 'Create a retainer for clients who need a steady monthly flow of edits.', 'repeat')) ?>
<?php else: ?>
  <div class="grid grid-cols-1 gap-5 lg:grid-cols-2"><?php foreach ($list as $r): ?>
    <div class="<?= e(card_class()) ?>">
      <div class="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
        <div class="min-w-0"><h3 class="flex flex-wrap items-center gap-2 text-base font-bold leading-tight"><a class="hover:underline" href="/admin/clients/<?= e($r['client']['id']) ?>"><?= e($r['client']['companyName']) ?></a><?= meta_badge('RETAINER_STATUS', $r['status']) ?></h3>
          <p class="mt-1 text-sm text-muted"><?= e($r['name'] . ' · ' . money((int)$r['monthlyPrice'], $r['currency']) . '/mo · renews ' . fmt_date($r['renewalDate'])) ?></p></div>
        <?= $manage ? '<div class="shrink-0">' . retainer_status_select($r['id'], $r['status']) . '</div>' : '' ?>
      </div>
      <div class="space-y-4 px-5 pb-5">
        <?= $r['videosIncluded'] ? progress_row('Videos', $r['usage']['used']['videos'], $r['videosIncluded']) : '' ?>
        <?= $r['shortsIncluded'] ? progress_row('Short-form', $r['usage']['used']['shorts'], $r['shortsIncluded']) : '' ?>
        <?= $r['hoursIncluded'] ? progress_row('Hours', $r['usage']['used']['hours'], $r['hoursIncluded']) : '' ?>
        <?php if (!empty($r['usage']['upcoming'])): ?><ul class="space-y-1 border-t border-line pt-3 text-sm"><?php foreach (array_slice($r['usage']['upcoming'], 0, 4) as $p): ?><li><a class="hover:underline" href="/admin/projects/<?= e($p['id']) ?>"><?= e($p['code'] . ' · ' . $p['name']) ?></a></li><?php endforeach; ?></ul><?php endif; ?>
      </div>
    </div>
  <?php endforeach; ?></div>
<?php endif; ?>
