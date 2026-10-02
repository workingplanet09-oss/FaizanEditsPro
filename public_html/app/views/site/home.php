<?php defined('FEP') or exit; /** Vars: $site, $hero, $process, $stats, $services, $work, $testimonials, $plans, $faqs */
$b = $site['business'];
$portalFeatures = [
    ['clipboard', 'Guided briefs', 'A short, adaptive form instead of long email threads. The questions change with your type of content.'],
    ['message', 'Timestamped feedback', "Click the timeline and leave feedback on the exact frame. Every note is tracked until I resolve it."],
    ['layers', 'Version history', 'V1, V2, Final: nothing is overwritten. Compare versions and approve the right one.'],
    ['shield', 'Private files and delivery', 'Secure uploads, signed links, and final files that unlock when approval and payment are done.'],
    ['receipt', 'Quotes, agreements, invoices', "Accept, e-sign and pay in your portal. You always know what you've agreed and what's due."],
    ['activity', "Always know what's next", "A live timeline shows what happened, what is happening and what I need from you."],
];
?>
<section class="bg-bg">
  <div class="container-page grid grid-cols-1 items-center gap-12 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16 lg:py-24">
    <div>
      <div<?= rv_now(0, 'eyebrow mb-5') ?>><?= e($hero['eyebrow']) ?></div>
      <div<?= rv_now(60) ?>><h1 class="display"><?= e($hero['headline']) ?></h1></div>
      <div<?= rv_now(120) ?>><p class="site-copy measure mt-6 text-muted"><?= e($hero['subheadline']) ?></p></div>
      <div<?= rv_now(180, 'mt-8 flex flex-wrap gap-3') ?>>
        <?= ui_link($hero['primaryCta']['href'], $hero['primaryCta']['label'], ['size' => 'lg', 'iconRight' => 'arrow']) ?>
        <?= ui_link($hero['secondaryCta']['href'], $hero['secondaryCta']['label'], ['size' => 'lg', 'variant' => 'outline']) ?>
      </div>
      <?php if ($hero['trustPoints']): ?><div<?= rv_now(240) ?>><ul class="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-base text-muted"><?php foreach ($hero['trustPoints'] as $t): ?><li class="flex items-center gap-2"><?= icon('check-circle', 18, 'shrink-0 text-accent-text') ?><?= e($t) ?></li><?php endforeach; ?></ul></div><?php endif; ?>
    </div>
    <div<?= rv_now(120) ?>><?= hero_visual($b, $hero['showreelUrl'] ?: null, $hero['posterUrl'] ?: null) ?></div>
  </div>
  <?php if ($stats): ?>
  <div class="border-t border-line bg-surface"><div class="container-page py-8">
    <dl class="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6"><?php foreach ($stats as $s): ?><div><dd class="font-display text-3xl font-bold tabular-nums"><?= e($s['value']) ?></dd><dt class="mt-1 text-sm font-medium text-muted"><?= e($s['label']) ?></dt></div><?php endforeach; ?></dl>
  </div></div>
  <?php endif; ?>
</section>

<?= sec_open(['id' => 'services']) ?>
  <?= section_heading('Services', 'What I edit.', 'Short-form, long-form and podcast editing, and motion graphics. Pick a service and I will tailor the brief to it.') ?>
  <div class="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-3"><?php foreach ($services as $i => $s): ?><div<?= rv(($i % 3) * 70) ?>><?= service_card($s, true) ?></div><?php endforeach; ?></div>
  <div class="mt-10"><?= ui_link('/services', 'See all services', ['variant' => 'outline', 'iconRight' => 'arrow']) ?></div>
<?= sec_close() ?>

<?php if ($work): ?>
<?= sec_open(['id' => 'work', 'tone' => 'alt']) ?>
  <?= section_heading('Selected work', 'Edits built to hold attention.', 'A few recent projects. Open any of them for the video and the story behind it.') ?>
  <?= work_grid($work, []) ?>
  <div class="mt-12"><?= ui_link('/work', 'View my work', ['iconRight' => 'arrow']) ?></div>
