<?php /** Var: $next */ ob_start(); ?>
<form novalidate data-fe-form="/api/auth/2fa/verify" data-redirect="@redirect" data-next-param="next" class="space-y-4">
  <?= form_error_slot() ?>
  <?= field_input('code', 'Authentication code', '', ['required' => true, 'autocomplete' => 'one-time-code', 'hint' => '6 digits from your authenticator app, or a recovery code.', 'inputClass' => 'text-center font-mono text-lg tracking-[0.3em]', 'attrs' => ['autofocus' => true, 'data-trim' => true]]) ?>
  <?= submit_button('Verify') ?>
</form>
<?php $bodyHtml = ob_get_clean(); ?>
<?= auth_card('Two-step verification', 'Enter the code from your authenticator app to finish signing in.', $bodyHtml) ?>
