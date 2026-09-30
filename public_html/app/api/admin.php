<?php
/** /api/admin/* — analytics, audit log, automations, CMS, exports, form builder, jobs, referrals, settings, team. */
defined('FEP') or exit;

$pageQ = fn() => V::coerceNum()->optional();

api('GET', '/api/admin/analytics', function (Ctx $c) {
    $a = $c->actor;
    return [
        'report' => analytics_report($a, $c->query),
        'workload' => team_workload($a),
        'profitability' => $a->can('profitability:read') ? profitability($a) : null,
    ];
}, ['query' => V::obj(['from' => V::date()->optional(), 'to' => V::date()->optional()])]);

api('GET', '/api/admin/audit-log', fn(Ctx $c) => list_audit_log($c->actor, $c->query), ['query' => V::obj([
    'q' => V::str()->optional(), 'entityType' => V::str()->optional(), 'actorId' => V::str()->optional(), 'action' => V::str()->optional(), 'page' => $pageQ(), 'pageSize' => $pageQ(),
])]);

// ── automations ──
function automation_body_schema(): V
{
    return V::obj([
        'name' => V::str()->trim()->min(1)->max(120), 'description' => V::str()->max(500)->nullish(), 'event' => V::str()->max(60), 'enabled' => V::bool()->optional(), 'conditions' => V::any()->nullish(),
        'actions' => V::arr(V::obj([
            'type' => V::enum(['EMAIL', 'NOTIFICATION', 'STATUS_UPDATE', 'CREATE_TASK', 'ADMIN_ALERT', 'CLIENT_REMINDER']), 'config' => V::rec(V::any()), 'delayMinutes' => V::num()->int()->min(0)->optional(),
        ]))->min(1)->max(10),
    ]);
}
api('GET', '/api/admin/automations', fn(Ctx $c) => list_automations($c->actor));
api('POST', '/api/admin/automations', fn(Ctx $c) => save_automation($c->actor, null, $c->body), ['body' => automation_body_schema(), 'status' => 201]);
api('GET', '/api/admin/automations/{id}', fn(Ctx $c) => get_automation($c->actor, $c->params['id']));
api('PUT', '/api/admin/automations/{id}', fn(Ctx $c) => save_automation($c->actor, $c->params['id'], $c->body), ['body' => automation_body_schema()]);
api('DELETE', '/api/admin/automations/{id}', fn(Ctx $c) => delete_automation($c->actor, $c->params['id']));
api('POST', '/api/admin/automations/{id}/toggle', fn(Ctx $c) => toggle_automation($c->actor, $c->params['id'], $c->body['enabled']), ['body' => V::obj(['enabled' => V::bool()])]);

// ── CMS ──
api('GET', '/api/admin/cms/{resource}', fn(Ctx $c) => cms_list($c->actor, $c->params['resource'], $c->query), ['query' => V::obj(['q' => V::str()->optional(), 'page' => $pageQ(), 'pageSize' => $pageQ()])]);
api('POST', '/api/admin/cms/{resource}', fn(Ctx $c) => cms_create($c->actor, $c->params['resource'], $c->body), ['body' => V::rec(V::any()), 'status' => 201]);
api('POST', '/api/admin/cms/{resource}/reorder', fn(Ctx $c) => cms_reorder($c->actor, $c->params['resource'], $c->body['ids']), ['body' => V::obj(['ids' => V::arr(V::str())->min(1)->max(500)])]);
api('GET', '/api/admin/cms/{resource}/{id}', fn(Ctx $c) => cms_get($c->actor, $c->params['resource'], $c->params['id']));
api('PATCH', '/api/admin/cms/{resource}/{id}', fn(Ctx $c) => cms_update($c->actor, $c->params['resource'], $c->params['id'], $c->body), ['body' => V::rec(V::any())]);
api('DELETE', '/api/admin/cms/{resource}/{id}', fn(Ctx $c) => cms_delete($c->actor, $c->params['resource'], $c->params['id']));
api('POST', '/api/admin/cms/{resource}/{id}/duplicate', fn(Ctx $c) => cms_duplicate($c->actor, $c->params['resource'], $c->params['id']), ['status' => 201]);

api('GET', '/api/admin/emails', fn(Ctx $c) => list_emails($c->actor, $c->query), ['query' => V::obj(['q' => V::str()->optional(), 'status' => V::str()->optional(), 'page' => $pageQ()])]);

/** CSV / Excel-compatible CSV downloads for leads, clients, projects, invoices, payments, testimonials and reports. */
api('GET', '/api/admin/exports/{key}', function (Ctx $c) {
    $q = $c->query;
    $r = run_export($c->actor, $c->params['key'], ['from' => $q['from'] ?? null, 'to' => $q['to'] ?? null], ($q['excel'] ?? '1') !== '0');
    return new RawResponse(function () use ($r) {
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: ' . content_disposition($r['filename']));
        header('Cache-Control: no-store');
        echo $r['csv'];
    });
}, ['query' => V::obj(['from' => V::date()->optional(), 'to' => V::date()->optional(), 'excel' => V::str()->optional()]), 'rate' => ['export', 30, 600, 'user']]);

