<?php
/** /api/clients, members, leads (Start Project wizard + CRM), contact & booking forms, messages, notifications, search, referrals. */
defined('FEP') or exit;

$pageQ = fn() => V::coerceNum()->optional();

// ── clients ──
$clientStatus = fn() => V::enum(['LEAD', 'PROSPECT', 'ONBOARDING', 'ACTIVE', 'RETAINER', 'INACTIVE', 'ARCHIVED']);
api('GET', '/api/clients', fn(Ctx $c) => list_clients($c->actor, $c->query), ['query' => V::obj([
    'q' => V::str()->optional(), 'status' => V::str()->optional(), 'section' => V::enum(['active', 'inactive', 'retainers', 'prospects'])->optional(), 'sort' => V::str()->optional(), 'page' => $pageQ(), 'pageSize' => $pageQ(),
])]);
/** Quick action: create a client directly (no lead). */
api('POST', '/api/clients', function (Ctx $c) {
    $a = $c->actor;
    assert_can($a, 'clients:write');
    $b = $c->body;
    $email = strtolower($b['email']);
    if (Db::exists('clients', ['workspaceId' => $a->workspaceId, 'email' => $email])) {
        throw new AppError('CONFLICT', 'A client with that email already exists.', ['email' => 'Already exists.']);
    }
    $client = create_client_record(['workspaceId' => $a->workspaceId] + $b + ['email' => $email, 'status' => 'PROSPECT', 'source' => 'manual']);
    audit($a, ['workspaceId' => $a->workspaceId, 'action' => 'client.created', 'entityType' => 'client', 'entityId' => $client['id'], 'message' => "{$a->name} created client {$client['companyName']}"]);
    return $client;
}, ['status' => 201, 'body' => V::obj([
    'name' => V::str()->trim()->min(2)->max(100), 'email' => V::str()->email()->max(200), 'companyName' => V::str()->trim()->min(1)->max(120), 'phone' => V::str()->max(40)->optional(),
    'industry' => V::str()->max(80)->optional(), 'website' => V::str()->url()->max(300)->optional(),
])]);
api('GET', '/api/clients/{id}', function (Ctx $c) {
    $cl = get_client_or_throw($c->actor, $c->params['id']);
    return $cl + ['lifetime' => client_lifetime($cl['id'])];
});
api('PATCH', '/api/clients/{id}', fn(Ctx $c) => update_client($c->actor, $c->params['id'], $c->body), ['body' => V::obj([
    'name' => V::str()->trim()->min(2)->max(100)->optional(), 'email' => V::str()->email()->max(200)->optional(), 'phone' => V::str()->max(40)->nullish(), 'companyName' => V::str()->trim()->min(1)->max(120)->optional(),
    'industry' => V::str()->max(80)->nullish(), 'website' => V::str()->max(300)->nullish(), 'country' => V::str()->max(60)->nullish(), 'timezone' => V::str()->max(60)->nullish(), 'status' => $clientStatus()->optional(),
    'tags' => V::arr(V::str()->max(40))->max(20)->optional(), 'managerId' => V::str()->nullish(), 'socialLinks' => V::rec(V::str()->max(300))->optional(),
])]);
api('PATCH', '/api/clients/{id}/company', fn(Ctx $c) => update_own_company($c->actor, $c->params['id'], $c->body), ['body' => V::obj([
    'name' => V::str()->trim()->min(2)->max(100)->optional(), 'phone' => V::str()->max(40)->nullish(), 'companyName' => V::str()->trim()->min(1)->max(120)->optional(), 'industry' => V::str()->max(80)->nullish(),
    'website' => V::str()->max(300)->nullish(), 'country' => V::str()->max(60)->nullish(), 'timezone' => V::str()->max(60)->nullish(), 'socialLinks' => V::rec(V::str()->max(300))->optional(),
    'billingEmail' => V::str()->email()->max(200)->nullish(), 'billingAddress' => V::str()->max(500)->nullish(), 'taxId' => V::str()->max(60)->nullish(),
])]);
api('PATCH', '/api/clients/{id}/profile', fn(Ctx $c) => update_client_profile($c->actor, $c->params['id'], $c->body), ['body' => V::obj([
    'brandSummary' => V::str()->max(2000)->nullish(), 'editingPreferences' => V::str()->max(2000)->nullish(), 'preferredContact' => V::str()->max(60)->nullish(), 'communicationPrefs' => V::rec(V::any())->optional(),
])]);
api('GET', '/api/clients/{id}/checklist', fn(Ctx $c) => onboarding_checklist($c->actor, $c->params['id']));
api('POST', '/api/clients/{id}/invite', function (Ctx $c) {
    assert_can($c->actor, 'clients:write');
    return invite_client_user($c->actor, $c->params['id']);
});
api('GET', '/api/clients/{id}/brand-kit', function (Ctx $c) {
    $kit = get_brand_kit($c->actor, $c->params['id']);
    $ids = array_values(array_filter(array_merge([$kit['logoAssetId'], $kit['guidelinesAssetId'], $kit['introAssetId'], $kit['outroAssetId'], $kit['watermarkAssetId']], $kit['altLogoAssetIds'] ?? [], $kit['lowerThirdAssetIds'] ?? [])));
    $assets = [];
    if ($ids) {
        [$ph, $pp] = Db::in($ids);
        foreach (Db::rows("SELECT `id`, `displayName`, `mimeType`, `storageKey` FROM `assets` WHERE `id` IN {$ph} AND `clientId` = ? AND `deletedAt` IS NULL", [...$pp, $c->params['id']]) as $a) {
            $assets[] = ['id' => $a['id'], 'name' => $a['displayName'], 'mimeType' => $a['mimeType'], 'url' => storage()->downloadUrl($a['storageKey'], ['inline' => str_starts_with($a['mimeType'], 'image/') && $a['mimeType'] !== 'image/svg+xml', 'filename' => $a['displayName'], 'contentType' => $a['mimeType']])];
        }
    }
    return ['kit' => $kit, 'assets' => $assets];
});
api('PUT', '/api/clients/{id}/brand-kit', fn(Ctx $c) => save_brand_kit($c->actor, $c->params['id'], $c->body), ['body' => V::obj([
    'logoAssetId' => V::str()->nullish(), 'altLogoAssetIds' => V::arr(V::str())->max(10)->optional(),
    'colors' => V::arr(V::obj(['name' => V::str()->max(40), 'hex' => V::str()->regex('/^#?[0-9a-fA-F]{3,8}$/')]))->max(12)->optional(),
    'fonts' => V::arr(V::obj(['name' => V::str()->max(60), 'usage' => V::str()->max(60)->optional()]))->max(8)->optional(), 'typographyRules' => V::str()->max(2000)->nullish(),
    'guidelinesAssetId' => V::str()->nullish(), 'introAssetId' => V::str()->nullish(), 'outroAssetId' => V::str()->nullish(), 'watermarkAssetId' => V::str()->nullish(),
    'lowerThirdAssetIds' => V::arr(V::str())->max(10)->optional(), 'musicPreference' => V::str()->max(500)->nullish(), 'socialHandles' => V::rec(V::str()->max(120))->optional(), 'websiteUrl' => V::str()->max(300)->nullish(),
])]);

