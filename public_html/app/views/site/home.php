<?php defined('FEP') or exit; /** Vars: $site, $hero, $process, $stats, $services, $work, $testimonials, $plans, $faqs */
$headline = explode("\n", $hero['headline']);
$portal = [
    ['clipboard', 'Guided briefs', 'A short, adaptive setup instead of endless email threads — the questions change with your niche.'],
    ['message', 'Timestamped review', "Click the timeline and leave feedback on the exact frame. Every note is tracked until it's resolved."],
    ['layers', 'Version history', 'V1, V2, Final — nothing is overwritten. Compare versions side by side and approve the right one.'],
    ['shield', 'Secure files & delivery', 'Direct-to-cloud uploads, signed links, and final files that unlock when approval and payment are done.'],
    ['receipt', 'Quotes, contracts, invoices', "Accept, e-sign and pay in your portal. Always know what you've agreed to and what's due."],
    ['activity', "Always know what's next", "A live timeline shows what happened, what's happening, and what we need from you."],
];
?>
<section class="dark-zone grain relative isolate overflow-hidden">
  <div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_85%_0%,color-mix(in_srgb,var(--accent)_26%,transparent),transparent_70%),radial-gradient(50%_45%_at_0%_100%,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_70%)]"></div>
  <div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10 opacity-[0.35] [background-image:linear-gradient(to_right,rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.05)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(70%_60%_at_50%_30%,#000,transparent)]"></div>
  <div class="container-page grid grid-cols-1 items-center gap-14 py-16 sm:py-24 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-10 lg:py-32">
    <div>
      <div<?= rv(0, 'mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1.5 pl-2 pr-4 text-xs font-semibold text-muted backdrop-blur') ?>>
        <span class="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-fg"><?= icon('clapperboard', 12) ?></span><?= e($hero['eyebrow']) ?>
      </div>
      <div<?= rv(60) ?>><h1 class="display text-[clamp(2.5rem,5vw,4.7rem)]"><?php foreach ($headline as $i => $line): ?><span class="block<?= $i === 1 ? ' text-accent-text' : '' ?>"><?= e($line) ?></span><?php endforeach; ?></h1></div>
      <div<?= rv(140) ?>><p class="mt-7 max-w-xl text-base leading-relaxed text-muted sm:text-lg"><?= e($hero['subheadline']) ?></p></div>
      <div<?= rv(220, 'mt-9 flex flex-wrap gap-3') ?>>
        <?= ui_link($hero['primaryCta']['href'], $hero['primaryCta']['label'], ['size' => 'lg', 'iconRight' => 'arrow']) ?>
        <?= ghost_link($hero['secondaryCta']['href'], $hero['secondaryCta']['label'], ['size' => 'lg']) ?>
      </div>
      <div<?= rv(300) ?>><ul class="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted"><?php foreach ($hero['trustPoints'] as $t): ?><li class="flex items-center gap-2"><?= icon('check-circle', 16, 'text-accent-text') ?><?= e($t) ?></li><?php endforeach; ?></ul></div>
    </div>
    <div<?= rv(200) ?>><?= hero_visual($hero['showreelUrl'] ?: null, $hero['posterUrl'] ?: null, $hero['floatingCards']) ?></div>
  </div>
  <div class="border-t border-white/10 bg-black/30 backdrop-blur"><div class="container-page py-8">
    <?php if ($stats): ?>
      <dl class="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6"><?php foreach ($stats as $s): ?><div><dd class="font-display text-3xl font-extrabold tracking-tight tabular-nums"><?= e($s['value']) ?></dd><dt class="mt-1 text-xs font-medium text-muted"><?= e($s['label']) ?></dt></div><?php endforeach; ?></dl>
    <?php else: ?>
      <ul class="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><?php foreach ([['clipboard', 'Fixed-scope quotes'], ['message', 'Timestamped feedback'], ['layers', 'Every version kept'], ['lock', 'Private, signed file delivery']] as [$ic, $l]): ?><li class="flex items-center gap-3 font-semibold text-muted"><?= icon($ic, 18, 'text-accent-text') ?><?= e($l) ?></li><?php endforeach; ?></ul>
    <?php endif; ?>
  </div></div>
</section>

<?= sec_open(['id' => 'services']) ?>
  <?= section_heading('Services', 'Every kind of edit, one production system.', "From vertical shorts to long-form YouTube, podcasts to property tours — pick a service and we'll tailor the brief to it.") ?>
  <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"><?php foreach ($services as $i => $s): ?><div<?= rv(($i % 3) * 70) ?>><?= service_card($s, true) ?></div><?php endforeach; ?></div>
  <div class="mt-10 text-center"><?= ui_link('/services', 'Explore all services', ['variant' => 'outline', 'iconRight' => 'arrow']) ?></div>
<?= sec_close() ?>

<?php if ($work): ?>
<?= sec_open(['id' => 'work', 'tone' => 'alt']) ?>
  <?= section_heading('Selected work', 'Edits that hold attention.', 'A few recent projects. Open any of them for the full story.') ?>
  <?= work_grid($work, []) ?>
  <div class="mt-10 text-center"><?= ui_link('/work', 'See all work', ['variant' => 'outline', 'iconRight' => 'arrow']) ?></div>
<?= sec_close() ?>
<?php endif; ?>

<?= sec_open(['id' => 'process', 'tone' => 'dark']) ?>
  <?= section_heading('How it works', $process['heading'], $process['intro']) ?>
  <ol class="grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
    <?php foreach ($process['steps'] as $i => $s): ?>
      <li<?= rv($i * 50, 'group relative bg-surface p-6 transition hover:bg-surface-2') ?>>
        <div class="flex items-center gap-3"><span class="flex h-9 w-9 items-center justify-center rounded-full border border-line-strong font-display text-sm font-extrabold transition group-hover:border-accent group-hover:bg-accent group-hover:text-accent-fg"><?= $i + 1 ?></span></div>
        <h3 class="mt-4 text-base font-extrabold leading-snug"><?= e($s['title']) ?></h3><p class="mt-2 text-sm leading-relaxed text-muted"><?= e($s['summary']) ?></p>
      </li>
    <?php endforeach; ?>
    <?php if (count($process['steps']) % 4 === 3): ?>
      <li class="flex flex-col justify-between bg-accent p-6 text-accent-fg max-lg:hidden"><span class="text-base font-extrabold leading-snug">Ready when you are.</span><a href="/start-project" class="mt-6 inline-flex items-center gap-2 text-sm font-extrabold underline-offset-4 hover:underline">Start a project <?= icon('arrow', 15) ?></a></li>
    <?php endif; ?>
  </ol>
  <div class="mt-8"><a href="/process" class="inline-flex items-center gap-2 text-sm font-bold text-accent-text hover:underline">See the full process <?= icon('arrow', 15) ?></a></div>
<?= sec_close() ?>

<?= sec_open(['id' => 'portal']) ?>
  <?= section_heading('Your client portal', 'A studio with its own production software.', "You'll never wonder where a project stands, where a file went, or who's handling what.") ?>
  <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
    <?php foreach ($portal as $i => [$ic, $t, $b]): ?>
      <div<?= rv(($i % 3) * 70, 'rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-soft') ?>><span class="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft"><?= icon($ic, 20) ?></span><h3 class="text-base font-extrabold"><?= e($t) ?></h3><p class="mt-2 text-sm leading-relaxed text-muted"><?= e($b) ?></p></div>
    <?php endforeach; ?>
  </div>
<?= sec_close() ?>

<?php if ($testimonials): ?>
<?= sec_open(['tone' => 'alt']) ?>
  <?= section_heading('Client feedback', 'What clients say after delivery.') ?>
  <div class="grid grid-cols-1 gap-5 md:grid-cols-3"><?php foreach ($testimonials as $t): ?><?= testimonial_card($t) ?><?php endforeach; ?></div>
<?= sec_close() ?>
<?php endif; ?>

<?= sec_open(['id' => 'pricing']) ?>
  <?= section_heading('Pricing', 'Flexible by design.', 'One-time projects, per-video or per-short pricing, or a monthly retainer. Every project gets a clear, fixed-scope quote before anything starts.') ?>
  <?php if ($plans): ?>
    <div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4"><?php foreach (array_slice($plans, 0, 4) as $p): ?><?= plan_card($p) ?><?php endforeach; ?></div>
  <?php else: ?>
    <?= icon_cards([['film', 'One-time projects', 'A single video or a defined package — quoted once, delivered once.'], ['repeat', 'Per-video & per-short', 'Predictable pricing for creators who publish on a schedule.'], ['calendar', 'Monthly retainer', 'A monthly allowance with priority scheduling and usage tracking.']]) ?>
  <?php endif; ?>
  <div class="mt-10 text-center"><?= ui_link('/pricing', 'See pricing details', ['variant' => 'outline', 'iconRight' => 'arrow']) ?></div>
<?= sec_close() ?>

<?= sec_open(['tone' => 'alt']) ?>
  <div class="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
    <?= section_heading('FAQ', 'Questions, answered.', "Can't find yours? Ask us anything — we reply within one business day.", ['class' => 'mb-0']) ?>
    <div><?= faq_list(array_slice($faqs, 0, 7)) ?><a href="/faq" class="mt-5 inline-flex items-center gap-2 text-sm font-bold text-accent-text hover:underline">Read all FAQs <?= icon('arrow', 15) ?></a></div>
  </div>
<?= sec_close() ?>

<section class="dark-zone grain relative isolate overflow-hidden">
  <div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_80%_at_50%_120%,color-mix(in_srgb,var(--accent)_35%,transparent),transparent_70%)]"></div>
  <div class="container-page py-24 text-center sm:py-32"><div<?= rv() ?>>
    <h2 class="display mx-auto max-w-3xl text-[clamp(2.2rem,6vw,4.4rem)]">Ready to make your footage look unforgettable?</h2>
    <p class="mx-auto mt-6 max-w-xl text-lg text-muted">Tell us what you need in about three minutes. You'll get a clear plan and a fixed-scope quote — no obligation.</p>
    <div class="mt-9 flex flex-wrap justify-center gap-3">
      <?= ui_link('/start-project', 'Start a Project', ['size' => 'lg', 'iconRight' => 'arrow']) ?>
      <?php if ($site['booking']['enabled']): ?><?= ghost_link('/book', 'Book a call', ['size' => 'lg', 'icon' => 'calendar']) ?><?php endif; ?>
    </div>
  </div></div>
</section>
