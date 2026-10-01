<?php defined('FEP') or exit; /** Vars: $s, $site, $faqs, $work, $startHref */
$included = (array)$s['included']; $whoFor = (array)$s['whoFor']; $platforms = (array)$s['platforms']; $deliverables = (array)$s['deliverables']; $examples = (array)$s['exampleDeliverables'];
$addOns = array_map('strval', array_values((array)($s['addOns'] ?? []))); $workflow = array_map('strval', array_values((array)($s['workflow'] ?? [])));
if (!$workflow) { $workflow = ['Tell us what you need', 'Receive a quote', 'Onboard & upload', 'Review & revise', 'Approve & download']; }
$panel = 'rounded-[var(--radius-card)] border border-line bg-surface';
?>
<?= page_hero('Service · ' . ($s['turnaround'] ?: 'Custom timeline'), $s['title'], $s['shortDescription'],
    '<div class="flex flex-wrap gap-3">' . ui_link($startHref, 'Start a project', ['size' => 'lg', 'iconRight' => 'arrow']) . ghost_link('/book', 'Book a call', ['size' => 'lg', 'icon' => 'calendar']) . '</div>'
    . '<dl class="mt-10 flex flex-wrap gap-x-10 gap-y-4 text-sm"><div><dt class="text-muted">Starting at</dt><dd class="mt-0.5 text-lg font-extrabold">' . e(!empty($s['startingPrice']) ? money((int)$s['startingPrice'], $s['currency'] ?: 'USD', true) : ($s['priceLabel'] ?: 'Custom quote')) . '</dd></div>'
    . '<div><dt class="text-muted">Turnaround</dt><dd class="mt-0.5 text-lg font-extrabold">' . e($s['turnaround'] ?: 'Confirmed in your quote') . '</dd></div>'
    . '<div><dt class="text-muted">Revisions</dt><dd class="mt-0.5 text-lg font-extrabold">Included in every quote</dd></div></dl>') ?>

<?= sec_open() ?>
  <div class="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
    <div<?= rv() ?>>
      <h2 class="text-2xl font-extrabold tracking-tight sm:text-3xl">What you get</h2>
      <?php if ($s['description']): ?><div class="prose-lite mt-5 text-muted"><?= render_markdown($s['description']) ?></div><?php endif; ?>
      <h3 class="mt-10 text-lg font-extrabold">Included in every project</h3>
      <ul class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"><?php foreach ($included as $i): ?><li class="flex gap-3 text-sm"><?= icon('check-circle', 18, 'mt-px shrink-0 text-accent-text') ?><?= e($i) ?></li><?php endforeach; ?></ul>
    </div>
    <div<?= rv(100, 'space-y-6') ?>>
      <div class="<?= $panel ?> p-6"><h3 class="font-extrabold">Who it's for</h3><ul class="mt-4 space-y-2.5 text-sm text-muted"><?php foreach ($whoFor as $w): ?><li class="flex gap-2.5"><?= icon('users', 16, 'mt-0.5 shrink-0 text-subtle') ?><?= e($w) ?></li><?php endforeach; ?></ul></div>
      <?php if ($platforms): ?><div class="<?= $panel ?> p-6"><h3 class="font-extrabold">Platforms</h3><ul class="mt-4 flex flex-wrap gap-2"><?php foreach ($platforms as $p): ?><li class="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold"><?= e($p) ?></li><?php endforeach; ?></ul></div><?php endif; ?>
      <?php if ($s['editingStyle']): ?><div class="<?= $panel ?> p-6"><h3 class="font-extrabold">Editing style</h3><p class="mt-3 text-sm leading-relaxed text-muted"><?= e(str_replace('**', '', $s['editingStyle'])) ?></p></div><?php endif; ?>
    </div>
  </div>
<?= sec_close() ?>

<?php if ($deliverables || $examples): ?>
<?= sec_open(['tone' => 'alt']) ?>
  <?= section_heading('Deliverables', 'Exactly what lands in your portal.') ?>
  <div class="grid grid-cols-1 gap-5 md:grid-cols-2">
    <div class="<?= $panel ?> p-7"><h3 class="font-extrabold">Standard deliverables</h3><ul class="mt-4 space-y-3 text-sm"><?php foreach ($deliverables as $d): ?><li class="flex gap-3"><?= icon('film', 16, 'mt-0.5 shrink-0 text-accent-text') ?> <?= e($d) ?></li><?php endforeach; ?></ul></div>
    <div class="<?= $panel ?> p-7"><h3 class="font-extrabold">Example packages</h3><ul class="mt-4 space-y-3 text-sm"><?php foreach ($examples as $d): ?><li class="flex gap-3"><?= icon('package', 16, 'mt-0.5 shrink-0 text-accent-text') ?> <?= e($d) ?></li><?php endforeach; ?></ul>
      <?php if ($addOns): ?><h3 class="mt-8 font-extrabold">Optional add-ons</h3><ul class="mt-4 space-y-2.5 text-sm text-muted"><?php foreach ($addOns as $a): ?><li class="flex gap-3"><?= icon('plus', 16, 'mt-0.5 shrink-0') ?> <?= e($a) ?></li><?php endforeach; ?></ul><?php endif; ?></div>
  </div>
<?= sec_close() ?>
<?php endif; ?>

<?= sec_open() ?>
  <?= section_heading('Workflow', 'How a project runs.', $s['revisionPolicy'] ?: $site['business']['revisionPolicy']) ?>
  <ol class="grid grid-cols-1 gap-4 md:grid-cols-5"><?php foreach ($workflow as $i => $w): ?><li class="<?= $panel ?> p-5"><span class="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft font-display text-sm font-extrabold"><?= $i + 1 ?></span><p class="mt-3 text-sm font-semibold leading-snug"><?= e($w) ?></p></li><?php endforeach; ?></ol>
<?= sec_close() ?>

<?php if ($work): ?><?= sec_open(['tone' => 'alt']) ?><?= section_heading('Examples', 'Recent work in this style.') ?><?= work_grid($work, []) ?><?= sec_close() ?><?php endif; ?>

<?php if ($faqs): ?><?= sec_open() ?><div class="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]"><?= section_heading('FAQ', $s['title'] . ': common questions', null, ['class' => 'mb-0']) ?><?= faq_list($faqs) ?></div><?= sec_close() ?><?php endif; ?>

<section class="dark-zone grain relative overflow-hidden"><div class="container-page flex flex-col items-start justify-between gap-6 py-16 sm:flex-row sm:items-center">
  <div><h2 class="text-2xl font-extrabold sm:text-3xl">Let's talk about your <?= e(mb_strtolower($s['title'])) ?> project.</h2><p class="mt-2 text-muted">A short guided form — you'll get a fixed-scope quote.</p></div>
  <div class="flex gap-3"><?= ui_link($startHref, 'Start a project', ['size' => 'lg', 'iconRight' => 'arrow']) ?><a href="/pricing" class="inline-flex h-13 items-center px-3 text-sm font-bold text-muted hover:text-fg">See pricing</a></div>
</div></section>
