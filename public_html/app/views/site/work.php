<?= page_hero('Work', "A look at what we've made.", 'Real projects, real deliverables. Open any project for the video and, where available, the full case study.') ?>
<?= sec_open() ?>
  <?= $items ? work_grid($items, $categories) : ui_empty('Portfolio coming soon', "We're curating our best projects. In the meantime, tell us about yours and we'll show you relevant examples on a call.", 'film', ui_link('/start-project', 'Start a project')) ?>
<?= sec_close() ?>
