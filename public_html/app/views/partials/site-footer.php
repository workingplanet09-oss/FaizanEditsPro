<?php defined('FEP') or exit; /** Public site footer (navy): name, descriptor, navigation, contact, verified social links. Var: $site */
$b = $site['business']; $footer = $site['footer'];
$socialIcon = ['instagram' => 'camera', 'youtube' => 'play', 'linkedin' => 'briefcase', 'tiktok' => 'music', 'x' => 'message', 'behance' => 'palette'];
$socials = array_filter((array)($b['socials'] ?? []));
?>
<footer class="dark-zone border-t border-line">
  <div class="container-page grid grid-cols-1 gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)]">
    <div>
      <?php partial('partials/logo', ['name' => $b['name'], 'descriptor' => $b['descriptor'] ?? '', 'logoUrl' => $b['logoUrl'] ?: null, 'large' => true]); ?>
      <p class="mt-6 max-w-sm text-base leading-relaxed text-muted"><?= e($footer['description']) ?></p>
      <?php if (!empty($b['email'])): ?><a href="mailto:<?= e($b['email']) ?>" class="mt-5 inline-flex min-h-11 items-center gap-2 text-base font-semibold text-fg underline underline-offset-4"><?= icon('mail', 18) ?><?= e($b['email']) ?></a><?php endif; ?>
      <?php if ($socials): ?><div class="mt-4 flex flex-wrap gap-2">
        <?php foreach ($socials as $k => $v): ?><a href="<?= e($v) ?>" target="_blank" rel="noopener noreferrer" aria-label="<?= e(ucfirst($k)) ?> (opens in a new tab)" class="flex h-11 w-11 items-center justify-center rounded-xl border border-line-strong text-fg transition-colors duration-150 hover:bg-surface-2"><?= icon($socialIcon[$k] ?? 'globe', 20) ?></a><?php endforeach; ?>
      </div><?php endif; ?>
      <?php if (!empty($footer['newsletter'])): ?><div class="mt-8 max-w-sm">
        <div class="text-base font-semibold">Editing tips, occasionally</div>
        <p class="mt-1 text-sm text-muted">No spam. Unsubscribe any time.</p>
        <?php partial('site/newsletter-form'); ?>
      </div><?php endif; ?>
    </div>
    <div class="grid grid-cols-2 gap-8 sm:grid-cols-3">
      <?php foreach ($footer['columns'] as $col): ?>
        <nav aria-label="<?= e($col['title']) ?>">
          <div class="eyebrow mb-4"><?= e($col['title']) ?></div>
          <ul class="space-y-1"><?php foreach ($col['links'] as $l): ?><li><a href="<?= e($l['href']) ?>" class="inline-flex min-h-11 items-center text-base text-muted transition-colors duration-150 hover:text-fg hover:underline"><?= e($l['label']) ?></a></li><?php endforeach; ?></ul>
        </nav>
      <?php endforeach; ?>
    </div>
  </div>
  <div class="border-t border-line">
    <div class="container-page flex flex-col items-center justify-between gap-3 py-6 text-sm text-muted sm:flex-row">
      <span>© <?= gmdate('Y') ?> <?= e($b['legalName'] ?: $b['name']) ?>. All rights reserved.</span>
      <div class="flex gap-2"><a href="/privacy" class="inline-flex min-h-11 items-center px-2 hover:text-fg hover:underline">Privacy</a><a href="/terms" class="inline-flex min-h-11 items-center px-2 hover:text-fg hover:underline">Terms</a><a href="/contact" class="inline-flex min-h-11 items-center px-2 hover:text-fg hover:underline">Contact</a></div>
    </div>
    <?php if ($site['demoMode']): ?><div class="border-t border-line bg-warning-soft py-2 text-center text-sm font-medium text-warning">Demo mode: sample content and fictional data are enabled. Set 'mode' to 'live' in config.php and remove the demo data before going live.</div><?php endif; ?>
  </div>
</footer>
