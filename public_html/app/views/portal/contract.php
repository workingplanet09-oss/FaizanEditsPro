<?php defined('FEP') or exit; /** Vars: $c, $canSign, $actor */
$signable = in_array($c['status'], ['SENT', 'VIEWED'], true);
$script = "font-family:'Segoe Script','Snell Roundhand','Brush Script MT',cursive";
?>
<div class="mb-2"><a href="/dashboard/contracts" class="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg"><?= icon('chevron-left', 14) ?> Contracts</a></div>
<?= ui_page_header($c['number'], $c['title'] . ' · ' . $c['project']['name'], meta_badge('CONTRACT_STATUS', $c['status']) . ui_link('/api/contracts/' . $c['id'] . '/download', 'Download / print', ['variant' => 'outline', 'icon' => 'download', 'attrs' => ['target' => '_blank', 'rel' => 'noopener']])) ?>
<div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
  <div class="space-y-6">
    <?php ob_start(); ?><div class="space-y-7"><?php foreach ($c['sections'] as $s): ?>
      <section><h2 class="text-base font-extrabold"><?= e($s['title']) ?></h2><div class="prose-lite mt-2 text-sm leading-relaxed text-muted"><?= render_markdown($s['body']) ?></div></section>
    <?php endforeach; ?></div>
    <?= card(ob_get_clean(), 'p-6 sm:p-10') ?>
    <?= ($signable && $canSign) ? contract_sign($c['id'], (int)$c['currentVersion'], $actor->name) : '' ?>
    <?= ($signable && !$canSign) ? card('Only account owners and managers can sign contracts. Ask one of them to open this page.', 'p-5 text-sm text-muted') : '' ?>
  </div>
  <aside class="space-y-4">
    <?php if ($c['signatures']): ?>
      <?php ob_start(); ?>
        <div class="flex items-center gap-2 font-extrabold"><?= icon('check-circle', 18, 'text-success') ?>Signed</div>
        <?php foreach ($c['signatures'] as $s): ?>
          <div class="mt-3 border-t border-success/20 pt-3">
            <?php if ($s['signatureKind'] === 'drawn' && preg_match('#^data:image/png;base64,[A-Za-z0-9+/=]+$#', (string)$s['signatureData'])): ?><img src="<?= e($s['signatureData']) ?>" alt="Signature of <?= e($s['signerName']) ?>" class="h-16 rounded-lg bg-white object-contain p-1">
            <?php else: ?><div class="text-2xl text-fg" style="<?= $script ?>"><?= e($s['signatureData']) ?></div><?php endif; ?>
            <div class="mt-2 text-sm font-bold"><?= e($s['signerName']) ?></div><div class="text-xs text-muted"><?= local_time($s['signedAt']) ?> · version <?= (int)$s['version'] ?></div>
          </div>
        <?php endforeach; ?>
        <p class="mt-3 text-[11px] text-subtle">Integrity hash: <span class="font-mono"><?= e(substr($c['contentHash'], 0, 16)) ?>…</span></p>
      <?= card(ob_get_clean(), 'border-success/30 bg-success-soft/40 p-5') ?>
    <?php endif; ?>
    <?= card('<h3 class="font-extrabold">Need a change?</h3><p class="mt-1 text-muted">If something in the agreement doesn\'t look right, message us before signing and we\'ll update it.</p><a href="/dashboard/projects/' . e($c['project']['id']) . '?tab=messages" class="mt-2 inline-block font-semibold text-accent-text hover:underline">Message the team →</a>', 'p-5 text-sm') ?>
  </aside>
</div>
