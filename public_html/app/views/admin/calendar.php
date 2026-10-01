<?php defined('FEP') or exit; /** Vars: $view, $date, $tz, $events, $clients, $actor */ ?>
<?= ui_page_header('Calendar', 'Deadlines, calls, project starts, retainer renewals and task due dates in one view.', $actor->can('leads:write') ? schedule_call_modal($clients) : null) ?>
<?= calendar_view($events, $view, $date, '/admin/calendar', $tz) ?>
