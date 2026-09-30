<?= page_hero('FAQ', "Everything you'd want to know first.", "Can't find your answer? Ask us — we reply within one business day.", ghost_link('/contact', 'Ask a question')) ?>
<?= sec_open() ?>
  <div class="mx-auto max-w-3xl space-y-14">
    <?php foreach ($cats as $c): ?><div id="<?= e(strtolower($c)) ?>"><h2 class="mb-4 text-xl font-extrabold"><?= e($c) ?></h2><?= faq_list(array_values(array_filter($faqs, fn($f) => $f['category'] === $c))) ?></div><?php endforeach; ?>
  </div>
<?= sec_close() ?>