<?= sec_close() ?>
<?php endif; ?>

<?= sec_open(['id' => 'process', 'tone' => 'dark']) ?>
  <?= section_heading('How it works', $process['heading'], $process['intro']) ?>
  <ol class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
    <?php foreach ($process['steps'] as $i => $s): ?>
      <li<?= rv($i * 60, 'flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-6') ?>>
        <span class="flex h-10 w-10 items-center justify-center rounded-full bg-accent font-display text-base font-bold text-accent-fg"><?= $i + 1 ?></span>
        <h3 class="h-card mt-5"><?= e($s['title']) ?></h3><p class="mt-2 text-base leading-relaxed text-muted"><?= e($s['summary']) ?></p>
      </li>
    <?php endforeach; ?>
  </ol>
  <div class="mt-10"><a href="/process" class="inline-flex min-h-11 items-center gap-2 text-base font-semibold text-fg underline underline-offset-4">See the full process <?= icon('arrow', 18) ?></a></div>
<?= sec_close() ?>

<?= sec_open(['id' => 'portal']) ?>
  <?= section_heading('Your client portal', 'Everything about your project in one place.', "You will never wonder where a project stands, where a file went or what I need from you.") ?>
  <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3">
    <?php foreach ($portalFeatures as $i => [$ic, $t, $d]): ?>
      <div<?= rv(($i % 3) * 70, 'rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-8') ?>><span class="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2"><?= icon($ic, 24) ?></span><h3 class="h-card"><?= e($t) ?></h3><p class="mt-3 text-base leading-relaxed text-muted"><?= e($d) ?></p></div>
    <?php endforeach; ?>
  </div>
<?= sec_close() ?>

<?php if ($testimonials): ?>
<?= sec_open(['tone' => 'alt']) ?>
  <?= section_heading('Client feedback', 'What clients say after delivery.') ?>
  <div class="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3"><?php foreach ($testimonials as $t): ?><?= testimonial_card($t) ?><?php endforeach; ?></div>
<?= sec_close() ?>
<?php endif; ?>

<?= sec_open(['id' => 'pricing']) ?>
  <?= section_heading('Pricing', 'Clear pricing before I start.', 'One-time projects, per-video or per-short pricing, or a monthly retainer. Every project gets a fixed-scope quote before any work begins.') ?>
  <?php if ($plans): ?>
    <div class="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2 xl:grid-cols-3"><?php foreach (array_slice($plans, 0, 3) as $p): ?><?= plan_card($p) ?><?php endforeach; ?></div>
  <?php else: ?>
    <?= icon_cards([['film', 'One-time projects', 'A single video or a defined package, quoted once and delivered once.'], ['repeat', 'Per video or per short', 'Predictable pricing if you publish on a schedule.'], ['calendar', 'Monthly retainer', 'A monthly allowance with priority scheduling and usage tracking.']]) ?>
  <?php endif; ?>
  <div class="mt-10"><?= ui_link('/pricing', 'See pricing details', ['variant' => 'outline', 'iconRight' => 'arrow']) ?></div>
<?= sec_close() ?>

<?= sec_open(['tone' => 'alt']) ?>
  <div class="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
    <?= section_heading('FAQ', 'Questions, answered.', "Can't find yours? Ask me anything. I reply within one business day.", ['class' => 'mb-0']) ?>
    <div><?= faq_list(array_slice($faqs, 0, 7)) ?><a href="/faq" class="link mt-5 inline-flex min-h-11 items-center gap-2 text-base font-semibold">Read all FAQs <?= icon('arrow', 16) ?></a></div>
  </div>
<?= sec_close() ?>

<?= cta_band('Ready to discuss your project?', 'Tell me what you are making in about three minutes. I will reply with next steps and a fixed-scope quote.',
    ui_link('/start-project', 'Discuss your project', ['size' => 'lg', 'iconRight' => 'arrow']) . ($site['booking']['enabled'] ? ghost_link('/book', 'Book a call', ['size' => 'lg', 'icon' => 'calendar']) : '')) ?>