// ── organisation members ──
$orgRole = fn() => V::enum(['OWNER', 'MANAGER', 'ASSISTANT', 'BILLING', 'MEMBER']);
api('GET', '/api/organizations/{id}/members', fn(Ctx $c) => list_members($c->actor, $c->params['id']));
api('POST', '/api/organizations/{id}/members', fn(Ctx $c) => add_member($c->actor, ['organizationId' => $c->params['id']] + $c->body), ['status' => 201, 'body' => V::obj([
    'name' => V::str()->trim()->min(2)->max(100), 'email' => V::str()->email()->max(200), 'role' => $orgRole(), 'title' => V::str()->max(80)->optional(),
])]);
api('PATCH', '/api/members/{id}', fn(Ctx $c) => update_member($c->actor, $c->params['id'], $c->body), ['body' => V::obj(['role' => $orgRole()->optional(), 'title' => V::str()->max(80)->optional()])]);
api('DELETE', '/api/members/{id}', fn(Ctx $c) => remove_member($c->actor, $c->params['id']));

// ── leads (the Start Project wizard is public) ──
/** POST /api/leads — the Start Project wizard. Public (anti-spam + rate limited); signed-in clients skip contact details. */
api_public('POST', '/api/leads', function (Ctx $c) {
    $b = $c->body;
    assert_not_spam(['hp' => $b['hp'] ?? null, 't' => $b['t'] ?? null, 'turnstile' => $b['turnstile'] ?? null], $c->ip, ['minMs' => 4000]);
    return submit_inquiry([
        'answers' => $b['answers'], 'serviceSlug' => $b['serviceSlug'] ?? null, 'draftToken' => $b['draftToken'] ?? null, 'utm' => $b['utm'] ?? null, 'referrer' => $b['referrer'] ?? null,
        'referralCode' => $b['referralCode'] ?? null, 'ip' => $c->ip, 'actor' => $c->actor,
    ]);
}, ['status' => 201, 'body' => V::obj([
    'answers' => V::rec(V::any()), 'serviceSlug' => V::str()->max(100)->nullish(), 'draftToken' => V::str()->max(80)->nullish(),
    'utm' => V::obj(['source' => V::str()->max(120)->optional(), 'medium' => V::str()->max(120)->optional(), 'campaign' => V::str()->max(120)->optional(), 'term' => V::str()->max(120)->optional(), 'content' => V::str()->max(120)->optional()])->optional(),
    'referrer' => V::str()->max(400)->nullish(), 'referralCode' => V::str()->max(24)->nullish(), 'hp' => V::str()->optional(), 't' => V::num()->optional(), 'turnstile' => V::str()->optional(),
])]);
/** GET /api/leads — CRM list (staff). */
api('GET', '/api/leads', function (Ctx $c) {
    if (!$c->actor->isStaff) {
        throw new AppError('FORBIDDEN', "You don't have permission to do that.");
    }
    return list_leads($c->actor, $c->query);
}, ['query' => V::obj([
    'q' => V::str()->optional(), 'section' => V::enum(['leads', 'prospects', 'lost', 'converted', 'all'])->optional(), 'status' => V::str()->optional(), 'temperature' => V::str()->optional(), 'source' => V::str()->optional(),
    'assignedTo' => V::str()->optional(), 'sort' => V::str()->optional(), 'page' => $pageQ(), 'pageSize' => $pageQ(),
])]);
/** Answers from an earlier project, so a returning client can start a new request from the same settings. */
api('GET', '/api/leads/previous', fn(Ctx $c) => ['answers' => previous_answers_for_project($c->actor, $c->query['projectId'])], ['query' => V::obj(['projectId' => V::str()->min(1)])]);
api('GET', '/api/leads/{id}', fn(Ctx $c) => get_lead($c->actor, $c->params['id']));
api('PATCH', '/api/leads/{id}', fn(Ctx $c) => update_lead($c->actor, $c->params['id'], $c->body), ['body' => V::obj([
    'status' => V::enum(['NEW', 'CONTACTED', 'CALL_SCHEDULED', 'QUALIFIED', 'QUOTED', 'CONVERTED', 'LOST', 'ARCHIVED'])->optional(), 'assignedToId' => V::str()->nullish(), 'nextFollowUpAt' => V::date()->nullish(),
    'tags' => V::arr(V::str()->max(40))->max(20)->optional(), 'temperatureOverride' => V::enum(['HOT', 'WARM', 'COLD', 'NEEDS_REVIEW'])->nullish(), 'lostReason' => V::str()->max(300)->nullish(),
    'phone' => V::str()->max(40)->nullish(), 'company' => V::str()->max(120)->nullish(),
])]);
api('POST', '/api/leads/{id}/activities', fn(Ctx $c) => add_lead_activity($c->actor, $c->params['id'], $c->body), ['status' => 201, 'body' => V::obj([
    'type' => V::enum(['note', 'email_sent', 'call_made', 'call_scheduled', 'contacted', 'meeting']), 'title' => V::str()->trim()->min(1)->max(200), 'note' => V::str()->max(2000)->optional(), 'nextFollowUpAt' => V::date()->nullish(),
])]);
api('POST', '/api/leads/{id}/archive', fn(Ctx $c) => archive_lead($c->actor, $c->params['id'], $c->body['archive'] ?? true), ['body' => V::obj(['archive' => V::bool()->default(true)])->default(['archive' => true])]);
api('POST', '/api/leads/{id}/convert', fn(Ctx $c) => convert_lead($c->actor, $c->params['id'], $c->body), ['body' => V::obj(['createProject' => V::bool()->optional(), 'invite' => V::bool()->optional(), 'projectName' => V::str()->max(200)->optional()])->default([])]);
api('POST', '/api/leads/{id}/reject', fn(Ctx $c) => reject_lead($c->actor, $c->params['id'], $c->body['reason'] ?? null), ['body' => V::obj(['reason' => V::str()->max(300)->optional()])->default([])]);

