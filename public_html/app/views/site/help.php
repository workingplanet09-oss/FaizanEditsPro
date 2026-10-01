<?php defined('FEP') or exit; $cats = array_values(array_unique(array_column($articles, 'category'))); ?>
<?= page_hero('Help center', 'How do I…?', 'Quick answers about uploading footage, revisions, turnaround, approval and payment.') ?>
<?= sec_open() ?>
  <div class="mx-auto max-w-3xl space-y-12">
    <?php foreach ($cats as $c): ?><div><h2 class="mb-4 text-xl font-extrabold"><?= e($c) ?></h2><?= faq_list(array_map(fn($a) => ['question' => $a['title'], 'answer' => $a['content']], array_values(array_filter($articles, fn($a) => $a['category'] === $c)))) ?></div><?php endforeach; ?>
    <div class="rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center"><h2 class="text-lg font-extrabold">Still stuck?</h2><p class="mt-1 text-sm text-muted">Message your project manager inside your project, or contact the studio.</p><?= ui_link('/contact', 'Contact support', ['variant' => 'outline', 'class' => 'mt-4']) ?></div>
  </div>
<?= sec_close() ?>
