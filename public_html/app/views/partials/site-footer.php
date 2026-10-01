<?php defined('FEP') or exit; /** Public site footer. Var: $site */
$b = $site['business']; $footer = $site['footer'];
$socialIcon = ['instagram' => 'camera', 'youtube' => 'play', 'linkedin' => 'briefcase', 'tiktok' => 'music', 'x' => 'message', 'behance' => 'palette'];
$socials = array_filter((array)($b['socials'] ?? []));
?>
<footer class="dark-zone relative border-t border-line">
  <div class="container-page grid grid-cols-1 gap-12 py-16 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)]">
    <div>
      <?php partial('partials/logo', ['name' => $b['name'], 'logoUrl' => $b['logoUrl'] ?: null]); ?>
      <p class="mt-4 max-w-sm text-sm leading-relaxed text-muted"><?= e($footer['description']) ?></p>
      <?php if (!empty($b['email'])): ?><a href="mailto:<?= e($b['email']) ?>" class="mt-5 inline-flex items-center gap-2 text-sm font-semibold hover:text-accent-text"><?= icon('mail', 16) ?><?= e($b['email']) ?></a><?php endif; ?>
      <?php if ($socials): ?><div class="mt-5 flex gap-2">
        <?php foreach ($socials as $k => $v): ?><a href="<?= e($v) ?>" target="_blank" rel="noopener noreferrer" aria-label="<?= e($k) ?>" class="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-muted transition hover:border-accent hover:text-accent-text"><?= icon($socialIcon[$k] ?? 'globe', 16) ?></a><?php endforeach; ?>
      </div><?php endif; ?>
      <?php if (!empty($footer['newsletter'])): ?><div class="mt-8 max-w-sm">
        <div class="text-sm font-bold">Editing tips, occasionally</div>
        <p class="mt-1 text-xs text-muted">No spam. Unsubscribe anytime.</p>
        <?php partial('site/newsletter-form'); ?>
      </div><?php endif; ?>
    </div>
    <div class="grid grid-cols-2 gap-8 sm:grid-cols-3">
      <?php foreach ($footer['columns'] as $col): ?>
        <nav aria-label="<?= e($col['title']) ?>">
          <div class="eyebrow mb-4"><?= e($col['title']) ?></div>
          <ul class="space-y-2.5"><?php foreach ($col['links'] as $l): ?><li><a href="<?= e($l['href']) ?>" class="text-sm text-muted transition hover:text-fg"><?= e($l['label']) ?></a></li><?php endforeach; ?></ul>
        </nav>
      <?php endforeach; ?>
    </div>
  </div>
  <div class="border-t border-line">
    <div class="container-page flex flex-col items-center justify-between gap-3 py-6 text-xs text-subtle sm:flex-row">
      <span>© <?= gmdate('Y') ?> <?= e($b['legalName'] ?: $b['name']) ?>. All rights reserved.</span>
      <div class="flex gap-5"><a href="/privacy" class="hover:text-fg">Privacy</a><a href="/terms" class="hover:text-fg">Terms</a><a href="/contact" class="hover:text-fg">Contact</a></div>
    </div>
    <?php if ($site['demoMode']): ?><div class="border-t border-line bg-warning-soft py-2 text-center text-xs font-semibold text-warning">Demo mode: sample content and fictional data are enabled. Set 'mode' to 'live' in config.php and clear the demo data before going live.</div><?php endif; ?>
  </div>
</footer>
