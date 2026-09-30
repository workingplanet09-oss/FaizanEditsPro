<?php /** Vars: $area2, $tab, $user, [$prefs, $sessions], $actor */ ?>
<?= ui_page_header('My account', $actor->name . ' · ' . implode(', ', array_map(fn($r) => str_replace('_', ' ', $r), $actor->roleKeys))) ?>
<?= ui_tabs([['profile', 'Profile'], ['notifications', 'Notifications'], ['security', 'Security']], $tab, "/{$area2}/account") ?>
<div class="max-w-4xl">
  <?php if ($tab === 'profile'): ?><?= profile_form($actor->name, $actor->email, (string)($user['phone'] ?? ''), (string)($user['timezone'] ?? '')) ?><?php endif; ?>
  <?php if ($tab === 'notifications'): ?><?= notification_prefs($prefs) ?><?php endif; ?>
  <?php if ($tab === 'security'): ?><?= security_panel($actor->twoFactorEnabled, $sessions) ?><?php endif; ?>
</div>
