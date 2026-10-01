<?php defined('FEP') or exit; /** Wordmark. Vars: $name, $logoUrl?, $class?, $href? */
$href = $href ?? '/'; ?>
<a href="<?= e($href) ?>" aria-label="<?= e($name) ?> — home" class="<?= e(cx('flex min-w-0 items-center gap-2.5 font-display font-extrabold tracking-tight', $class ?? '')) ?>">
  <?php if (!empty($logoUrl)): ?><img src="<?= e($logoUrl) ?>" alt="" class="h-8 w-auto shrink-0">
  <?php else: ?><span aria-hidden="true" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-fg text-[15px] font-black text-bg"><?= e(strtoupper(mb_substr(trim($name), 0, 1)) ?: 'F') ?><span class="-ml-0.5 mt-1 h-1.5 w-1.5 rounded-full bg-accent"></span></span><?php endif; ?>
  <span class="truncate text-[17px] leading-none"><?= e($name) ?></span>
</a>