// ── contact form, contact submissions, booking, newsletter ──
api_public('POST', '/api/contact', function (Ctx $c) {
    $b = $c->body;
    assert_not_spam(['hp' => $b['hp'] ?? null, 't' => $b['t'] ?? null, 'turnstile' => $b['turnstile'] ?? null], $c->ip, ['minMs' => 2500]);
    unset($b['hp'], $b['t'], $b['turnstile']);
    return submit_contact($b + ['ip' => $c->ip]);
}, ['status' => 201, 'body' => V::obj([
    'name' => V::str()->trim()->min(2)->max(100), 'email' => V::str()->email()->max(200), 'phone' => V::str()->max(40)->optional(), 'company' => V::str()->max(120)->optional(),
    'reason' => V::enum(['GENERAL', 'PROJECT', 'PARTNERSHIP', 'AGENCY', 'CAREER']), 'message' => V::str()->trim()->min(10)->max(4000), 'source' => V::str()->max(120)->optional(),
    'utm' => V::rec(V::str()->max(120))->optional(), 'hp' => V::str()->optional(), 't' => V::num()->optional(), 'turnstile' => V::str()->optional(),
])]);
api('GET', '/api/contact-submissions', fn(Ctx $c) => list_contact_submissions($c->actor, $c->query), ['query' => V::obj(['handled' => V::str()->optional(), 'page' => $pageQ()])]);
api('POST', '/api/contact-submissions/{id}/convert', fn(Ctx $c) => convert_contact_to_lead($c->actor, $c->params['id']));
api('POST', '/api/contact-submissions/{id}/handled', fn(Ctx $c) => mark_contact_handled($c->actor, $c->params['id'], $c->body['handled'] ?? true), ['body' => V::obj(['handled' => V::bool()->default(true)])->default(['handled' => true])]);

