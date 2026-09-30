<?php
/** Clients (companies + their contact), portal helpers, organisation members, brand kit, onboarding checklist. */
defined('FEP') or exit;

/** Escapes a user search term for LIKE and wraps it as %term%. */
function like_pattern(string $q): string
{
    return '%' . addcslashes($q, '%_\\') . '%';
}

function gen_referral_code(): string
{
    return 'FE-' . strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', random_token(5)), 0, 6));
}

function unique_org_slug(string $workspaceId, string $base): string
{
    $root = slugify($base) ?: 'client';
    for ($i = 0; $i < 20; $i++) {
        $slug = $i === 0 ? $root : $root . '-' . ($i + 1);
        if (!Db::exists('organizations', ['workspaceId' => $workspaceId, 'slug' => $slug])) {
            return $slug;
        }
    }
    return $root . '-' . strtolower(substr(preg_replace('/[^a-z0-9]/i', '', random_token(3)), 0, 4));
}

/**
 * Creates the company (organization), client record, profile, brand kit and referral code as one unit.
 * $in: workspaceId, name, email, companyName, phone?, industry?, website?, socialLinks?, country?, timezone?, status?, source?, userId?,
 *      referralCode?, managerId?, tags?, isDemo?
 */
function create_client_record(array $in): array
{
    return Db::tx(function () use ($in) {
        $org = Db::insert('organizations', [
            'workspaceId' => $in['workspaceId'], 'name' => $in['companyName'], 'slug' => unique_org_slug($in['workspaceId'], $in['companyName']),
            'website' => $in['website'] ?? null, 'billingEmail' => $in['email'], 'isDemo' => $in['isDemo'] ?? false,
        ]);
        $code = gen_referral_code();
        for ($i = 0; $i < 5 && Db::exists('clients', ['referralCode' => $code]); $i++) {
            $code = gen_referral_code();
        }
        $client = Db::insert('clients', [
            'workspaceId' => $in['workspaceId'], 'organizationId' => $org['id'], 'userId' => $in['userId'] ?? null, 'name' => $in['name'], 'email' => $in['email'],
            'phone' => $in['phone'] ?? null, 'companyName' => $in['companyName'], 'industry' => $in['industry'] ?? null, 'website' => $in['website'] ?? null,
            'socialLinks' => $in['socialLinks'] ?? null, 'country' => $in['country'] ?? null, 'timezone' => $in['timezone'] ?? null,
            'status' => $in['status'] ?? 'PROSPECT', 'source' => $in['source'] ?? null, 'managerId' => $in['managerId'] ?? null,
            'tags' => $in['tags'] ?? [], 'referralCode' => $code, 'isDemo' => $in['isDemo'] ?? false,
        ]);
        Db::insert('client_profiles', ['clientId' => $client['id']], false);
        Db::insert('client_brand_kits', ['clientId' => $client['id'], 'websiteUrl' => $in['website'] ?? null], false);
        if (!empty($in['userId'])) {
            Db::insert('organization_members', ['organizationId' => $org['id'], 'userId' => $in['userId'], 'role' => 'OWNER', 'title' => 'Owner'], false);
        }
        if (!empty($in['referralCode'])) {
            $referrer = Db::first('clients', ['workspaceId' => $in['workspaceId'], 'referralCode' => strtoupper($in['referralCode'])]);
            if ($referrer) {
                Db::insert('referrals', ['workspaceId' => $in['workspaceId'], 'code' => $referrer['referralCode'], 'referrerClientId' => $referrer['id'], 'referredClientId' => $client['id'], 'status' => 'PENDING'], false);
            }
        }
        return $client + ['organization' => $org];
    });
}

// ───────────────────────────── lists & detail (staff) ─────────────────────────────

