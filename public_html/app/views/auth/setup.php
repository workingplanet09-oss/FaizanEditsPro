<?php /** Vars: $secretOk, $canDemo */ ob_start(); ?>
<?php if (!$secretOk): ?>
  <?= ui_notice("Before you continue: open config.php and replace the 'secret' value with a long random text (40 or more characters). It signs your sign-in links and forms. Then reload this page.", 'danger') ?>
<?php endif; ?>
<form novalidate data-fe-form="/api/setup" data-redirect="@redirect" data-success="Your studio is ready" class="space-y-4">
  <?= form_error_slot() ?>
  <?= field_input('studio', 'Studio or company name', '', ['placeholder' => 'e.g. Northlight Video', 'optional' => true, 'attrs' => ['data-trim' => true]]) ?>
  <?= field_input('name', 'Your name', '', ['required' => true, 'autocomplete' => 'name', 'attrs' => ['data-trim' => true]]) ?>
  <?= field_input('email', 'Your email', '', ['type' => 'email', 'required' => true, 'autocomplete' => 'username', 'hint' => "You'll sign in with this.", 'attrs' => ['data-trim' => true]]) ?>
  <?= field_input('password', 'Password', '', ['type' => 'password', 'required' => true, 'autocomplete' => 'new-password', 'hint' => 'At least 10 characters.']) ?>
  <?= field_input('confirm', 'Repeat the password', '', ['type' => 'password', 'required' => true, 'autocomplete' => 'new-password']) ?>
  <?= field_input('code', 'Installation code', '', ['required' => true, 'autocomplete' => 'off', 'hint' => "For safety, enter the first 6 characters of the 'secret' value in your config.php file.", 'attrs' => ['data-trim' => true]]) ?>
  <?= $canDemo ? ui_checkbox('sampleData', 'Also load the sample studio', false, 'Fictional clients, projects and invoices so you can explore. You can remove them later from Settings.') : '' ?>
  <?= submit_button('Create my account', ['attrs' => $secretOk ? [] : ['disabled' => true]]) ?>
</form>
<?php $bodyHtml = ob_get_clean(); ?>
<?= auth_card('Welcome — let’s set up your studio', 'The database is ready. Create the administrator account to finish. This page disappears once you are done.', $bodyHtml) ?>
