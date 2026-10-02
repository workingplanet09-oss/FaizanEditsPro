<?php defined('FEP') or exit; ?><?= page_hero('FAQ', 'Answers before you ask.', 'Cannot find yours? Send me a message. I reply within one business day.', ui_link('/contact', 'Ask a question', ['variant' => 'outline', 'size' => 'lg'])) ?>
<?= sec_open() ?>
  <div class="mx-auto max-w-3xl space-y-14">
    <?php foreach ($cats as $c): ?><div id="<?= e(strtolower($c)) ?>"><h2 class="h-card mb-4"><?= e($c) ?></h2><?= faq_list(array_values(array_filter($faqs, fn($f) => $f['category'] === $c))) ?></div><?php endforeach; ?>
  </div>
<?= sec_close() ?>
<?= cta_band('Ready when you are.', 'Send me the details and I will reply with a clear plan and quote.', ui_link('/start-project', 'Discuss your project', ['size' => 'lg', 'iconRight' => 'arrow']) . ghost_link('/work', 'View my work', ['size' => 'lg'])) ?>