/** $q: q?, status?, section? (active|inactive|retainers|prospects), sort? (oldest|name), page?, pageSize? */
function list_clients(Actor $actor, array $q = []): array
{
    assert_can($actor, 'clients:read');
    ['page' => $page, 'pageSize' => $pageSize, 'skip' => $skip, 'take' => $take] = page_args($q);
    [$scope, $sp] = scope_client($actor, 'c');
    $where = [$scope, 'c.`archivedAt` IS NULL'];
    $params = $sp;
    $section = $q['section'] ?? null;
    if (!empty($q['status'])) {
        $where[] = 'c.`status` = ?';
        $params[] = $q['status'];
    }
    $sections = ['active' => ['ACTIVE', 'ONBOARDING'], 'inactive' => ['INACTIVE', 'ARCHIVED'], 'retainers' => ['RETAINER'], 'prospects' => ['LEAD', 'PROSPECT']];
    if ($section && isset($sections[$section])) {
        [$ph, $p] = Db::in($sections[$section]);
        $where[] = "c.`status` IN {$ph}";
        array_push($params, ...$p);
    }
    if (!empty($q['q'])) {
        $like = like_pattern($q['q']);
        $where[] = '(c.`name` LIKE ? OR c.`companyName` LIKE ? OR c.`email` LIKE ?)';
        array_push($params, $like, $like, $like);
    }
    $order = ($q['sort'] ?? '') === 'oldest' ? 'c.`createdAt` ASC' : (($q['sort'] ?? '') === 'name' ? 'c.`companyName` ASC' : 'c.`updatedAt` DESC');
    $w = implode(' AND ', $where);
    $rows = Db::rows(
        "SELECT c.*, mu.`name` AS manager_name,
           (SELECT COUNT(*) FROM `projects` p WHERE p.`clientId` = c.`id`) AS totalProjects,
           (SELECT COUNT(*) FROM `projects` p WHERE p.`clientId` = c.`id` AND p.`status` NOT IN ('DELIVERED','ARCHIVED','CANCELLED')) AS activeProjects
         FROM `clients` c LEFT JOIN `users` mu ON mu.`id` = c.`managerId` WHERE {$w} ORDER BY {$order} LIMIT " . (int)$take . ' OFFSET ' . (int)$skip,
        $params,
    );
    $total = (int)Db::val("SELECT COUNT(*) FROM `clients` c WHERE {$w}", $params);
    $items = array_map(function ($r) {
        $mgr = $r['manager_name'];
        $tp = (int)$r['totalProjects'];
        $ap = (int)$r['activeProjects'];
        unset($r['manager_name'], $r['totalProjects'], $r['activeProjects']);
        return Db::hydrate('clients', $r) + ['manager' => $mgr !== null ? ['name' => $mgr] : null, 'activeProjects' => $ap, 'totalProjects' => $tp];
    }, $rows);
    return paged($items, $total, $page, $pageSize);
}

function get_client_or_throw(Actor $actor, string $id): array
{
    [$scope, $sp] = scope_client($actor, 'c');
    $row = Db::rowRaw("SELECT c.* FROM `clients` c WHERE c.`id` = ? AND {$scope}", [$id, ...$sp]);
    if (!$row) {
        throw not_found('Client');
    }
    $c = Db::hydrate('clients', $row);
    $c['organization'] = Db::first('organizations', ['id' => $c['organizationId']]);
    $c['profile'] = Db::first('client_profiles', ['clientId' => $id]);
    $c['brandKit'] = Db::first('client_brand_kits', ['clientId' => $id]);
    $c['manager'] = $c['managerId'] ? Db::first('users', ['id' => $c['managerId']], ['cols' => ['id', 'name']]) : null;
    $c['user'] = $c['userId'] ? Db::first('users', ['id' => $c['userId']], ['cols' => ['id', 'name', 'email', 'lastLoginAt', 'status']]) : null;
    return $c;
}

