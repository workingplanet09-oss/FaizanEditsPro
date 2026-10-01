<?php defined('FEP') or exit; /** Vars: $events, $templates, $rows, $statuses */ ?>
<?= ui_page_header('Automations', 'Reminders, notifications and follow-ups that run themselves. Every run is recorded.') ?>
<div data-fe-component="automation-manager" data-props="<?= json_attr(['automations' => $rows, 'events' => $events, 'templates' => $templates, 'statuses' => $statuses]) ?>"></div>
