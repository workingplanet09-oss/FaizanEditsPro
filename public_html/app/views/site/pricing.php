<?php defined('FEP') or exit; /** Vars: $plans, $faqs, $site */
$models = [['film', 'One-time project', 'A single video or a defined package with one fixed price.', 'Launches, campaigns, one-off content'], ['video', 'Per video', 'A repeatable rate for each long-form video you send.', 'YouTube channels, podcasts'],
    ['smartphone', 'Per short', 'Simple pricing per vertical clip, with batch rates.', 'Reels, Shorts, TikTok'], ['repeat', 'Monthly retainer', 'A monthly allowance with priority scheduling and usage tracking.', 'A regular publishing schedule'],
    ['clock', 'Hourly', 'Billed by the hour for flexible or exploratory work.', 'Fixes, re-edits, small jobs'], ['clipboard', 'Custom quote', 'A tailored scope and price for larger or more complex projects.', 'Series, brand films, agencies']];
?>
<?= page_hero('Pricing', 'Clear pricing before I start.', 'Every project starts with a fixed-scope quote. Choose the model that fits how you publish.', ui_link('/start-project', 'Discuss your project', ['size' => 'lg', 'iconRight' => 'arrow'])) ?>
<?php if ($plans): ?>
<?= sec_open() ?>
  <div class="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2 xl:grid-cols-3"><?php foreach ($plans as $p): ?><div<?= rv() ?>><?= plan_card($p) ?></div><?php endforeach; ?></div>
  <p class="mt-8 text-base text-muted">Prices shown are starting points. Your quote states the exact scope, currency, deposit and turnaround.</p>
<?= sec_close() ?>
<?php endif; ?>
<?= sec_open(['tone' => $plans ? 'alt' : 'default']) ?>
  <?= section_heading('Pricing models', 'Choose how you would like to work.', 'Not every project needs the same structure. I offer all of these, and you can mix them if it helps.') ?>
  <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3">
    <?php foreach ($models as $i => [$ic, $t, $b, $fit]): ?>
      <div<?= rv(($i % 3) * 60, 'rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-8') ?>><span class="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2"><?= icon($ic, 24) ?></span><h3 class="h-card mt-5"><?= e($t) ?></h3><p class="mt-3 text-base text-muted"><?= e($b) ?></p>
        <p class="mt-5 border-t border-line pt-4 text-sm text-muted"><span class="font-semibold text-fg">Best for · </span><?= e($fit) ?></p></div>
    <?php endforeach; ?>
  </div>
<?= sec_close() ?>
<?= sec_open() ?><?= icon_cards([['shield', 'No surprises', 'Your quote lists the deliverables, quantity, revisions, turnaround and total before you commit.'], ['layers', 'Revisions built in', $site['business']['revisionPolicy']], ['globe', 'Your currency', 'Quotes and invoices can be issued in USD, EUR, GBP, AED, PKR, CAD, AUD and more, with the currency shown next to every amount.']]) ?><?= sec_close() ?>
<?php if ($faqs): ?><?= sec_open(['tone' => 'alt']) ?><div class="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]"><?= section_heading('Pricing FAQ', 'Before you ask.', null, ['class' => 'mb-0']) ?><?= faq_list($faqs) ?></div><?= sec_close() ?><?php endif; ?>