/** Per-currency lifetime figures — we never add up amounts of different currencies. */
function client_lifetime(string $clientId): array
{
    $projects = Db::find('projects', ['clientId' => $clientId], ['cols' => ['id', 'status', 'name', 'createdAt', 'currency']]);
    $revenue = [];
    foreach (Db::rows("SELECT `amount`, `currency` FROM `payments` WHERE `clientId` = ? AND `status` = 'SUCCEEDED'", [$clientId]) as $p) {
        $revenue[$p['currency']] = ($revenue[$p['currency']] ?? 0) + (int)$p['amount'];
    }
    $n = count($projects);
    $avg = [];
    if ($n) {
        foreach ($revenue as $cur => $v) {
            $avg[$cur] = (int)round($v / $n);
        }
    }
    usort($projects, fn($a, $b) => ts_ms($b['createdAt']) <=> ts_ms($a['createdAt']));
    $retainer = Db::first('retainers', ['clientId' => $clientId, 'status' => 'ACTIVE'], ['cols' => ['id', 'name', 'monthlyPrice', 'currency', 'renewalDate']]);
    $lastMsg = Db::val('SELECT MAX(`createdAt`) FROM `messages` WHERE `clientId` = ?', [$clientId]);
    return [
        'totalProjects' => $n,
        'activeProjects' => count(array_filter($projects, fn($p) => !in_array($p['status'], ['DELIVERED', 'ARCHIVED', 'CANCELLED'], true))),
        'revenue' => $revenue, 'averageProjectValue' => $avg,
        'lastProject' => $projects ? ['id' => $projects[0]['id'], 'name' => $projects[0]['name'], 'at' => $projects[0]['createdAt']] : null,
        'currentRetainer' => $retainer,
        'lastContact' => $lastMsg ? iso_dt(ts_ms($lastMsg)) : null,
    ];
}

function update_client(Actor $actor, string $id, array $patch): array
{
    assert_can($actor, 'clients:write');
    $before = get_client_or_throw($actor, $id);
    $allowed = ['name', 'email', 'phone', 'companyName', 'industry', 'website', 'country', 'timezone', 'status', 'tags', 'managerId', 'socialLinks', 'lastContactAt'];
    Db::update('clients', ['id' => $id], array_intersect_key($patch, array_flip($allowed)));
    if (!empty($patch['companyName']) && $patch['companyName'] !== $before['organization']['name']) {
        Db::update('organizations', ['id' => $before['organizationId']], ['name' => $patch['companyName']]);
    }
    if (!empty($patch['status']) && $patch['status'] !== $before['status']) {
        audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'client.status_changed', 'entityType' => 'client', 'entityId' => $id, 'message' => "{$actor->name} changed {$before['companyName']} from {$before['status']} to {$patch['status']}"]);
        log_activity($actor, ['workspaceId' => $actor->workspaceId, 'type' => 'client.status_changed', 'message' => "{$actor->name} set client status to {$patch['status']}", 'clientId' => $id]);
    }
    return Db::first('clients', ['id' => $id]);
}

// ───────────────────────────── portal helpers ─────────────────────────────

/** The client record a portal user acts on behalf of (their first / selected organization). */
function primary_client_for(Actor $actor, ?string $organizationId = null): ?array
{
    $orgIds = $organizationId ? [$organizationId] : $actor->orgIds();
    if ($organizationId && !in_array($organizationId, $actor->orgIds(), true) && !$actor->isStaff) {
        throw not_found('Company');
    }
    [$ph, $p] = Db::in($orgIds);
    $row = Db::rowRaw("SELECT * FROM `clients` WHERE `organizationId` IN {$ph} AND `workspaceId` = ? ORDER BY `createdAt` ASC LIMIT 1", [...$p, $actor->workspaceId]);
    if (!$row) {
        return null;
    }
    $c = Db::hydrate('clients', $row);
    $c['organization'] = Db::first('organizations', ['id' => $c['organizationId']]);
    $c['profile'] = Db::first('client_profiles', ['clientId' => $c['id']]);
    $c['brandKit'] = Db::first('client_brand_kits', ['clientId' => $c['id']]);
    return $c;
}

// ───────────────────────────── organization members ─────────────────────────────

