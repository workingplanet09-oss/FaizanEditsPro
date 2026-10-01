<?php defined('FEP') or exit; ?><?= back_link('/admin/clients', 'Clients') ?>
<?= ui_page_header('New client', 'Add someone directly. To convert an inquiry, use the lead page instead — it carries over their answers.') ?>
<form novalidate data-fe-form="/api/clients" data-redirect="/admin/clients/@id" data-success="Client created" class="grid max-w-3xl grid-cols-1 gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-soft sm:grid-cols-2">
  <?= form_error_slot() ?>
  <?= field_input('name', 'Contact name', '', ['required' => true, 'attrs' => ['autofocus' => true, 'data-trim' => true]]) ?>
  <?= field_input('email', 'Email', '', ['required' => true, 'type' => 'email']) ?>
  <?= field_input('companyName', 'Company', '', ['required' => true, 'attrs' => ['data-trim' => true]]) ?>
  <?= field_input('phone', 'Phone') ?>
  <?= field_input('industry', 'Industry') ?>
  <?= field_input('website', 'Website', '', ['type' => 'url', 'placeholder' => 'https://']) ?>
  <div class="sm:col-span-2"><?= submit_button('Create client', ['size' => 'md', 'class' => '']) ?></div>
</form>
