<?php if (!$client): ?>
  <?= card(ui_empty('No company linked yet', 'Once your account is linked to a company you can save its brand kit here.', 'palette')) ?>
<?php else: ?>
  <?= ui_page_header('Brand kit', 'Save your logo, colours, fonts and style once. Editors see it on every project, so you never send it twice.') ?>
  <?= brand_kit_editor($client['id'], $kit, $assets, $canEdit) ?>
<?php endif; ?>
