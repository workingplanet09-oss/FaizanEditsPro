<?php defined('FEP') or exit; /** Var: $props (wizard configuration — see assets/js/wizard.js) */ ?>
<noscript><h1 class="display-sm mx-auto mb-4 max-w-xl text-center">Discuss your project</h1><p class="mx-auto max-w-xl rounded-[var(--radius-card)] bg-warning-soft p-6 text-center text-base font-medium text-warning">The project form needs JavaScript. Please enable it, or <a class="underline" href="/contact">send me a message</a> instead.</p></noscript>
<div data-fe-component="wizard" data-props="<?= json_attr($props) ?>"></div>
