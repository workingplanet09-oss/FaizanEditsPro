<?php defined('FEP') or exit; /** Vars: $key, $group, $jobs, $st, $demo, $demoLoaded, $demoCanLoad, $isSuper, [$value] */
$nav = array_merge([['integrations', 'Integrations & system', 'zap']], array_map(fn($g) => [$g[0], $g[1], $g[2]], SETTING_GROUPS));
$items = [
    ['Database', true, 'MySQL connected.', 'config.php → db'],
    ['Site address', $st['siteUrl']['source'] !== 'none', $st['siteUrl']['source'] === 'none' ? 'Not set. Links in emails and the sitemap then use the address of whoever makes the request — set app_url in config.php to your https:// address.' : 'Links in emails and the sitemap use ' . $st['siteUrl']['url'] . ($st['siteUrl']['source'] === 'setup' ? ' (remembered from the first-run setup; set app_url in config.php to change it).' : '.'), 'config.php → app_url'],
    ['File storage', $st['storage']['configured'], 'Files are stored in the private storage folder on your hosting and handed out through signed, expiring links.', 'config.php → storage'],
    ['Payments', $st['payments']['configured'], $st['payments']['provider'] === 'demo' ? 'Demo checkout — no card is charged. Set the payment provider to "stripe" for live payments.' : 'Provider: ' . $st['payments']['provider'] . '.', 'config.php → payments'],
    ['Email', $st['email']['configured'], $st['email']['provider'] === 'log' ? 'Emails are written to the outbox instead of being delivered.' : 'Driver: ' . $st['email']['provider'] . '.', 'config.php → email'],
    ['Google sign-in', $st['google']['configured'], $st['google']['configured'] ? 'Enabled on the login page.' : 'Optional — add a client ID and secret to enable.', 'config.php → google'],
    ['Spam protection (Turnstile)', $st['turnstile']['configured'], $st['turnstile']['configured'] ? 'Cloudflare Turnstile is checking public forms.' : ($st['turnstile']['partial'] ? 'Only one of the two keys is set, so the challenge is switched off. Set both site_key and secret_key.' : 'Honeypot, time-trap and rate limits are active; add Turnstile for stronger protection.'), 'config.php → turnstile'],
    ['Malware scanning', $st['scan']['configured'], $st['scan']['provider'] === 'none' ? 'Not enabled. Uploads are type- and size-checked; PHP and executable files are always refused.' : 'Provider: ' . $st['scan']['provider'] . '.', 'config.php → scan'],
    ['Demo mode', !$st['demoMode'], $st['demoMode'] ? 'ON — demo login buttons and demo checkout are enabled. Switch mode to "live" before launch.' : 'Off.', 'config.php → mode'],
];
?>
<?= ui_page_header('Settings', 'Everything about your studio, site and workflow. Changes go live immediately.') ?>
<div class="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
  <nav aria-label="Settings sections" class="thin-scroll -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:block lg:space-y-0.5 lg:overflow-visible lg:px-0"><?php foreach ($nav as [$k, $l, $ic]): $on = $k === $key; ?>
    <a href="/admin/settings?g=<?= e($k) ?>"<?= $on ? ' aria-current="page"' : '' ?> class="flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition <?= $on ? 'bg-fg text-bg' : 'text-muted hover:bg-surface-2 hover:text-fg' ?>"><?= icon($ic, 16, $on ? 'text-accent-text' : 'text-subtle') ?><?= e($l) ?></a><?php endforeach; ?></nav>
  <div class="min-w-0">
    <?php if ($group): ?>
      <h2 class="text-xl font-extrabold"><?= e($group[1]) ?></h2><p class="mb-5 mt-1 text-sm text-muted"><?= e($group[3]) ?></p>
      <div data-fe-component="settings-editor" data-props="<?= json_attr(['group' => $group[0], 'value' => $value]) ?>"></div>
    <?php else: ?>
      <div class="space-y-6">
        <?php ob_start(); ?><ul class="divide-y divide-line"><?php foreach ($items as [$name, $ok, $detail, $where]): ?>
          <li class="flex flex-wrap items-center gap-3 px-5 py-3.5"><span class="flex h-8 w-8 items-center justify-center rounded-full <?= $ok ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning' ?>"><?= icon($ok ? 'check' : 'alert', 15) ?></span>
            <div class="min-w-0 flex-1"><div class="text-sm font-bold"><?= e($name) ?></div><div class="text-xs text-muted"><?= e($detail) ?></div></div><code class="rounded bg-surface-2 px-2 py-1 text-[11px] text-muted"><?= e($where) ?></code></li><?php endforeach; ?></ul>
        <?= card(ob_get_clean(), '', 'Integrations', 'Configured in config.php so secrets never touch the database.') ?>
        <?php ob_start(); ?><div class="flex flex-wrap items-center gap-3 px-5 pb-5">
          <?php foreach ((array)$jobs['counts'] as $k => $n): ?><?= ui_badge(strtolower($k) . ': ' . (int)$n, $k === 'FAILED' ? 'danger' : ($k === 'PENDING' ? 'warning' : 'neutral')) ?><?php endforeach; ?>
          <?= !empty($jobs['counts']->FAILED) ? ui_action('/api/admin/jobs', 'Retry failed jobs', ['size' => 'sm', 'variant' => 'outline', 'success' => 'Failed jobs queued for retry']) : '' ?>
          <?= !(array)$jobs['counts'] ? '<span class="text-sm text-muted">No jobs yet.</span>' : '' ?></div>
        <?php if ($jobs['failed']): ?><ul class="divide-y divide-line border-t border-line"><?php foreach ($jobs['failed'] as $j): ?><li class="px-5 py-3 text-sm"><b><?= e($j['type']) ?></b> <span class="text-muted">— <?= e(mb_substr((string)$j['lastError'], 0, 160)) ?></span></li><?php endforeach; ?></ul><?php endif; ?>
        <?= card(ob_get_clean(), '', 'Background jobs', 'Emails, reminders and automations run through a database-backed queue, processed on each page visit or by an optional cPanel cron job.') ?>
        <?php ob_start(); ?><div class="flex flex-wrap items-center gap-4 px-5 pb-5">
          <p class="min-w-0 flex-1 basis-72 text-sm text-muted"><?= $demoLoaded
              ? 'A fictional studio (clients, projects, invoices and videos) is loaded so you can explore. Remove it before you start using the site for real — every sample row, file link and sign-in is deleted; your own data is never touched.'
              : ($demoCanLoad ? 'Want to look around first? Add a fictional studio with clients, projects, invoices and review videos. You can remove it again with one click.' : 'Sample data can only be added to a site that has no clients, projects or invoices yet.') ?></p>
          <?= $demoLoaded
              ? ($isSuper ? ui_action('/api/admin/demo/clear', 'Remove demo data', ['variant' => 'danger', 'icon' => 'trash', 'success' => 'Demo data removed', 'confirm' => ['title' => 'Remove all demo data?', 'description' => 'Sample clients, projects, invoices, files and sample sign-ins will be deleted for good. Anything you created yourself is kept.', 'confirmLabel' => 'Remove demo data', 'tone' => 'danger']]) : '<span class="text-xs text-subtle">Only a Super Admin can remove it.</span>')
              : ($demoCanLoad ? ui_action('/api/admin/demo/load', 'Load sample data', ['variant' => 'outline', 'icon' => 'sparkles', 'success' => 'Sample data loaded']) : '') ?></div>
        <?= card(ob_get_clean(), '', 'Sample data', $demoLoaded ? 'Loaded' : null) ?>
      </div>
    <?php endif; ?>
  </div>
</div>
