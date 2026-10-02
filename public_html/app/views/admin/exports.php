<?php defined('FEP') or exit; /** Vars: $list */ ?>
<?= ui_page_header('Exports', 'Download your data as CSV. Files open cleanly in Excel and Google Sheets; formula-like cells are neutralised for safety.') ?>
<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"><?php foreach ($list as [$key, $label, $desc, $ic]): ?>
  <div class="<?= e(card_class('flex flex-col p-6')) ?>">
    <div class="flex items-start gap-3"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2"><?= icon($ic, 18) ?></span><div><h3 class="font-bold"><?= e($label) ?></h3><p class="mt-0.5 text-sm text-muted"><?= e($desc) ?></p></div></div>
    <div class="mt-auto flex gap-2 pt-4"><?= ui_link("/api/admin/exports/{$key}", 'CSV for Excel', ['variant' => 'dark', 'size' => 'sm', 'icon' => 'download']) ?><?= ui_link("/api/admin/exports/{$key}?excel=0", 'Plain CSV', ['variant' => 'outline', 'size' => 'sm']) ?></div>
  </div><?php endforeach; ?></div>
<?= !$list ? card('<p class="px-6 pb-6 text-sm text-muted">Your role doesn\'t include any export permissions.</p>', '', 'Nothing to export') : '' ?>
