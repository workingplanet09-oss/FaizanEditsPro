<?php defined('FEP') or exit; /** Vars: $s, $site, $faqs, $work, $startHref */
$included = (array)$s['included']; $whoFor = (array)$s['whoFor']; $platforms = (array)$s['platforms']; $deliverables = (array)$s['deliverables']; $examples = (array)$s['exampleDeliverables'];
$addOns = array_map('strval', array_values((array)($s['addOns'] ?? []))); $workflow = array_map('strval', array_values((array)($s['workflow'] ?? [])));
if (!$workflow) { $workflow = ['Send project details', 'Receive your quote', 'Upload your footage', 'Review and give feedback', 'Download final files']; }
$panel = 'rounded-[var(--radius-card)] border border-line bg-surface';
?>
<?= page_hero('Service · ' . ($s['turnaround'] ?: 'Custom timeline'), $s['title'], $s['shortDescription'],
    '<div class="flex flex-wrap gap-3">' . ui_link($startHref, 'Discuss your project', ['size' => 'lg', 'iconRight' => 'arrow']) . ui_link('/work', 'View my work', ['size' => 'lg', 'variant' => 'outline']) . '</div>'
    . '<dl class="mt-10 flex flex-wrap gap-x-10 gap-y-4 text-base"><div><dt class="text-muted">Starting at</dt><dd class="mt-0.5 font-display text-xl font-bold">' . e(!empty($s['startingPrice']) ? money((int)$s['startingPrice'], $s['currency'] ?: 'USD', true) : ($s['priceLabel'] ?: 'Custom quote')) . '</dd></div>'
    . '<div><dt class="text-muted">Turnaround</dt><dd class="mt-0.5 font-display text-xl font-bold">' . e($s['turnaround'] ?: 'Confirmed in your quote') . '</dd></div>'
    . '<div><dt class="text-muted">Revisions</dt><dd class="mt-0.5 font-display text-xl font-bold">Included in every quote</dd></div></dl>') ?>

<?= sec_open() ?>
  <div class="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-16">
    <div<?= rv() ?>>
      <h2 class="h-section">What you get</h2>
      <?php if ($s['description']): ?><div class="prose-lite site-copy measure mt-5 text-muted"><?= render_markdown($s['description']) ?></div><?php endif; ?>
      <h3 class="h-card mt-10 text-xl">Included in every project</h3>
      <ul class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"><?php foreach ($included as $i): ?><li class="flex gap-3 text-base"><?= icon('check-circle', 20, 'mt-px shrink-0 text-accent-text') ?><?= e($i) ?></li><?php endforeach; ?></ul>
    </div>
    <div<?= rv(100, 'space-y-6') ?>>
      <div class="<?= $panel ?> p-6 sm:p-8"><h3 class="h-card text-xl">Who it is for</h3><ul class="mt-4 space-y-3 text-base text-muted"><?php foreach ($whoFor as $w): ?><li class="flex gap-2.5"><?= icon('users', 16, 'mt-0.5 shrink-0 text-subtle') ?><?= e($w) ?></li><?php endforeach; ?></ul></div>
      <?php if ($platforms): ?><div class="<?= $panel ?> p-6 sm:p-8"><h3 class="h-card text-xl">Platforms</h3><ul class="mt-4 flex flex-wrap gap-2"><?php foreach ($platforms as $p): ?><li class="rounded-full bg-surface-2 px-3 py-1.5 text-sm font-semibold text-fg"><?= e($p) ?></li><?php endforeach; ?></ul></div><?php endif; ?>
      <?php if ($s['editingStyle']): ?><div class="<?= $panel ?> p-6 sm:p-8"><h3 class="h-card text-xl">My editing style</h3><p class="mt-3 text-base leading-relaxed text-muted"><?= e(str_replace('**', '', $s['editingStyle'])) ?></p></div><?php endif; ?>
    </div>
  </div>
<?= sec_close() ?>

<?php if ($deliverables || $examples): ?>
<?= sec_open(['tone' => 'alt']) ?>
  <?= section_heading('Deliverables', 'Exactly what you receive.') ?>
  <div class="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2">
    <div class="<?= $panel ?> p-6 sm:p-8"><h3 class="h-card text-xl">Standard deliverables</h3><ul class="mt-4 space-y-3 text-base"><?php foreach ($deliverables as $d): ?><li class="flex gap-3"><?= icon('film', 16, 'mt-0.5 shrink-0 text-accent-text') ?> <?= e($d) ?></li><?php endforeach; ?></ul></div>
    <div class="<?= $panel ?> p-6 sm:p-8"><h3 class="h-card text-xl">Example packages</h3><ul class="mt-4 space-y-3 text-base"><?php foreach ($examples as $d): ?><li class="flex gap-3"><?= icon('package', 16, 'mt-0.5 shrink-0 text-accent-text') ?> <?= e($d) ?></li><?php endforeach; ?></ul>
      <?php if ($addOns): ?><h3 class="h-card mt-8 text-xl">Optional add-ons</h3><ul class="mt-4 space-y-3 text-base text-muted"><?php foreach ($addOns as $a): ?><li class="flex gap-3"><?= icon('plus', 16, 'mt-0.5 shrink-0') ?> <?= e($a) ?></li><?php endforeach; ?></ul><?php endif; ?></div>
  </div>
<?= sec_close() ?>
<?php endif; ?>

<?= sec_open() ?>
  <?= section_heading('Workflow', 'How a project runs.', $s['revisionPolicy'] ?: $site['business']['revisionPolicy']) ?>
  <ol class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-5 md:gap-6"><?php foreach ($workflow as $i => $w): ?><li class="<?= $panel ?> p-6"><span class="flex h-10 w-10 items-center justify-center rounded-full bg-accent font-display text-base font-bold text-accent-fg"><?= $i + 1 ?></span><p class="mt-4 text-base font-semibold leading-snug"><?= e($w) ?></p></li><?php endforeach; ?></ol>
<?= sec_close() ?>

<?php if ($work): ?><?= sec_open(['tone' => 'alt']) ?><?= section_heading('Examples', 'Recent work in this style.') ?><?= work_grid($work, []) ?><?= sec_close() ?><?php endif; ?>

<?php if ($faqs): ?><?= sec_open() ?><div class="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]"><?= section_heading('FAQ', $s['title'] . ': common questions', null, ['class' => 'mb-0']) ?><?= faq_list($faqs) ?></div><?= sec_close() ?><?php endif; ?>

<?= cta_band('Let us talk about your ' . mb_strtolower($s['title']) . ' project.', 'A short guided form. You will get a fixed-scope quote.', ui_link($startHref, 'Discuss your project', ['size' => 'lg', 'iconRight' => 'arrow']) . ghost_link('/pricing', 'See pricing', ['size' => 'lg'])) ?>
