<?php
/** Team members and roles (staff). Only a Super Admin can create, change or remove another Super Admin. */
defined('FEP') or exit;

function list_team(Actor $actor): array
{
    assert_can($actor, 'team:manage');
    $users = Db::hydrateAll('users', Db::rows("SELECT * FROM `users` WHERE `workspaceId` = ? AND `isStaff` = 1 ORDER BY `status` ASC, `name` ASC", [$actor->workspaceId]));
    $roles = [];
    foreach (Db::rows('SELECT ur.`userId`, r.`key`, r.`name` FROM `user_roles` ur JOIN `roles` r ON r.`id` = ur.`roleId`') as $r) {
        $roles[$r['userId']][] = ['key' => $r['key'], 'name' => $r['name']];
    }
    $counts = [];
    foreach (Db::rows('SELECT `userId`, COUNT(*) AS n FROM `project_members` GROUP BY `userId`') as $r) {
        $counts[$r['userId']] = (int)$r['n'];
    }
    return array_map(fn($u) => [
        'id' => $u['id'], 'name' => $u['name'], 'email' => $u['email'], 'status' => $u['status'], 'roles' => $roles[$u['id']] ?? [], 'lastLoginAt' => $u['lastLoginAt'],
        'twoFactorEnabled' => $u['twoFactorEnabled'], 'projects' => $counts[$u['id']] ?? 0, 'hourlyCost' => $u['hourlyCost'],
    ], $users);
}

function list_roles(Actor $actor): array
{
    assert_can($actor, 'team:manage');
    $perms = [];
    foreach (Db::rows('SELECT rp.`roleId`, p.`key` FROM `role_permissions` rp JOIN `permissions` p ON p.`id` = rp.`permissionId`') as $r) {
        $perms[$r['roleId']][] = $r['key'];
    }
    return array_map(function ($r) use ($perms) {
        $p = $perms[$r['id']] ?? [];
        sort($p);
        return ['key' => $r['key'], 'name' => $r['name'], 'description' => $r['description'], 'rank' => $r['rank'], 'permissions' => $p];
    }, Db::find('roles', ['isStaff' => true], ['order' => '`rank` DESC']));
}

function assert_can_grant(Actor $actor, array $roleKeys): array
{
    [$ph, $pp] = Db::in($roleKeys);
    $roles = Db::hydrateAll('roles', Db::rows("SELECT * FROM `roles` WHERE `key` IN {$ph} AND `isStaff` = 1", $pp));
    if (count($roles) !== count(array_unique($roleKeys))) {
        throw bad_request('Unknown role.');
    }
    // only a super admin can create another super admin
    if (in_array('super_admin', $roleKeys, true) && !in_array('super_admin', $actor->roleKeys, true)) {
        throw new AppError('FORBIDDEN', 'Only a Super Admin can grant Super Admin.');
    }
    return $roles;
}

/** $in: name, email, roleKeys, hourlyCost? */
function invite_team_member(Actor $actor, array $in): array
{
    assert_can($actor, 'team:manage');
    if (!$in['roleKeys']) {
        throw bad_request('Choose at least one role.');
    }
    assert_can_grant($actor, $in['roleKeys']);
    $email = strtolower(trim($in['email']));
    if (Db::exists('users', ['email' => $email])) {
        throw new AppError('CONFLICT', 'That email already has an account.', ['email' => 'Already in use.']);
    }
    $inv = invite_user_by_email(['workspaceId' => $actor->workspaceId, 'email' => $email, 'name' => trim($in['name']), 'kind' => 'staff', 'roleKeys' => $in['roleKeys'], 'invitedBy' => $actor]);
    if (array_key_exists('hourlyCost', $in) && $in['hourlyCost'] !== null) {
        Db::update('users', ['id' => $inv['userId']], ['hourlyCost' => $in['hourlyCost']]);
    }
    audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'team.invited', 'entityType' => 'user', 'entityId' => $inv['userId'], 'message' => "{$actor->name} invited {$in['name']} as " . implode(', ', $in['roleKeys'])]);
    return $inv;
}

/** $patch: name?, roleKeys?, suspended?, hourlyCost? */
function update_team_member(Actor $actor, string $id, array $patch): array
{
    assert_can($actor, 'team:manage');
    $u = Db::first('users', ['id' => $id, 'workspaceId' => $actor->workspaceId, 'isStaff' => true]);
    if (!$u) {
        throw not_found('Team member');
    }
    $isSuper = (bool)Db::val("SELECT 1 FROM `user_roles` ur JOIN `roles` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = ? AND r.`key` = 'super_admin' LIMIT 1", [$id]);
    if ($isSuper && !in_array('super_admin', $actor->roleKeys, true)) {
        throw new AppError('FORBIDDEN', 'Only a Super Admin can change a Super Admin.');
    }
    if ($id === $actor->userId && (!empty($patch['suspended']) || (isset($patch['roleKeys']) && !in_array('super_admin', $patch['roleKeys'], true) && $isSuper))) {
        throw bad_request("You can't lock yourself out.");
    }
    if (isset($patch['roleKeys'])) {
        if (!$patch['roleKeys']) {
            throw bad_request('Choose at least one role.');
        }
        $roles = assert_can_grant($actor, $patch['roleKeys']);
        if ($isSuper && !in_array('super_admin', $patch['roleKeys'], true)) {
            $supers = (int)Db::val("SELECT COUNT(*) FROM `user_roles` ur JOIN `roles` r ON r.`id` = ur.`roleId` JOIN `users` u ON u.`id` = ur.`userId` WHERE r.`key` = 'super_admin' AND u.`status` <> 'SUSPENDED'");
            if ($supers <= 1) {
                throw bad_request('There must be at least one active Super Admin.');
            }
        }
        Db::tx(function () use ($id, $roles) {
            Db::delete('user_roles', ['userId' => $id]);
            foreach ($roles as $r) {
                Db::insert('user_roles', ['userId' => $id, 'roleId' => $r['id']], false);
            }
        });
        audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => 'team.roles_changed', 'entityType' => 'user', 'entityId' => $id, 'message' => "{$actor->name} set {$u['name']}'s roles to " . implode(', ', $patch['roleKeys'])]);
        // permissions changed: existing sessions pick the new roles up on the next request (roles are read per request)
    }
    if (array_key_exists('suspended', $patch)) {
        Db::update('users', ['id' => $id], ['status' => $patch['suspended'] ? 'SUSPENDED' : 'ACTIVE']);
        if ($patch['suspended']) {
            Sessions::destroyAllFor($id);
        }
        audit($actor, ['workspaceId' => $actor->workspaceId, 'action' => $patch['suspended'] ? 'team.suspended' : 'team.reactivated', 'entityType' => 'user', 'entityId' => $id, 'message' => "{$actor->name} " . ($patch['suspended'] ? 'deactivated' : 'reactivated') . " {$u['name']}"]);
    }
    $data = [];
    if (!empty($patch['name'])) {
        $data['name'] = $patch['name'];
    }
    if (array_key_exists('hourlyCost', $patch)) {
        $data['hourlyCost'] = $patch['hourlyCost'];
    }
    if ($data) {
        Db::update('users', ['id' => $id], $data);
    }
    return ['ok' => true];
}
