<?php defined('FEP') or exit; /** Vars: $all, $key, $def, $lite, $items, $total, $relations, $currency, $icons */
$ICON = ['services' => 'clapperboard', 'pricing-plans' => 'wallet', 'portfolio' => 'film', 'case-studies' => 'book', 'testimonials' => 'quote', 'blog-posts' => 'news', 'blog-categories' => 'folder', 'faqs' => 'help', 'kb-articles' => 'book', 'project-types' => 'layers', 'project-templates' => 'checklist', 'email-templates' => 'mail']; ?>
<?= ui_page_header('Website content', 'Everything visitors see: services, pricing, portfolio, case studies, testimonials, blog, FAQs and more. Sample entries are labelled and can be removed any time.') ?>
<div class="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
  <nav aria-label="Content types" class="thin-scroll -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:block lg:space-y-0.5 lg:overflow-visible lg:px-0"><?php foreach ($all as $r): $on = $r['key'] === $key; ?>
    <a href="/admin/content?r=<?= e($r['key']) ?>"<?= $on ? ' aria-current="page"' : '' ?> class="flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition <?= $on ? 'bg-fg text-bg' : 'text-muted hover:bg-surface-2 hover:text-fg' ?>"><?= icon($ICON[$r['key']] ?? 'news', 16, $on ? 'text-accent-text' : 'text-subtle') ?><?= e($r['label']) ?></a>
  <?php endforeach; ?></nav>
  <div class="min-w-0"><h2 class="mb-1 text-xl font-extrabold"><?= e($def['label']) ?></h2><p class="mb-5 text-sm text-muted"><?= e($def['description']) ?></p>
    <div data-fe-component="cms-manager" data-props="<?= json_attr(['resource' => $lite, 'items' => $items, 'total' => $total, 'relations' => (object)$relations, 'currency' => $currency, 'icons' => $icons]) ?>"></div></div>
</div>