// ── form builder ──
function question_body_schema(bool $partial): V
{
    $cond = V::obj(['field' => V::str()->max(60), 'op' => V::enum(['eq', 'neq', 'in', 'nin', 'contains', 'not_contains', 'exists', 'empty', 'gt', 'lt', 'truthy']), 'value' => V::any()->nullish()]);
    $logic = V::obj(['all' => V::arr($cond)->max(10)->optional(), 'any' => V::arr($cond)->max(10)->optional()])->nullish();
    $types = ['TEXT', 'TEXTAREA', 'SELECT', 'MULTI_SELECT', 'RADIO', 'CHECKBOX', 'DATE', 'TIME', 'NUMBER', 'CURRENCY', 'FILE', 'URL', 'EMAIL', 'PHONE', 'COLOR', 'RATING'];
    $shape = [
        'formKey' => V::str()->max(40), 'sectionKey' => V::str()->max(40),
        'key' => V::str()->trim()->regex('/^[a-z][a-z0-9_]{1,50}$/'), 'text' => V::str()->trim()->min(3)->max(300), 'helpText' => V::str()->max(500)->nullish(), 'placeholder' => V::str()->max(200)->nullish(),
        'type' => V::enum($types), 'required' => V::bool()->optional(), 'categoryKeys' => V::arr(V::str()->max(40))->max(20)->optional(), 'conditionalLogic' => $logic,
        'meta' => V::rec(V::any())->nullish(), 'active' => V::bool()->optional(),
        'options' => V::arr(V::obj([
            'label' => V::str()->trim()->min(1)->max(120), 'value' => V::str()->trim()->min(1)->max(80), 'categoryKeys' => V::arr(V::str()->max(40))->max(10)->optional(),
            'icon' => V::str()->max(30)->nullish(), 'description' => V::str()->max(200)->nullish(),
        ]))->max(60)->optional(),
    ];
    if ($partial) {
        $shape = array_map(fn(V $r) => $r->optional(), $shape);
    }
    return V::obj($shape);
}
api('GET', '/api/admin/forms/{form}', fn(Ctx $c) => admin_overview($c->actor, $c->params['form']));
api('POST', '/api/admin/forms/questions', fn(Ctx $c) => create_question($c->actor, $c->body), ['body' => question_body_schema(false), 'status' => 201]);
api('POST', '/api/admin/forms/questions/reorder', fn(Ctx $c) => reorder_questions($c->actor, $c->body['ids']), ['body' => V::obj(['ids' => V::arr(V::str())->min(1)->max(300)])]);
api('PATCH', '/api/admin/forms/questions/{id}', fn(Ctx $c) => update_question($c->actor, $c->params['id'], $c->body), ['body' => question_body_schema(true)]);
api('DELETE', '/api/admin/forms/questions/{id}', fn(Ctx $c) => delete_question($c->actor, $c->params['id']));
api('POST', '/api/admin/forms/questions/{id}/duplicate', fn(Ctx $c) => duplicate_question($c->actor, $c->params['id']), ['status' => 201]);

api('GET', '/api/admin/jobs', fn(Ctx $c) => job_stats($c->actor));
api('POST', '/api/admin/jobs', fn(Ctx $c) => retry_failed_jobs($c->actor));

api('GET', '/api/admin/referrals', fn(Ctx $c) => list_referrals($c->actor));
api('PATCH', '/api/admin/referrals', fn(Ctx $c) => update_referral($c->actor, $c->body['id'], array_intersect_key($c->body, ['status' => 1, 'reward' => 1])), [
    'body' => V::obj(['id' => V::str(), 'status' => V::enum(['PENDING', 'QUALIFIED', 'REWARDED', 'EXPIRED'])->optional(), 'reward' => V::str()->max(200)->optional()]),
]);

// ── settings ──
/** All settings groups + which integrations are wired up (never their secrets). */
api('GET', '/api/admin/settings', function (Ctx $c) {
    assert_can($c->actor, 'settings:manage');
    return ['settings' => get_all_settings($c->actor->workspaceId), 'integrations' => integration_status()];
});
api('GET', '/api/admin/settings/{key}', function (Ctx $c) {
    assert_can($c->actor, 'settings:manage');
    if (!setting_schema($c->params['key'])) {
        throw new AppError('NOT_FOUND', 'Unknown settings group.');
    }
    return get_setting($c->actor->workspaceId, $c->params['key']);
});
api('PUT', '/api/admin/settings/{key}', function (Ctx $c) {
    assert_can($c->actor, 'settings:manage');
    $key = $c->params['key'];
    $schema = setting_schema($key);
    if (!$schema) {
        throw new AppError('NOT_FOUND', 'Unknown settings group.');
    }
    $value = setting_normalize($key, $schema->parse($c->req->json()));
    save_setting($c->actor, $key, $value);
    return $value;
});

// ── team ──
api('GET', '/api/admin/team', fn(Ctx $c) => ['members' => list_team($c->actor), 'roles' => list_roles($c->actor)]);
api('POST', '/api/admin/team', fn(Ctx $c) => invite_team_member($c->actor, $c->body), ['status' => 201, 'body' => V::obj([
    'name' => V::str()->trim()->min(2)->max(100), 'email' => V::str()->email()->max(200), 'roleKeys' => V::arr(V::str())->min(1)->max(4), 'hourlyCost' => V::num()->int()->min(0)->nullish(),
])]);
api('PATCH', '/api/admin/team/{id}', fn(Ctx $c) => update_team_member($c->actor, $c->params['id'], $c->body), ['body' => V::obj([
    'name' => V::str()->trim()->min(2)->max(100)->optional(), 'roleKeys' => V::arr(V::str())->min(1)->max(4)->optional(), 'suspended' => V::bool()->optional(), 'hourlyCost' => V::num()->int()->min(0)->nullish(),
])]);
