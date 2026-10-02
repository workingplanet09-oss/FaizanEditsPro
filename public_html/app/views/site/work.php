<?php defined('FEP') or exit; ?><?= page_hero('Work', 'A look at what I have edited.', 'Open any project for the video and, where available, the full story: the client goal, my editing decisions and the verified results.') ?>
<?= sec_open() ?>
  <?= $items ? work_grid($items, $categories) : ui_empty('Portfolio coming soon', "I am selecting the projects to show here. In the meantime, tell me about yours and I will share relevant examples on a call.", 'film', ui_link('/start-project', 'Discuss your project')) ?>
<?= sec_close() ?>
