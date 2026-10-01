<?php defined('FEP') or exit; /** Vars: $clients, $services, $types, $templates, $staff, $business, $defaultClient, $actor */
$clientOpts = array_map(fn($c) => ['value' => $c['id'], 'label' => $c['companyName'] . ' — ' . $c['name']], $clients);
array_unshift($clientOpts, ['value' => '', 'label' => 'Choose a client…']);
$cur = array_map(fn($c) => ['value' => $c, 'label' => $c], $business['currencies']);
?>
<?= back_link('/admin/projects', 'Projects') ?>
<?= ui_page_header('New project', 'Create a project for an existing client. To start from an inquiry, convert the lead instead.') ?>
<form novalidate data-fe-form="/api/projects" data-redirect="/admin/projects/@id" data-success="Project created" class="grid max-w-4xl grid-cols-1 gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-soft sm:grid-cols-2">
  <?= form_error_slot() ?>
  <?= field_select('clientId', 'Client', $clientOpts, $defaultClient ?? '', ['required' => true, 'class' => 'sm:col-span-2']) ?>
  <?= field_input('name', 'Project name', '', ['required' => true, 'placeholder' => 'e.g. Autumn campaign — 6 shorts', 'class' => 'sm:col-span-2', 'attrs' => ['data-trim' => true]]) ?>
  <?= field_textarea('description', 'Description', '', ['rows' => 3, 'class' => 'sm:col-span-2']) ?>
  <?= field_select('serviceId', 'Service', select_options($services, 'id', 'label', '—'), '') ?>
  <?= field_select('projectTypeKey', 'Project type', select_options($types, 'id', 'label', '—'), '', ['hint' => 'Drives the brief questions.']) ?>
  <?= field_select('templateId', 'Template', select_options($templates, 'id', 'label', 'None'), '', ['hint' => 'Pre-fills tasks and deliverables.']) ?>
  <?= field_select('managerId', 'Project manager', select_options(array_map(fn($s) => ['id' => $s['id'], 'label' => $s['name']], $staff), 'id', 'label', 'None'), $actor->userId) ?>
  <?= field_select('priority', 'Priority', enum_options('PRIORITY'), 'NORMAL', ['optional' => false]) ?>
  <?= field_input('deadline', 'Deadline', '', ['type' => 'date']) ?>
  <?= field_select('currency', 'Currency', $cur, $business['defaultCurrency'], ['optional' => false]) ?>
  <?= field_input('revisionLimit', 'Included revision rounds', '', ['type' => 'number', 'min' => 0, 'max' => 20, 'hint' => 'Leave empty to use the project type default.', 'attrs' => ['data-type' => 'int']]) ?>
  <div class="sm:col-span-2"><?= ui_checkbox('clientVisible', 'Show in the client portal now', false, 'Otherwise the client sees it once a quote is sent.') ?></div>
  <div class="sm:col-span-2"><?= submit_button('Create project', ['size' => 'lg']) ?></div>
</form>
