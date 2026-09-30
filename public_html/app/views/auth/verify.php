<?php /** Vars: $type, $token */
$label = ['magic' => 'Sign me in', 'verify' => 'Confirm my email', 'invite' => 'Set password & continue', 'reset' => 'Save new password'][$type];
$copy = ['magic' => ['Sign in to your portal', 'Confirm to finish signing in on this device.'], 'verify' => ['Confirm your email', 'One click and your account is verified.'], 'invite' => ['Welcome — set up your account', 'Choose a password to open your client portal.'], 'reset' => ['Choose a new password', "You'll be signed out everywhere else once it's saved."]][$type];
$needsPassword = in_array($type, ['invite', 'reset'], true);
ob_start(); ?>
<form novalidate data-fe-form="/api/auth/token" data-redirect="@redirect" data-prepare="tokenPrep" class="space-y-4">
  <input type="hidden" name="type" value="<?= e($type) ?>"><input type="hidden" name="token" value="<?= e($token) ?>">
  <?= form_error_slot() ?>
  <?php if ($type === 'invite'): ?><?= field_input('name', 'Your name', '', ['autocomplete' => 'name']) ?><?php endif; ?>
  <?php if ($needsPassword): ?>
    <?= field_input('password', 'New password', '', ['type' => 'password', 'required' => true, 'autocomplete' => 'new-password', 'hint' => 'At least 10 characters.', 'attrs' => ['autofocus' => true]]) ?>
    <?= field_input('confirm', 'Confirm password', '', ['type' => 'password', 'required' => true, 'autocomplete' => 'new-password']) ?>
  <?php endif; ?>
  <?= submit_button($label) ?>
</form>
<?php $bodyHtml = ob_get_clean(); ?>
<?= auth_card($copy[0], $copy[1], $bodyHtml) ?>
