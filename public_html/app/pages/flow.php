<?php
/** /start-project — the public "Start a project" wizard (a distraction-free flow page). */
defined('FEP') or exit;

page('/start-project', function (Ctx $c) {
    $q = $c->query;
    $form = get_form_def(workspace_id(), 'inquiry');
    if (!$form) {
        Pages::error(503, 'Setup', 'settings', "The project form isn't set up yet", 'Import database.sql to create the default questions, or build your own under Admin → Forms.', [['Contact us instead', '/contact', true]]);
    }
    $actor = actor();
    $prefill = inquiry_prefill($actor);
    $service = preg_match('/^[a-z0-9-]{1,100}$/', (string)($q['service'] ?? '')) ? $q['service'] : null;
    $defaults = app_data('site-defaults')['SERVICE_TO_LOOKING_FOR'];
    $looking = preg_match('/^[a-z_]{1,40}$/', (string)($q['looking_for'] ?? '')) ? $q['looking_for'] : ($service ? ($defaults[$service] ?? null) : null);
    $answers = (array)$prefill['answers'] + ($looking ? ['looking_for' => $looking] : []);
    if ($looking) {
        $answers['looking_for'] = $looking;
    }
    $plan = isset($q['plan']) && is_string($q['plan']) ? mb_substr($q['plan'], 0, 80) : null;
    render_page('flow', 'site/start-project', [
        'props' => [
            'mode' => 'inquiry', 'form' => $form, 'answers' => (object)$answers, 'skipSections' => $prefill['skipContact'] ? ['contact'] : [], 'storageKey' => 'fe-inquiry-draft',
            'exitHref' => $actor ? home_for_roles($actor->roleKeys, $actor->permissions) : '/', 'uploads' => ['purpose' => 'lead_reference'], 'previousProjects' => $prefill['previousProjects'], 'previousUrl' => '/api/leads/previous?projectId=',
            'draftUrl' => '/api/forms/inquiry/draft', 'serviceSlug' => $service, 'plan' => $plan, 'signedIn' => (bool)$actor, 'portalHref' => $actor ? home_for_roles($actor->roleKeys, $actor->permissions) : '/',
            'turnstileSiteKey' => turnstile_enabled() ? cfg('turnstile.site_key') : null,
        ],
        'scripts' => ['js/site.js', 'js/conditions.js', 'js/uploader.js', 'js/wizard.js'],
    ], ['title' => 'Start a project', 'description' => 'Tell us about your video — it takes a few minutes and every answer is saved as you go.', 'path' => '/start-project']);
});
