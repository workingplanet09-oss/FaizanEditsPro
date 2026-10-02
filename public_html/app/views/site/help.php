<?php defined('FEP') or exit; $cats = array_values(array_unique(array_column($articles, 'category'))); ?>
<?= page_hero('Help center', 'How do I…?', 'Quick answers about uploading footage, revisions, turnaround, approval and payment.') ?>
<?= sec_open() ?>
  <div class="mx-auto max-w-3xl space-y-12">
    <?php foreach ($cats as $c): ?><div><h2 class="h-card mb-4"><?= e($c) ?></h2><?= faq_list(array_map(fn($a) => ['question' => $a['title'], 'answer' => $a['content']], array_values(array_filter($articles, fn($a) => $a['category'] === $c)))) ?></div><?php endforeach; ?>
    <div class="rounded-[var(--radius-card)] border border-line bg-surface p-6 text-center sm:p-8"><h2 class="h-card">Still stuck?</h2><p class="mt-2 text-base text-muted">Message me inside your project, or send a note from the contact page.</p><?= ui_link('/contact', 'Contact me', ['variant' => 'outline', 'class' => 'mt-5']) ?></div>
  </div>
<?= sec_close() ?>
