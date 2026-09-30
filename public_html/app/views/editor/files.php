<?php /** Vars: $q, $res, $actor */ ?>
<?= ui_page_header('Files', 'Client assets and drafts across your assigned projects. Open a project to upload versions or deliverables.') ?>
<?= card(ui_filter_bar('/editor/files', [['name' => 'q', 'label' => 'Search files', 'placeholder' => 'Search by file name…']], ['q' => $q]), 'mb-5 overflow-visible') ?>
<?= file_manager($res['items'], ['showProject' => true, 'projectBase' => '/editor', 'canUpload' => false, 'canDelete' => $actor->can('files:delete'), 'canShare' => $actor->can('files:write')]) ?>
<?= ui_pagination($res['page'], $res['pages'], '/editor/files', ['q' => $q], $res['total']) ?>