$meetingType = fn() => V::enum(['DISCOVERY_CALL', 'PROJECT_CONSULTATION', 'CLIENT_REVIEW_CALL', 'STRATEGY_CALL']);
api_public('POST', '/api/booking', function (Ctx $c) {
    $b = $c->body;
    assert_not_spam(['hp' => $b['hp'] ?? null, 't' => $b['t'] ?? null], $c->ip, ['minMs' => 2000]);
    unset($b['hp'], $b['t']);
    return book_meeting($b + ['ip' => $c->ip]);
}, ['status' => 201, 'body' => V::obj([
    'type' => $meetingType(), 'startsAt' => V::date(), 'name' => V::str()->trim()->min(2)->max(100), 'email' => V::str()->email()->max(200), 'phone' => V::str()->max(40)->optional(),
    'company' => V::str()->max(120)->optional(), 'notes' => V::str()->max(1500)->optional(), 'timezone' => V::str()->max(60)->optional(), 'hp' => V::str()->optional(), 't' => V::num()->optional(),
])]);
api_public('GET', '/api/booking/slots', fn(Ctx $c) => available_slots(['type' => $c->query['type'], 'days' => $c->query['days'] ?? null]), ['query' => V::obj([
    'type' => $meetingType()->default('DISCOVERY_CALL'), 'days' => V::coerceNum()->min(1)->max(60)->optional(),
])]);
api_public('POST', '/api/newsletter', function (Ctx $c) {
    assert_not_spam(['hp' => $c->body['hp'] ?? null], $c->ip);
    return subscribe_newsletter($c->body['email']);
}, ['body' => V::obj(['email' => V::str()->email()->max(200), 'hp' => V::str()->optional()]), 'rate' => ['newsletter', 6, 3600]]);

