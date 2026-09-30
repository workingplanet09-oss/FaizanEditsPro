<?php ob_start(); ?>
<div data-fe-component="forgot">
  <form novalidate data-fe-form="/api/auth/forgot-password" data-on-success="forgotSent" class="space-y-4">
    <?= form_error_slot() ?>
    <?= field_input('email', 'Email', '', ['type' => 'email', 'required' => true, 'autocomplete' => 'username', 'attrs' => ['autofocus' => true, 'data-trim' => true]]) ?>
    <?= submit_button('Send reset link') ?>
  </form>
  <div data-forgot-sent hidden role="status" class="text-center">
    <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success"><?= icon('mail', 24) ?></span>
    <p class="mt-4 text-sm text-muted">If an account exists for <b class="text-fg" data-sent-email></b>, we've sent a reset link. It expires in one hour.</p>
  </div>
</div>
<?php $bodyHtml = ob_get_clean(); ?>
<?= auth_card('Reset your password', "Enter your email and we'll send you a link to choose a new one.", $bodyHtml, '<a href="/login" class="font-bold text-fg hover:text-accent-text">Back to sign in</a>') ?>
