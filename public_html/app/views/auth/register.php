<?php /** Vars: $ref */ ?>
<?php ob_start(); ?>
<form novalidate data-fe-form="/api/auth/register" data-redirect="@redirect" data-prepare="registerPrep" data-props="<?= json_attr(['ref' => $ref]) ?>" class="space-y-4">
  <?= form_error_slot() ?>
  <?= field_input('name', 'Full name', '', ['required' => true, 'autocomplete' => 'name', 'attrs' => ['autofocus' => true]]) ?>
  <?= field_input('email', 'Email', '', ['type' => 'email', 'required' => true, 'autocomplete' => 'email', 'inputmode' => 'email', 'placeholder' => 'you@company.com']) ?>
  <?= field_input('company', 'Company or channel', '', ['autocomplete' => 'organization']) ?>
  <?= field_input('password', 'Password', '', ['type' => 'password', 'required' => true, 'autocomplete' => 'new-password', 'hint' => 'At least 10 characters.']) ?>
  <?= honeypot() ?>
  <?= submit_button('Create account') ?>
  <p class="text-center text-xs text-subtle">We'll email a link to confirm your address. Your projects appear once it's confirmed.</p>
</form>
<?php $bodyHtml = ob_get_clean(); ?>
<?= auth_card('Create your account', 'Track projects, review drafts and approve videos — all in one place.', $bodyHtml, 'Already have an account? <a href="/login" class="font-bold text-fg hover:text-accent-text">Sign in</a>') ?>
