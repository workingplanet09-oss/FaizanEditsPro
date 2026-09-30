<?php /** Vars: $tab, $tasks, $staff, $projects, $openNew, $actor */ ?>
<?= ui_page_header('Tasks', 'Everything the team needs to do, across all projects.') ?>
<?= ui_tabs([['open', 'Open'], ['mine', 'Assigned to me'], ['today', 'Due today'], ['overdue', 'Overdue'], ['done', 'Completed']], $tab, '/admin/tasks') ?>
<?= tasks_panel($tasks, ['staff' => $staff, 'canWrite' => $actor->can('tasks:write'), 'showProject' => true, 'meId' => $actor->userId, 'projects' => $projects, 'openNew' => $openNew, 'title' => $tab === 'done' ? 'Completed tasks' : 'Tasks', 'base' => '/admin']) ?>
