<?php
/**
 * Who is calling (the Actor), what they may do (permissions) and which rows they may see (ownership scopes).
 *
 * OWNERSHIP SCOPES are the single place that decides "which rows may this actor see?". Every read/write of projects, assets,
 * quotes, invoices, contracts, messages, versions and comments is filtered through one of these, so tampering with an id in a URL
 * can never reach another client's data. A row outside scope is indistinguishable from a missing row (404, never 403) to avoid
 * leaking existence.
 *
 * Each scope function returns [sql, params]: a predicate on the table alias you pass in (no leading AND).
 */
defined('FEP') or exit;

defined('FEP') or exit;

final class Actor
{
    public string $userId;
    public string $workspaceId;
    public string $name;
    public string $email;
    public ?string $avatarUrl;
    public bool $isStaff;
    /** @var string[] */
    public array $roleKeys = [];
    /** @var array<string,true> */
    public array $permissions = [];
    /** @var array<int,array{organizationId:string,role:string,orgName:string}> */
    public array $orgs = [];
    public bool $twoFactorEnabled;
    public string $sessionId;
    public string $sessionHash;
    public bool $isDemo;
    public ?string $timezone = null;

    public function can(string $perm): bool { return isset($this->permissions[$perm]); }

    public function canAny(array $perms): bool
    {
        foreach ($perms as $p) {
            if (isset($this->permissions[$p])) {
                return true;
            }
        }
        return false;
    }

    /** @return string[] */
    public function orgIds(): array { return array_column($this->orgs, 'organizationId'); }
}

/** A "system" actor for jobs and automations: not a person, never used for permission checks. */
function system_actor(string $label = 'System'): array
{
    return ['system' => true, 'label' => $label];
}

/** The signed-in Actor for this request, or null. Memoised per request. */
function actor(): ?Actor
{
    static $resolved = false, $actor = null;
    if ($resolved) {
        return $actor;
    }
    $resolved = true;
    $id = Sessions::resume();
    return $actor = $id ? actor_from_session_id($id) : null;
}

function actor_from_session_id(string $sessionId): ?Actor
{
    $hash = sha256_hex($sessionId);
    $row = Db::rowRaw(
        'SELECT s.`id` AS sid, s.`twoFactorPending`, s.`expiresAt`, u.* FROM `sessions` s JOIN `users` u ON u.`id` = s.`userId` WHERE s.`tokenHash` = ?',
        [$hash],
    );
    if (!$row || $row['expiresAt'] <= db_dt() || (int)$row['twoFactorPending'] === 1 || $row['status'] === 'SUSPENDED') {
        return null;
    }
    $a = new Actor();
    $a->userId = $row['id'];
    $a->workspaceId = $row['workspaceId'];
    $a->name = $row['name'];
    $a->email = $row['email'];
    $a->avatarUrl = $row['avatarUrl'];
    $a->isStaff = (bool)$row['isStaff'];
    $a->twoFactorEnabled = (bool)$row['twoFactorEnabled'];
    $a->sessionId = $row['sid'];
    $a->sessionHash = $hash;
    $a->isDemo = (bool)$row['isDemo'];
    $a->timezone = $row['timezone'];
    $a->roleKeys = Db::col('SELECT r.`key` FROM `user_roles` ur JOIN `roles` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = ?', [$a->userId]);
    if ($a->isStaff) {
        foreach (Db::col('SELECT DISTINCT p.`key` FROM `user_roles` ur JOIN `role_permissions` rp ON rp.`roleId` = ur.`roleId` JOIN `permissions` p ON p.`id` = rp.`permissionId` WHERE ur.`userId` = ?', [$a->userId]) as $k) {
            $a->permissions[$k] = true;
        }
    }
    foreach (Db::rows('SELECT om.`organizationId`, om.`role`, o.`name` AS orgName FROM `organization_members` om JOIN `organizations` o ON o.`id` = om.`organizationId` WHERE om.`userId` = ?', [$a->userId]) as $m) {
        $a->orgs[] = ['organizationId' => $m['organizationId'], 'role' => $m['role'], 'orgName' => $m['orgName']];
    }
    Sessions::refreshCsrfCookie($hash);
    return $a;
}

function require_actor(): Actor
{
    $a = actor();
    if (!$a) {
        throw new AppError('UNAUTHENTICATED', 'Please sign in to continue.');
    }
    return $a;
}

function can(Actor $a, string $perm): bool { return $a->can($perm); }

function assert_can(Actor $a, string ...$perms): void
{
    if (!$a->isStaff) {
        throw forbidden();
    }
    foreach ($perms as $p) {
        if (!$a->can($p)) {
            throw forbidden();
        }
    }
}

function assert_can_any(Actor $a, string ...$perms): void
{
    if (!$a->isStaff || !$a->canAny($perms)) {
        throw forbidden();
    }
}

