<?php defined('FEP') or exit; /** Vars: $d, $initial, $defaults */ ?>
<?= back_link('/admin/quotes', 'Quotes') ?>
<?= ui_page_header('New quote', 'Line items, deposit and terms. The client accepts it in their portal, which starts the contract.') ?>
<?= doc_builder('quote', $d, $initial, $defaults) ?>
