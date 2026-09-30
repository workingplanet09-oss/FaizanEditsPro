<?php /** Vars: $d, $initial, $defaults */ ?>
<?= back_link('/admin/invoices', 'Invoices') ?>
<?= ui_page_header('New invoice', 'For extras, retainers and anything not covered by an accepted quote.') ?>
<?= doc_builder('invoice', $d, $initial, $defaults) ?>
