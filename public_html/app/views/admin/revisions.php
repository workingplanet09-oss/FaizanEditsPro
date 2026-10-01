<?php defined('FEP') or exit; /** Vars: $base, $tab, $rows, $canManage */ ?>
<?= ui_page_header('Revisions', 'Feedback rounds waiting on an editor, across every project.') ?>
<?= ui_tabs([['open', 'Open'], ['all', 'All']], $tab, "{$base}/revisions") ?>
<?= revisions_board($rows, $base, $canManage) ?>