function list_members(Actor $actor, string $organizationId): array
{
    assert_org_action($actor, $organizationId, 'view');
    if ($actor->isStaff) {
        assert_can($actor, 'clients:read');
        if (!Db::exists('organizations', ['id' => $organizationId, 'workspaceId' => $actor->workspaceId])) {
            throw not_found('Company');
        }
    }
    $rows = Db::rows('SELECT om.*, u.`id` AS u_id, u.`name` AS u_name, u.`email` AS u_email, u.`status` AS u_status, u.`lastLoginAt` AS u_lastLoginAt, u.`avatarUrl` AS u_avatarUrl FROM `organization_members` om JOIN `users` u ON u.`id` = om.`userId` WHERE om.`organizationId` = ? ORDER BY om.`createdAt` ASC', [$organizationId]);
    return array_map(function ($r) {
        $user = ['id' => $r['u_id'], 'name' => $r['u_name'], 'email' => $r['u_email'], 'status' => $r['u_status'], 'lastLoginAt' => $r['u_lastLoginAt'] ? iso_dt(ts_ms($r['u_lastLoginAt'])) : null, 'avatarUrl' => $r['u_avatarUrl']];
        foreach (['u_id', 'u_name', 'u_email', 'u_status', 'u_lastLoginAt', 'u_avatarUrl'] as $k) {
            unset($r[$k]);
        }
        return Db::hydrate('organization_members', $r) + ['user' => $user];
    }, $rows);
}

function add_member(Actor $actor, array $in): array
{
    assert_org_action($actor, $in['organizationId'], 'manage_members');
    if ($actor->isStaff) {
        assert_can($actor, 'clients:write');
    }
    $org = Db::first('organizations', ['id' => $in['organizationId'], 'workspaceId' => $actor->workspaceId]);
    if (!$org) {
        throw not_found('Company');
    }
    $email = strtolower(trim($in['email']));
    $existing = Db::first('users', ['email' => $email], ['cols' => ['isStaff']]);
    if ($existing && $existing['isStaff']) {
        throw bad_request("That email belongs to a studio team member and can't be added as a client.");
    }
    $inv = invite_user_by_email(['workspaceId' => $actor->workspaceId, 'email' => $email, 'name' => $in['name'], 'kind' => 'client', 'invitedBy' => $actor]);
    Db::upsert('organization_members', ['organizationId' => $in['organizationId'], 'userId' => $inv['userId'], 'role' => $in['role'], 'title' => $in['title'] ?? null], ['role' => $in['role'], 'title' => $in['title'] ?? null]);
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'org.member_added', 'entityType' => 'organization', 'entityId' => $in['organizationId'], 'message' => "{$actor->name} added {$in['name']} ({$in['role']}) to {$org['name']}"]);
    return ['userId' => $inv['userId']];
}

function count_owners(string $organizationId): int
{
    return Db::count('organization_members', ['organizationId' => $organizationId, 'role' => 'OWNER']);
}

function update_member(Actor $actor, string $memberId, array $patch): array
{
    $m = Db::first('organization_members', ['id' => $memberId]);
    if (!$m) {
        throw not_found('Member');
    }
    assert_org_action($actor, $m['organizationId'], 'manage_members');
    if ($m['role'] === 'OWNER' && !empty($patch['role']) && $patch['role'] !== 'OWNER' && count_owners($m['organizationId']) <= 1) {
        throw bad_request('A company needs at least one owner.');
    }
    Db::update('organization_members', ['id' => $memberId], array_intersect_key($patch, array_flip(['role', 'title'])));
    return Db::first('organization_members', ['id' => $memberId]);
}

function remove_member(Actor $actor, string $memberId): array
{
    $m = Db::first('organization_members', ['id' => $memberId]);
    if (!$m) {
        throw not_found('Member');
    }
    assert_org_action($actor, $m['organizationId'], 'manage_members');
    if ($m['role'] === 'OWNER' && count_owners($m['organizationId']) <= 1) {
        throw bad_request('A company needs at least one owner.');
    }
    Db::delete('organization_members', ['id' => $memberId]);
    return ['ok' => true];
}

// ───────────────────────────── brand kit ─────────────────────────────

function scoped_client_row(Actor $actor, string $clientId): array
{
    [$scope, $sp] = scope_client($actor, 'c');
    $row = Db::rowRaw("SELECT c.* FROM `clients` c WHERE c.`id` = ? AND {$scope}", [$clientId, ...$sp]);
    if (!$row) {
        throw not_found('Client');
    }
    return Db::hydrate('clients', $row);
}

function get_brand_kit(Actor $actor, string $clientId): array
{
    scoped_client_row($actor, $clientId);
    return Db::first('client_brand_kits', ['clientId' => $clientId]) ?? Db::insert('client_brand_kits', ['clientId' => $clientId]);
}