/** Client-side org authorization. Staff always pass here (their RBAC is checked separately); portal users need a membership whose role allows the action. */
function assert_org_action(Actor $a, string $organizationId, string $action): void
{
    if ($a->isStaff) {
        return;
    }
    foreach ($a->orgs as $o) {
        if ($o['organizationId'] === $organizationId) {
            if (!org_role_can($o['role'], $action)) {
                throw forbidden("Your role in this company doesn't allow that. Ask the account owner.");
            }
            return;
        }
    }
    throw new AppError('NOT_FOUND', 'Not found.');
}

// ─────────────────────────────── page-level guards ───────────────────────────────

/** Ensures a signed-in user with access to the area, or redirects (pages) — real authorization still happens in every service call. */
function require_page_actor(string $area, ?string $nextPath = null): Actor
{
    $a = actor();
    if (!$a) {
        Res::redirect('/login' . ($nextPath ? '?next=' . rawurlencode($nextPath) : ''));
    }
    $home = home_for_roles($a->roleKeys, $a->permissions);
    if ($area === 'admin' && !$a->can('admin:access')) {
        Res::redirect($a->isStaff ? $home : '/dashboard');
    }
    if ($area === 'editor' && !$a->can('editor:access')) {
        Res::redirect($a->isStaff ? $home : '/dashboard');
    }
    if ($area === 'client' && $a->isStaff) {
        Res::redirect($home);
    }
    return $a;
}

// ─────────────────────────────── ownership scopes ───────────────────────────────

const SC_DENY = ['1 = 0', []];

/** Combine predicates with AND. */
function sc_and(array ...$parts): array
{
    $sql = [];
    $params = [];
    foreach ($parts as [$s, $p]) {
        $sql[] = '(' . $s . ')';
        array_push($params, ...$p);
    }
    return [implode(' AND ', $sql) ?: '1 = 1', $params];
}

function sc_or(array ...$parts): array
{
    $sql = [];
    $params = [];
    foreach ($parts as [$s, $p]) {
        $sql[] = '(' . $s . ')';
        array_push($params, ...$p);
    }
    return [implode(' OR ', $sql) ?: '1 = 0', $params];
}

function sc_in(string $col, array $values): array
{
    [$ph, $p] = Db::in($values);
    return ["{$col} IN {$ph}", $p];
}

function scope_project(Actor $a, string $t = 'p'): array
{
    $base = ["`{$t}`.`workspaceId` = ?", [$a->workspaceId]];
    if (!$a->isStaff) {
        return sc_and($base, sc_in("`{$t}`.`organizationId`", $a->orgIds()), ["`{$t}`.`clientVisible` = 1", []]);
    }
    if ($a->can('projects:read_all')) {
        return $base;
    }
    if ($a->can('projects:read_assigned')) {
        return sc_and($base, ["`{$t}`.`managerId` = ? OR EXISTS (SELECT 1 FROM `project_members` pm_{$t} WHERE pm_{$t}.`projectId` = `{$t}`.`id` AND pm_{$t}.`userId` = ?)", [$a->userId, $a->userId]]);
    }
    return SC_DENY;
}

function scope_client(Actor $a, string $t = 'c'): array
{
    $base = ["`{$t}`.`workspaceId` = ?", [$a->workspaceId]];
    if (!$a->isStaff) {
        return sc_and($base, sc_in("`{$t}`.`organizationId`", $a->orgIds()));
    }
    return $a->can('clients:read') ? $base : SC_DENY;
}

function scope_lead(Actor $a, string $t = 'l'): array
{
    if (!$a->isStaff || !$a->can('leads:read')) {
        return SC_DENY;
    }
    return ["`{$t}`.`workspaceId` = ?", [$a->workspaceId]];
}

/** quotes / contracts / invoices share one shape: clients see their organisation's non-draft documents. */
function scope_document(Actor $a, string $t, string $perm): array
{
    $base = ["`{$t}`.`workspaceId` = ?", [$a->workspaceId]];
    if (!$a->isStaff) {
        return sc_and($base, sc_in("`{$t}`.`organizationId`", $a->orgIds()), ["`{$t}`.`status` <> 'DRAFT'", []]);
    }
    return $a->can($perm) ? $base : SC_DENY;
}

function scope_quote(Actor $a, string $t = 'q'): array { return scope_document($a, $t, 'quotes:read'); }
function scope_contract(Actor $a, string $t = 'ct'): array { return scope_document($a, $t, 'contracts:read'); }
function scope_invoice(Actor $a, string $t = 'i'): array { return scope_document($a, $t, 'invoices:read'); }

function scope_payment(Actor $a, string $t = 'pay'): array
{
    $base = ["`{$t}`.`workspaceId` = ?", [$a->workspaceId]];
    if (!$a->isStaff) {
        return sc_and($base, sc_in("`{$t}`.`organizationId`", $a->orgIds()));
    }
    return $a->can('payments:read') ? $base : SC_DENY;
}

function scope_retainer(Actor $a, string $t = 'r'): array
{
    $base = ["`{$t}`.`workspaceId` = ?", [$a->workspaceId]];
    if (!$a->isStaff) {
        return sc_and($base, sc_in("`{$t}`.`organizationId`", $a->orgIds()));
    }
    return ($a->can('retainers:manage') || $a->can('clients:read')) ? $base : SC_DENY;
}

