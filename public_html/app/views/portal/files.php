<?php defined('FEP') or exit; /** Vars: $q, $res */ ?>
<?= ui_page_header('Files', "Everything you've uploaded and every draft and deliverable across your projects. Add files to a specific project from its Files tab.") ?>
<?= card(ui_filter_bar('/dashboard/files', [['name' => 'q', 'label' => 'Search files', 'placeholder' => 'Search by file name…']], ['q' => $q]), 'mb-5 overflow-visible') ?>
<?= file_manager($res['items'], ['showProject' => true]) ?>
<?php if ($res['items']): ?><div class="mt-4"><?= ui_pagination($res['page'], $res['pages'], '/dashboard/files', ['q' => $q], $res['total']) ?></div><?php endif; ?>
