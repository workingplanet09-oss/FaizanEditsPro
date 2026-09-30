<?php /** Vars: $tab, $tasks, $staff, $canWrite, $projects, $openNew, $actor */ ?>
<?= ui_page_header('My tasks', 'Tasks assigned to you across your projects.') ?>
<?= ui_tabs([['open', 'Open'], ['today', 'Due today'], ['overdue', 'Overdue'], ['done', 'Completed']], $tab, '/editor/tasks') ?>
<?= tasks_panel($tasks, ['staff' => $staff, 'canWrite' => $canWrite, 'showProject' => true, 'meId' => $actor->userId, 'projects' => $projects, 'openNew' => $openNew, 'title' => $tab === 'done' ? 'Completed tasks' : 'Tasks', 'base' => '/editor']) ?>
