<?php defined('FEP') or exit; /** Vars: $c, $results */
$labels = ['views' => 'Views', 'watchTime' => 'Watch time', 'engagement' => 'Engagement', 'ctr' => 'CTR', 'leads' => 'Leads', 'conversions' => 'Conversions'];
$sections = [['The problem', $c['problem']], ['The objective', $c['objective']], ['Editing strategy', $c['strategy']], ['Creative direction', $c['creativeDirection']]];
$deliverables = (array)$c['deliverables'];
?>
<?= page_hero('Case study · ' . implode(' · ', array_filter([$c['clientName'], $c['industry']])), $c['title'], $c['summary'] ?: null) ?>
<?= sec_open() ?>
  <div class="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
    <div class="space-y-12">
      <?php if ($c['beforeVideoUrl'] && $c['afterVideoUrl']): ?><div<?= rv() ?>><h2 class="mb-4 text-2xl font-extrabold">Before &amp; after</h2><?= before_after($c['beforeVideoUrl'], $c['afterVideoUrl']) ?></div>
      <?php elseif ($c['heroImage']): ?><img src="<?= e($c['heroImage']) ?>" alt="" class="w-full rounded-[var(--radius-card)] border border-line"><?php endif; ?>
      <?php foreach ($sections as [$title, $body]): if (!$body) continue; ?>
        <div<?= rv() ?>><h2 class="text-2xl font-extrabold"><?= e($title) ?></h2><div class="prose-lite mt-3 text-muted"><?= render_markdown($body) ?></div></div>
      <?php endforeach; ?>
      <?php if ($c['clientFeedback']): ?>
        <div<?= rv() ?>><figure class="rounded-[var(--radius-card)] border border-line bg-surface p-8"><?= icon('quote', 28, 'text-accent-text') ?><blockquote class="mt-3 text-xl font-semibold leading-snug">“<?= e($c['clientFeedback']) ?>”</blockquote>
          <?php if ($c['feedbackAuthor']): ?><figcaption class="mt-4 text-sm text-muted">— <?= e($c['feedbackAuthor']) ?></figcaption><?php endif; ?></figure></div>
      <?php endif; ?>
    </div>
    <aside class="space-y-6 lg:sticky lg:top-24 lg:self-start">
      <?php if ($results): ?>
        <div class="rounded-[var(--radius-card)] border border-line bg-surface p-6"><h2 class="font-extrabold">Results</h2>
          <dl class="mt-4 space-y-4"><?php foreach ($results as [$k, $v]): ?><div class="flex items-baseline justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0"><dt class="text-sm text-muted"><?= e($labels[$k] ?? title_case(preg_replace('/([a-z])([A-Z])/', '$1 $2', $k))) ?></dt><dd class="font-display text-xl font-extrabold tabular-nums"><?= e($v) ?></dd></div><?php endforeach; ?></dl>
          <p class="mt-4 text-[11px] text-subtle">Figures supplied by the client.</p></div>
      <?php endif; ?>
      <?php if ($deliverables): ?>
        <div class="rounded-[var(--radius-card)] border border-line bg-surface p-6"><h2 class="font-extrabold">Deliverables</h2>
          <ul class="mt-4 space-y-2.5 text-sm"><?php foreach ($deliverables as $d): ?><li class="flex gap-2.5"><?= icon('check', 16, 'mt-0.5 shrink-0 text-accent-text') ?> <?= e($d) ?></li><?php endforeach; ?></ul>
          <?php if ($c['timeline']): ?><p class="mt-5 border-t border-line pt-4 text-sm text-muted"><span class="font-bold text-fg">Timeline · </span><?= e($c['timeline']) ?></p><?php endif; ?></div>
      <?php endif; ?>
      <?= ui_link('/start-project', 'Start a similar project', ['class' => 'w-full', 'iconRight' => 'arrow']) ?>
    </aside>
  </div>
<?= sec_close() ?>
