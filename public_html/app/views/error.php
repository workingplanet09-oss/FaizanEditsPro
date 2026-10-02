<?php defined('FEP') or exit; /** Every error surface answers two questions: what happened, and what can I do next. Vars: $code, $icon, $title, $description, $actions [[label, href, primary]] */ ?>
<div class="flex min-h-[70dvh] flex-col items-center justify-center px-6 py-16 text-center">
  <div class="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft"><?= icon($icon ?? 'alert', 28) ?></div>
  <?php if (!empty($code)): ?><div class="eyebrow mb-2"><?= e($code) ?></div><?php endif; ?>
  <h1 class="text-3xl font-bold tracking-tight sm:text-4xl"><?= e($title) ?></h1>
  <p class="mt-3 max-w-md text-muted"><?= e($description) ?></p>
  <div class="mt-7 flex flex-wrap justify-center gap-3">
    <?php foreach ($actions as [$label, $href, $primary]): ?><?= ui_link($href, $label, ['variant' => $primary ? 'primary' : 'outline']) ?><?php endforeach; ?>
  </div>
  <p class="mt-10 text-xs text-subtle">Need a hand? <a class="underline underline-offset-4" href="/contact">Contact us</a></p>
</div>
