<?php defined('FEP') or exit; /** Vars: $q, $res, $actor */ ?>
<?= ui_page_header('Files', 'Every uploaded file across projects. Open a project to upload or organise its files.') ?>
<?= card(ui_filter_bar('/admin/files', [['name' => 'q', 'label' => 'Search files', 'placeholder' => 'Search by file name…']], ['q' => $q]), 'mb-5 overflow-visible') ?>
<?= file_manager($res['items'], ['showProject' => true, 'projectBase' => '/admin', 'canUpload' => false, 'canDelete' => $actor->can('files:delete'), 'canShare' => $actor->can('files:write')]) ?>
<?= ui_pagination($res['page'], $res['pages'], '/admin/files', ['q' => $q], $res['total']) ?>
