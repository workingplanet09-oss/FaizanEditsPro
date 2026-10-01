<?php
/** POST /api/setup — creates the first administrator of a freshly imported site. Only works while no staff account exists. */
defined('FEP') or exit;

api_public('POST', '/api/setup', function (Ctx $c) {
    rate_limit('setup:' . $c->ip, 20, 15 * 60000);
    if (install_state() !== 'needs_admin') {
        throw new AppError('CONFLICT', 'This site is already set up.');
    }
    $b = $c->body;
    $secret = (string)cfg('secret', '');
    if (strlen($secret) < 32 || str_starts_with($secret, 'CHANGE-ME')) {
        throw new AppError('NOT_CONFIGURED', "Set 'secret' in config.php to a long random text (40+ characters) first — it signs your links and forms.");
    }
    if (!safe_equal(strtolower(substr($secret, 0, 6)), strtolower(trim((string)$b['code'])))) {
        throw new AppError('VALIDATION', "That isn't the installation code.", ['code' => "Enter the first 6 characters of 'secret' from config.php."]);
    }
    if ($b['password'] !== $b['confirm']) {
        throw new AppError('VALIDATION', "The passwords don't match.", ['confirm' => "The passwords don't match."]);
    }
    $email = norm_email($b['email']);
    $ws = Db::first('workspaces', null, ['order' => '`createdAt` ASC']);
    $role = Db::first('roles', ['key' => 'super_admin']);
    if (!$ws || !$role) {
        throw new AppError('NOT_CONFIGURED', 'database.sql has not been imported completely. Import it again into an empty database.');
    }
    $demo = !empty($b['sampleData']);
    if ($demo && !demo_can_load()) {
        throw new AppError('CONFLICT', 'The sample data is not available on this site.');
    }
    if (Db::exists('users', ['email' => $email])) {
        throw new AppError('CONFLICT', 'That email address is already used by a sample account. Choose another.', ['email' => 'Already in use.']);
    }
    Db::tx(function () use ($b, $email, $ws, $role) {
        $u = Db::insert('users', ['workspaceId' => $ws['id'], 'email' => $email, 'name' => trim($b['name']), 'passwordHash' => hash_password($b['password']), 'isStaff' => true, 'status' => 'ACTIVE', 'emailVerifiedAt' => now_ms()]);
        Db::insert('user_roles', ['userId' => $u['id'], 'roleId' => $role['id']], false);
        // the studio name shows in the header, footer, emails and invoices
        $biz = get_setting($ws['id'], 'business');
        $name = trim((string)($b['studio'] ?? ''));
        if ($name !== '') {
            $biz['name'] = $name;
            $biz['legalName'] = $name;
        }
        $biz['email'] = $email;
        Db::upsert('settings', ['workspaceId' => $ws['id'], 'key' => 'business', 'value' => $biz, 'updatedById' => $u['id']], ['value' => $biz, 'updatedById' => $u['id'], 'updatedAt' => db_dt()]);
        if ($name !== '') {
            Db::update('workspaces', ['id' => $ws['id']], ['name' => $name]);
        }
        // remember the address the owner is using (they proved ownership with the installation code) so links in emails never depend on a request header
        if (trim((string)cfg('app_url', '')) === '') {
            Db::upsert('settings', ['workspaceId' => $ws['id'], 'key' => 'site', 'value' => ['url' => request_origin()], 'updatedById' => $u['id']], ['value' => ['url' => request_origin()], 'updatedById' => $u['id'], 'updatedAt' => db_dt()]);
        }
        audit(null, ['workspaceId' => $ws['id'], 'action' => 'setup.completed', 'entityType' => 'user', 'entityId' => $u['id'], 'message' => "{$u['name']} completed the first-run setup"]);
        return $u;
    });
    $loaded = 0;
    if ($demo) {
        $loaded = load_demo_data();
    }
    invalidate_settings();
    $user = Db::first('users', ['email' => $email]);
    Sessions::create($user['id']);
    Db::update('users', ['id' => $user['id']], ['lastLoginAt' => db_dt()]);
    return ['redirect' => '/admin/settings', 'sampleRows' => $loaded];
}, ['status' => 201, 'body' => V::obj([
    'studio' => V::str()->max(80)->optional(), 'name' => V::str()->trim()->min(2)->max(100), 'email' => V::str()->email()->max(200), 'password' => V::str()->min(10)->max(200),
    'confirm' => V::str()->max(200), 'code' => V::str()->max(40), 'sampleData' => V::bool()->optional(),
])]);

// ── sample data (Settings → Integrations & system) ──
api('POST', '/api/admin/demo/load', function (Ctx $c) {
    assert_can($c->actor, 'settings:manage');
    $n = load_demo_data();
    audit($c->actor, ['workspaceId' => $c->actor->workspaceId, 'action' => 'demo.loaded', 'entityType' => 'setting', 'entityId' => null, 'message' => "{$c->actor->name} loaded the sample data"]);
    return ['statements' => $n];
});
api('POST', '/api/admin/demo/clear', function (Ctx $c) {
    assert_can($c->actor, 'settings:manage');
    if (!in_array('super_admin', $c->actor->roleKeys, true)) {
        throw forbidden();
    }
    $removed = clear_demo_data();
    if (Db::exists('users', ['id' => $c->actor->userId])) { // a sample administrator removes themselves along with the rest
        audit($c->actor, ['workspaceId' => $c->actor->workspaceId, 'action' => 'demo.cleared', 'entityType' => 'setting', 'entityId' => null, 'message' => "{$c->actor->name} removed the sample data"]);
    }
    return ['removed' => (object)$removed];
});
