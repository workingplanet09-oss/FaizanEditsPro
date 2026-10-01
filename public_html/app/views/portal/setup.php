<?php defined('FEP') or exit; /** Vars: $props, $project */ ?>
<div class="mx-auto max-w-3xl">
  <div class="mb-6"><a href="/dashboard/projects/<?= e($props['projectId']) ?>" class="text-sm font-semibold text-muted hover:text-fg">← <?= e($project['name']) ?></a></div>
  <div data-fe-component="wizard" data-props="<?= json_attr($props) ?>"></div>
</div>