/** Files uploaded to the client's brand kit (not tied to any project). */
function list_brand_assets(Actor $actor, string $clientId): array
{
    scoped_client_row($actor, $clientId);
    $rows = Db::find('assets', ['sql' => "`clientId` = ? AND `projectId` IS NULL AND `deletedAt` IS NULL AND `status` = 'READY'", 'params' => [$clientId]], ['order' => '`createdAt` DESC']);
    return array_map(fn($a) => ['id' => $a['id'], 'displayName' => $a['displayName'], 'mimeType' => $a['mimeType'], 'sizeBytes' => (int)$a['sizeBytes'], 'createdAt' => $a['createdAt'], 'hasThumbnail' => (bool)$a['thumbnailKey'], 'status' => 'READY', 'version' => 1, 'folderKey' => null, 'folderName' => null], $rows);
}

function save_brand_kit(Actor $actor, string $clientId, array $patch): array
{
    $c = scoped_client_row($actor, $clientId);
    if ($actor->isStaff) {
        assert_can($actor, 'clients:write');
    } else {
        assert_org_action($actor, $c['organizationId'], 'manage_projects');
    }
    // Any referenced asset must belong to this client (brand assets are uploaded against the client).
    $ids = array_filter([$patch['logoAssetId'] ?? null, $patch['guidelinesAssetId'] ?? null, $patch['introAssetId'] ?? null, $patch['outroAssetId'] ?? null, $patch['watermarkAssetId'] ?? null, ...($patch['altLogoAssetIds'] ?? []), ...($patch['lowerThirdAssetIds'] ?? [])]);
    if ($ids) {
        $unique = array_values(array_unique($ids));
        [$ph, $p] = Db::in($unique);
        $ok = (int)Db::val("SELECT COUNT(*) FROM `assets` WHERE `id` IN {$ph} AND `clientId` = ? AND `projectId` IS NULL AND `deletedAt` IS NULL", [...$p, $clientId]);
        if ($ok !== count($unique)) {
            throw bad_request("One of the selected brand assets doesn't belong to this account.");
        }
    }
    $allowed = ['logoAssetId', 'altLogoAssetIds', 'colors', 'fonts', 'typographyRules', 'guidelinesAssetId', 'introAssetId', 'outroAssetId', 'watermarkAssetId', 'lowerThirdAssetIds', 'musicPreference', 'socialHandles', 'websiteUrl'];
    $data = array_intersect_key($patch, array_flip($allowed));
    $kit = Db::first('client_brand_kits', ['clientId' => $clientId]);
    if ($kit) {
        Db::update('client_brand_kits', ['clientId' => $clientId], $data + ['updatedAt' => db_dt()]);
    } else {
        Db::insert('client_brand_kits', $data + ['clientId' => $clientId], false);
    }
    return Db::first('client_brand_kits', ['clientId' => $clientId]);
}

// ───────────────────────────── onboarding checklist ─────────────────────────────

