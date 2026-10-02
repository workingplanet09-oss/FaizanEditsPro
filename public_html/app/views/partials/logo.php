<?php defined('FEP') or exit; /** Wordmark. Vars: $name, $descriptor?, $logoUrl?, $class?, $href?, $large? (footer: wide enough for the descriptor) */
$href = $href ?? '/'; $large = !empty($large); ?>
<a href="<?= e($href) ?>" aria-label="<?= e($name) ?> — home" class="<?= e(cx('wordmark', $large ? 'wordmark-lg' : '', $class ?? '')) ?>">
  <?php if (!empty($logoUrl)): ?><img src="<?= e($logoUrl) ?>" alt="" class="<?= $large ? 'h-12' : 'h-8' ?> w-auto max-w-[240px] shrink-0">
  <?php else: ?><span class="wordmark-name"><?= e($name) ?></span><?php if (!empty($descriptor)): ?><span class="wordmark-desc"><?= e($descriptor) ?></span><?php endif; ?><?php endif; ?>
</a>