// ── forms (definitions + wizard drafts) ──
/** Public definition of the inquiry form (questions, options, conditional logic) — served from the database. */
api_public('GET', '/api/forms/{key}', function (Ctx $c) {
    $key = $c->params['key'];
    if ($key !== 'inquiry' && !$c->actor) {
        throw new AppError('UNAUTHENTICATED', 'Please sign in.');
    }
    $form = get_form_def(workspace_id(), $key);
    if (!$form) {
        throw new AppError('NOT_FOUND', 'Form not found.');
    }
    return $form;
});
/** Debounced autosave target for the wizard. Anonymous visitors resume via an unguessable token kept in localStorage. */
api_public('PUT', '/api/forms/{key}/draft', function (Ctx $c) {
    if ($c->params['key'] !== 'inquiry') {
        throw new AppError('FORBIDDEN', 'Not available.');
    }
    rate_limit("draft:{$c->ip}", 240, 600000);
    if (strlen(json_enc($c->body['data'])) > 200000) {
        throw new AppError('BAD_REQUEST', 'That draft is too large.');
    }
    return save_draft(['workspaceId' => workspace_id(), 'token' => $c->body['token'] ?? null, 'userId' => $c->actor->userId ?? null, 'formKey' => $c->params['key'], 'data' => $c->body['data'], 'step' => $c->body['step']]);
}, ['body' => V::obj(['token' => V::str()->max(80)->nullish(), 'data' => V::rec(V::any()), 'step' => V::num()->int()->min(0)->max(50)])]);
api_public('GET', '/api/forms/{key}/draft', function (Ctx $c) {
    if ($c->params['key'] !== 'inquiry') {
        throw new AppError('FORBIDDEN', 'Not available.');
    }
    return ['draft' => get_draft(['token' => $c->query['token'] ?? null, 'userId' => $c->actor->userId ?? null, 'formKey' => $c->params['key']])];
}, ['query' => V::obj(['token' => V::str()->max(80)->optional()])]);

// ── messages ──
$group = fn() => V::enum(['PROJECT_MANAGER', 'EDITOR', 'SUPPORT', 'CLIENT']);
api('GET', '/api/messages', fn(Ctx $c) => list_messages($c->actor, ['projectId' => $c->query['projectId'] ?? null, 'clientId' => $c->query['clientId'] ?? null, 'markRead' => ($c->query['markRead'] ?? null) !== '0']), ['query' => V::obj([
    'projectId' => V::str()->optional(), 'clientId' => V::str()->optional(), 'markRead' => V::str()->optional(),
])]);
api('POST', '/api/messages', fn(Ctx $c) => send_message($c->actor, $c->body), ['status' => 201, 'body' => V::obj([
    'projectId' => V::str()->nullish(), 'clientId' => V::str()->nullish(), 'body' => V::str()->max(5000), 'recipientGroup' => $group()->optional(),
    'mentionUserIds' => V::arr(V::str())->max(10)->optional(), 'attachmentAssetIds' => V::arr(V::str())->max(10)->optional(),
])]);
api('GET', '/api/messages/threads', fn(Ctx $c) => list_threads($c->actor));
api('GET', '/api/messages/unread', fn(Ctx $c) => ['count' => unread_message_count($c->actor)]);

// ── notifications ──
$cat = fn() => V::enum(['PROJECT', 'MESSAGE', 'PAYMENT', 'REVIEW', 'SYSTEM']);
api('GET', '/api/notifications', fn(Ctx $c) => list_notifications($c->actor, ['category' => $c->query['category'] ?? null, 'unreadOnly' => ($c->query['unread'] ?? null) === '1', 'page' => $c->query['page'] ?? null, 'pageSize' => $c->query['pageSize'] ?? null]), ['query' => V::obj([
    'category' => $cat()->optional(), 'unread' => V::str()->optional(), 'page' => $pageQ(), 'pageSize' => $pageQ(),
])]);
api('POST', '/api/notifications/read', fn(Ctx $c) => mark_all_read($c->actor, $c->body['category'] ?? null), ['body' => V::obj(['category' => $cat()->optional()])->default([])]);
api('POST', '/api/notifications/{id}/read', fn(Ctx $c) => mark_read($c->actor, $c->params['id']));
api('GET', '/api/notifications/preferences', fn(Ctx $c) => get_preferences($c->actor));
api('PUT', '/api/notifications/preferences', fn(Ctx $c) => set_preferences($c->actor, $c->body['prefs']), ['body' => V::obj([
    'prefs' => V::arr(V::obj(['category' => V::str(), 'inApp' => V::bool(), 'email' => V::bool()]))->max(10),
])]);

// ── search, referrals, contact-sales misc ──
api('GET', '/api/search', fn(Ctx $c) => ['hits' => global_search($c->actor, $c->query['q'], !empty($c->query['kinds']) ? explode(',', $c->query['kinds']) : null)], [
    'query' => V::obj(['q' => V::str()->max(100), 'kinds' => V::str()->optional()]), 'rate' => ['search', 120, 60, 'user'],
]);
api('GET', '/api/referrals', fn(Ctx $c) => get_my_referrals($c->actor));
