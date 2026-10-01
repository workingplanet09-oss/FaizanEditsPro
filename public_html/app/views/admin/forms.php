<?php /** Vars: $form, $forms, $categories, $section */ ?>
<?= ui_page_header('Project form builder', 'Edit the questions visitors answer when they start a project, and the brief clients fill after payment. Everything is stored in the database — no code changes needed.') ?>
<div data-fe-component="form-builder" data-props="<?= json_attr(['form' => $form, 'forms' => $forms, 'categories' => $categories, 'activeSection' => $section]) ?>" class="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]"></div>
