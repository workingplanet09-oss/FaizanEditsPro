<?php /** Vars: $plans, $faqs, $site */
$models = [['film', 'One-time project', 'A single video or defined package with one fixed price.', 'Launches, campaigns, one-off content'], ['video', 'Per video', 'A repeatable rate for each long-form video you send.', 'YouTube channels, podcasts'],
    ['smartphone', 'Per short', 'Simple pricing per vertical clip, with volume-friendly batches.', 'Reels, Shorts, TikTok'], ['repeat', 'Monthly retainer', 'A monthly allowance with priority scheduling and usage tracking.', 'Consistent publishing schedules'],
    ['clock', 'Hourly', 'Billed by the hour for flexible or exploratory work.', 'Fixes, re-edits, consulting'], ['clipboard', 'Custom quote', 'Tailored scope and price for complex or large projects.', 'VSLs, brand films, agencies']];
?>
<?= page_hero('Pricing', 'Pay for the outcome, not the guesswork.', 'Every project starts with a clear, fixed-scope quote. Choose the model that fits how you publish.', ui_link('/start-project', 'Get a quote', ['size' => 'lg', 'iconRight' => 'arrow'])) ?>
<?php if ($plans): ?>
<?= sec_open() ?>
  <div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4"><?php foreach ($plans as $p): ?><div<?= rv() ?>><?= plan_card($p) ?></div><?php endforeach; ?></div>
  <p class="mt-8 text-center text-sm text-subtle">Prices shown are starting points. Your quote states the exact scope, currency, deposit and turnaround.</p>
<?= sec_close() ?>
<?php endif; ?>
<?= sec_open(['tone' => $plans ? 'alt' : 'default']) ?>
  <?= section_heading('Pricing models', "Choose how you'd like to work.", "Not every client needs the same structure. We support all of these — mix them if it helps.") ?>
  <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
    <?php foreach ($models as $i => [$ic, $t, $b, $fit]): ?>
      <div<?= rv(($i % 3) * 60, 'rounded-[var(--radius-card)] border border-line bg-surface p-6') ?>><span class="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft"><?= icon($ic, 20) ?></span><h3 class="mt-4 text-lg font-extrabold"><?= e($t) ?></h3><p class="mt-2 text-sm text-muted"><?= e($b) ?></p>
        <p class="mt-4 border-t border-line pt-3 text-xs text-subtle"><span class="font-bold text-muted">Best for · </span><?= e($fit) ?></p></div>
    <?php endforeach; ?>
  </div>
<?= sec_close() ?>
<?= sec_open() ?><?= icon_cards([['shield', 'No surprises', 'Your quote lists deliverables, quantity, revisions, turnaround and total before you commit.'], ['layers', 'Revisions built in', $site['business']['revisionPolicy']], ['globe', 'Your currency', 'Quotes and invoices can be issued in USD, EUR, GBP, AED, PKR, CAD, AUD and more.']]) ?><?= sec_close() ?>
<?php if ($faqs): ?><?= sec_open(['tone' => 'alt']) ?><div class="grid grid-cols-1 gap-12 lg:grid-cols-[0.7fr_1.3fr]"><?= section_heading('Pricing FAQ', 'Before you ask.', null, ['class' => 'mb-0']) ?><?= faq_list($faqs) ?></div><?= sec_close() ?><?php endif; ?>
