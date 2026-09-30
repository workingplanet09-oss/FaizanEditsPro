<?php /** Vars: $tab, $client, $role, $user, members?, prefs?, sessions? */ $a = $actor; ?>
<?= ui_page_header('Settings', 'Your profile, company, team and security.') ?>
<?= ui_tabs([['profile', 'Profile'], ['company', 'Company'], ['team', 'Team'], ['notifications', 'Notifications'], ['security', 'Security']], $tab, '/dashboard/settings') ?>
<div class="max-w-4xl">
  <?php if ($tab === 'profile'): ?><?= profile_form($a->name, $a->email, (string)($user['phone'] ?? ''), (string)($user['timezone'] ?? '')) ?><?php endif; ?>
  <?php if ($tab === 'company' && $client): ?><?= company_form($client['id'], ['companyName' => (string)$client['companyName'], 'industry' => (string)$client['industry'], 'website' => (string)$client['website'], 'country' => (string)$client['country'], 'phone' => (string)$client['phone'],
      'billingEmail' => (string)($client['organization']['billingEmail'] ?? ''), 'billingAddress' => (string)($client['organization']['billingAddress'] ?? ''), 'taxId' => (string)($client['organization']['taxId'] ?? '')], org_role_can($role, 'manage_projects')) ?><?php endif; ?>
  <?php if ($tab === 'team' && $client): ?><?= members_manager($client['organizationId'], $members, org_role_can($role, 'manage_members'), $a->userId) ?><?php endif; ?>
  <?php if ($tab === 'notifications'): ?><?= notification_prefs($prefs) ?><?php endif; ?>
  <?php if ($tab === 'security'): ?><?= security_panel($a->twoFactorEnabled, $sessions) ?><?php endif; ?>
</div>