function scope_asset(Actor $a, string $t = 'a'): array
{
    $base = ["`{$t}`.`workspaceId` = ? AND `{$t}`.`deletedAt` IS NULL", [$a->workspaceId]];
    if (!$a->isStaff) {
        [$inP, $pp] = Db::in($a->orgIds());
        return sc_and(
            $base,
            ["`{$t}`.`visibleToClient` = 1 AND `{$t}`.`status` IN ('READY','PROCESSING','UPLOADING')", []],
            ["EXISTS (SELECT 1 FROM `projects` px_{$t} WHERE px_{$t}.`id` = `{$t}`.`projectId` AND px_{$t}.`organizationId` IN {$inP} AND px_{$t}.`clientVisible` = 1)
              OR (`{$t}`.`projectId` IS NULL AND EXISTS (SELECT 1 FROM `clients` cx_{$t} WHERE cx_{$t}.`id` = `{$t}`.`clientId` AND cx_{$t}.`organizationId` IN {$inP}))", [...$pp, ...$pp]],
        );
    }
    if (!$a->can('files:read')) {
        return SC_DENY;
    }
    [$ps, $pp] = scope_project($a, "psx_{$t}");
    $or = ["EXISTS (SELECT 1 FROM `projects` `psx_{$t}` WHERE `psx_{$t}`.`id` = `{$t}`.`projectId` AND {$ps})", $pp];
    if ($a->can('clients:read') || $a->can('leads:read')) {
        $or = sc_or($or, ["`{$t}`.`projectId` IS NULL", []]);
    }
    return sc_and($base, $or);
}

function scope_version(Actor $a, string $t = 'v'): array
{
    [$ps, $pp] = scope_project($a, "psv_{$t}");
    $base = sc_and(["`{$t}`.`workspaceId` = ?", [$a->workspaceId]], ["EXISTS (SELECT 1 FROM `projects` `psv_{$t}` WHERE `psv_{$t}`.`id` = `{$t}`.`projectId` AND {$ps})", $pp]);
    if (!$a->isStaff) {
        return sc_and($base, ["`{$t}`.`releasedAt` IS NOT NULL", []]);
    }
    if (!$a->can('files:read') && !$a->can('versions:upload') && !$a->can('projects:read_all')) {
        return SC_DENY;
    }
    return $base;
}

function scope_comment(Actor $a, string $t = 'vc'): array
{
    [$vs, $vp] = scope_version($a, "vsc_{$t}");
    return sc_and(["`{$t}`.`workspaceId` = ?", [$a->workspaceId]], ["EXISTS (SELECT 1 FROM `video_versions` `vsc_{$t}` WHERE `vsc_{$t}`.`id` = `{$t}`.`versionId` AND {$vs})", $vp]);
}

function scope_message(Actor $a, string $t = 'm'): array
{
    $base = ["`{$t}`.`workspaceId` = ?", [$a->workspaceId]];
    if (!$a->isStaff) {
        return sc_and($base, sc_in("`{$t}`.`organizationId`", $a->orgIds()));
    }
    if (!$a->can('messages:read')) {
        return SC_DENY;
    }
    if ($a->can('projects:read_all')) {
        return $base;
    }
    [$ps, $pp] = scope_project($a, "psm_{$t}");
    return sc_and($base, ["EXISTS (SELECT 1 FROM `projects` `psm_{$t}` WHERE `psm_{$t}`.`id` = `{$t}`.`projectId` AND {$ps})", $pp]);
}

function scope_task(Actor $a, string $t = 'tk'): array
{
    if (!$a->isStaff || !$a->can('tasks:read')) {
        return SC_DENY;
    }
    $base = ["`{$t}`.`workspaceId` = ?", [$a->workspaceId]];
    if ($a->can('projects:read_all')) {
        return $base;
    }
    [$ps, $pp] = scope_project($a, "pst_{$t}");
    return sc_and($base, ["`{$t}`.`assigneeId` = ? OR EXISTS (SELECT 1 FROM `projects` `pst_{$t}` WHERE `pst_{$t}`.`id` = `{$t}`.`projectId` AND {$ps})", [$a->userId, ...$pp]]);
}

/** Rows that hang off a project (change requests, file requests…): visible when the project is. */
function scope_by_project(Actor $a, string $t): array
{
    [$ps, $pp] = scope_project($a, "psb_{$t}");
    return sc_and(["`{$t}`.`workspaceId` = ?", [$a->workspaceId]], ["EXISTS (SELECT 1 FROM `projects` `psb_{$t}` WHERE `psb_{$t}`.`id` = `{$t}`.`projectId` AND {$ps})", $pp]);
}

function scope_change_request(Actor $a, string $t = 'cr'): array { return scope_by_project($a, $t); }
function scope_file_request(Actor $a, string $t = 'fr'): array { return scope_by_project($a, $t); }

/** WHERE helper: [sql, params] of scope AND id = ?. */
function scoped_id(array $scope, string $alias, string $id): array
{
    return sc_and($scope, ["`{$alias}`.`id` = ?", [$id]]);
}