function onboarding_checklist(Actor $actor, string $clientId): array
{
    $c = get_client_or_throw($actor, $clientId);
    $signed = Db::count('contracts', ['clientId' => $clientId, 'status' => 'SIGNED']);
    $paid = Db::count('payments', ['clientId' => $clientId, 'status' => 'SUCCEEDED']);
    $assets = (int)Db::val("SELECT COUNT(*) FROM `assets` a WHERE (a.`clientId` = ? OR a.`projectId` IN (SELECT `id` FROM `projects` WHERE `clientId` = ?)) AND a.`deletedAt` IS NULL AND a.`status` = 'READY'", [$clientId, $clientId]);
    $briefs = (int)Db::val('SELECT COUNT(*) FROM `project_briefs` b JOIN `projects` p ON p.`id` = b.`projectId` WHERE p.`clientId` = ? AND b.`confirmedAt` IS NOT NULL', [$clientId]);
    $projects = Db::count('projects', ['clientId' => $clientId]);
    $kit = $c['brandKit'];
    $brandDone = $kit && ($kit['logoAssetId'] || (is_array($kit['colors']) && count($kit['colors'])) || (is_array($kit['fonts']) && count($kit['fonts'])));
    $items = [
        ['key' => 'account', 'label' => 'Account created', 'done' => (bool)$c['userId']],
        ['key' => 'contact', 'label' => 'Contact information', 'done' => (bool)($c['name'] && $c['email'] && $c['phone']), 'href' => '/dashboard/profile', 'hint' => 'Add a phone number so we can reach you.'],
        ['key' => 'company', 'label' => 'Company information', 'done' => (bool)($c['companyName'] && ($c['industry'] || $c['website'])), 'href' => '/dashboard/profile', 'hint' => 'Add your industry or website.'],
        ['key' => 'brand', 'label' => 'Brand assets', 'done' => (bool)$brandDone, 'href' => '/dashboard/brand-kit', 'hint' => 'Save your logo, colors and fonts once.'],
        ['key' => 'requirements', 'label' => 'Project requirements', 'done' => $projects > 0 && $briefs > 0, 'href' => '/dashboard/projects'],
        ['key' => 'billing', 'label' => 'Billing information', 'done' => (bool)($c['organization']['billingEmail'] && $c['organization']['billingAddress']), 'href' => '/dashboard/settings', 'hint' => 'Add a billing address.'],
        ['key' => 'contract', 'label' => 'Contract signed', 'done' => $signed > 0, 'href' => '/dashboard/contracts'],
        ['key' => 'payment', 'label' => 'Initial payment received', 'done' => $paid > 0, 'href' => '/dashboard/invoices'],
        ['key' => 'files', 'label' => 'Files uploaded', 'done' => $assets > 0, 'href' => '/dashboard/files'],
        ['key' => 'brief', 'label' => 'Project brief approved', 'done' => $briefs > 0, 'href' => '/dashboard/projects'],
    ];
    $manual = $c['profile']['checklist'] ?? [];
    foreach ($items as &$it) {
        if (!empty($manual[$it['key']])) {
            $it['done'] = true;
        }
    }
    unset($it);
    return ['items' => $items, 'done' => count(array_filter($items, fn($i) => $i['done'])), 'total' => count($items)];
}

function update_client_profile(Actor $actor, string $clientId, array $patch): array
{
    $c = scoped_client_row($actor, $clientId);
    if ($actor->isStaff) {
        assert_can($actor, 'clients:write');
    } else {
        assert_org_action($actor, $c['organizationId'], 'manage_projects');
    }
    $data = array_intersect_key($patch, array_flip(['brandSummary', 'editingPreferences', 'preferredContact', 'communicationPrefs']));
    if (Db::first('client_profiles', ['clientId' => $clientId])) {
        Db::update('client_profiles', ['clientId' => $clientId], $data + ['updatedAt' => db_dt()]);
    } else {
        Db::insert('client_profiles', $data + ['clientId' => $clientId], false);
    }
    return Db::first('client_profiles', ['clientId' => $clientId]);
}

/** Portal user edits their own company / contact details. */
function update_own_company(Actor $actor, string $clientId, array $patch): array
{
    $c = scoped_client_row($actor, $clientId);
    $billing = array_key_exists('billingEmail', $patch) || array_key_exists('billingAddress', $patch) || array_key_exists('taxId', $patch);
    if ($actor->isStaff) {
        assert_can($actor, 'clients:write');
    } else {
        assert_org_action($actor, $c['organizationId'], $billing ? 'billing' : 'manage_projects');
    }
    $clientData = array_intersect_key($patch, array_flip(['name', 'phone', 'companyName', 'industry', 'website', 'country', 'timezone', 'socialLinks']));
    if ($clientData) {
        Db::update('clients', ['id' => $clientId], $clientData);
    }
    $orgData = array_intersect_key($patch, array_flip(['billingEmail', 'billingAddress', 'taxId', 'website']));
    if (!empty($patch['companyName'])) {
        $orgData['name'] = $patch['companyName'];
    }
    if ($orgData) {
        Db::update('organizations', ['id' => $c['organizationId']], $orgData);
    }
    return ['ok' => true];
}

function assert_client_access(Actor $actor, string $organizationId, string $action): void
{
    if (!$actor->isStaff && !in_array($organizationId, $actor->orgIds(), true)) {
        throw not_found();
    }
    assert_org_action($actor, $organizationId, $action);
}
