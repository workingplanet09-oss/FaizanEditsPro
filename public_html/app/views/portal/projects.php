<?php /** Vars: $tab, $active, $delivered, $all */
$rows = ['delivered' => $delivered, 'all' => $all][$tab] ?? $active;
?>
<?= ui_page_header('Projects', "Every video you've commissioned, from first quote to final delivery.", ui_link('/start-project', 'New project', ['variant' => 'dark', 'icon' => 'plus'])) ?>
<?= ui_tabs([['active', 'Active', count($active)], ['delivered', 'Delivered', count($delivered)], ['all', 'All', count($all)]], $tab, '/dashboard/projects') ?>
<?php if ($rows): ?>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"><?php foreach ($rows as $p): ?><?= project_card($p) ?><?php endforeach; ?></div>
<?php else: ?>
  <?= card(ui_empty($tab === 'delivered' ? 'Nothing delivered yet' : 'No projects here', $tab === 'delivered' ? 'Finished projects and their final files will be kept here.' : 'Start a project and it will appear here with a live progress tracker.', 'film', ui_link('/start-project', 'Start a project'))) ?>
<?php endif; ?>
