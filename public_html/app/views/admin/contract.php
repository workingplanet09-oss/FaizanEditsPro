<?php /** Vars: $c, $canWrite */
$id = $c['id'];
$actions = ui_link("/api/contracts/{$id}/download", 'Download / print', ['icon' => 'download', 'variant' => 'outline'])
    . ($canWrite && $c['status'] !== 'SIGNED' ? ui_action("/api/contracts/{$id}/send", $c['status'] === 'DRAFT' ? 'Send for signature' : 'Resend', ['icon' => 'send', 'variant' => 'dark', 'success' => 'Contract sent for signature']) : '');
?>
<?= back_link('/admin/contracts', 'Contracts') ?>
<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
  <div class="min-w-0"><h1 class="flex flex-wrap items-center gap-3 text-2xl font-extrabold tracking-tight sm:text-3xl"><?= e($c['number']) ?><?= meta_badge('CONTRACT_STATUS', $c['status']) ?></h1>
    <p class="mt-1.5 text-sm text-muted sm:text-[15px]"><?= e($c['title'] . ' · ' . $c['client']['companyName']) ?> · <a class="font-semibold text-fg hover:underline" href="/admin/projects/<?= e($c['project']['id']) ?>"><?= e($c['project']['code']) ?></a> · version <?= (int)$c['currentVersion'] ?></p></div>
  <div class="flex flex-wrap items-center gap-2"><?= $actions ?></div>
</div>
<div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
  <div class="space-y-6">
    <?php ob_start(); ?><div class="space-y-7"><?php foreach ($c['sections'] as $s): ?><section><h2 class="text-base font-extrabold"><?= e($s['title']) ?></h2><div class="prose-lite mt-2 text-sm leading-relaxed text-muted"><?= render_markdown($s['body']) ?></div></section><?php endforeach; ?></div>
    <?= card(ob_get_clean(), 'p-6 sm:p-10') ?>
    <?= $canWrite && $c['status'] !== 'SIGNED' ? contract_editor($c) : '' ?>
  </div>
  <aside class="space-y-4">
    <?php ob_start(); if ($c['signatures']): ?><ul class="divide-y divide-line"><?php foreach ($c['signatures'] as $s): ?>
      <li class="space-y-1 px-5 py-4 text-sm"><div class="font-bold"><?= e($s['signerName']) ?></div><div class="text-muted"><?= e($s['signerEmail']) ?></div><div><?= e(fmt_datetime($s['signedAt'])) ?> · v<?= (int)$s['version'] ?></div>
        <?= array_key_exists('ip', $s) ? '<div class="text-xs text-subtle">IP ' . e((string)($s['ip'] ?? '—')) . '<br>' . e(mb_substr((string)($s['userAgent'] ?? ''), 0, 80)) . '<br>Hash ' . e(mb_substr((string)($s['contentHash'] ?? ''), 0, 20)) . '…</div>' : '' ?></li><?php endforeach; ?></ul>
    <?php else: ?><p class="px-5 pb-5 text-sm text-muted"><?= $c['sentAt'] ? 'Sent — awaiting signature.' : 'Not sent yet.' ?></p><?php endif; ?>
    <?= card(ob_get_clean(), '', 'Signature record') ?>
    <?= card('<ul class="px-5 pb-5 text-sm text-muted">' . implode('', array_map(fn($v) => '<li>v' . (int)$v['version'] . ' · ' . e(fmt_datetime($v['createdAt'])) . '</li>', $c['versions'])) . '</ul>', '', 'Versions') ?>
  </aside>
</div>
